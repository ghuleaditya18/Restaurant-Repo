import sys
from pathlib import Path
from getpass import getpass

# Ensure the backend directory is in sys.path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.db.session import SessionLocal
from app.models import User
from app.core.security import hash_password


def create_manager():
    db = SessionLocal()

    try:
        print("\n--- Create Initial Manager Account ---")

        full_name = input("Manager Name: ").strip()
        email = input("Manager Email: ").strip().lower()
        business_context = (input("Business context [RESTAURANT/SPA/VILLA/PACKAGE] (default RESTAURANT): ").strip().upper() or "RESTAURANT")
        if business_context == "PACKAGES":
            business_context = "PACKAGE"
        if business_context not in {"RESTAURANT", "SPA", "VILLA", "PACKAGE"}:
            raise ValueError("Business context must be RESTAURANT, SPA, VILLA, or PACKAGE.")

        password = getpass("Manager Password: ")
        confirm_password = getpass("Confirm Password: ")

        if not full_name or not email:
            raise ValueError("Name and email are required.")

        if len(password) < 8:
            raise ValueError("Password must contain at least 8 characters.")

        if password != confirm_password:
            raise ValueError("Passwords do not match.")

        existing_user = db.query(User).filter(
            User.email == email
        ).first()

        if existing_user:
            raise ValueError("A user with this email already exists.")

        # Get the Manager enum from the existing SQLAlchemy model
        role_enum = User.__table__.c.role.type.enum_class
        manager_role = role_enum.MANAGER

        manager = User(
            full_name=full_name,
            email=email,
            password_hash=hash_password(password),
            role=manager_role,
            business_context=business_context,
            is_active=True
        )

        db.add(manager)
        db.commit()
        db.refresh(manager)

        print("\nManager account created successfully!")
        print("Manager ID:", manager.id)
        print("Name:", manager.full_name)
        print("Email:", manager.email)
        print("Role:", manager.role)
        print("Business context:", manager.business_context)

    except Exception as error:
        db.rollback()
        print("\nManager creation failed:", error)
        raise

    finally:
        db.close()


if __name__ == "__main__":
    create_manager()
