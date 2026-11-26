"""Safely provision a dedicated Packages Manager in the isolated Packages dev database."""

from getpass import getpass
from pathlib import Path
import os
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password, verify_password
from app.db.session import OPERATIONAL_DB_NAMES
from app.models import User
from app.models.entities import UserRole


ENV_PACKAGES_LOCAL = BACKEND_ROOT / ".env.packages.local"
EXPECTED_DEV_DB_NAME = "newaraai_packages_dev"


def provision_packages_manager(
    *,
    email: str | None = None,
    full_name: str | None = None,
    password: str | None = None,
) -> None:
    if ENV_PACKAGES_LOCAL.is_file():
        load_dotenv(ENV_PACKAGES_LOCAL, override=True)

    db_url = os.environ.get("PACKAGES_DEV_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError(
            f"Missing isolated Packages database URL. Configure {ENV_PACKAGES_LOCAL} first."
        )

    parsed = make_url(db_url)
    db_name = (parsed.database or "").strip()
    if db_name in OPERATIONAL_DB_NAMES:
        raise RuntimeError(
            f"Refusing to modify operational database '{db_name}'. Use isolated dev database '{EXPECTED_DEV_DB_NAME}'."
        )
    if db_name != EXPECTED_DEV_DB_NAME and "packages" not in db_name.lower():
        raise RuntimeError(
            f"Refusing to use unexpected database '{db_name}'. Expected '{EXPECTED_DEV_DB_NAME}'."
        )

    if email is None:
        email = input("Dedicated Packages Manager email: ").strip().lower()
    else:
        email = email.strip().lower()

    if full_name is None:
        full_name = input("Manager display name [NewaraAI Packages Manager]: ").strip()
    full_name = full_name or "NewaraAI Packages Manager"

    if password is None:
        password = getpass("Manager password: ")
        confirmation = getpass("Confirm manager password: ")
        if password != confirmation:
            raise ValueError("Passwords do not match.")

    if not email or len(password) < 8:
        raise ValueError("Valid email and password (min 8 characters) are required.")

    engine = create_engine(db_url, pool_pre_ping=True)
    if not inspect(engine).has_table("users"):
        engine.dispose()
        raise RuntimeError("Target database has no users table; run Alembic migrations first.")

    Session = sessionmaker(autoflush=False, expire_on_commit=False, bind=engine)
    try:
        with Session.begin() as db:
            user = db.query(User).filter(User.email == email).one_or_none()
            if user is None:
                user = User(
                    full_name=full_name,
                    email=email,
                    password_hash=hash_password(password),
                    role=UserRole.MANAGER,
                    business_context="PACKAGE",
                    is_active=True,
                )
                db.add(user)
                result = "created"
            else:
                if str(getattr(user, "business_context", "")).upper() != "PACKAGE":
                    raise RuntimeError(
                        f"Email {email} already belongs to context '{user.business_context}'. "
                        "Use a dedicated email for the Packages Manager."
                    )
                user.full_name = full_name
                user.role = UserRole.MANAGER
                user.business_context = "PACKAGE"
                user.is_active = True
                if not verify_password(password, user.password_hash):
                    user.password_hash = hash_password(password)
                result = "verified/updated"

            db.flush()
            print(
                f"Packages Manager {result}: id={user.id}, email={user.email}, "
                f"role=MANAGER, context=PACKAGE, active=True, db={db_name}"
            )
    finally:
        engine.dispose()


if __name__ == "__main__":
    provision_packages_manager()
