"""Safely provision one manager in the isolated Villas development database."""

from getpass import getpass
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password, verify_password
from app.models import User
from app.models.entities import UserRole


VILLAS_DB_PATH = (BACKEND_ROOT / ".local" / "niwaraai_villas_dev.sqlite3").resolve()


def provision_villas_manager() -> None:
    if not VILLAS_DB_PATH.is_file():
        raise FileNotFoundError(f"Isolated Villas database is missing: {VILLAS_DB_PATH}")

    email = input("Dedicated Villas Manager email: ").strip().lower()
    full_name = input("Manager display name [Suyash Villas Manager]: ").strip()
    full_name = full_name or "Suyash Villas Manager"
    password = getpass("Manager password: ")
    confirmation = getpass("Confirm manager password: ")

    if not email or len(password) < 8 or password != confirmation:
        raise ValueError("Email is required; passwords must match and contain at least 8 characters.")

    engine = create_engine(
        f"sqlite:///{VILLAS_DB_PATH.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    if engine.url.get_backend_name() != "sqlite" or Path(engine.url.database).resolve() != VILLAS_DB_PATH:
        engine.dispose()
        raise RuntimeError("Refusing to use a database other than the isolated Villas SQLite file.")
    if not inspect(engine).has_table("users"):
        engine.dispose()
        raise RuntimeError("The isolated Villas database has no users table; no schema was created.")

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
                    business_context="VILLA",
                    is_active=True,
                )
                db.add(user)
                result = "created"
            else:
                user.role = UserRole.MANAGER
                user.business_context = "VILLA"
                user.is_active = True
                if not verify_password(password, user.password_hash):
                    user.password_hash = hash_password(password)
                result = "verified/updated"

            db.flush()
            print(f"Account {result}: id={user.id}, email={user.email}, role=MANAGER, context=VILLA, active=True")
            print(f"Database: {VILLAS_DB_PATH}")
    finally:
        engine.dispose()


if __name__ == "__main__":
    provision_villas_manager()
