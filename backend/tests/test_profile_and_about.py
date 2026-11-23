import io
import sys
from pathlib import Path
import unittest
import jwt

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from starlette.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entities import User, BusinessProfile


def get_token(user_id: int) -> str:
    return jwt.encode(
        {"sub": str(user_id)},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


class ProfileAndAboutTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        # User 1: Restaurant Manager
        self.rest_manager = self.db.query(User).filter(User.id == 1).first()
        # User 2: Restaurant Staff
        self.staff_user = self.db.query(User).filter(User.role == "staff").first()
        # User 17: Spa Manager
        self.spa_manager = self.db.query(User).filter(User.business_context == "SPA").first()

        self.rest_token = get_token(self.rest_manager.id)
        self.staff_token = get_token(self.staff_user.id) if self.staff_user else None
        self.spa_token = get_token(self.spa_manager.id) if self.spa_manager else None

    def tearDown(self):
        self.db.close()

    # 1. USER PROFILE RETRIEVAL & AVATAR
    def test_get_me_returns_avatar_url_field(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        resp = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("avatar_url", data)
        self.assertEqual(data["email"], self.rest_manager.email)

    # 2. USER PROFILE PICTURE UPLOAD AND DELETE
    def test_upload_valid_profile_image(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        # Valid PNG header
        png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
        file = io.BytesIO(png_bytes)
        files = {"file": ("avatar.png", file, "image/png")}

        resp = self.client.post("/api/auth/profile/image", headers=headers, files=files)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNotNone(data["avatar_url"])
        self.assertTrue(data["avatar_url"].startswith("/uploads/profiles/"))

        # Clean up
        del_resp = self.client.delete("/api/auth/profile/image", headers=headers)
        self.assertEqual(del_resp.status_code, 200)
        self.assertIsNone(del_resp.json()["avatar_url"])

    def test_upload_invalid_profile_image_rejected(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        # Plain text disguised as image
        fake_bytes = b"This is not a real image header"
        file = io.BytesIO(fake_bytes)
        files = {"file": ("fake.png", file, "image/png")}

        resp = self.client.post("/api/auth/profile/image", headers=headers, files=files)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Only JPG, PNG or WebP", resp.json()["detail"])

    # 3. BUSINESS PROFILE GET & CONTEXT ISOLATION
    def test_get_business_profile_restaurant(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        resp = self.client.get("/api/business-profile", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["business_context"], "RESTAURANT")

    def test_get_business_profile_spa(self):
        if not self.spa_token:
            self.skipTest("No Spa manager found")
        headers = {"Authorization": f"Bearer {self.spa_token}"}
        resp = self.client.get("/api/business-profile", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["business_context"], "SPA")

    # 4. AUTHORIZATION RESTRICTIONS (STAFF CANNOT EDIT ABOUT)
    def test_staff_cannot_update_business_profile(self):
        if not self.staff_token:
            self.skipTest("No staff user found")
        headers = {"Authorization": f"Bearer {self.staff_token}"}
        payload = {
            "business_name": "Unauthorized Update",
        }
        resp = self.client.put("/api/business-profile", headers=headers, json=payload)
        self.assertEqual(resp.status_code, 403)

    # 5. MANAGER UPDATE BUSINESS PROFILE & COMPLETION LOGIC
    def test_manager_update_business_profile_and_completeness(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}

        # Incomplete update (missing required address/city/email/phone)
        incomplete_payload = {
            "business_name": "Saffron Table Dining",
            "tagline": "Taste of Tradition",
        }
        resp1 = self.client.put("/api/business-profile", headers=headers, json=incomplete_payload)
        self.assertEqual(resp1.status_code, 200)
        data1 = resp1.json()
        self.assertFalse(data1["is_profile_complete"])
        self.assertGreater(len(data1["missing_fields"]), 0)

        # Full complete update
        complete_payload = {
            "business_name": "Saffron Table Dining",
            "business_type": "Fine Dining Restaurant",
            "business_category": "Multi-Cuisine",
            "tagline": "Good Food, Great Moments",
            "description": "Authentic dining experience crafted with fresh regional ingredients and warm hospitality.",
            "established_year": "2021",
            "story_heading": "Our Journey",
            "story_content": "Founded in 2021 with passion for pure flavours.",
            "founder_name": "Amit Patil",
            "founder_designation": "Owner & Managing Director",
            "founder_bio": "Culinary entrepreneur dedicated to fresh culinary excellence.",
            "business_email": "contact@saffrontable.com",
            "business_phone": "9876543210",
            "address_line": "Shop 4, Heritage Plaza, MG Road",
            "city": "Pune",
            "state": "Maharashtra",
            "postal_code": "411001",
            "country": "India",
            "operating_hours": "11:00 AM - 11:00 PM",
            "weekly_closed_days": "None",
            "business_highlights": "Family Seating, Multi-Course Dining, Fresh Regional Spices",
        }
        resp2 = self.client.put("/api/business-profile", headers=headers, json=complete_payload)
        self.assertEqual(resp2.status_code, 200)
        data2 = resp2.json()
        self.assertTrue(data2["is_profile_complete"])
        self.assertEqual(len(data2["missing_fields"]), 0)
        self.assertEqual(data2["business_name"], "Saffron Table Dining")
        self.assertEqual(data2["city"], "Pune")

    # 6. FOUNDER IMAGE UPLOAD & REMOVE
    def test_upload_and_delete_founder_image(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        # Valid JPEG byte header
        jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00"
        file = io.BytesIO(jpeg_bytes)
        files = {"file": ("founder.jpg", file, "image/jpeg")}

        resp = self.client.post("/api/business-profile/founder-image", headers=headers, files=files)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNotNone(data["founder_image_url"])
        self.assertTrue(data["founder_image_url"].startswith("/uploads/founders/"))

        # Clean up
        del_resp = self.client.delete("/api/business-profile/founder-image", headers=headers)
        self.assertEqual(del_resp.status_code, 200)
        self.assertIsNone(del_resp.json()["founder_image_url"])


if __name__ == "__main__":
    unittest.main()
