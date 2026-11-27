"""Safely and idempotently provision the dedicated Transport Manager in the canonical database."""
from __future__ import annotations

from getpass import getpass
from pathlib import Path
import os
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import inspect
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password, verify_password
from app.db.session import engine
from app.models import User
from app.models.entities import UserRole


def provision_transport_manager(
    *,
    email: str | None = None,
    full_name: str | None = None,
    password: str | None = None,
) -> None:
    if email is None:
        email = (os.environ.get("TRANSPORT_MANAGER_EMAIL") or input("Transport Manager email: ")).strip().lower()
    else:
        email = email.strip().lower()

    if full_name is None:
        full_name = (
            os.environ.get("TRANSPORT_MANAGER_NAME")
            or input("Manager display name [Transport Manager]: ")
        ).strip()
    full_name = full_name or "Transport Manager"

    if password is None:
        password = os.environ.get("TRANSPORT_MANAGER_PASSWORD")
    if password is None:
        password = getpass("Transport Manager password: ")
        confirmation = getpass("Confirm Transport Manager password: ")
        if password != confirmation:
            raise ValueError("Passwords do not match.")

    if not email or len(password) < 8:
        raise ValueError("Valid email and password (min 8 characters) are required.")

    if not inspect(engine).has_table("users"):
        raise RuntimeError("Target database has no users table; run Alembic migrations first.")

    Session = sessionmaker(autoflush=False, expire_on_commit=False, bind=engine)
    with Session.begin() as db:
        existing_transport = (
            db.query(User)
            .filter(User.business_context == "TRANSPORT", User.email != email)
            .first()
        )
        if existing_transport:
            raise RuntimeError(
                f"Another TRANSPORT account already exists ({existing_transport.email}). "
                "Transport module requires a single dedicated Transport Manager initially."
            )

        user = db.query(User).filter(User.email == email).one_or_none()
        if user is None:
            user = User(
                full_name=full_name,
                email=email,
                password_hash=hash_password(password),
                role=UserRole.MANAGER,
                business_context="TRANSPORT",
                is_active=True,
            )
            db.add(user)
            result = "created"
        else:
            ctx = str(getattr(user, "business_context", "")).upper()
            if ctx not in ("TRANSPORT", "TRANSPORTS"):
                raise RuntimeError(
                    f"Email {email} already belongs to context '{user.business_context}'. "
                    "Use a dedicated email for the Transport Manager."
                )
            user.full_name = full_name
            user.role = UserRole.MANAGER
            user.business_context = "TRANSPORT"
            user.is_active = True
            if not verify_password(password, user.password_hash):
                user.password_hash = hash_password(password)
            result = "verified/updated"

        db.flush()
        print(
            f"Transport Manager {result}: id={user.id}, email={user.email}, "
            f"role=MANAGER, context=TRANSPORT, active=True, db={engine.url.database}"
        )


if __name__ == "__main__":
    provision_transport_manager()
