"""Isolated integration tests for the NewaraAI Packages Module."""
import io
import os
import shutil
import unittest
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image as PILImage
from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

from app.core.date_utils import get_kolkata_today
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    Customer,
    Invoice,
    MenuCategory,
    MenuItem,
    Payment,
    SpaService,
    SpaServiceCategory,
    Unit,
    UnitCategory,
    User,
    Villa,
)
from app.models.entities import UserRole
from app.services import packages_service

TEST_DB_PATH = Path(__file__).resolve().parent / "test_packages_isolated.db"
TEST_PDF_DIR = Path(__file__).resolve().parent / "_tmp_package_pdfs"
TEST_DATABASE_URL = os.environ.get(
    "PACKAGES_TEST_DATABASE_URL",
    f"sqlite:///{TEST_DB_PATH.as_posix()}",
)
parsed_url = make_url(TEST_DATABASE_URL)
db_name = (parsed_url.database or "").lower()
if db_name in {"resort_db", "restaurant_db", "dineflow_db"}:
    raise RuntimeError("Packages tests are blocked from connecting to operational databases.")
if "test" not in db_name and ":memory:" not in TEST_DATABASE_URL.lower():
    raise RuntimeError("Packages tests require an isolated test database.")

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in TEST_DATABASE_URL else {},
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def _make_valid_png() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (24, 24), (245, 158, 11)).save(buf, format="PNG")
    return buf.getvalue()


VALID_PNG = _make_valid_png()


class TestPackagesModule(unittest.TestCase):
    _seq = 0

    @classmethod
    def setUpClass(cls):
        os.environ["DINEFLOW_TEST_MODE"] = "1"
        Base.metadata.drop_all(bind=test_engine)
        Base.metadata.create_all(bind=test_engine)
        db = TestSession()
        cls.pkg_manager = User(
            full_name="Packages Manager",
            email="packages-mgr@example.test",
            password_hash=hash_password("PackageTest@123"),
            role=UserRole.MANAGER,
            business_context="PACKAGE",
            is_active=True,
        )
        cls.rest_manager = User(
            full_name="Restaurant Manager",
            email="rest-mgr@example.test",
            password_hash=hash_password("RestTest@123"),
            role=UserRole.MANAGER,
            business_context="RESTAURANT",
            is_active=True,
        )
        cls.spa_manager = User(
            full_name="Spa Manager",
            email="spa-mgr@example.test",
            password_hash=hash_password("SpaTest@123"),
            role=UserRole.MANAGER,
            business_context="SPA",
            is_active=True,
        )
        cls.villa_manager = User(
            full_name="Villa Manager",
            email="villa-mgr@example.test",
            password_hash=hash_password("VillaTest@123"),
            role=UserRole.MANAGER,
            business_context="VILLA",
            is_active=True,
        )
        cls.pkg_staff = User(
            full_name="Packages Staff",
            email="pkg-staff@example.test",
            password_hash=hash_password("PkgStaff@123"),
            role=UserRole.STAFF,
            business_context="PACKAGE",
            is_active=True,
        )
        db.add_all([cls.pkg_manager, cls.rest_manager, cls.spa_manager, cls.villa_manager, cls.pkg_staff])
        db.commit()
        for u in [cls.pkg_manager, cls.rest_manager, cls.spa_manager, cls.villa_manager, cls.pkg_staff]:
            db.refresh(u)

        # Seed minimal catalog references from Restaurant, Spa, Villas for reference validation tests
        v = Villa(name="Test Resort Villa", is_active=True)
        uc = UnitCategory(name="Pool Suite", is_active=True)
        mc = MenuCategory(name="Breakfast", is_active=True)
        sc = SpaServiceCategory(name="Ayurveda", is_active=True)
        db.add_all([v, uc, mc, sc])
        db.flush()

        cls.unit = Unit(
            villa_id=v.id,
            category_id=uc.id,
            name="Sunset Villa 101",
            capacity=4,
            bedrooms=2,
            base_rate=Decimal("8000.00"),
            is_active=True,
        )
        cls.menu_item = MenuItem(
            category_id=mc.id,
            name="Champagne Breakfast",
            price=Decimal("1500.00"),
            is_available=True,
        )
        cls.spa_service = SpaService(
            category_id=sc.id,
            name="Couples Abhyanga Ritual",
            price=Decimal("4500.00"),
            duration_minutes=60,
            is_available=True,
        )
        db.add_all([cls.unit, cls.menu_item, cls.spa_service])
        db.commit()
        for obj in [
            cls.pkg_manager,
            cls.rest_manager,
            cls.spa_manager,
            cls.villa_manager,
            cls.pkg_staff,
            cls.unit,
            cls.menu_item,
            cls.spa_service,
        ]:
            db.refresh(obj)
        cls.pkg_manager_id = cls.pkg_manager.id
        cls.rest_manager_id = cls.rest_manager.id
        cls.spa_manager_id = cls.spa_manager.id
        cls.villa_manager_id = cls.villa_manager.id
        cls.pkg_staff_id = cls.pkg_staff.id
        cls.unit_id = cls.unit.id
        cls.menu_item_id = cls.menu_item.id
        cls.spa_service_id = cls.spa_service.id
        db.close()

        cls.client = TestClient(app)
        cls.pkg_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(cls.pkg_manager_id)})}"}
        cls.rest_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(cls.rest_manager_id)})}"}
        cls.spa_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(cls.spa_manager_id)})}"}
        cls.villa_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(cls.villa_manager_id)})}"}
        cls.staff_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(cls.pkg_staff_id)})}"}

        def override_db():
            s = TestSession()
            try:
                yield s
            finally:
                s.close()

        cls._orig_pdf_dir = packages_service.PACKAGE_INVOICE_PDF_DIR
        packages_service.PACKAGE_INVOICE_PDF_DIR = TEST_PDF_DIR
        app.dependency_overrides[get_db] = override_db

    @classmethod
    def tearDownClass(cls):
        packages_service.PACKAGE_INVOICE_PDF_DIR = cls._orig_pdf_dir
        shutil.rmtree(TEST_PDF_DIR, ignore_errors=True)
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()

    def _next_seq(self) -> int:
        type(self)._seq += 1
        return type(self)._seq

    def _create_customer(self) -> dict:
        seq = self._next_seq()
        res = self.client.post(
            "/api/packages/customers",
            headers=self.pkg_headers,
            json={
                "full_name": f"Package Guest {seq}",
                "phone": f"98765{seq:05d}",
                "email": f"pkg-guest-{seq}@example.test",
                "address": "MG Road, Pune",
            },
        )
        self.assertEqual(res.status_code, 201, res.text)
        return res.json()

    def _create_package(self, **overrides) -> dict:
        seq = self._next_seq()
        today = get_kolkata_today()
        payload = {
            "name": f"Honeymoon Package {seq}",
            "package_code": f"PKG-COUPLE-{seq:03d}",
            "category": "Couple",
            "description": "Romantic resort bundle",
            "duration_nights": 2,
            "min_guests": 2,
            "max_guests": 4,
            "pricing_type": "Per Package",
            "price": "20000.00",
            "valid_from": today.isoformat(),
            "valid_to": (today + timedelta(days=60)).isoformat(),
            "applicable_accommodation_types": "Pool Suite",
            "is_customizable": True,
            "terms_and_conditions": "Non-refundable within 48h",
            "exclusions": "Alcoholic beverages",
        }
        payload.update(overrides)
        res = self.client.post("/api/packages/packages", headers=self.pkg_headers, json=payload)
        return res

    # 1. AUTHENTICATION & CROSS-MODULE ISOLATION
    def test_01_auth_login_jwt_and_cross_module_isolation(self):
        # Valid PACKAGE login
        ok_login = self.client.post(
            "/api/auth/login",
            json={
                "email": "packages-mgr@example.test",
                "password": "PackageTest@123",
                "business_context": "PACKAGE",
            },
        )
        self.assertEqual(ok_login.status_code, 200, ok_login.text)
        token_data = ok_login.json()
        self.assertEqual(token_data["business_context"], "PACKAGE")
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}

        # /me returns PACKAGE context
        me_res = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["business_context"], "PACKAGE")

        # Wrong password -> 401
        bad_pw = self.client.post(
            "/api/auth/login",
            json={
                "email": "packages-mgr@example.test",
                "password": "WrongPassword!",
                "business_context": "PACKAGE",
            },
        )
        self.assertEqual(bad_pw.status_code, 401)

        # Wrong context login -> 401
        wrong_ctx = self.client.post(
            "/api/auth/login",
            json={
                "email": "packages-mgr@example.test",
                "password": "PackageTest@123",
                "business_context": "VILLA",
            },
        )
        self.assertEqual(wrong_ctx.status_code, 401)

        # Staff login -> 403
        staff_login = self.client.post(
            "/api/auth/login",
            json={
                "email": "pkg-staff@example.test",
                "password": "PkgStaff@123",
                "business_context": "PACKAGE",
            },
        )
        self.assertEqual(staff_login.status_code, 403)

        # Unauthenticated -> 401/403
        no_auth = self.client.get("/api/packages/dashboard")
        self.assertIn(no_auth.status_code, (401, 403))

        # Packages manager denied Restaurant, Spa, Villas
        self.assertEqual(self.client.get("/api/orders/", headers=headers).status_code, 403)
        self.assertEqual(self.client.get("/api/spa/dashboard/summary", headers=headers).status_code, 403)
        self.assertEqual(self.client.get("/api/villas/dashboard", headers=headers).status_code, 403)

        # Other module managers denied Packages
        self.assertEqual(self.client.get("/api/packages/dashboard", headers=self.rest_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/packages/dashboard", headers=self.spa_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/packages/dashboard", headers=self.villa_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/packages/dashboard", headers=self.staff_headers).status_code, 403)

    # 2. PACKAGE CRUD, DRAFT-FIRST, ACTIVATION & INCLUSIONS
    def test_02_package_crud_inclusions_and_status_rules(self):
        res = self._create_package()
        self.assertEqual(res.status_code, 201, res.text)
        pkg = res.json()
        self.assertEqual(pkg["status"], "Draft")

        # Duplicate package_code rejected -> 409
        dup = self._create_package(package_code=pkg["package_code"])
        self.assertEqual(dup.status_code, 409)

        # Invalid date range -> 422
        today = get_kolkata_today()
        bad_dates = self._create_package(valid_from=today.isoformat(), valid_to=(today - timedelta(days=1)).isoformat())
        self.assertEqual(bad_dates.status_code, 422)

        # Activation blocked without inclusions -> 409
        act_fail = self.client.post(
            f"/api/packages/packages/{pkg['id']}/status",
            headers=self.pkg_headers,
            json={"status": "Active"},
        )
        self.assertEqual(act_fail.status_code, 409)

        # Add mandatory inclusion with Villa Unit reference
        item1 = self.client.post(
            f"/api/packages/packages/{pkg['id']}/items",
            headers=self.pkg_headers,
            json={
                "inclusion_type": "Unit Stay",
                "description": "2 Nights in Sunset Villa",
                "quantity": 2,
                "is_optional": False,
                "reference_id": self.unit_id,
            },
        )
        self.assertEqual(item1.status_code, 201, item1.text)
        self.assertEqual(item1.json()["reference_module"], "VILLA")

        # Add optional inclusion for pending Activity module
        item2 = self.client.post(
            f"/api/packages/packages/{pkg['id']}/items",
            headers=self.pkg_headers,
            json={
                "inclusion_type": "Activity",
                "description": "Guided Nature Trail",
                "quantity": 1,
                "is_optional": True,
            },
        )
        self.assertEqual(item2.status_code, 201, item2.text)

        # Invalid quantity rejected -> 422
        bad_qty = self.client.post(
            f"/api/packages/packages/{pkg['id']}/items",
            headers=self.pkg_headers,
            json={"inclusion_type": "Amenity", "description": "Welcome Basket", "quantity": 0},
        )
        self.assertEqual(bad_qty.status_code, 422)

        # Invalid supported reference -> 404
        bad_ref = self.client.post(
            f"/api/packages/packages/{pkg['id']}/items",
            headers=self.pkg_headers,
            json={"inclusion_type": "Spa Service", "description": "Missing Spa", "quantity": 1, "reference_id": 999999},
        )
        self.assertEqual(bad_ref.status_code, 404)

        # Now activation succeeds
        act_ok = self.client.post(
            f"/api/packages/packages/{pkg['id']}/status",
            headers=self.pkg_headers,
            json={"status": "Active"},
        )
        self.assertEqual(act_ok.status_code, 200, act_ok.text)
        self.assertEqual(act_ok.json()["status"], "Active")

        # Delete second inclusion succeeds; deleting last inclusion of Active package fails -> 409
        del_2 = self.client.delete(f"/api/packages/items/{item2.json()['id']}", headers=self.pkg_headers)
        self.assertEqual(del_2.status_code, 200)
        del_last = self.client.delete(f"/api/packages/items/{item1.json()['id']}", headers=self.pkg_headers)
        self.assertEqual(del_last.status_code, 409)

        # Deactivate & archive
        deact = self.client.post(
            f"/api/packages/packages/{pkg['id']}/status",
            headers=self.pkg_headers,
            json={"status": "Inactive"},
        )
        self.assertEqual(deact.status_code, 200)
        self.assertEqual(deact.json()["status"], "Inactive")

    # 3. MEDIA UPLOAD, RETRIEVAL & DELETE
    def test_03_package_media_upload_and_validation(self):
        pkg = self._create_package().json()
        # Reject invalid image bytes
        bad = self.client.post(
            f"/api/packages/packages/{pkg['id']}/media",
            headers=self.pkg_headers,
            data={"media_type": "cover"},
            files={"file": ("fake.png", io.BytesIO(b"not-an-image"), "image/png")},
        )
        self.assertEqual(bad.status_code, 400)

        # Upload valid cover PNG
        up = self.client.post(
            f"/api/packages/packages/{pkg['id']}/media",
            headers=self.pkg_headers,
            data={"media_type": "cover", "caption": "Main Cover"},
            files={"file": ("cover.png", io.BytesIO(VALID_PNG), "image/png")},
        )
        self.assertEqual(up.status_code, 201, up.text)
        media = up.json()

        # Secure retrieval requires PACKAGE context
        self.assertEqual(self.client.get(media["url"], headers=self.rest_headers).status_code, 403)
        img_res = self.client.get(media["url"], headers=self.pkg_headers)
        self.assertEqual(img_res.status_code, 200)
        self.assertEqual(img_res.headers["content-type"], "image/png")

        # Delete media clears cover_image_url
        rm = self.client.delete(f"/api/packages/media/{media['id']}", headers=self.pkg_headers)
        self.assertEqual(rm.status_code, 200)
        detail = self.client.get(f"/api/packages/packages/{pkg['id']}", headers=self.pkg_headers).json()
        self.assertIsNone(detail["cover_image_url"])

    # 4. PRICING TYPES, BLACKOUTS, EXPIRY, BOOKINGS & SNAPSHOTS
    def test_04_pricing_blackouts_bookings_and_snapshots(self):
        today = get_kolkata_today()
        cust = self._create_customer()

        # Create 3 packages for Per Package, Per Person, Per Night
        pkg_person = self._create_package(
            name="Wellness Per Person",
            pricing_type="Per Person",
            price="5000.25",
            duration_nights=3,
            min_guests=2,
            max_guests=5,
            items=[
                {"inclusion_type": "Spa Service", "description": "Daily Ayurveda", "quantity": 1, "reference_id": self.spa_service_id}
            ],
        ).json()
        self.client.post(f"/api/packages/packages/{pkg_person['id']}/status", headers=self.pkg_headers, json={"status": "Active"})

        pkg_night = self._create_package(
            name="Weekend Per Night",
            pricing_type="Per Night",
            price="7500.50",
            duration_nights=3,
            min_guests=1,
            max_guests=4,
            items=[
                {"inclusion_type": "Meal Plan", "description": "Breakfast Included", "quantity": 3, "reference_id": self.menu_item_id}
            ],
        ).json()
        self.client.post(f"/api/packages/packages/{pkg_night['id']}/status", headers=self.pkg_headers, json={"status": "Active"})

        # Add blackout on pkg_person for days 10..12
        blk = self.client.post(
            "/api/packages/blackouts",
            headers=self.pkg_headers,
            json={
                "package_id": pkg_person["id"],
                "start_date": (today + timedelta(days=10)).isoformat(),
                "end_date": (today + timedelta(days=12)).isoformat(),
                "reason": "Annual Retreat Maintenance",
            },
        )
        self.assertEqual(blk.status_code, 201, blk.text)

        # Booking overlapping blackout rejected -> 409
        blk_fail = self.client.post(
            "/api/packages/bookings",
            headers=self.pkg_headers,
            json={
                "package_id": pkg_person["id"],
                "customer_id": cust["id"],
                "start_date": (today + timedelta(days=9)).isoformat(),  # 3 nights: 9,10,11 overlaps 10..12
                "guest_count": 3,
            },
        )
        self.assertEqual(blk_fail.status_code, 409)

        # Guest limit violation -> 409
        guest_fail = self.client.post(
            "/api/packages/bookings",
            headers=self.pkg_headers,
            json={
                "package_id": pkg_person["id"],
                "customer_id": cust["id"],
                "start_date": (today + timedelta(days=2)).isoformat(),
                "guest_count": 1,  # below min_guests=2
            },
        )
        self.assertEqual(guest_fail.status_code, 409)

        # Valid Per Person booking: 5000.25 * 3 = 15000.75
        bk_person = self.client.post(
            "/api/packages/bookings",
            headers=self.pkg_headers,
            json={
                "package_id": pkg_person["id"],
                "customer_id": cust["id"],
                "start_date": (today + timedelta(days=2)).isoformat(),
                "guest_count": 3,
            },
        )
        self.assertEqual(bk_person.status_code, 201, bk_person.text)
        b1 = bk_person.json()
        self.assertRegex(b1["booking_number"], rf"^PKG-{today.year}-\d{{4}}$")
        self.assertEqual(Decimal(str(b1["total_amount"])), Decimal("15000.75"))

        # Valid Per Night booking: 7500.50 * 3 = 22501.50
        bk_night = self.client.post(
            "/api/packages/bookings",
            headers=self.pkg_headers,
            json={
                "package_id": pkg_night["id"],
                "customer_id": cust["id"],
                "start_date": (today + timedelta(days=3)).isoformat(),
                "guest_count": 2,
            },
        )
        self.assertEqual(bk_night.status_code, 201, bk_night.text)
        b2 = bk_night.json()
        self.assertEqual(Decimal(str(b2["total_amount"])), Decimal("22501.50"))
        self.assertNotEqual(b1["booking_number"], b2["booking_number"])

        # Edit pkg_person price & name later -> existing booking b1 snapshot MUST remain unchanged!
        self.client.patch(
            f"/api/packages/packages/{pkg_person['id']}",
            headers=self.pkg_headers,
            json={"name": "Renamed Expensive Package", "price": "9999.00"},
        )
        b1_after = self.client.get(f"/api/packages/bookings/{b1['id']}", headers=self.pkg_headers).json()
        self.assertEqual(b1_after["package_name"], "Wellness Per Person")
        self.assertEqual(Decimal(str(b1_after["total_amount"])), Decimal("15000.75"))

        # Expired package auto-expiry & booking rejection
        exp_pkg = self._create_package(
            valid_from=(today - timedelta(days=10)).isoformat(),
            valid_to=(today - timedelta(days=1)).isoformat(),
            items=[{"inclusion_type": "Other", "description": "Day pass", "quantity": 1}],
        ).json()
        exp_list = self.client.get("/api/packages/packages", headers=self.pkg_headers, params={"status": "Expired"}).json()
        # Note: Draft stays Draft unless Active/Inactive; set via DB or test Inactive -> Expired
        db = TestSession()
        p_row = db.get(packages_service.Package, exp_pkg["id"])
        p_row.status = "Active"
        db.commit()
        db.close()

        exp_detail = self.client.get(f"/api/packages/packages/{exp_pkg['id']}", headers=self.pkg_headers).json()
        self.assertEqual(exp_detail["status"], "Expired")
        exp_book = self.client.post(
            "/api/packages/bookings",
            headers=self.pkg_headers,
            json={
                "package_id": exp_pkg["id"],
                "customer_id": cust["id"],
                "start_date": today.isoformat(),
                "guest_count": 2,
            },
        )
        self.assertEqual(exp_book.status_code, 409)

    # 5. BOOKING LIFECYCLE, CANCELLATION REASON, INVOICES, PAYMENTS, PDF & REPORTS
    def test_05_booking_lifecycle_billing_pdf_and_reports(self):
        today = get_kolkata_today()
        cust = self._create_customer()
        pkg = self._create_package(
            pricing_type="Per Package",
            price="10000.00",
            items=[{"inclusion_type": "Amenity", "description": "Full Resort Access", "quantity": 1}],
        ).json()
        self.client.post(f"/api/packages/packages/{pkg['id']}/status", headers=self.pkg_headers, json={"status": "Active"})

        # Booking 1 -> generate invoice, Advance + Partial + Full payment, PDF
        bk_res = self.client.post(
            "/api/packages/bookings",
            headers=self.pkg_headers,
            json={
                "package_id": pkg["id"],
                "customer_id": cust["id"],
                "start_date": (today + timedelta(days=4)).isoformat(),
                "guest_count": 2,
                "generate_invoice": True,
                "gst_rate": "18.00",
            },
        )
        self.assertEqual(bk_res.status_code, 201, bk_res.text)
        bk = bk_res.json()
        inv_id = bk["invoice_id"]
        self.assertIsNotNone(inv_id)
        # 10000 + 18% GST = 11800.00
        self.assertEqual(Decimal(str(bk["invoice_total"])), Decimal("11800.00"))

        # Duplicate invoice rejected -> 409
        dup_inv = self.client.post(
            "/api/packages/invoices",
            headers=self.pkg_headers,
            json={"booking_id": bk["id"], "gst_rate": "18.00"},
        )
        self.assertEqual(dup_inv.status_code, 409)

        # Advance payment: 3000 via UPI
        p1 = self.client.post(
            f"/api/packages/invoices/{inv_id}/payments",
            headers=self.pkg_headers,
            json={"amount": "3000.00", "payment_method": "UPI", "payment_type": "Advance", "reference_number": "UPI-ADV-1"},
        )
        self.assertEqual(p1.status_code, 201, p1.text)
        self.assertEqual(p1.json()["invoice"]["payment_status"], "Partially Paid")
        self.assertEqual(Decimal(str(p1.json()["invoice"]["balance_due"])), Decimal("8800.00"))

        # Partial payment: 4000 via Card
        p2 = self.client.post(
            f"/api/packages/invoices/{inv_id}/payments",
            headers=self.pkg_headers,
            json={"amount": "4000.00", "payment_method": "Card", "payment_type": "Partial", "reference_number": "CARD-2"},
        )
        self.assertEqual(p2.status_code, 201, p2.text)
        self.assertEqual(Decimal(str(p2.json()["invoice"]["balance_due"])), Decimal("4800.00"))

        # Overpayment rejected -> 422
        over = self.client.post(
            f"/api/packages/invoices/{inv_id}/payments",
            headers=self.pkg_headers,
            json={"amount": "5000.00", "payment_method": "Cash", "payment_type": "Full"},
        )
        self.assertEqual(over.status_code, 422)

        # Final payment: 4800 via Net Banking -> Paid
        p3 = self.client.post(
            f"/api/packages/invoices/{inv_id}/payments",
            headers=self.pkg_headers,
            json={"amount": "4800.00", "payment_method": "Net Banking", "payment_type": "Full"},
        )
        self.assertEqual(p3.status_code, 201, p3.text)
        self.assertEqual(p3.json()["invoice"]["payment_status"], "Paid")
        self.assertEqual(Decimal(str(p3.json()["invoice"]["balance_due"])), Decimal("0.00"))

        # Download PDF -> valid PDF header
        pdf_res = self.client.get(f"/api/packages/invoices/{inv_id}/pdf", headers=self.pkg_headers)
        self.assertEqual(pdf_res.status_code, 200)
        self.assertTrue(pdf_res.content.startswith(b"%PDF"))

        # Verify Restaurant /api/invoices/ does NOT crash or leak Package invoices
        rest_inv_res = self.client.get("/api/invoices/", headers=self.rest_headers)
        self.assertEqual(rest_inv_res.status_code, 200)
        self.assertFalse(any(i["id"] == inv_id for i in rest_inv_res.json()))

        # Booking transitions: Pending -> Confirmed -> In Progress -> Completed
        self.assertEqual(
            self.client.patch(f"/api/packages/bookings/{bk['id']}/status", headers=self.pkg_headers, json={"status": "Confirmed"}).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(f"/api/packages/bookings/{bk['id']}/status", headers=self.pkg_headers, json={"status": "In Progress"}).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(f"/api/packages/bookings/{bk['id']}/status", headers=self.pkg_headers, json={"status": "Completed"}).status_code,
            200,
        )
        # Invalid transition from Completed -> 409
        self.assertEqual(
            self.client.patch(f"/api/packages/bookings/{bk['id']}/status", headers=self.pkg_headers, json={"status": "Pending"}).status_code,
            409,
        )

        # Booking 2: Cancellation requires reason
        bk2 = self.client.post(
            "/api/packages/bookings",
            headers=self.pkg_headers,
            json={
                "package_id": pkg["id"],
                "customer_id": cust["id"],
                "start_date": (today + timedelta(days=5)).isoformat(),
                "guest_count": 2,
            },
        ).json()
        cancel_no_reason = self.client.patch(
            f"/api/packages/bookings/{bk2['id']}/status",
            headers=self.pkg_headers,
            json={"status": "Cancelled"},
        )
        self.assertEqual(cancel_no_reason.status_code, 422)
        cancel_ok = self.client.patch(
            f"/api/packages/bookings/{bk2['id']}/status",
            headers=self.pkg_headers,
            json={"status": "Cancelled", "reason": "Guest changed travel itinerary"},
        )
        self.assertEqual(cancel_ok.status_code, 200)
        self.assertEqual(cancel_ok.json()["status"], "Cancelled")
        self.assertGreaterEqual(len(cancel_ok.json()["history"]), 2)

        # Dashboard & Reports reflect real data
        dash = self.client.get("/api/packages/dashboard", headers=self.pkg_headers)
        self.assertEqual(dash.status_code, 200)
        self.assertGreaterEqual(dash.json()["statistics"]["total_bookings"], 2)

        rep = self.client.get("/api/packages/reports", headers=self.pkg_headers)
        self.assertEqual(rep.status_code, 200)
        self.assertGreaterEqual(len(rep.json()["cancellation_report"]), 1)

        csv_res = self.client.get("/api/packages/reports/export", headers=self.pkg_headers)
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn("Booking Number", csv_res.text)

    def test_06_shared_billing_isolation_and_no_duplicates(self):
        from app.models.entities import Order, OrderStatus, PaymentMethod, PaymentStatus, RestaurantTable, TableStatus

        today = get_kolkata_today()
        db = TestSession()
        try:
            cust_rest = Customer(
                full_name="Restaurant Billing Guest",
                phone=f"98222{self._seq:05d}",
                email=f"restiso{self._seq}@example.test",
            )
            db.add(cust_rest)
            tbl = RestaurantTable(table_number=f"T-ISO-{self._seq}", capacity=4, status=TableStatus.AVAILABLE)
            db.add(tbl)
            db.flush()
            rest_order = Order(
                order_number=f"ORD-ISO-{self._seq}",
                table_id=tbl.id,
                customer_id=cust_rest.id,
                created_by_user_id=self.rest_manager_id,
                status=OrderStatus.COMPLETED,
            )
            db.add(rest_order)
            db.flush()
            rest_inv = Invoice(
                invoice_number=f"INV-REST-{self._seq}",
                order_id=rest_order.id,
                source_module="RESTAURANT",
                subtotal=Decimal("2000.00"),
                gst_rate=Decimal("5.00"),
                gst_amount=Decimal("100.00"),
                total_amount=Decimal("2100.00"),
                paid_amount=Decimal("2100.00"),
                balance_due=Decimal("0.00"),
                payment_status=PaymentStatus.PAID,
            )
            db.add(rest_inv)
            db.flush()
            rest_pay = Payment(
                invoice_id=rest_inv.id,
                amount=Decimal("2100.00"),
                payment_method=PaymentMethod.CASH,
                status=PaymentStatus.PAID,
                source_module="RESTAURANT",
                payment_type="Full",
            )
            db.add(rest_pay)
            db.commit()
            rest_inv_id = rest_inv.id
            rest_pay_id = rest_pay.id
        finally:
            db.close()

        # Snapshot dashboard revenue before creating cross-module billing records
        before_rest_dash = self.client.get("/api/dashboard/summary?preset=all", headers=self.rest_headers)
        self.assertEqual(before_rest_dash.status_code, 200, before_rest_dash.text)
        before_rest_rev = Decimal(str(before_rest_dash.json()["statistics"]["total_revenue"]))
        before_pkg_rev = Decimal(str(self.client.get("/api/packages/dashboard", headers=self.pkg_headers).json()["statistics"]["revenue_generated"]))

        # Create an active package, customer, booking, invoice, and payment in PACKAGE context
        pkg_res = self._create_package(
            name="Isolation Verify Package",
            pricing_mode="Per Package",
            base_price="10000.00",
        )
        self.assertEqual(pkg_res.status_code, 201, pkg_res.text)
        pkg = pkg_res.json()
        self.assertEqual(
            self.client.post(
                f"/api/packages/packages/{pkg['id']}/items",
                headers=self.pkg_headers,
                json={"inclusion_type": "Activity", "description": "Welcome Amenity", "quantity": 1, "is_optional": False},
            ).status_code,
            201,
        )
        self.assertEqual(
            self.client.post(
                f"/api/packages/packages/{pkg['id']}/status",
                headers=self.pkg_headers,
                json={"status": "Active"},
            ).status_code,
            200,
        )
        cust_res = self.client.post(
            "/api/packages/customers",
            headers=self.pkg_headers,
            json={"full_name": "Isolation Billing Guest", "phone": f"98111{self._seq:05d}", "email": f"iso{self._seq}@example.test"},
        )
        self.assertEqual(cust_res.status_code, 201, cust_res.text)
        cust = cust_res.json()
        bk_res = self.client.post(
            "/api/packages/bookings",
            headers=self.pkg_headers,
            json={"package_id": pkg["id"], "customer_id": cust["id"], "start_date": (today + timedelta(days=2)).isoformat(), "guest_count": 2},
        )
        self.assertEqual(bk_res.status_code, 201, bk_res.text)
        bk = bk_res.json()

        # Unpaid package invoice before second duplicate attempt
        pkg_inv_res = self.client.post("/api/packages/invoices", headers=self.pkg_headers, json={"booking_id": bk["id"], "gst_rate": "18.00"})
        self.assertEqual(pkg_inv_res.status_code, 201, pkg_inv_res.text)
        pkg_inv_id = pkg_inv_res.json()["id"]
        self.assertEqual(pkg_inv_res.json()["source_module"], "PACKAGE")

        # Duplicate invoice generation rejected cleanly without adding another row
        dup_inv = self.client.post("/api/packages/invoices", headers=self.pkg_headers, json={"booking_id": bk["id"], "gst_rate": "18.00"})
        self.assertEqual(dup_inv.status_code, 409)

        # Restaurant DELETE/GET endpoints must NOT touch or delete a Pending Package invoice
        self.assertEqual(self.client.get(f"/api/invoices/{pkg_inv_id}", headers=self.rest_headers).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/invoices/{pkg_inv_id}", headers=self.rest_headers).status_code, 404)
        self.assertEqual(self.client.get(f"/api/invoices/{pkg_inv_id}/pdf", headers=self.rest_headers).status_code, 404)
        self.assertEqual(self.client.post(f"/api/payments/invoice/{pkg_inv_id}", headers=self.rest_headers, json={"amount": "100.00", "payment_method": "Cash"}).status_code, 404)

        # Record a Package payment and confirm isolation across Restaurant/Packages dashboards, lists, and lookups
        pkg_pay_res = self.client.post(
            f"/api/packages/invoices/{pkg_inv_id}/payments",
            headers=self.pkg_headers,
            json={"amount": "4500.00", "payment_method": "UPI", "payment_type": "Advance"},
        )
        self.assertEqual(pkg_pay_res.status_code, 201, pkg_pay_res.text)
        pkg_pay_id = pkg_pay_res.json()["payment"]["id"]

        rest_invoices = self.client.get("/api/invoices/", headers=self.rest_headers).json()
        rest_payments = self.client.get("/api/payments/", headers=self.rest_headers).json()
        self.assertTrue(any(i["id"] == rest_inv_id for i in rest_invoices))
        self.assertFalse(any(i["id"] == pkg_inv_id for i in rest_invoices))
        self.assertTrue(any(p["id"] == rest_pay_id for p in rest_payments))
        self.assertFalse(any(p["id"] == pkg_pay_id for p in rest_payments))
        self.assertEqual(self.client.get(f"/api/payments/{pkg_pay_id}", headers=self.rest_headers).status_code, 404)

        # Restaurant dashboard summary excludes Package payment (4500.00) and includes only Restaurant payment
        rest_dash = self.client.get("/api/dashboard/summary?preset=all", headers=self.rest_headers)
        self.assertEqual(rest_dash.status_code, 200, rest_dash.text)
        self.assertEqual(Decimal(str(rest_dash.json()["statistics"]["total_revenue"])), before_rest_rev)

        # Package APIs exclude Restaurant invoices/payments and count only Package revenue (+4500.00)
        pkg_invoices = self.client.get("/api/packages/invoices?page_size=100", headers=self.pkg_headers).json()["items"]
        self.assertTrue(any(i["id"] == pkg_inv_id for i in pkg_invoices))
        self.assertFalse(any(i["id"] == rest_inv_id for i in pkg_invoices))
        self.assertEqual(self.client.get(f"/api/packages/invoices/{rest_inv_id}", headers=self.pkg_headers).status_code, 404)
        self.assertEqual(self.client.get(f"/api/packages/invoices/{rest_inv_id}/pdf", headers=self.pkg_headers).status_code, 404)
        pkg_dash = self.client.get("/api/packages/dashboard", headers=self.pkg_headers).json()
        self.assertEqual(Decimal(str(pkg_dash["statistics"]["revenue_generated"])), before_pkg_rev + Decimal("4500.00"))


if __name__ == "__main__":
    unittest.main()
