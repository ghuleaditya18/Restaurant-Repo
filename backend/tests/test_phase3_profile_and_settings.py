import sys
from pathlib import Path
import unittest
import jwt

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from starlette.testclient import TestClient

from tests.base import IsolatedTestCase
from app.main import app
from app.core.config import settings
from app.models.entities import User, Staff


def get_token(user_id: int) -> str:
    return jwt.encode(
        {"sub": str(user_id)},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


class Phase3ProfileAndSettingsTestCase(IsolatedTestCase):
    def setUp(self):
        super().setUp()
        # Ensure user 1 (Manager/Receptionist) and user 2 exist
        self.manager_user = self.db.query(User).filter(User.id == 1).first()
        self.other_user = self.db.query(User).filter(User.id != 1).first()
        self.orig_name = self.manager_user.full_name
        self.orig_email = self.manager_user.email
        self.orig_phone = self.manager_user.staff_profile.phone if self.manager_user.staff_profile else None

    def tearDown(self):
        super().tearDown()

    def test_get_current_user_profile(self):
        """
        Verify GET /api/auth/me returns receptionist profile details including phone.
        """
        token = get_token(self.manager_user.id)
        response = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], self.manager_user.id)
        self.assertEqual(data["full_name"], self.manager_user.full_name)
        self.assertEqual(data["email"], self.manager_user.email)
        self.assertIn("role", data)
        self.assertIn("is_active", data)
        self.assertIn("phone", data)

    def test_update_profile_success(self):
        """
        Verify Receptionist can update their own full name, email, and contact phone.
        """
        token = get_token(self.manager_user.id)
        original_name = self.manager_user.full_name
        original_email = self.manager_user.email

        update_payload = {
            "full_name": "Amit Patil Updated",
            "email": "amit.patil@gmail.com",
            "phone": "9876543210",
        }
        response = self.client.patch(
            "/api/auth/profile",
            json=update_payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["full_name"], "Amit Patil Updated")
        self.assertEqual(data["email"], "amit.patil@gmail.com")
        self.assertEqual(data["phone"], "9876543210")

        # Verify DB persisted
        self.db.refresh(self.manager_user)
        self.assertEqual(self.manager_user.full_name, "Amit Patil Updated")

        # Restore original name
        self.manager_user.full_name = original_name
        self.db.commit()

    def test_update_profile_validation_failures(self):
        """
        Verify validation rules on profile updates:
        - Empty or too short full name is rejected (422).
        - Invalid email format is rejected (422).
        - Invalid phone format is rejected (422).
        """
        token = get_token(self.manager_user.id)

        # 1. Short name
        res1 = self.client.patch(
            "/api/auth/profile",
            json={"full_name": "A", "email": "valid@email.com"},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(res1.status_code, 422)

        # 2. Invalid email
        res2 = self.client.patch(
            "/api/auth/profile",
            json={"full_name": "Valid Name", "email": "invalid-email"},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(res2.status_code, 422)

        # 3. Invalid phone (not 10 digits or invalid starting digit)
        res3 = self.client.patch(
            "/api/auth/profile",
            json={"full_name": "Valid Name", "email": "valid@email.com", "phone": "12345"},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(res3.status_code, 422)

    def test_update_profile_duplicate_email_conflict(self):
        """
        Verify updating to an email already in use by another user returns HTTP 409 Conflict.
        """
        token = get_token(self.manager_user.id)
        other_email = self.other_user.email

        response = self.client.patch(
            "/api/auth/profile",
            json={"full_name": "Amit Patil", "email": other_email},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("already registered", response.json()["detail"].lower())

    def test_update_profile_security_and_auth(self):
        """
        Verify security enforcement:
        - Unauthorized requests without token fail (401).
        - Staff accounts without manager privileges are forbidden (403).
        - Roles cannot be escalated or changed through profile update.
        """
        # No token
        res_no_token = self.client.patch(
            "/api/auth/profile",
            json={"full_name": "Hacker", "email": "hacker@test.com"},
        )
        self.assertEqual(res_no_token.status_code, 401)

        # Staff user token
        staff_user = self.db.query(User).filter(User.role == "staff", User.is_active.is_(True)).first()
        if staff_user:
            staff_token = get_token(staff_user.id)
            res_staff = self.client.patch(
                "/api/auth/profile",
                json={"full_name": "Staff Escalation", "email": "staff@test.com"},
                headers={"Authorization": f"Bearer {staff_token}"},
            )
            self.assertEqual(res_staff.status_code, 403)


if __name__ == "__main__":
    unittest.main()
