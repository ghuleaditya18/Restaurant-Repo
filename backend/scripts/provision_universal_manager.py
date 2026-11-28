"""Create/update the shared manager account in every module database.

Run from the backend directory:
    python scripts/provision_universal_manager.py

The password is requested interactively and is never stored in this script.
"""

from __future__ import annotations

from getpass import getpass
from pathlib import Path
import sys

from dotenv import dotenv_values
from pwdlib import PasswordHash
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.models import User
from app.models.entities import UserRole


ENV_FILES = (
    ".env",
    ".env.villas.local",
    ".env.packages.local",
    ".env.activities.local",
)
EMAIL = "manager@resort.com"
FULL_NAME = "Resort Manager"


def main() -> None:
    databases: list[tuple[str, str]] = []
    for env_file in ENV_FILES:
        env_path = BACKEND_ROOT / env_file
        if not env_path.is_file():
            raise SystemExit(f"Missing module environment file: {env_file}")
        database_url = dotenv_values(env_path).get("DATABASE_URL")
        if not database_url:
            raise SystemExit(f"DATABASE_URL is missing from {env_file}")
        databases.append((env_file, database_url))

    password = getpass("Password for manager@resort.com: ")
    if len(password) < 6:
        raise SystemExit("Password must be at least 6 characters.")
    if password != getpass("Confirm password: "):
        raise SystemExit("Passwords do not match.")

    print("This will create/update the universal manager in these databases:")
    for env_file, _ in databases:
        print(f"  - {env_file}")
    if input('Type "PROVISION" to continue: ').strip() != "PROVISION":
        raise SystemExit("Cancelled.")

    password_hash = PasswordHash.recommended().hash(password)
    engines = [
        (env_file, create_engine(database_url, pool_pre_ping=True))
        for env_file, database_url in databases
    ]
    try:
        for env_file, engine in engines:
            try:
                with engine.connect():
                    pass
            except Exception as exc:
                raise SystemExit(
                    f"Could not connect to the database configured by {env_file}; "
                    "no account changes were made."
                ) from exc

        for env_file, engine in engines:
            session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
            with session_factory() as db:
                user = db.query(User).filter(User.email == EMAIL).one_or_none()
                if user is None:
                    user = User(
                        full_name=FULL_NAME,
                        email=EMAIL,
                        password_hash=password_hash,
                        role=UserRole.MANAGER,
                        business_context="ALL",
                        is_active=True,
                    )
                    db.add(user)
                else:
                    user.full_name = FULL_NAME
                    user.password_hash = password_hash
                    user.role = UserRole.MANAGER
                    user.business_context = "ALL"
                    user.is_active = True
                db.commit()
            print(f"Provisioned manager account in {env_file}.")
    finally:
        for _, engine in engines:
            engine.dispose()


if __name__ == "__main__":
    main()
