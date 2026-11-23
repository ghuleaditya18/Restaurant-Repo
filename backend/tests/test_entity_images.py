import io
import unittest
from PIL import Image as PILImage
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.models.entities import User, UserRole, Customer, Staff, EntityImage
from app.models.spa import SpaCustomer, SpaStaff
from app.core.security import hash_password, create_access_token


def make_dummy_image(format="JPEG", size=(100, 100), color=(255, 128, 0)):
    buf = io.BytesIO()
    img = PILImage.new("RGB", size, color=color)
    img.save(buf, format=format)
    return buf.getvalue()


class TestEntityImageManagement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # In-memory SQLite for testing
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestingSessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=cls.engine
        )
        Base.metadata.create_all(bind=cls.engine)

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=cls.engine)
        app.dependency_overrides.clear()

    def setUp(self):
        self.db = self.TestingSessionLocal()

        # Seed restaurant manager
        self.rest_manager = User(
            full_name="Restaurant Manager",
            email="rest.mgr@dineflow.com",
            password_hash=hash_password("Pass@12345678"),
            role=UserRole.MANAGER,
            is_active=True,
        )
        setattr(self.rest_manager, "business_context", "RESTAURANT")
        self.db.add(self.rest_manager)

        # Seed spa manager
        self.spa_manager = User(
            full_name="Spa Manager",
            email="spa.mgr@dineflow.com",
            password_hash=hash_password("Pass@12345678"),
            role=UserRole.MANAGER,
            is_active=True,
        )
        setattr(self.spa_manager, "business_context", "SPA")
        self.db.add(self.spa_manager)

        # Seed restaurant customer & staff
        self.customer = Customer(
            full_name="John Doe",
            phone="9876543210",
            email="john@example.com",
            address="123 Street",
        )
        self.db.add(self.customer)

        self.staff_user = User(
            full_name="Chef Robert",
            email="robert@dineflow.com",
            password_hash=hash_password("Pass@12345678"),
            role=UserRole.STAFF,
            is_active=True,
        )
        self.db.add(self.staff_user)
        self.db.flush()

        self.staff = Staff(
            user_id=self.staff_user.id,
            employee_code="STF-101",
            phone="9876543211",
            designation="Sous Chef",
        )
        self.db.add(self.staff)

        # Seed spa customer & staff
        self.spa_customer = SpaCustomer(
            full_name="Alice Smith",
            phone="9876543212",
            email="alice@example.com",
        )
        self.db.add(self.spa_customer)

        self.spa_staff = SpaStaff(
            employee_code="SPA-201",
            full_name="Elena Therapist",
            designation="Senior Therapist",
            phone="9876543213",
            email="elena@dineflow.com",
            is_therapist=True,
        )
        self.db.add(self.spa_staff)

        self.db.commit()

        self.rest_token = create_access_token(data={"sub": str(self.rest_manager.id)})
        self.spa_token = create_access_token(data={"sub": str(self.spa_manager.id)})
        self.rest_headers = {"Authorization": f"Bearer {self.rest_token}"}
        self.spa_headers = {"Authorization": f"Bearer {self.spa_token}"}

    def tearDown(self):
        self.db.query(EntityImage).delete()
        self.db.query(Staff).delete()
        self.db.query(Customer).delete()
        self.db.query(SpaCustomer).delete()
        self.db.query(SpaStaff).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    def test_restaurant_customer_image_lifecycle(self):
        # 1. Upload valid JPEG
        img_bytes = make_dummy_image(format="JPEG")
        res = self.client.post(
            f"/api/customers/{self.customer.id}/image",
            headers=self.rest_headers,
            files={"file": ("profile.jpg", img_bytes, "image/jpeg")},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("/api/customers/", data["image_url"])

        # Verify DB binary storage
        img_record = (
            self.db.query(EntityImage)
            .filter_by(entity_type="restaurant_customer", entity_id=self.customer.id)
            .first()
        )
        self.assertIsNotNone(img_record)
        self.assertEqual(img_record.mime_type, "image/jpeg")
        self.assertEqual(img_record.image_data, img_bytes)

        # 2. Retrieve image
        get_res = self.client.get(
            f"/api/customers/{self.customer.id}/image",
            headers=self.rest_headers,
        )
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.headers["content-type"], "image/jpeg")
        self.assertEqual(get_res.content, img_bytes)

        # 3. Retrieve image without auth header or with query param must be rejected (401)
        get_res_no_auth = self.client.get(
            f"/api/customers/{self.customer.id}/image"
        )
        self.assertEqual(get_res_no_auth.status_code, 401)

        get_res_query = self.client.get(
            f"/api/customers/{self.customer.id}/image?token={self.rest_token}"
        )
        self.assertEqual(get_res_query.status_code, 401)

        # 4. Replace with PNG
        png_bytes = make_dummy_image(format="PNG", color=(0, 255, 128))
        res_replace = self.client.post(
            f"/api/customers/{self.customer.id}/image",
            headers=self.rest_headers,
            files={"file": ("profile.png", png_bytes, "image/png")},
        )
        self.assertEqual(res_replace.status_code, 200)

        # Verify in DB: updated in place, no duplicate row
        count = (
            self.db.query(EntityImage)
            .filter_by(entity_type="restaurant_customer", entity_id=self.customer.id)
            .count()
        )
        self.assertEqual(count, 1)

        # 5. Remove image
        del_res = self.client.delete(
            f"/api/customers/{self.customer.id}/image",
            headers=self.rest_headers,
        )
        self.assertEqual(del_res.status_code, 200)
        self.assertIsNone(del_res.json()["image_url"])

        # Verify DB deletion
        count_after = (
            self.db.query(EntityImage)
            .filter_by(entity_type="restaurant_customer", entity_id=self.customer.id)
            .count()
        )
        self.assertEqual(count_after, 0)

    def test_restaurant_staff_image_lifecycle(self):
        img_bytes = make_dummy_image(format="JPEG")
        res = self.client.post(
            f"/api/staff/{self.staff.id}/image",
            headers=self.rest_headers,
            files={"file": ("staff.jpg", img_bytes, "image/jpeg")},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("/api/staff/", res.json()["image_url"])

        # Retrieve
        get_res = self.client.get(
            f"/api/staff/{self.staff.id}/image",
            headers=self.rest_headers,
        )
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.content, img_bytes)

        # Delete
        del_res = self.client.delete(
            f"/api/staff/{self.staff.id}/image",
            headers=self.rest_headers,
        )
        self.assertEqual(del_res.status_code, 200)
        self.assertIsNone(del_res.json()["image_url"])

    def test_spa_customer_and_staff_image_lifecycle(self):
        # Spa customer
        img_bytes = make_dummy_image(format="PNG")
        res_cust = self.client.post(
            f"/api/spa/customers/{self.spa_customer.id}/image",
            headers=self.spa_headers,
            files={"file": ("spa_cust.png", img_bytes, "image/png")},
        )
        self.assertEqual(res_cust.status_code, 200)
        self.assertIn("/api/spa/customers/", res_cust.json()["image_url"])

        # Spa staff
        res_staff = self.client.post(
            f"/api/spa/staff/{self.spa_staff.id}/image",
            headers=self.spa_headers,
            files={"file": ("spa_staff.png", img_bytes, "image/png")},
        )
        self.assertEqual(res_staff.status_code, 200)
        self.assertIn("/api/spa/staff/", res_staff.json()["image_url"])

    def test_validation_rejects_corrupted_or_fake_image(self):
        fake_bytes = b"This is a text file masquerading as an image."
        res = self.client.post(
            f"/api/customers/{self.customer.id}/image",
            headers=self.rest_headers,
            files={"file": ("evil.jpg", fake_bytes, "image/jpeg")},
        )
        self.assertEqual(res.status_code, 400)

    def test_validation_rejects_oversized_image(self):
        oversized_bytes = b"x" * (6 * 1024 * 1024)  # 6 MB
        res = self.client.post(
            f"/api/customers/{self.customer.id}/image",
            headers=self.rest_headers,
            files={"file": ("huge.jpg", oversized_bytes, "image/jpeg")},
        )
        self.assertEqual(res.status_code, 400)

    def test_context_isolation_blocks_cross_context_access(self):
        # Upload an image to restaurant customer
        img_bytes = make_dummy_image(format="JPEG")
        self.client.post(
            f"/api/customers/{self.customer.id}/image",
            headers=self.rest_headers,
            files={"file": ("profile.jpg", img_bytes, "image/jpeg")},
        )

        # Attempt to access using Spa Manager token -> must return 403 Forbidden
        res = self.client.get(
            f"/api/customers/{self.customer.id}/image",
            headers=self.spa_headers,
        )
        self.assertEqual(res.status_code, 403)

        # Attempt to upload using Spa Manager token to Restaurant customer -> must return 403 Forbidden
        res_post = self.client.post(
            f"/api/customers/{self.customer.id}/image",
            headers=self.spa_headers,
            files={"file": ("profile.jpg", img_bytes, "image/jpeg")},
        )
        self.assertEqual(res_post.status_code, 403)

        # Upload image to Spa customer
        spa_img_bytes = make_dummy_image(format="PNG")
        self.client.post(
            f"/api/spa/customers/{self.spa_customer.id}/image",
            headers=self.spa_headers,
            files={"file": ("spa.png", spa_img_bytes, "image/png")},
        )

        # Attempt to access Spa image using Restaurant Manager token -> must return 403 Forbidden
        res_spa = self.client.get(
            f"/api/spa/customers/{self.spa_customer.id}/image",
            headers=self.rest_headers,
        )
        self.assertEqual(res_spa.status_code, 403)

    def test_customer_and_staff_deletion_cleans_up_image(self):
        img_bytes = make_dummy_image(format="JPEG")
        # 1. Customer image upload and customer delete
        self.client.post(
            f"/api/customers/{self.customer.id}/image",
            headers=self.rest_headers,
            files={"file": ("profile.jpg", img_bytes, "image/jpeg")},
        )
        self.assertEqual(
            self.db.query(EntityImage).filter_by(entity_type="restaurant_customer", entity_id=self.customer.id).count(),
            1,
        )
        # Delete customer
        del_cust = self.client.delete(f"/api/customers/{self.customer.id}", headers=self.rest_headers)
        self.assertEqual(del_cust.status_code, 200)
        # Verify image cleaned up
        self.assertEqual(
            self.db.query(EntityImage).filter_by(entity_type="restaurant_customer", entity_id=self.customer.id).count(),
            0,
        )

        # 2. Staff image upload and staff delete
        self.client.post(
            f"/api/staff/{self.staff.id}/image",
            headers=self.rest_headers,
            files={"file": ("staff.jpg", img_bytes, "image/jpeg")},
        )
        self.assertEqual(
            self.db.query(EntityImage).filter_by(entity_type="restaurant_staff", entity_id=self.staff.id).count(),
            1,
        )
        # Delete staff
        del_staff = self.client.delete(f"/api/staff/{self.staff.id}", headers=self.rest_headers)
        self.assertEqual(del_staff.status_code, 200)
        # Verify image cleaned up
        self.assertEqual(
            self.db.query(EntityImage).filter_by(entity_type="restaurant_staff", entity_id=self.staff.id).count(),
            0,
        )

    def test_unauthorized_entity_upload_rejected(self):
        img_bytes = make_dummy_image(format="JPEG")
        # Non-existent customer ID
        res = self.client.post(
            "/api/customers/999999/image",
            headers=self.rest_headers,
            files={"file": ("profile.jpg", img_bytes, "image/jpeg")},
        )
        self.assertEqual(res.status_code, 404)

        # Non-existent spa customer ID
        res_spa = self.client.post(
            "/api/spa/customers/999999/image",
            headers=self.spa_headers,
            files={"file": ("profile.jpg", img_bytes, "image/jpeg")},
        )
        self.assertEqual(res_spa.status_code, 404)


if __name__ == "__main__":
    unittest.main()
