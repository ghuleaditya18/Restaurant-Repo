"""Isolated integration tests for the Villas API workflows."""
import os
import shutil
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

from app.core.security import create_access_token, hash_password
from app.core.config import settings
from app.core.date_utils import get_kolkata_today
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import User, Staff
from app.models.entities import UserRole
from app.services import villas_service


TEST_DB_PATH = Path(__file__).resolve().parent / "test_villas_isolated.db"
TEST_PDF_DIR = Path(__file__).resolve().parent / "_tmp_villa_pdfs"
TEST_DATABASE_URL = os.environ.get("VILLAS_TEST_DATABASE_URL", f"sqlite:///{TEST_DB_PATH.as_posix()}")
parsed_test_url = make_url(TEST_DATABASE_URL)
test_db_name = (parsed_test_url.database or "").lower()
if test_db_name in {"resort_db", "restaurant_db", "dineflow_db"}:
    raise RuntimeError("Villas tests are blocked from using the operational database.")
if "test" not in test_db_name and ":memory:" not in TEST_DATABASE_URL.lower():
    raise RuntimeError("Villas tests require a dedicated database name containing 'test' or in-memory SQLite.")
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in TEST_DATABASE_URL else {})
Session = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class TestVillasWorkflows(unittest.TestCase):
    _setup_seq = 0

    @classmethod
    def setUpClass(cls):
        os.environ["DINEFLOW_TEST_MODE"] = "1"
        Base.metadata.create_all(bind=test_engine)
        db = Session()
        cls.manager = User(full_name="Villa Manager", email="villas-manager@example.test", password_hash=hash_password("VillaTest@123"), role=UserRole.MANAGER, business_context="VILLA", is_active=True)
        cls.other = User(full_name="Restaurant Manager", email="restaurant-manager@example.test", password_hash=hash_password("Restaurant@123"), role=UserRole.MANAGER, business_context="RESTAURANT", is_active=True)
        cls.staff_user = User(full_name="Villa Service Staff", email="villa-staff@example.test", password_hash=hash_password("VillaStaff@123"), role=UserRole.STAFF, business_context="VILLA", is_active=True)
        cls.inactive_villa_staff_user = User(full_name="Inactive Villa Staff", email="inactive-villa-staff@example.test", password_hash=hash_password("VillaStaff@123"), role=UserRole.STAFF, business_context="VILLA", is_active=False)
        cls.rest_staff_user = User(full_name="Restaurant Waiter", email="rest-staff@example.test", password_hash=hash_password("RestStaff@123"), role=UserRole.STAFF, business_context="RESTAURANT", is_active=True)
        cls.spa_staff_user = User(full_name="Spa Reception Staff", email="spa-staff@example.test", password_hash=hash_password("SpaStaff@123"), role=UserRole.STAFF, business_context="SPA", is_active=True)
        cls.inactive_manager = User(full_name="Inactive Villa Manager", email="inactive-villa-manager@example.test", password_hash=hash_password("InactiveVilla@123"), role=UserRole.MANAGER, business_context="VILLA", is_active=False)
        db.add_all([cls.manager, cls.other, cls.staff_user, cls.inactive_villa_staff_user, cls.rest_staff_user, cls.spa_staff_user, cls.inactive_manager]); db.commit(); db.refresh(cls.manager); db.refresh(cls.other); db.refresh(cls.staff_user); db.refresh(cls.inactive_villa_staff_user); db.refresh(cls.rest_staff_user); db.refresh(cls.spa_staff_user); db.refresh(cls.inactive_manager); db.close()
        db = Session()
        cls.staff_member = Staff(user_id=cls.staff_user.id, employee_code="VILLA-SVC-01", phone="9876500000", designation="Guest Services")
        cls.inactive_villa_staff = Staff(user_id=cls.inactive_villa_staff_user.id, employee_code="VILLA-SVC-02", phone="9876500001", designation="Housekeeping")
        cls.rest_staff_member = Staff(user_id=cls.rest_staff_user.id, employee_code="REST-01", phone="9876500002", designation="Waiter")
        cls.spa_staff_member = Staff(user_id=cls.spa_staff_user.id, employee_code="SPA-01", phone="9876500003", designation="Attendant")
        db.add_all([cls.staff_member, cls.inactive_villa_staff, cls.rest_staff_member, cls.spa_staff_member]); db.commit()
        for obj in [cls.staff_member, cls.inactive_villa_staff, cls.rest_staff_member, cls.spa_staff_member]:
            db.refresh(obj)
        cls.inactive_villa_staff_id = cls.inactive_villa_staff.id
        cls.rest_staff_member_id = cls.rest_staff_member.id
        db.close()
        cls.client = TestClient(app)
        cls.headers = {"Authorization": f"Bearer {create_access_token({'sub': str(cls.manager.id)})}"}
        cls.other_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(cls.other.id)})}"}
        cls.staff_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(cls.staff_user.id)})}"}

        def override_db():
            db = Session()
            try:
                yield db
            finally:
                db.close()
        cls._orig_pdf_dir = villas_service.VILLA_INVOICE_PDF_DIR
        villas_service.VILLA_INVOICE_PDF_DIR = TEST_PDF_DIR
        app.dependency_overrides[get_db] = override_db

    @classmethod
    def tearDownClass(cls):
        villas_service.VILLA_INVOICE_PDF_DIR = cls._orig_pdf_dir
        shutil.rmtree(TEST_PDF_DIR, ignore_errors=True)
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()

    def setUp(self):
        type(self)._setup_seq += 1
        seq = type(self)._setup_seq
        today = date.today()
        self.arrival = today + timedelta(days=14)
        self.departure = self.arrival + timedelta(days=2)
        villa = self.client.post("/api/villas/villas", headers=self.headers, json={"name": f"V-Property-{id(self)}"})
        self.assertEqual(villa.status_code, 201, villa.text)
        category = self.client.post("/api/villas/categories", headers=self.headers, json={"name": f"V-Category-{id(self)}"})
        self.assertEqual(category.status_code, 201, category.text)
        unit = self.client.post("/api/villas/units", headers=self.headers, json={"villa_id": villa.json()["id"], "category_id": category.json()["id"], "name": "Hill Suite", "capacity": 4, "bedrooms": 2, "base_rate": "5000"})
        self.assertEqual(unit.status_code, 201, unit.text)
        self.unit_id = unit.json()["id"]
        self.villa_id = villa.json()["id"]
        self.cat_id = category.json()["id"]
        customer = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest": {
                    "full_name": "Test Guest",
                    "phone": f"98765{seq:05d}",
                    "email": f"guest{seq}@example.test",
                },
                "check_in": self.arrival.isoformat(),
                "check_out": self.departure.isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(customer.status_code, 201, customer.text)
        self.booking = customer.json()
        self.invoice_id = self.booking["invoice_id"]
        self.assertIsNotNone(self.invoice_id)

    def test_other_business_context_is_denied(self):
        response = self.client.get("/api/villas/villas", headers=self.other_headers)
        self.assertEqual(response.status_code, 403)

    def test_missing_auth_and_service_staff_are_denied(self):
        self.assertEqual(self.client.get("/api/villas/villas").status_code, 401)
        self.assertEqual(self.client.get("/api/villas/villas", headers=self.staff_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/villas/villas", headers={"Authorization": "Bearer invalid-token"}).status_code, 401)
        expired_token = jwt.encode(
            {"sub": str(self.manager.id), "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        self.assertEqual(self.client.get("/api/villas/villas", headers={"Authorization": f"Bearer {expired_token}"}).status_code, 401)

    def test_unit_availability_and_overlapping_reservation(self):
        response = self.client.get("/api/villas/availability", headers=self.headers, params={"start_date": self.arrival, "end_date": self.departure, "guests": 2})
        own_unit = next(row for row in response.json() if row["id"] == self.unit_id)
        self.assertFalse(own_unit["available"])
        conflict = self.client.post("/api/villas/bookings", headers=self.headers, json={"unit_id": self.unit_id, "customer": {"full_name": "Second Guest", "phone": "9876501234"}, "check_in": self.arrival.isoformat(), "check_out": self.departure.isoformat(), "guests": 2})
        self.assertEqual(conflict.status_code, 409)

    def test_capacity_and_checkin_checkout_invoice_payment(self):
        too_many = self.client.post("/api/villas/bookings", headers=self.headers, json={"unit_id": self.unit_id, "customer": {"full_name": "Large Party", "phone": "9876504321"}, "check_in": (self.departure + timedelta(days=1)).isoformat(), "check_out": (self.departure + timedelta(days=3)).isoformat(), "guests": 5})
        self.assertEqual(too_many.status_code, 422)
        advance = self.client.post(f"/api/villas/invoices/{self.invoice_id}/payments", headers=self.headers, params={"amount": "1000", "method": "UPI"})
        self.assertEqual(advance.status_code, 201, advance.text)
        self.assertEqual(advance.json()["payment_status"], "Partially Paid")
        early = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Confirmed"})
        self.assertEqual(early.status_code, 200)
        early_checkin = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked In"})
        self.assertEqual(early_checkin.status_code, 409)
        db = Session(); db.query(__import__("app.models", fromlist=["StayBooking"]).StayBooking).filter_by(id=self.booking["id"]).update({"check_in": date.today() - timedelta(days=1)}); db.commit(); db.close()
        checkin = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked In"})
        self.assertEqual(checkin.status_code, 200, checkin.text)
        checkout = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked Out"})
        self.assertEqual(checkout.status_code, 200, checkout.text)
        invoice = self.client.get("/api/villas/invoices", headers=self.headers).json()[0]
        self.assertTrue(invoice["is_finalized"])
        self.assertEqual(invoice["payment_status"], "Partially Paid")
        balance = float(invoice["total_amount"]) - float(invoice["paid_amount"])
        paid = self.client.post(f"/api/villas/invoices/{invoice['id']}/payments", headers=self.headers, params={"amount": balance, "method": "UPI"})
        self.assertEqual(paid.status_code, 201, paid.text)
        self.assertEqual(paid.json()["payment_status"], "Paid")

    def test_booking_edit_confirmation_same_day_turnover_and_housekeeping(self):
        edit = self.client.patch(f"/api/villas/bookings/{self.booking['id']}", headers=self.headers, json={"check_in": (self.arrival + timedelta(days=1)).isoformat(), "check_out": (self.departure + timedelta(days=1)).isoformat(), "guests": 3})
        self.assertEqual(edit.status_code, 200, edit.text)
        self.assertEqual(edit.json()["guests"], 3)
        confirmation = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Confirmed"})
        self.assertEqual(confirmation.status_code, 200)
        next_guest = self.client.post("/api/villas/bookings", headers=self.headers, json={"unit_id": self.unit_id, "customer": {"full_name": "Turnover Guest", "phone": "9876502345"}, "check_in": edit.json()["check_out"], "check_out": (self.departure + timedelta(days=2)).isoformat(), "guests": 2})
        self.assertEqual(next_guest.status_code, 201, next_guest.text)
        db = Session()
        from app.models import Unit
        db.query(Unit).filter_by(id=self.unit_id).update({"housekeeping_status": "Needs Cleaning"})
        db.commit(); db.close()
        db = Session()
        db.query(__import__("app.models", fromlist=["StayBooking"]).StayBooking).filter_by(id=self.booking["id"]).update({"check_in": date.today() - timedelta(days=1)})
        db.commit(); db.close()
        checkin = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked In"})
        self.assertEqual(checkin.status_code, 409)
        ready = self.client.patch(f"/api/villas/units/{self.unit_id}/housekeeping", headers=self.headers, json={"status": "Ready"})
        self.assertEqual(ready.status_code, 200, ready.text)
        checkin = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked In"})
        self.assertEqual(checkin.status_code, 200, checkin.text)
        checkout = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked Out"})
        self.assertEqual(checkout.status_code, 200, checkout.text)
        units = self.client.get("/api/villas/units", headers=self.headers).json()
        self.assertEqual(next(u for u in units if u["id"] == self.unit_id)["housekeeping_status"], "Needs Cleaning")

    def test_rate_season_and_block_conflict(self):
        payload = {"unit_id": self.unit_id, "name": "Peak", "start_date": self.arrival.isoformat(), "end_date": self.departure.isoformat(), "nightly_rate": "7500"}
        rate = self.client.post("/api/villas/rates", headers=self.headers, json=payload)
        self.assertEqual(rate.status_code, 201, rate.text)
        overlap = self.client.post("/api/villas/rates", headers=self.headers, json={**payload, "name": "Overlap"})
        self.assertEqual(overlap.status_code, 409)
        block = self.client.post("/api/villas/blocks", headers=self.headers, json={"unit_id": self.unit_id, "start_date": self.arrival.isoformat(), "end_date": self.departure.isoformat(), "reason": "Maintenance"})
        self.assertEqual(block.status_code, 409)

    def test_maintenance_hold_blocks_availability_and_booking(self):
        start = self.departure + timedelta(days=4)
        end = start + timedelta(days=2)
        block = self.client.post("/api/villas/blocks", headers=self.headers, json={"unit_id": self.unit_id, "start_date": start.isoformat(), "end_date": end.isoformat(), "reason": "Owner hold"})
        self.assertEqual(block.status_code, 201, block.text)
        available = self.client.get("/api/villas/availability", headers=self.headers, params={"start_date": start, "end_date": end, "guests": 2}).json()
        self.assertFalse(next(item for item in available if item["id"] == self.unit_id)["available"])
        booking = self.client.post("/api/villas/bookings", headers=self.headers, json={"unit_id": self.unit_id, "customer": {"full_name": "Blocked Guest", "phone": "9876503456"}, "check_in": start.isoformat(), "check_out": end.isoformat(), "guests": 2})
        self.assertEqual(booking.status_code, 409)

    def test_guest_service_assignment_completion_and_invoice_charge(self):
        service = self.client.post("/api/villas/services", headers=self.headers, json={"name": f"Welcome service {id(self)}", "price": "250"})
        self.assertEqual(service.status_code, 201, service.text)
        self.assertEqual(self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Confirmed"}).status_code, 200)
        db = Session()
        from app.models import StayBooking
        db.query(StayBooking).filter_by(id=self.booking["id"]).update({"check_in": date.today() - timedelta(days=1)})
        db.commit(); db.close()
        checkin = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked In"})
        self.assertEqual(checkin.status_code, 200, checkin.text)
        request = self.client.post(f"/api/villas/bookings/{self.booking['id']}/services", headers=self.headers, json={"service_id": service.json()["id"], "staff_id": self.staff_member.id, "quantity": 2})
        self.assertEqual(request.status_code, 201, request.text)
        self.assertEqual(float(request.json()["unit_price"]), 250)
        request_status = self.client.patch(f"/api/villas/service-requests/{request.json()['id']}/status", headers=self.headers, params={"status": "Completed"})
        self.assertEqual(request_status.status_code, 200)
        checkout = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked Out"})
        self.assertEqual(checkout.status_code, 200, checkout.text)
        invoice = next(i for i in self.client.get("/api/villas/invoices", headers=self.headers).json() if i["id"] == self.invoice_id)
        self.assertEqual(float(invoice["subtotal"]), float(self.booking["total_amount"]) + 500)

    def test_module_login_checks_requested_context(self):
        accepted = self.client.post("/api/auth/login", json={
            "email": "villas-manager@example.test",
            "password": "VillaTest@123",
            "business_context": "VILLA",
        })
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted.json()["business_context"], "VILLA")

        alias_accepted = self.client.post("/api/auth/login", json={
            "email": "villas-manager@example.test",
            "password": "VillaTest@123",
            "business_context": "VILLAS",
        })
        self.assertEqual(alias_accepted.status_code, 200, alias_accepted.text)
        self.assertEqual(alias_accepted.json()["business_context"], "VILLA")

        for wrong_context in ["SPA", "RESTAURANT", "UNKNOWN"]:
            rejected = self.client.post("/api/auth/login", json={
                "email": "villas-manager@example.test",
                "password": "VillaTest@123",
                "business_context": wrong_context,
            })
            self.assertEqual(rejected.status_code, 401)

        rest_accepted = self.client.post("/api/auth/login", json={
            "email": "restaurant-manager@example.test",
            "password": "Restaurant@123",
            "business_context": "RESTAURANT",
        })
        self.assertEqual(rest_accepted.status_code, 200, rest_accepted.text)
        self.assertEqual(rest_accepted.json()["business_context"], "RESTAURANT")

        rest_wrong = self.client.post("/api/auth/login", json={
            "email": "restaurant-manager@example.test",
            "password": "Restaurant@123",
            "business_context": "VILLA",
        })
        self.assertEqual(rest_wrong.status_code, 401)

        legacy = self.client.post("/api/auth/login", json={
            "email": "restaurant-manager@example.test",
            "password": "Restaurant@123",
        })
        self.assertEqual(legacy.status_code, 200, legacy.text)
        self.assertEqual(legacy.json()["business_context"], "RESTAURANT")

    def test_login_rejects_bad_credentials_and_inactive_accounts(self):
        for email, password in [
            ("villas-manager@example.test", "incorrect-password"),
            ("missing@example.test", "VillaTest@123"),
        ]:
            response = self.client.post("/api/auth/login", json={"email": email, "password": password, "business_context": "VILLA"})
            self.assertEqual(response.status_code, 401)

        inactive = self.client.post("/api/auth/login", json={
            "email": "inactive-villa-manager@example.test",
            "password": "InactiveVilla@123",
            "business_context": "VILLA",
        })
        self.assertEqual(inactive.status_code, 403)

    def test_villa_token_cannot_access_restaurant_or_spa_apis(self):
        self.assertEqual(self.client.get("/api/dashboard/summary", headers=self.headers).status_code, 403)
        self.assertEqual(self.client.get("/api/spa/dashboard/summary", headers=self.headers).status_code, 403)
        self.assertEqual(self.client.get("/api/staff/", headers=self.headers).status_code, 403)
        self.assertEqual(self.client.get("/api/spa/staff", headers=self.headers).status_code, 403)

    def test_villas_staff_filters_by_villa_context_and_active_status(self):
        self.assertEqual(self.client.get("/api/villas/staff").status_code, 401)
        self.assertEqual(self.client.get("/api/villas/staff", headers=self.other_headers).status_code, 403)
        res = self.client.get("/api/villas/staff", headers=self.headers)
        self.assertEqual(res.status_code, 200, res.text)
        rows = res.json()
        returned_ids = {row["id"] for row in rows}
        self.assertEqual(returned_ids, {self.staff_member.id})
        self.assertEqual(rows[0]["name"], "Villa Service Staff")

    def test_block_conflict_rules_across_all_booking_statuses_and_boundaries(self):
        from app.core.date_utils import get_kolkata_today
        from app.models import StayBooking, UnitBlock

        kolkata_today = get_kolkata_today()

        # 1. Reserved booking (self.booking) overlaps -> 409 and block not persisted
        res_reserved = self.client.post("/api/villas/blocks", headers=self.headers, json={
            "unit_id": self.unit_id, "start_date": self.arrival.isoformat(), "end_date": self.departure.isoformat(), "reason": "Reserved overlap"
        })
        self.assertEqual(res_reserved.status_code, 409)

        # 2. Confirmed booking overlaps -> 409 and block not persisted
        confirm = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Confirmed"})
        self.assertEqual(confirm.status_code, 200)
        res_confirmed = self.client.post("/api/villas/blocks", headers=self.headers, json={
            "unit_id": self.unit_id, "start_date": self.arrival.isoformat(), "end_date": self.departure.isoformat(), "reason": "Confirmed overlap"
        })
        self.assertEqual(res_confirmed.status_code, 409)

        # 7. Same-day check-out boundary [departure, departure+2) and pre-arrival boundary [arrival-2, arrival) -> Allowed
        after_block = self.client.post("/api/villas/blocks", headers=self.headers, json={
            "unit_id": self.unit_id, "start_date": self.departure.isoformat(), "end_date": (self.departure + timedelta(days=2)).isoformat(), "reason": "Turnover maintenance"
        })
        self.assertEqual(after_block.status_code, 201, after_block.text)
        before_block = self.client.post("/api/villas/blocks", headers=self.headers, json={
            "unit_id": self.unit_id, "start_date": (self.arrival - timedelta(days=2)).isoformat(), "end_date": self.arrival.isoformat(), "reason": "Pre-arrival maintenance"
        })
        self.assertEqual(before_block.status_code, 201, before_block.text)
        self.assertEqual(self.client.delete(f"/api/villas/blocks/{after_block.json()['id']}", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/villas/blocks/{before_block.json()['id']}", headers=self.headers).status_code, 200)

        # 3. Checked In booking overlaps -> 409
        db = Session()
        db.query(StayBooking).filter_by(id=self.booking["id"]).update({"check_in": kolkata_today})
        db.commit(); db.close()
        checkin = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked In"})
        self.assertEqual(checkin.status_code, 200, checkin.text)
        res_checked_in = self.client.post("/api/villas/blocks", headers=self.headers, json={
            "unit_id": self.unit_id, "start_date": kolkata_today.isoformat(), "end_date": self.departure.isoformat(), "reason": "Checked in overlap"
        })
        self.assertEqual(res_checked_in.status_code, 409)

        # 6. Checked Out booking overlaps -> Allowed (201)
        checkout = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, params={"status": "Checked Out"})
        self.assertEqual(checkout.status_code, 200, checkout.text)
        res_checked_out = self.client.post("/api/villas/blocks", headers=self.headers, json={
            "unit_id": self.unit_id, "start_date": kolkata_today.isoformat(), "end_date": self.departure.isoformat(), "reason": "Post checkout maintenance"
        })
        self.assertEqual(res_checked_out.status_code, 201, res_checked_out.text)
        self.assertEqual(self.client.delete(f"/api/villas/blocks/{res_checked_out.json()['id']}", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.patch(f"/api/villas/units/{self.unit_id}/housekeeping", headers=self.headers, json={"status": "Ready"}).status_code, 200)

        # 4 & 5. Cancelled and No Show bookings do not block availability blocks
        cancel_start = self.departure + timedelta(days=5)
        cancel_end = cancel_start + timedelta(days=2)
        cancelled_bk_res = self.client.post("/api/villas/bookings", headers=self.headers, json={
            "unit_id": self.unit_id, "customer": {"full_name": "Cancel Guest", "phone": "9876509988"},
            "check_in": cancel_start.isoformat(), "check_out": cancel_end.isoformat(), "guests": 2
        })
        self.assertEqual(cancelled_bk_res.status_code, 201, cancelled_bk_res.text)
        cancelled_bk = cancelled_bk_res.json()
        self.assertEqual(self.client.patch(f"/api/villas/bookings/{cancelled_bk['id']}/status", headers=self.headers, json={"status": "Cancelled", "reason": "Guest changed travel plans"}).status_code, 200)
        res_cancelled = self.client.post("/api/villas/blocks", headers=self.headers, json={
            "unit_id": self.unit_id, "start_date": cancel_start.isoformat(), "end_date": cancel_end.isoformat(), "reason": "After cancellation"
        })
        self.assertEqual(res_cancelled.status_code, 201, res_cancelled.text)

        noshow_start = kolkata_today
        noshow_end = noshow_start + timedelta(days=2)
        noshow_bk_res = self.client.post("/api/villas/bookings", headers=self.headers, json={
            "unit_id": self.unit_id, "customer": {"full_name": "NoShow Guest", "phone": "9876509977"},
            "check_in": noshow_start.isoformat(), "check_out": noshow_end.isoformat(), "guests": 2
        })
        self.assertEqual(noshow_bk_res.status_code, 201, noshow_bk_res.text)
        noshow_bk = noshow_bk_res.json()
        self.assertEqual(self.client.patch(f"/api/villas/bookings/{noshow_bk['id']}/status", headers=self.headers, params={"status": "No Show"}).status_code, 200)
        res_noshow = self.client.post("/api/villas/blocks", headers=self.headers, json={
            "unit_id": self.unit_id, "start_date": noshow_start.isoformat(), "end_date": noshow_end.isoformat(), "reason": "After no show"
        })
        self.assertEqual(res_noshow.status_code, 201, res_noshow.text)

        # Verify only the two allowed blocks exist for this unit
        db = Session()
        unit_blocks = db.query(UnitBlock).filter_by(unit_id=self.unit_id).all()
        self.assertEqual(len(unit_blocks), 2)
        db.close()

    def test_booking_lifecycle_transitions_and_status_history(self):
        from app.core.date_utils import get_kolkata_today
        from app.models import StayBooking

        # Direct Reserved -> Checked In must be rejected (even if check_in is today)
        db = Session()
        db.query(StayBooking).filter_by(id=self.booking["id"]).update({"check_in": get_kolkata_today()})
        db.commit(); db.close()
        direct_checkin = self.client.patch(
            f"/api/villas/bookings/{self.booking['id']}/status",
            headers=self.headers,
            json={"status": "Checked In"},
        )
        self.assertEqual(direct_checkin.status_code, 409)

        # Unknown status -> 422
        bad_status = self.client.patch(
            f"/api/villas/bookings/{self.booking['id']}/status",
            headers=self.headers,
            json={"status": "Pending"},
        )
        self.assertEqual(bad_status.status_code, 422)

        # Reserved -> Confirmed -> Checked In -> Checked Out
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{self.booking['id']}/status",
                headers=self.headers,
                json={"status": "Confirmed", "reason": "Guest verified"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{self.booking['id']}/status",
                headers=self.headers,
                json={"status": "Checked In", "reason": "Arrived at desk"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{self.booking['id']}/status",
                headers=self.headers,
                json={"status": "Checked Out", "reason": "Stay completed"},
            ).status_code,
            200,
        )

        # Checked Out is terminal: cannot revert to Confirmed or Cancelled
        for next_st in ["Reserved", "Confirmed", "Checked In", "Cancelled", "No Show"]:
            res = self.client.patch(
                f"/api/villas/bookings/{self.booking['id']}/status",
                headers=self.headers,
                json={"status": next_st, "reason": "Attempt invalid revert"},
            )
            self.assertEqual(res.status_code, 409)

        # Status history preserved in full without overwriting earlier entries
        hist_res = self.client.get(f"/api/villas/bookings/{self.booking['id']}/history", headers=self.headers)
        self.assertEqual(hist_res.status_code, 200, hist_res.text)
        hist = hist_res.json()
        self.assertEqual(len(hist), 4)
        self.assertEqual(
            [(h["previous_status"], h["new_status"]) for h in reversed(hist)],
            [
                (None, "Reserved"),
                ("Reserved", "Confirmed"),
                ("Confirmed", "Checked In"),
                ("Checked In", "Checked Out"),
            ],
        )
        self.assertEqual(hist[0]["changed_by_name"], "Villa Manager")
        # Unauthorized history access rejected
        self.assertEqual(self.client.get(f"/api/villas/bookings/{self.booking['id']}/history").status_code, 401)
        self.assertEqual(self.client.get(f"/api/villas/bookings/{self.booking['id']}/history", headers=self.other_headers).status_code, 403)

    def test_cancellation_no_show_and_advance_refund_reversals(self):
        from app.core.date_utils import get_kolkata_today

        # Cancel without reason -> 422
        no_reason = self.client.patch(
            f"/api/villas/bookings/{self.booking['id']}/status",
            headers=self.headers,
            json={"status": "Cancelled", "reason": "   "},
        )
        self.assertEqual(no_reason.status_code, 422)

        # Record advance payment of 2000 on draft invoice
        adv = self.client.post(
            f"/api/villas/invoices/{self.invoice_id}/payments",
            headers=self.headers,
            params={"amount": "2000", "method": "UPI", "reference": "ADV-UPI-1"},
        )
        self.assertEqual(adv.status_code, 201, adv.text)

        # Attempting to cancel while advance is unrefunded -> 409 (booking remains Reserved)
        blocked_cancel = self.client.patch(
            f"/api/villas/bookings/{self.booking['id']}/status",
            headers=self.headers,
            json={"status": "Cancelled", "reason": "Guest requested cancel"},
        )
        self.assertEqual(blocked_cancel.status_code, 409)

        # Refund validation: <= 0 -> 422, > net paid -> 422
        self.assertEqual(
            self.client.post(
                f"/api/villas/invoices/{self.invoice_id}/refunds",
                headers=self.headers,
                json={"refund_amount": "0", "reason": "Invalid"},
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.post(
                f"/api/villas/invoices/{self.invoice_id}/refunds",
                headers=self.headers,
                json={"refund_amount": "2500", "reason": "Exceeds paid"},
            ).status_code,
            422,
        )

        # Full refund succeeds, keeps original payment intact, creates reversal
        refund = self.client.post(
            f"/api/villas/invoices/{self.invoice_id}/refunds",
            headers=self.headers,
            json={"refund_method": "UPI", "refund_reference": "REF-UPI-1", "reason": "Full advance refund"},
        )
        self.assertEqual(refund.status_code, 201, refund.text)
        self.assertEqual(float(refund.json()["invoice"]["paid_amount"]), 0.0)
        self.assertEqual(float(refund.json()["invoice"]["refunded_amount"]), 2000.0)
        self.assertEqual(refund.json()["invoice"]["payment_status"], "Refunded")

        # Duplicate refund attempt rejected -> 409
        dup_refund = self.client.post(
            f"/api/villas/invoices/{self.invoice_id}/refunds",
            headers=self.headers,
            json={"reason": "Duplicate attempt"},
        )
        self.assertEqual(dup_refund.status_code, 409)

        # Now cancellation succeeds, sets invoice Void, releases availability
        cancelled = self.client.patch(
            f"/api/villas/bookings/{self.booking['id']}/status",
            headers=self.headers,
            json={"status": "Cancelled", "reason": "Refund completed and cancelled"},
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["invoice_payment_status"], "Void")

        # Cancelled booking cannot be checked in
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{self.booking['id']}/status",
                headers=self.headers,
                json={"status": "Checked In"},
            ).status_code,
            409,
        )

        # Unit availability released for another booking
        rebooked = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "customer": {"full_name": "Replacement Guest", "phone": "9876598765"},
                "check_in": self.arrival.isoformat(),
                "check_out": self.departure.isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(rebooked.status_code, 201, rebooked.text)

        # Future No Show rejected (409)
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{rebooked.json()['id']}/status",
                headers=self.headers,
                json={"status": "No Show", "reason": "Too early"},
            ).status_code,
            409,
        )

        # Same-day No Show with advance payment: blocked until refunded, then succeeds
        today = get_kolkata_today()
        from app.core.date_utils import KOLKATA_TZ
        after_checkin = datetime.combine(today, datetime.min.time()).replace(hour=15, minute=0, tzinfo=KOLKATA_TZ)
        ns_res = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "customer": {"full_name": "Today NoShow", "phone": "9876511122"},
                "check_in": today.isoformat(),
                "check_out": (today + timedelta(days=1)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(ns_res.status_code, 201, ns_res.text)
        ns_bk = ns_res.json()
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{ns_bk['id']}/status", headers=self.headers, json={"status": "Confirmed"}).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                f"/api/villas/invoices/{ns_bk['invoice_id']}/payments",
                headers=self.headers,
                params={"amount": "500", "method": "Cash"},
            ).status_code,
            201,
        )
        with patch("app.services.villas_service.get_kolkata_now", return_value=after_checkin), patch("app.api.villas.get_kolkata_now", return_value=after_checkin):
            self.assertEqual(
                self.client.patch(f"/api/villas/bookings/{ns_bk['id']}/status", headers=self.headers, json={"status": "No Show"}).status_code,
                409,
            )
            self.assertEqual(
                self.client.post(
                    f"/api/villas/invoices/{ns_bk['invoice_id']}/refunds",
                    headers=self.headers,
                    json={"refund_method": "Cash", "reason": "Guest did not arrive"},
                ).status_code,
                201,
            )
            self.assertEqual(
                self.client.patch(
                    f"/api/villas/bookings/{ns_bk['id']}/status",
                    headers=self.headers,
                    json={"status": "No Show", "reason": "Guest did not arrive"},
                ).status_code,
                200,
            )
        # No Show booking cannot be checked in
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{ns_bk['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            409,
        )

    def test_checkin_preconditions_and_checkout_balance(self):
        from app.core.date_utils import get_kolkata_today
        from app.models import StayBooking, Unit, Villa

        today = get_kolkata_today()
        # Confirm booking first
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Confirmed"}).status_code,
            200,
        )
        # Early check-in rejected
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            409,
        )

        # Move check_in to today for precondition checks
        db = Session()
        db.query(StayBooking).filter_by(id=self.booking["id"]).update({"check_in": today})
        unit = db.get(Unit, self.unit_id)
        villa_id = unit.villa_id
        # 1. Inactive unit -> 409
        unit.is_active = False
        db.commit()
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            409,
        )
        # 2. Inactive parent villa -> 409
        unit.is_active = True
        db.get(Villa, villa_id).is_active = False
        db.commit()
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            409,
        )
        # 3. Out of Order unit -> 409
        db.get(Villa, villa_id).is_active = True
        unit.housekeeping_status = "Out of Order"
        db.commit()
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            409,
        )
        # 4. Overlapping unit block at check-in -> 409
        unit.housekeeping_status = "Ready"
        db.commit()
        from app.models import UnitBlock
        blk = UnitBlock(unit_id=self.unit_id, start_date=today, end_date=today + timedelta(days=1), reason="Emergency repair")
        db.add(blk); db.commit(); db.refresh(blk)
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            409,
        )
        db.delete(blk); db.commit(); db.close()

        # Check in succeeds once all preconditions are satisfied
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            200,
        )
        # Checkout with zero/partial payment succeeds and retains outstanding balance
        co = self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked Out"})
        self.assertEqual(co.status_code, 200, co.text)
        self.assertGreater(float(co.json()["invoice_balance_due"]), 0)
        self.assertEqual(co.json()["invoice_payment_status"], "Pending")
        units = self.client.get("/api/villas/units", headers=self.headers).json()
        self.assertEqual(next(u for u in units if u["id"] == self.unit_id)["housekeeping_status"], "Needs Cleaning")

    def test_guest_service_validation_and_post_checkout_lock(self):
        from app.core.date_utils import get_kolkata_today
        from app.models import StayBooking

        active_svc = self.client.post("/api/villas/services", headers=self.headers, json={"name": f"Airport Pickup {id(self)}", "price": "800"}).json()
        inactive_svc = self.client.post("/api/villas/services", headers=self.headers, json={"name": f"Old Service {id(self)}", "price": "300", "is_active": False}).json()

        # Cannot add service while booking is Reserved or Confirmed
        self.assertEqual(
            self.client.post(f"/api/villas/bookings/{self.booking['id']}/services", headers=self.headers, json={"service_id": active_svc["id"]}).status_code,
            409,
        )
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Confirmed"}).status_code,
            200,
        )
        db = Session()
        db.query(StayBooking).filter_by(id=self.booking["id"]).update({"check_in": get_kolkata_today()})
        db.commit(); db.close()
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            200,
        )

        # Inactive service rejected -> 409
        self.assertEqual(
            self.client.post(f"/api/villas/bookings/{self.booking['id']}/services", headers=self.headers, json={"service_id": inactive_svc["id"]}).status_code,
            409,
        )
        # Inactive Villa staff rejected -> 422
        self.assertEqual(
            self.client.post(f"/api/villas/bookings/{self.booking['id']}/services", headers=self.headers, json={"service_id": active_svc["id"], "staff_id": self.inactive_villa_staff_id}).status_code,
            422,
        )
        # Wrong-context (Restaurant) staff rejected -> 422
        self.assertEqual(
            self.client.post(f"/api/villas/bookings/{self.booking['id']}/services", headers=self.headers, json={"service_id": active_svc["id"], "staff_id": self.rest_staff_member_id}).status_code,
            422,
        )

        # Valid active Villa staff + scheduled_for + notes succeeds
        req_res = self.client.post(
            f"/api/villas/bookings/{self.booking['id']}/services",
            headers=self.headers,
            json={
                "service_id": active_svc["id"],
                "staff_id": self.staff_member.id,
                "quantity": 2,
                "scheduled_for": datetime.now(timezone.utc).isoformat(),
                "notes": "Terminal 2 pickup",
            },
        )
        self.assertEqual(req_res.status_code, 201, req_res.text)
        req_id = req_res.json()["id"]
        self.assertEqual(
            self.client.patch(f"/api/villas/service-requests/{req_id}/status", headers=self.headers, params={"status": "Completed"}).status_code,
            200,
        )

        # Checkout finalizes invoice and charges completed service exactly once (10000 + 1600 = 11600)
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked Out"}).status_code,
            200,
        )
        inv = self.client.get(f"/api/villas/invoices/{self.invoice_id}", headers=self.headers).json()
        self.assertEqual(float(inv["subtotal"]), 11600.0)
        service_items = [it for it in inv["items"] if it["item_type"] == "SERVICE"]
        self.assertEqual(len(service_items), 1)
        self.assertEqual(float(service_items[0]["total_amount"]), 1600.0)

        # Post-checkout service changes and additions rejected -> 409
        self.assertEqual(
            self.client.patch(f"/api/villas/service-requests/{req_id}/status", headers=self.headers, params={"status": "Cancelled"}).status_code,
            409,
        )
        self.assertEqual(
            self.client.post(f"/api/villas/bookings/{self.booking['id']}/services", headers=self.headers, json={"service_id": active_svc["id"]}).status_code,
            409,
        )

    def test_invoice_line_items_seasonal_rates_rounding_and_immutability(self):
        from app.core.date_utils import get_kolkata_today

        today = get_kolkata_today()
        # Seasonal rate for night 1 only (7500), night 2 uses base_rate (5000) -> 12500 subtotal
        stay_start = today + timedelta(days=30)
        stay_end = stay_start + timedelta(days=2)
        rate_res = self.client.post(
            "/api/villas/rates",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "name": "Holiday Night 1",
                "start_date": stay_start.isoformat(),
                "end_date": (stay_start + timedelta(days=1)).isoformat(),
                "nightly_rate": "7500",
            },
        )
        self.assertEqual(rate_res.status_code, 201, rate_res.text)

        bk = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "customer": {"full_name": "Seasonal Guest", "phone": "9876540011"},
                "check_in": stay_start.isoformat(),
                "check_out": stay_end.isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(bk.status_code, 201, bk.text)
        bk_data = bk.json()
        self.assertEqual(Decimal(str(bk_data["total_amount"])), Decimal("12500.00"))

        # Subsequent seasonal rate deletion must NOT mutate saved booking snapshot
        self.assertEqual(self.client.delete(f"/api/villas/rates/{rate_res.json()['id']}", headers=self.headers).status_code, 200)
        inv = self.client.get(f"/api/villas/invoices/{bk_data['invoice_id']}", headers=self.headers).json()
        self.assertEqual(Decimal(str(inv["subtotal"])), Decimal("12500.00"))
        self.assertEqual(Decimal(str(inv["tax_amount"])), Decimal("2250.00"))
        self.assertEqual(Decimal(str(inv["total_amount"])), Decimal("14750.00"))
        self.assertEqual([it["item_type"] for it in inv["items"]], ["ACCOMMODATION", "TAX"])

        # Finalize via checkout -> invoice stays immutable even if seasonal rates change
        from app.models import StayBooking
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{bk_data['id']}/status", headers=self.headers, json={"status": "Confirmed"}).status_code,
            200,
        )
        db = Session()
        db.query(StayBooking).filter_by(id=bk_data["id"]).update({"check_in": today, "check_out": today + timedelta(days=2)})
        db.commit(); db.close()
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{bk_data['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{bk_data['id']}/status", headers=self.headers, json={"status": "Checked Out"}).status_code,
            200,
        )
        final_inv = self.client.get(f"/api/villas/invoices/{bk_data['invoice_id']}", headers=self.headers).json()
        self.assertTrue(final_inv["is_finalized"])
        self.assertEqual(Decimal(str(final_inv["total_amount"])), Decimal("14750.00"))

    def test_payment_history_refund_history_and_pdf_download_authorization(self):
        # Record 2 partial payments
        p1 = self.client.post(
            f"/api/villas/invoices/{self.invoice_id}/payments",
            headers=self.headers,
            params={"amount": "1500", "method": "UPI", "reference": "PAY-1"},
        )
        self.assertEqual(p1.status_code, 201, p1.text)
        p2 = self.client.post(
            f"/api/villas/invoices/{self.invoice_id}/payments",
            headers=self.headers,
            params={"amount": "2500", "method": "Card", "reference": "PAY-2"},
        )
        self.assertEqual(p2.status_code, 201, p2.text)

        # Refund payment 1 specifically
        hist_before = self.client.get(f"/api/villas/invoices/{self.invoice_id}/payments", headers=self.headers).json()
        pay1_id = hist_before["payments"][0]["id"]
        ref1 = self.client.post(
            f"/api/villas/invoices/{self.invoice_id}/refunds",
            headers=self.headers,
            json={"payment_id": pay1_id, "refund_amount": "1500", "refund_method": "UPI", "refund_reference": "REV-1", "reason": "Partial adjustment"},
        )
        self.assertEqual(ref1.status_code, 201, ref1.text)

        hist = self.client.get(f"/api/villas/invoices/{self.invoice_id}/payments", headers=self.headers)
        self.assertEqual(hist.status_code, 200, hist.text)
        hdata = hist.json()
        self.assertEqual(len(hdata["payments"]), 2)
        self.assertEqual(len(hdata["reversals"]), 1)
        self.assertEqual(float(hdata["gross_paid_amount"]), 4000.0)
        self.assertEqual(float(hdata["refunded_amount"]), 1500.0)
        self.assertEqual(float(hdata["paid_amount"]), 2500.0)
        self.assertEqual(hdata["payments"][0]["status"], "Refunded")
        self.assertEqual(hdata["payments"][1]["status"], "Paid")

        # PDF authorization and content checks
        self.assertEqual(self.client.get(f"/api/villas/invoices/{self.invoice_id}/pdf").status_code, 401)
        self.assertEqual(self.client.get(f"/api/villas/invoices/{self.invoice_id}/pdf", headers=self.other_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/villas/invoices/999999/pdf", headers=self.headers).status_code, 404)

        pdf_res = self.client.get(f"/api/villas/invoices/{self.invoice_id}/pdf", headers=self.headers)
        self.assertEqual(pdf_res.status_code, 200, pdf_res.text)
        self.assertEqual(pdf_res.headers.get("content-type"), "application/pdf")
        self.assertIn("attachment;", pdf_res.headers.get("content-disposition", ""))
        self.assertTrue(pdf_res.content.startswith(b"%PDF-"))

    def test_phase3_guest_crud_pagination_isolation_and_profile(self):
        from app.models import Customer

        # Seed a Restaurant customer that must NEVER appear in Villas guests/customers
        db = Session()
        rest_cust = Customer(full_name="Restaurant Leak Check", phone="9000012345", email="leak@rest.test")
        db.add(rest_cust)
        db.commit()
        db.close()

        g1 = self.client.post(
            "/api/villas/guests",
            headers=self.headers,
            json={
                "full_name": "Aarav Mehta",
                "phone": "9810011223",
                "email": "aarav@resort.test",
                "city": "Mumbai",
                "state": "Maharashtra",
                "preferences": "Quiet corner suite",
            },
        )
        self.assertEqual(g1.status_code, 201, g1.text)
        g1_data = g1.json()
        self.assertTrue(g1_data["guest_reference"].startswith("V-GST-"))

        g2 = self.client.post(
            "/api/villas/guests",
            headers=self.headers,
            json={"full_name": "Diya Nair", "phone": "9820022334", "email": "diya@resort.test", "city": "Kochi"},
        )
        self.assertEqual(g2.status_code, 201, g2.text)

        # Duplicate phone and email rejected
        dup_phone = self.client.post(
            "/api/villas/guests",
            headers=self.headers,
            json={"full_name": "Dup Phone", "phone": "+91 9810011223"},
        )
        self.assertEqual(dup_phone.status_code, 409)
        dup_email = self.client.post(
            "/api/villas/guests",
            headers=self.headers,
            json={"full_name": "Dup Email", "phone": "9899988877", "email": "AARAV@RESORT.TEST"},
        )
        self.assertEqual(dup_email.status_code, 409)

        # Duplicate inline guest phone on booking is rejected with 409
        dup_bk = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest": {"full_name": "Aarav Duplicate", "phone": "9810011223"},
                "check_in": (self.departure + timedelta(days=5)).isoformat(),
                "check_out": (self.departure + timedelta(days=7)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(dup_bk.status_code, 409)

        # Create booking using guest_id + pay partial advance
        bk = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest_id": g1_data["id"],
                "check_in": (self.departure + timedelta(days=5)).isoformat(),
                "check_out": (self.departure + timedelta(days=7)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(bk.status_code, 201, bk.text)
        bk_data = bk.json()
        self.assertEqual(bk_data["guest_id"], g1_data["id"])
        self.assertEqual(bk_data["guest_name"], "Aarav Mehta")

        self.assertEqual(
            self.client.post(
                f"/api/villas/invoices/{bk_data['invoice_id']}/payments",
                headers=self.headers,
                params={"amount": "2000", "method": "UPI", "reference": "ADV-1"},
            ).status_code,
            201,
        )

        # Directory pagination + strict isolation from Restaurant customers
        directory = self.client.get("/api/villas/guests?page=1&page_size=2", headers=self.headers)
        self.assertEqual(directory.status_code, 200, directory.text)
        dir_json = directory.json()
        self.assertEqual(len(dir_json["items"]), 2)
        self.assertGreaterEqual(dir_json["total"], 3)
        self.assertGreaterEqual(dir_json["total_pages"], 2)

        scoped_customers = self.client.get("/api/villas/customers?search=Restaurant", headers=self.headers)
        self.assertEqual(scoped_customers.status_code, 200)
        self.assertEqual(scoped_customers.json(), [])

        # Guest profile view
        profile = self.client.get(f"/api/villas/guests/{g1_data['id']}", headers=self.headers)
        self.assertEqual(profile.status_code, 200, profile.text)
        pdata = profile.json()
        self.assertEqual(pdata["total_stays"], 1)
        self.assertEqual(float(pdata["total_spending"]), 2000.0)
        self.assertGreater(float(pdata["outstanding_balance"]), 0.0)
        self.assertEqual(len(pdata["stays"]), 1)

        # Deactivate guest prevents new bookings
        deact = self.client.patch(f"/api/villas/guests/{g2.json()['id']}", headers=self.headers, json={"is_active": False})
        self.assertEqual(deact.status_code, 200)
        self.assertFalse(deact.json()["is_active"])
        blocked_bk = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest_id": g2.json()["id"],
                "check_in": (self.departure + timedelta(days=10)).isoformat(),
                "check_out": (self.departure + timedelta(days=11)).isoformat(),
                "guests": 1,
            },
        )
        self.assertEqual(blocked_bk.status_code, 409)

        del_clean = self.client.delete(f"/api/villas/guests/{g2.json()['id']}", headers=self.headers)
        self.assertEqual(del_clean.status_code, 200)

        # Full cascade delete removes guest along with linked stays, invoices, and payments
        del_with_history = self.client.delete(f"/api/villas/guests/{g1_data['id']}", headers=self.headers)
        self.assertEqual(del_with_history.status_code, 200, del_with_history.text)
        self.assertEqual(self.client.get(f"/api/villas/guests/{g1_data['id']}", headers=self.headers).status_code, 404)

        # Direct booking delete also removes linked invoice, payments, and status history
        g3 = self.client.post(
            "/api/villas/guests",
            headers=self.headers,
            json={"full_name": "Booking Delete Guest", "phone": "9820012349"},
        ).json()
        bk3 = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest_id": g3["id"],
                "check_in": (self.departure + timedelta(days=12)).isoformat(),
                "check_out": (self.departure + timedelta(days=13)).isoformat(),
                "guests": 1,
            },
        ).json()
        del_bk3 = self.client.delete(f"/api/villas/bookings/{bk3['id']}", headers=self.headers)
        self.assertEqual(del_bk3.status_code, 200, del_bk3.text)
        self.assertEqual(self.client.delete(f"/api/villas/bookings/{bk3['id']}", headers=self.headers).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/villas/guests/{g3['id']}", headers=self.headers).status_code, 200)

    def test_phase3_inventory_edits_rates_blocks_and_service_catalogue(self):
        # Edit category & guard delete when used
        cat_upd = self.client.patch(
            f"/api/villas/categories/{self.cat_id}",
            headers=self.headers,
            json={"name": "Luxury Garden Suite", "description": "Updated", "is_active": True},
        )
        self.assertEqual(cat_upd.status_code, 200, cat_upd.text)
        self.assertEqual(cat_upd.json()["name"], "Luxury Garden Suite")
        self.assertEqual(self.client.delete(f"/api/villas/categories/{self.cat_id}", headers=self.headers).status_code, 409)

        # Rate create & edit
        start = get_kolkata_today() + timedelta(days=40)
        rate = self.client.post(
            "/api/villas/rates",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "name": "Winter Peak",
                "start_date": start.isoformat(),
                "end_date": (start + timedelta(days=3)).isoformat(),
                "nightly_rate": "8500",
            },
        )
        self.assertEqual(rate.status_code, 201, rate.text)
        rate_upd = self.client.patch(
            f"/api/villas/rates/{rate.json()['id']}",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "name": "Winter Peak Revised",
                "start_date": start.isoformat(),
                "end_date": (start + timedelta(days=4)).isoformat(),
                "nightly_rate": "9200",
            },
        )
        self.assertEqual(rate_upd.status_code, 200, rate_upd.text)
        self.assertEqual(rate_upd.json()["name"], "Winter Peak Revised")

        # Availability block type/description create & edit
        blk = self.client.post(
            "/api/villas/blocks",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "start_date": (start + timedelta(days=10)).isoformat(),
                "end_date": (start + timedelta(days=12)).isoformat(),
                "block_type": "Renovation",
                "reason": "Plunge pool tile polish",
                "description": "Scheduled engineering touch-up",
            },
        )
        self.assertEqual(blk.status_code, 201, blk.text)
        self.assertEqual(blk.json()["block_type"], "Renovation")
        blk_upd = self.client.patch(
            f"/api/villas/blocks/{blk.json()['id']}",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "start_date": (start + timedelta(days=10)).isoformat(),
                "end_date": (start + timedelta(days=13)).isoformat(),
                "block_type": "Owner",
                "reason": "Owner family visit",
                "description": "VIP hold",
            },
        )
        self.assertEqual(blk_upd.status_code, 200, blk_upd.text)
        self.assertEqual(blk_upd.json()["block_type"], "Owner")

        # Unused service can be deleted; used service cannot
        unused_svc = self.client.post(
            "/api/villas/services",
            headers=self.headers,
            json={"name": "Sunset Kayak", "description": "Lake tour", "price": "1800", "is_active": True},
        )
        self.assertEqual(unused_svc.status_code, 201)
        self.assertEqual(self.client.delete(f"/api/villas/services/{unused_svc.json()['id']}", headers=self.headers).status_code, 200)

        # Booking filters
        filtered = self.client.get(f"/api/villas/bookings?villa_id={self.villa_id}&search=Test", headers=self.headers)
        self.assertEqual(filtered.status_code, 200)
        self.assertGreaterEqual(len(filtered.json()), 1)

    def test_phase3_dashboard_and_reports_metrics(self):
        # Mark a second unit Out of Order and verify dashboard + reports
        u2 = self.client.post(
            "/api/villas/units",
            headers=self.headers,
            json={
                "villa_id": self.villa_id,
                "category_id": self.cat_id,
                "name": "Suite 102",
                "capacity": 2,
                "bedrooms": 1,
                "base_rate": "4500",
                "is_active": True,
            },
        )
        self.assertEqual(u2.status_code, 201, u2.text)
        self.assertEqual(
            self.client.patch(
                f"/api/villas/units/{u2.json()['id']}/housekeeping",
                headers=self.headers,
                json={"status": "Out of Order"},
            ).status_code,
            200,
        )

        dash = self.client.get("/api/villas/dashboard", headers=self.headers)
        self.assertEqual(dash.status_code, 200, dash.text)
        ddata = dash.json()
        self.assertEqual(ddata["out_of_order_units"], 1)
        self.assertGreater(float(ddata["outstanding_balance"]), 0.0)
        self.assertIn("occupancy_rate", ddata)

        today = get_kolkata_today()
        rep = self.client.get(
            f"/api/villas/reports?start_date={(today - timedelta(days=7)).isoformat()}&end_date={(today + timedelta(days=30)).isoformat()}",
            headers=self.headers,
        )
        self.assertEqual(rep.status_code, 200, rep.text)
        rdata = rep.json()
        self.assertIn("summary", rdata)
        self.assertIn("unit_performance", rdata)
        self.assertIn("guest_summary", rdata)
        self.assertGreaterEqual(len(rdata["unit_performance"]), 2)

    def test_phase3_delete_integrity_matrix(self):
        from app.models import StayBooking

        # Unused villa, category, and unit can be deleted cleanly (including rates/blocks on unused unit)
        v_unused = self.client.post("/api/villas/villas", headers=self.headers, json={"name": "Disposable Villa"}).json()
        c_unused = self.client.post("/api/villas/categories", headers=self.headers, json={"name": "Disposable Cat"}).json()
        u_unused = self.client.post(
            "/api/villas/units",
            headers=self.headers,
            json={
                "villa_id": v_unused["id"],
                "category_id": c_unused["id"],
                "name": "Disposable Suite",
                "capacity": 2,
                "bedrooms": 1,
                "base_rate": "4000",
            },
        ).json()
        start = get_kolkata_today() + timedelta(days=50)
        self.assertEqual(
            self.client.post(
                "/api/villas/rates",
                headers=self.headers,
                json={
                    "unit_id": u_unused["id"],
                    "name": "Temp Rate",
                    "start_date": start.isoformat(),
                    "end_date": (start + timedelta(days=2)).isoformat(),
                    "nightly_rate": "5000",
                },
            ).status_code,
            201,
        )

        # Blocked deletes while dependencies exist
        self.assertEqual(self.client.delete(f"/api/villas/villas/{v_unused['id']}", headers=self.headers).status_code, 409)
        self.assertEqual(self.client.delete(f"/api/villas/categories/{c_unused['id']}", headers=self.headers).status_code, 409)
        self.assertEqual(self.client.delete(f"/api/villas/units/{self.unit_id}", headers=self.headers).status_code, 409)

        # Deleting unbooked unit succeeds (and clears its rates), then category and villa delete succeed
        self.assertEqual(self.client.delete(f"/api/villas/units/{u_unused['id']}", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/villas/categories/{c_unused['id']}", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/villas/villas/{v_unused['id']}", headers=self.headers).status_code, 200)

        # Service request deletion: allowed for Requested on Checked-In stay, blocked once Completed or Checked Out
        svc = self.client.post(
            "/api/villas/services",
            headers=self.headers,
            json={"name": "Concierge Breakfast", "price": "900", "is_active": True},
        ).json()
        today = get_kolkata_today()
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Confirmed"}).status_code,
            200,
        )
        db = Session()
        db.query(StayBooking).filter_by(id=self.booking["id"]).update({"check_in": today, "check_out": today + timedelta(days=2)})
        db.commit(); db.close()
        self.assertEqual(
            self.client.patch(f"/api/villas/bookings/{self.booking['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
            200,
        )
        req_open = self.client.post(
            f"/api/villas/bookings/{self.booking['id']}/services",
            headers=self.headers,
            json={"service_id": svc["id"], "quantity": 1},
        ).json()
        req_done = self.client.post(
            f"/api/villas/bookings/{self.booking['id']}/services",
            headers=self.headers,
            json={"service_id": svc["id"], "quantity": 1},
        ).json()
        self.assertEqual(
            self.client.patch(f"/api/villas/service-requests/{req_done['id']}/status", headers=self.headers, params={"status": "Completed"}).status_code,
            200,
        )

        # Completed request & in-use service cannot be deleted; unbilled Requested can be deleted
        self.assertEqual(self.client.delete(f"/api/villas/services/{svc['id']}", headers=self.headers).status_code, 409)
        self.assertEqual(self.client.delete(f"/api/villas/service-requests/{req_done['id']}", headers=self.headers).status_code, 409)
        self.assertEqual(self.client.delete(f"/api/villas/service-requests/{req_open['id']}", headers=self.headers).status_code, 200)

    def test_phase3_villa_and_unit_image_upload_lifecycle(self):
        import io
        from PIL import Image

        def make_png_bytes(color):
            buf = io.BytesIO()
            Image.new("RGB", (32, 24), color=color).save(buf, format="PNG")
            return buf.getvalue()

        png1 = make_png_bytes((220, 140, 40))
        png2 = make_png_bytes((30, 120, 180))

        # Reject invalid/executable file upload on both villa and unit
        bad_v = self.client.post(
            f"/api/villas/villas/{self.villa_id}/image",
            headers=self.headers,
            files={"file": ("script.txt", b"not an image", "text/plain")},
        )
        self.assertEqual(bad_v.status_code, 400)
        bad_u = self.client.post(
            f"/api/villas/units/{self.unit_id}/image",
            headers=self.headers,
            files={"file": ("bad.png", b"\x89PNG\r\n\x1a\ncorrupted", "image/png")},
        )
        self.assertEqual(bad_u.status_code, 400)

        # Upload villa image, retrieve it, verify 304 ETag, replace it, preserve across PATCH
        up_v = self.client.post(
            f"/api/villas/villas/{self.villa_id}/image",
            headers=self.headers,
            files={"file": ("villa.png", png1, "image/png")},
        )
        self.assertEqual(up_v.status_code, 200, up_v.text)
        v_url = up_v.json()["image_url"]
        self.assertTrue(v_url.startswith(f"/api/villas/villas/{self.villa_id}/image?v="))

        # Cross-context access rejected; Villas context allowed
        self.assertEqual(self.client.get(v_url, headers=self.other_headers).status_code, 403)
        got_v = self.client.get(v_url, headers=self.headers)
        self.assertEqual(got_v.status_code, 200)
        self.assertEqual(got_v.content, png1)
        etag = got_v.headers.get("etag")
        self.assertIsNotNone(etag)
        self.assertEqual(
            self.client.get(v_url, headers={**self.headers, "If-None-Match": etag}).status_code,
            304,
        )

        # PATCH villa text fields preserves uploaded image_url
        patched_v = self.client.patch(
            f"/api/villas/villas/{self.villa_id}",
            headers=self.headers,
            json={"name": f"Renamed Villa {self.villa_id}", "description": "Updated", "is_active": True},
        )
        self.assertEqual(patched_v.status_code, 200)
        self.assertEqual(patched_v.json()["image_url"], v_url)

        # Upload & replace unit image, preserve across PATCH, then delete
        up_u = self.client.post(
            f"/api/villas/units/{self.unit_id}/image",
            headers=self.headers,
            files={"file": ("unit1.png", png1, "image/png")},
        )
        self.assertEqual(up_u.status_code, 200, up_u.text)
        up_u2 = self.client.post(
            f"/api/villas/units/{self.unit_id}/image",
            headers=self.headers,
            files={"file": ("unit2.png", png2, "image/png")},
        )
        self.assertEqual(up_u2.status_code, 200)
        u_url = up_u2.json()["image_url"]
        self.assertEqual(self.client.get(u_url, headers=self.headers).content, png2)

        patched_u = self.client.patch(
            f"/api/villas/units/{self.unit_id}",
            headers=self.headers,
            json={
                "villa_id": self.villa_id,
                "category_id": self.cat_id,
                "name": "Updated Suite",
                "capacity": 4,
                "bedrooms": 2,
                "base_rate": "5200",
                "is_active": True,
            },
        )
        self.assertEqual(patched_u.status_code, 200)
        self.assertEqual(patched_u.json()["image_url"], u_url)

        # Delete image endpoints clear image_url cleanly
        self.assertIsNone(self.client.delete(f"/api/villas/villas/{self.villa_id}/image", headers=self.headers).json()["image_url"])
        self.assertIsNone(self.client.delete(f"/api/villas/units/{self.unit_id}/image", headers=self.headers).json()["image_url"])
        self.assertEqual(self.client.get(f"/api/villas/units/{self.unit_id}/image", headers=self.headers).status_code, 404)

    @contextmanager
    def _freeze_ist_now(self, dt_ist: datetime):
        with patch("app.services.villas_service.get_kolkata_now", return_value=dt_ist), patch(
            "app.api.villas.get_kolkata_now", return_value=dt_ist
        ), patch("app.services.villas_service.get_kolkata_today", return_value=dt_ist.date()), patch(
            "app.api.villas.get_kolkata_today", return_value=dt_ist.date()
        ):
            yield

    def _reset_default_policy(self):
        res = self.client.put(
            "/api/villas/settings",
            headers=self.headers,
            json={
                "default_check_in_time": "14:00",
                "default_check_out_time": "11:00",
                "late_checkout_grace_minutes": 30,
                "default_late_checkout_fee": None,
            },
        )
        self.assertEqual(res.status_code, 200, res.text)

    def test_7a_past_date_validation_and_same_day_turnover(self):
        today = get_kolkata_today()
        yesterday = today - timedelta(days=1)

        # 1. Past check-in date rejected on creation (422)
        past_create = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest": {"full_name": "Past Date Guest", "phone": "9800001111"},
                "check_in": yesterday.isoformat(),
                "check_out": (today + timedelta(days=1)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(past_create.status_code, 422)

        # Past date rejected on availability search too
        past_avail = self.client.get(
            "/api/villas/availability",
            headers=self.headers,
            params={"start_date": yesterday.isoformat(), "end_date": (today + timedelta(days=1)).isoformat()},
        )
        self.assertEqual(past_avail.status_code, 422)

        # 2. Past check-in rejected during booking edit (422)
        past_edit = self.client.patch(
            f"/api/villas/bookings/{self.booking['id']}",
            headers=self.headers,
            json={"check_in": yesterday.isoformat(), "check_out": (today + timedelta(days=2)).isoformat()},
        )
        self.assertEqual(past_edit.status_code, 422)

        # 3. Check-out before or equal to check-in rejected (422)
        bad_range = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest": {"full_name": "Bad Range Guest", "phone": "9800001112"},
                "check_in": (today + timedelta(days=5)).isoformat(),
                "check_out": (today + timedelta(days=4)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(bad_range.status_code, 422)
        same_day_range = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest": {"full_name": "Same Range Guest", "phone": "9800001113"},
                "check_in": (today + timedelta(days=5)).isoformat(),
                "check_out": (today + timedelta(days=5)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(same_day_range.status_code, 422)

        # 4 & 5. Valid future dates and valid same-day turnover [check_in, check_out) accepted
        turnover = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest": {"full_name": "Turnover Guest 7A", "phone": "9800001114"},
                "check_in": self.departure.isoformat(),
                "check_out": (self.departure + timedelta(days=3)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(turnover.status_code, 201, turnover.text)

    def test_7b_duplicate_and_concurrent_reservation_prevention(self):
        today = get_kolkata_today()
        # Create a sibling unit in the SAME parent Villa
        sibling = self.client.post(
            "/api/villas/units",
            headers=self.headers,
            json={
                "villa_id": self.villa_id,
                "category_id": self.cat_id,
                "name": "Sibling Ridge Suite",
                "capacity": 4,
                "bedrooms": 2,
                "base_rate": "6200",
            },
        )
        self.assertEqual(sibling.status_code, 201, sibling.text)
        sibling_id = sibling.json()["id"]

        # Confirm self.booking ([arrival, departure))
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{self.booking['id']}/status",
                headers=self.headers,
                json={"status": "Confirmed"},
            ).status_code,
            200,
        )

        # 1. Same unit, same dates -> 409
        self.assertEqual(
            self.client.post(
                "/api/villas/bookings",
                headers=self.headers,
                json={
                    "unit_id": self.unit_id,
                    "guest": {"full_name": "Exact Conflict", "phone": "9800002001"},
                    "check_in": self.arrival.isoformat(),
                    "check_out": self.departure.isoformat(),
                    "guests": 2,
                },
            ).status_code,
            409,
        )

        # 2 & 8. Same unit, overlapping partial dates against Confirmed booking -> 409
        self.assertEqual(
            self.client.post(
                "/api/villas/bookings",
                headers=self.headers,
                json={
                    "unit_id": self.unit_id,
                    "guest": {"full_name": "Partial Overlap", "phone": "9800002002"},
                    "check_in": (self.arrival + timedelta(days=1)).isoformat(),
                    "check_out": (self.departure + timedelta(days=1)).isoformat(),
                    "guests": 2,
                },
            ).status_code,
            409,
        )

        # 4. Different unit under SAME parent Villa for exact same dates -> Allowed (201)
        sibling_bk = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": sibling_id,
                "guest": {"full_name": "Sibling Guest", "phone": "9800002003"},
                "check_in": self.arrival.isoformat(),
                "check_out": self.departure.isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(sibling_bk.status_code, 201, sibling_bk.text)

        # 3 & 9. Non-overlapping booking on unit_id allowed, then editing into overlap rejected (409)
        non_overlap = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest": {"full_name": "Later Guest", "phone": "9800002004"},
                "check_in": (self.departure + timedelta(days=2)).isoformat(),
                "check_out": (self.departure + timedelta(days=4)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(non_overlap.status_code, 201, non_overlap.text)
        # Edit dates to overlap self.booking -> 409
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{non_overlap.json()['id']}",
                headers=self.headers,
                json={"check_in": (self.arrival + timedelta(days=1)).isoformat()},
            ).status_code,
            409,
        )
        # Edit unit_id to sibling_id which is booked on self.arrival..self.departure -> 409
        non_overlap_match = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "guest": {"full_name": "Reassign Guest", "phone": "9800002005"},
                "check_in": (self.departure + timedelta(days=5)).isoformat(),
                "check_out": (self.departure + timedelta(days=7)).isoformat(),
                "guests": 2,
            },
        ).json()
        # Verify moving sibling_bk to unit_id during arrival..departure -> 409
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{sibling_bk.json()['id']}",
                headers=self.headers,
                json={"unit_id": self.unit_id},
            ).status_code,
            409,
        )

        # 5. Cancelled booking does not block availability
        self.assertEqual(
            self.client.patch(
                f"/api/villas/bookings/{non_overlap_match['id']}/status",
                headers=self.headers,
                json={"status": "Cancelled", "reason": "Plans changed"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                "/api/villas/bookings",
                headers=self.headers,
                json={
                    "unit_id": self.unit_id,
                    "guest": {"full_name": "After Cancel", "phone": "9800002006"},
                    "check_in": (self.departure + timedelta(days=5)).isoformat(),
                    "check_out": (self.departure + timedelta(days=7)).isoformat(),
                    "guests": 2,
                },
            ).status_code,
            201,
        )

        # 6 & 7. No-show and Checked-out bookings do not block availability
        from app.core.date_utils import KOLKATA_TZ
        day_after_checkin = datetime.combine(today, datetime.min.time()).replace(hour=15, minute=0, tzinfo=KOLKATA_TZ)
        ns_bk = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": sibling_id,
                "guest": {"full_name": "NS Reopen Guest", "phone": "9800002007"},
                "check_in": today.isoformat(),
                "check_out": (today + timedelta(days=2)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(ns_bk.status_code, 201, ns_bk.text)
        with self._freeze_ist_now(day_after_checkin):
            self.assertEqual(
                self.client.patch(
                    f"/api/villas/bookings/{ns_bk.json()['id']}/status",
                    headers=self.headers,
                    json={"status": "No Show", "reason": "Did not arrive"},
                ).status_code,
                200,
            )
        reopen_after_ns = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": sibling_id,
                "guest": {"full_name": "Reopen Guest", "phone": "9800002008"},
                "check_in": today.isoformat(),
                "check_out": (today + timedelta(days=2)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(reopen_after_ns.status_code, 201, reopen_after_ns.text)
        with self._freeze_ist_now(day_after_checkin):
            self.assertEqual(
                self.client.patch(
                    f"/api/villas/bookings/{reopen_after_ns.json()['id']}/status",
                    headers=self.headers,
                    json={"status": "Confirmed"},
                ).status_code,
                200,
            )
            self.assertEqual(
                self.client.patch(
                    f"/api/villas/bookings/{reopen_after_ns.json()['id']}/status",
                    headers=self.headers,
                    json={"status": "Checked In"},
                ).status_code,
                200,
            )
            self.assertEqual(
                self.client.patch(
                    f"/api/villas/bookings/{reopen_after_ns.json()['id']}/status",
                    headers=self.headers,
                    json={"status": "Checked Out"},
                ).status_code,
                200,
            )
        self.assertEqual(
            self.client.patch(f"/api/villas/units/{sibling_id}/housekeeping", headers=self.headers, json={"status": "Ready"}).status_code,
            200,
        )
        reopen_after_co = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": sibling_id,
                "guest": {"full_name": "Post Checkout Guest", "phone": "9800002009"},
                "check_in": today.isoformat(),
                "check_out": (today + timedelta(days=2)).isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(reopen_after_co.status_code, 201, reopen_after_co.text)

        # Availability consistency when parent villa is deactivated
        self.client.patch(f"/api/villas/villas/{self.villa_id}", headers=self.headers, json={"name": f"V-Property-{id(self)}", "is_active": False})
        avail_inactive = self.client.get(
            "/api/villas/availability",
            headers=self.headers,
            params={"start_date": (today + timedelta(days=30)).isoformat(), "end_date": (today + timedelta(days=32)).isoformat()},
        ).json()
        self.assertFalse(next(u for u in avail_inactive if u["id"] == sibling_id)["available"])
        units_inactive = self.client.get("/api/villas/units", headers=self.headers).json()
        self.assertFalse(next(u for u in units_inactive if u["id"] == sibling_id)["availability"])
        self.client.patch(f"/api/villas/villas/{self.villa_id}", headers=self.headers, json={"name": f"V-Property-{id(self)}", "is_active": True})

        # 10. Concurrent booking attempts cannot both allocate the same unit
        race_start = self.departure + timedelta(days=15)
        race_end = race_start + timedelta(days=2)
        barrier = threading.Barrier(2)

        def attempt_race(idx: int):
            local_client = TestClient(app)
            barrier.wait(timeout=5)
            return local_client.post(
                "/api/villas/bookings",
                headers=self.headers,
                json={
                    "unit_id": sibling_id,
                    "guest": {"full_name": f"Race Guest {idx}", "phone": f"980000300{idx}"},
                    "check_in": race_start.isoformat(),
                    "check_out": race_end.isoformat(),
                    "guests": 2,
                },
            ).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = sorted(list(pool.map(attempt_race, [1, 2])))
        self.assertEqual(statuses, [201, 409])

    def test_7c_checkin_checkout_timing_inheritance_and_action_restrictions(self):
        from app.core.date_utils import KOLKATA_TZ

        self._reset_default_policy()
        try:
            today = get_kolkata_today()
            arrival_dt = today + timedelta(days=1)
            depart_dt = arrival_dt + timedelta(days=2)

            # Configure Villa-level override (15:00 / 10:30) and Unit-level override (13:00 / 12:00)
            v_over = self.client.post(
                "/api/villas/villas",
                headers=self.headers,
                json={
                    "name": f"Timed Villa {id(self)}",
                    "check_in_time": "15:00",
                    "check_out_time": "10:30",
                    "late_checkout_fee": "1200",
                },
            )
            self.assertEqual(v_over.status_code, 201, v_over.text)
            v_over_id = v_over.json()["id"]

            # Unit A inherits from Villa (15:00 / 10:30)
            u_villa_inherit_res = self.client.post(
                "/api/villas/units",
                headers=self.headers,
                json={
                    "villa_id": v_over_id,
                    "category_id": self.cat_id,
                    "name": "Villa Inherited Unit",
                    "capacity": 2,
                    "bedrooms": 1,
                    "base_rate": "5000",
                },
            ).json()
            # Unit B overrides check-in/check-out (13:00 / 12:00)
            u_unit_override_res = self.client.post(
                "/api/villas/units",
                headers=self.headers,
                json={
                    "villa_id": v_over_id,
                    "category_id": self.cat_id,
                    "name": "Unit Override Suite",
                    "capacity": 2,
                    "bedrooms": 1,
                    "base_rate": "5500",
                    "check_in_time": "13:00",
                    "check_out_time": "12:00",
                },
            ).json()
            all_units = self.client.get("/api/villas/units", headers=self.headers).json()
            u_villa_inherit = next(u for u in all_units if u["id"] == u_villa_inherit_res["id"])
            u_unit_override = next(u for u in all_units if u["id"] == u_unit_override_res["id"])
            self.assertEqual(u_villa_inherit["effective_check_in_time"], "15:00")
            self.assertEqual(u_villa_inherit["effective_check_out_time"], "10:30")
            self.assertEqual(u_unit_override["effective_check_in_time"], "13:00")
            self.assertEqual(u_unit_override["effective_check_out_time"], "12:00")

            # Create & Confirm booking on u_unit_override for arrival_dt (check-in 13:00)
            bk = self.client.post(
                "/api/villas/bookings",
                headers=self.headers,
                json={
                    "unit_id": u_unit_override["id"],
                    "guest": {"full_name": "Timing Guest", "phone": "9800004001"},
                    "check_in": arrival_dt.isoformat(),
                    "check_out": depart_dt.isoformat(),
                    "guests": 2,
                },
            ).json()
            self.assertEqual(bk["check_in_time"], "13:00")
            self.assertEqual(bk["check_out_time"], "12:00")

            conf = self.client.patch(
                f"/api/villas/bookings/{bk['id']}/status",
                headers=self.headers,
                json={"status": "Confirmed"},
            ).json()
            self.assertFalse(conf["can_check_in"])
            self.assertFalse(conf["can_check_out"])
            self.assertFalse(conf["can_mark_no_show"])

            # 6. Future booking cannot be checked out (directly or before check-in)
            self.assertEqual(
                self.client.patch(
                    f"/api/villas/bookings/{bk['id']}/status",
                    headers=self.headers,
                    json={"status": "Checked Out"},
                ).status_code,
                409,
            )

            # 1 & 4. Check-in and No-show at 12:59 (1 min before 13:00) -> Rejected (409)
            just_before = datetime(arrival_dt.year, arrival_dt.month, arrival_dt.day, 12, 59, tzinfo=KOLKATA_TZ)
            with self._freeze_ist_now(just_before):
                list_row = next(x for x in self.client.get("/api/villas/bookings", headers=self.headers).json() if x["id"] == bk["id"])
                self.assertFalse(list_row["can_check_in"])
                self.assertFalse(list_row["can_mark_no_show"])
                self.assertEqual(
                    self.client.patch(f"/api/villas/bookings/{bk['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
                    409,
                )
                self.assertEqual(
                    self.client.patch(f"/api/villas/bookings/{bk['id']}/status", headers=self.headers, json={"status": "No Show", "reason": "Early NS"}).status_code,
                    409,
                )

            # 2. Check-in at exact configured time (13:00) -> Accepted (200)
            at_checkin = datetime(arrival_dt.year, arrival_dt.month, arrival_dt.day, 13, 0, tzinfo=KOLKATA_TZ)
            with self._freeze_ist_now(at_checkin):
                list_row = next(x for x in self.client.get("/api/villas/bookings", headers=self.headers).json() if x["id"] == bk["id"])
                self.assertTrue(list_row["can_check_in"])
                self.assertFalse(list_row["can_mark_no_show"])
                checked_in = self.client.patch(
                    f"/api/villas/bookings/{bk['id']}/status",
                    headers=self.headers,
                    json={"status": "Checked In"},
                )
                self.assertEqual(checked_in.status_code, 200, checked_in.text)
                self.assertIsNotNone(checked_in.json()["actual_check_in_at"])

            # 3 & 5. Another booking on u_villa_inherit (15:00): after 15:00 -> No-show accepted and Check-in accepted
            bk_ns = self.client.post(
                "/api/villas/bookings",
                headers=self.headers,
                json={
                    "unit_id": u_villa_inherit["id"],
                    "guest": {"full_name": "Late Arrival NS", "phone": "9800004002"},
                    "check_in": arrival_dt.isoformat(),
                    "check_out": depart_dt.isoformat(),
                    "guests": 2,
                },
            ).json()
            self.client.patch(f"/api/villas/bookings/{bk_ns['id']}/status", headers=self.headers, json={"status": "Confirmed"})
            after_1500 = datetime(arrival_dt.year, arrival_dt.month, arrival_dt.day, 15, 1, tzinfo=KOLKATA_TZ)
            with self._freeze_ist_now(after_1500):
                list_ns = next(x for x in self.client.get("/api/villas/bookings", headers=self.headers).json() if x["id"] == bk_ns["id"])
                self.assertTrue(list_ns["can_check_in"])
                self.assertTrue(list_ns["can_mark_no_show"])
                self.assertEqual(
                    self.client.patch(
                        f"/api/villas/bookings/{bk_ns['id']}/status",
                        headers=self.headers,
                        json={"status": "No Show", "reason": "Guest never arrived after 3 PM"},
                    ).status_code,
                    200,
                )
        finally:
            self._reset_default_policy()

    def test_7d_late_checkout_grace_boundaries_precedence_invoice_pdf_and_refunds(self):
        from app.core.date_utils import KOLKATA_TZ
        from app.services.villas_service import sync_villa_invoice
        from app.models import StayBooking

        self._reset_default_policy()
        try:
            today = get_kolkata_today()
            stay_in = today + timedelta(days=20)
            stay_out = today + timedelta(days=22)

            # Set property default late checkout fee = 1000, grace = 30
            self.client.put(
                "/api/villas/settings",
                headers=self.headers,
                json={
                    "default_check_in_time": "14:00",
                    "default_check_out_time": "11:00",
                    "late_checkout_grace_minutes": 30,
                    "default_late_checkout_fee": "1000.00",
                },
            )

            # Villa with fee override 1500; second villa without override (uses property default 1000)
            v_fee = self.client.post(
                "/api/villas/villas",
                headers=self.headers,
                json={"name": f"Fee Villa {id(self)}", "late_checkout_fee": "1500.00"},
            ).json()
            u_villa_fee = self.client.post(
                "/api/villas/units",
                headers=self.headers,
                json={
                    "villa_id": v_fee["id"],
                    "category_id": self.cat_id,
                    "name": "Villa Fee Unit",
                    "capacity": 2,
                    "bedrooms": 1,
                    "base_rate": "4000",
                },
            ).json()
            u_unit_fee = self.client.post(
                "/api/villas/units",
                headers=self.headers,
                json={
                    "villa_id": v_fee["id"],
                    "category_id": self.cat_id,
                    "name": "Unit Fee Override",
                    "capacity": 2,
                    "bedrooms": 1,
                    "base_rate": "4000",
                    "late_checkout_fee": "2500.00",
                },
            ).json()

            # Helper to book, confirm, check-in at stay_in 14:30, then checkout at custom dt
            def run_checkout_at(unit_id: int, phone: str, checkout_dt: datetime, advance: str | None = None):
                bk = self.client.post(
                    "/api/villas/bookings",
                    headers=self.headers,
                    json={
                        "unit_id": unit_id,
                        "guest": {"full_name": f"Guest {phone}", "phone": phone},
                        "check_in": stay_in.isoformat(),
                        "check_out": stay_out.isoformat(),
                        "guests": 2,
                    },
                )
                self.assertEqual(bk.status_code, 201, bk.text)
                bdata = bk.json()
                if advance:
                    self.assertEqual(
                        self.client.post(
                            f"/api/villas/invoices/{bdata['invoice_id']}/payments",
                            headers=self.headers,
                            params={"amount": advance, "method": "UPI"},
                        ).status_code,
                        201,
                    )
                self.assertEqual(
                    self.client.patch(f"/api/villas/bookings/{bdata['id']}/status", headers=self.headers, json={"status": "Confirmed"}).status_code,
                    200,
                )
                in_dt = datetime(stay_in.year, stay_in.month, stay_in.day, 14, 30, tzinfo=KOLKATA_TZ)
                with self._freeze_ist_now(in_dt):
                    self.assertEqual(
                        self.client.patch(f"/api/villas/bookings/{bdata['id']}/status", headers=self.headers, json={"status": "Checked In"}).status_code,
                        200,
                    )
                with self._freeze_ist_now(checkout_dt):
                    summary = self.client.get(f"/api/villas/bookings/{bdata['id']}/checkout-summary", headers=self.headers)
                    self.assertEqual(summary.status_code, 200, summary.text)
                    co = self.client.patch(f"/api/villas/bookings/{bdata['id']}/status", headers=self.headers, json={"status": "Checked Out"})
                    self.assertEqual(co.status_code, 200, co.text)
                inv = self.client.get(f"/api/villas/invoices/{bdata['invoice_id']}", headers=self.headers).json()
                # Reset unit HK back to Ready for reuse if needed
                self.client.patch(f"/api/villas/units/{unit_id}/housekeeping", headers=self.headers, json={"status": "Ready"})
                return bdata, summary.json(), co.json(), inv

            # 1, 2, 3: 11:00, 11:15, 11:30 -> No penalty!
            for idx, (hr, mn) in enumerate([(11, 0), (11, 15), (11, 30)], start=1):
                dt_ok = datetime(stay_out.year, stay_out.month, stay_out.day, hr, mn, tzinfo=KOLKATA_TZ)
                _, sum_ok, _, inv_ok = run_checkout_at(self.unit_id, f"980000500{idx}", dt_ok)
                self.assertFalse(sum_ok["is_late_checkout"])
                self.assertEqual(Decimal(str(sum_ok["late_checkout_fee"])), Decimal("0.00"))
                self.assertEqual([it for it in inv_ok["items"] if it["item_type"] == "LATE_CHECKOUT"], [])
                # Reset booking dates isn't needed; move next booking window forward 5 days
                stay_in += timedelta(days=4)
                stay_out += timedelta(days=4)

            # 4 & 5: 11:31 (31 min late) on u_unit_fee -> Unit fee 2500 overrides Villa 1500 & Property 1000!
            dt_31 = datetime(stay_out.year, stay_out.month, stay_out.day, 11, 31, tzinfo=KOLKATA_TZ)
            bk_unit, sum_unit, co_unit, inv_unit = run_checkout_at(u_unit_fee["id"], "9800005010", dt_31, advance="5000")
            self.assertTrue(sum_unit["is_late_checkout"])
            self.assertEqual(Decimal(str(sum_unit["late_checkout_fee"])), Decimal("2500.00"))
            late_items = [it for it in inv_unit["items"] if it["item_type"] == "LATE_CHECKOUT"]
            self.assertEqual(len(late_items), 1)
            self.assertIn("Late Checkout Penalty", late_items[0]["description"])
            self.assertIn(bk_unit["booking_number"], late_items[0]["description"])
            self.assertEqual(Decimal(str(late_items[0]["total_amount"])), Decimal("2500.00"))
            # Base 2 nights * 4000 = 8000 + 2500 = 10500 subtotal; GST 18% = 1890; Total = 12390; Paid = 5000; Bal = 7390
            self.assertEqual(Decimal(str(inv_unit["subtotal"])), Decimal("10500.00"))
            self.assertEqual(Decimal(str(inv_unit["tax_amount"])), Decimal("1890.00"))
            self.assertEqual(Decimal(str(inv_unit["total_amount"])), Decimal("12390.00"))
            self.assertEqual(Decimal(str(inv_unit["balance_due"])), Decimal("7390.00"))
            self.assertTrue(inv_unit["is_finalized"])

            # 8. Repeated checkout request rejected (409) & sync_villa_invoice does NOT duplicate penalty
            self.assertEqual(
                self.client.patch(f"/api/villas/bookings/{bk_unit['id']}/status", headers=self.headers, json={"status": "Checked Out"}).status_code,
                409,
            )
            db = Session()
            bk_row = db.get(StayBooking, bk_unit["id"])
            sync_villa_invoice(db, bk_row, finalize=True, late_checkout_fee=Decimal("2500.00"))
            db.commit()
            db.close()
            inv_after_resync = self.client.get(f"/api/villas/invoices/{bk_unit['invoice_id']}", headers=self.headers).json()
            self.assertEqual(len([it for it in inv_after_resync["items"] if it["item_type"] == "LATE_CHECKOUT"]), 1)
            self.assertEqual(Decimal(str(inv_after_resync["total_amount"])), Decimal("12390.00"))

            # 9. PDF includes late checkout item (readable with pypdf/pdf content or non-empty valid PDF)
            pdf_res = self.client.get(f"/api/villas/invoices/{bk_unit['invoice_id']}/pdf", headers=self.headers)
            self.assertEqual(pdf_res.status_code, 200)
            self.assertTrue(pdf_res.content.startswith(b"%PDF-"))
            # ReportLab writes uncompressed/compressed streams; also check reports include late_checkout_revenue
            rep = self.client.get(
                f"/api/villas/reports?start_date={today.isoformat()}&end_date={(stay_out + timedelta(days=5)).isoformat()}",
                headers=self.headers,
            ).json()
            self.assertGreaterEqual(Decimal(str(rep["summary"]["late_checkout_revenue"])), Decimal("2500.00"))

            # 10. Refund & payment settlement remain exact after late checkout fee
            pay_rem = self.client.post(
                f"/api/villas/invoices/{bk_unit['invoice_id']}/payments",
                headers=self.headers,
                params={"amount": "7390.00", "method": "Card"},
            )
            self.assertEqual(pay_rem.status_code, 201, pay_rem.text)
            self.assertEqual(pay_rem.json()["payment_status"], "Paid")
            ref_res = self.client.post(
                f"/api/villas/invoices/{bk_unit['invoice_id']}/refunds",
                headers=self.headers,
                json={"refund_amount": "500.00", "refund_method": "UPI", "reason": "Goodwill discount"},
            )
            self.assertEqual(ref_res.status_code, 201, ref_res.text)
            self.assertEqual(Decimal(str(ref_res.json()["invoice"]["paid_amount"])), Decimal("11890.00"))
            self.assertEqual(Decimal(str(ref_res.json()["invoice"]["balance_due"])), Decimal("500.00"))

            # 6. Villa-level fee (1500) overrides property default (1000)
            _, sum_villa, _, inv_villa = run_checkout_at(u_villa_fee["id"], "9800005011", dt_31)
            self.assertEqual(Decimal(str(sum_villa["late_checkout_fee"])), Decimal("1500.00"))
            self.assertEqual(Decimal(str(inv_villa["subtotal"])), Decimal("9500.00"))

            # 7. Unconfigured fee (None at unit, villa, property) does NOT fabricate any charge even at 12:30 PM
            self.client.put(
                "/api/villas/settings",
                headers=self.headers,
                json={
                    "default_check_in_time": "14:00",
                    "default_check_out_time": "11:00",
                    "late_checkout_grace_minutes": 30,
                    "default_late_checkout_fee": None,
                },
            )
            dt_very_late = datetime(stay_out.year, stay_out.month, stay_out.day, 12, 30, tzinfo=KOLKATA_TZ)
            _, sum_unconf, _, inv_unconf = run_checkout_at(self.unit_id, "9800005012", dt_very_late)
            self.assertTrue(sum_unconf["is_late_checkout"])
            self.assertFalse(sum_unconf["late_fee_configured"])
            self.assertEqual(Decimal(str(sum_unconf["late_checkout_fee"])), Decimal("0.00"))
            self.assertEqual([it for it in inv_unconf["items"] if it["item_type"] == "LATE_CHECKOUT"], [])
            self.assertEqual(Decimal(str(inv_unconf["subtotal"])), Decimal("10000.00"))
        finally:
            self._reset_default_policy()

    def test_availability_schedule_reasons_and_next_available(self):
        # 1. Existing booking self.arrival -> self.departure makes unit unavailable; next open is self.departure
        resp = self.client.get(
            "/api/villas/availability",
            headers=self.headers,
            params={"start_date": self.arrival.isoformat(), "end_date": self.departure.isoformat(), "guests": 2},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        own = next(row for row in resp.json() if row["id"] == self.unit_id)
        self.assertFalse(own["available"])
        self.assertIn("Reserved", own["unavailable_reason"])
        self.assertEqual(own["next_available_date"], self.departure.isoformat())
        self.assertIn("2:00 PM", own["next_available_display"])

        # 2. Back-to-back booking leaving only a 1-night gap means a 2-night search skips past the second booking
        second_in = self.departure + timedelta(days=1)
        second_out = second_in + timedelta(days=3)
        b2 = self.client.post(
            "/api/villas/bookings",
            headers=self.headers,
            json={
                "unit_id": self.unit_id,
                "customer": {"full_name": "BackToBack Guest", "phone": "9876509988"},
                "check_in": second_in.isoformat(),
                "check_out": second_out.isoformat(),
                "guests": 2,
            },
        )
        self.assertEqual(b2.status_code, 201, b2.text)
        resp2 = self.client.get(
            "/api/villas/availability",
            headers=self.headers,
            params={
                "start_date": self.arrival.isoformat(),
                "end_date": (self.arrival + timedelta(days=2)).isoformat(),
                "guests": 2,
            },
        )
        own2 = next(row for row in resp2.json() if row["id"] == self.unit_id)
        self.assertFalse(own2["available"])
        self.assertEqual(own2["next_available_date"], second_out.isoformat())

        # 3. Block + Out of Order + Needs Cleaning on separate units
        u_blk = self.client.post(
            "/api/villas/units",
            headers=self.headers,
            json={"villa_id": self.villa_id, "category_id": self.cat_id, "name": "Unit-Blk-Avail", "capacity": 4, "bedrooms": 2, "base_rate": "4500"},
        )
        self.assertEqual(u_blk.status_code, 201, u_blk.text)
        u_blk_id = u_blk.json()["id"]
        blk_start = self.arrival
        blk_end = self.arrival + timedelta(days=4)
        self.assertEqual(
            self.client.post(
                "/api/villas/blocks",
                headers=self.headers,
                json={"unit_id": u_blk_id, "start_date": blk_start.isoformat(), "end_date": blk_end.isoformat(), "block_type": "Maintenance", "reason": "Plumbing"},
            ).status_code,
            201,
        )

        u_ooo = self.client.post(
            "/api/villas/units",
            headers=self.headers,
            json={"villa_id": self.villa_id, "category_id": self.cat_id, "name": "Unit-OOO-Avail", "capacity": 4, "bedrooms": 2, "base_rate": "4500"},
        )
        self.assertEqual(u_ooo.status_code, 201, u_ooo.text)
        u_ooo_id = u_ooo.json()["id"]
        self.assertEqual(
            self.client.patch(
                f"/api/villas/units/{u_ooo_id}/housekeeping",
                headers=self.headers,
                json={"status": "Out of Order"},
            ).status_code,
            200,
        )

        u_dirty = self.client.post(
            "/api/villas/units",
            headers=self.headers,
            json={"villa_id": self.villa_id, "category_id": self.cat_id, "name": "Unit-Dirty-Avail", "capacity": 4, "bedrooms": 2, "base_rate": "4500"},
        )
        self.assertEqual(u_dirty.status_code, 201, u_dirty.text)
        u_dirty_id = u_dirty.json()["id"]
        self.assertEqual(
            self.client.patch(
                f"/api/villas/units/{u_dirty_id}/housekeeping",
                headers=self.headers,
                json={"status": "Needs Cleaning"},
            ).status_code,
            200,
        )

        from app.core.date_utils import get_kolkata_today
        today = get_kolkata_today()
        resp_today = self.client.get(
            "/api/villas/availability",
            headers=self.headers,
            params={"start_date": today.isoformat(), "end_date": (today + timedelta(days=2)).isoformat(), "guests": 2},
        )
        rows_today = {row["id"]: row for row in resp_today.json()}
        self.assertFalse(rows_today[u_ooo_id]["available"])
        self.assertIn("Out of Order", rows_today[u_ooo_id]["unavailable_reason"])
        self.assertIsNone(rows_today[u_ooo_id]["next_available_date"])
        self.assertIn("maintenance clearance", rows_today[u_ooo_id]["next_available_display"].lower())

        self.assertFalse(rows_today[u_dirty_id]["available"])
        self.assertIn("Needs Cleaning", rows_today[u_dirty_id]["unavailable_reason"])
        self.assertEqual(rows_today[u_dirty_id]["next_available_date"], (today + timedelta(days=1)).isoformat())

        resp_future = self.client.get(
            "/api/villas/availability",
            headers=self.headers,
            params={"start_date": blk_start.isoformat(), "end_date": (blk_start + timedelta(days=2)).isoformat(), "guests": 2},
        )
        rows_future = {row["id"]: row for row in resp_future.json()}
        self.assertFalse(rows_future[u_blk_id]["available"])
        self.assertIn("Maintenance block", rows_future[u_blk_id]["unavailable_reason"])
        self.assertEqual(rows_future[u_blk_id]["next_available_date"], blk_end.isoformat())
        self.assertTrue(rows_future[u_dirty_id]["available"])

    def test_villa_guest_phone_and_email_strict_validation(self):
        # Reject 15-digit random phone, 7-digit phone, invalid prefix phone, and malformed email
        for bad_phone in ["789955441265125", "1234567", "5123456789", "98765"]:
            res = self.client.post(
                "/api/villas/guests",
                headers=self.headers,
                json={"full_name": "Invalid Phone Guest", "phone": bad_phone},
            )
            self.assertEqual(res.status_code, 422, f"Expected 422 for phone={bad_phone}: {res.text}")

        for bad_email in ["not-an-email", "a..b@resort.com", "guest@resort.c", "guest@domain"]:
            res = self.client.post(
                "/api/villas/guests",
                headers=self.headers,
                json={"full_name": "Invalid Email Guest", "phone": "9876501122", "email": bad_email},
            )
            self.assertEqual(res.status_code, 422, f"Expected 422 for email={bad_email}: {res.text}")

        # Valid +91 formatted 10-digit mobile and valid email succeed and normalize cleanly
        ok = self.client.post(
            "/api/villas/guests",
            headers=self.headers,
            json={"full_name": "Valid Contact Guest", "phone": "+91 98765 01133", "email": "Valid.Guest@Resort.IN"},
        )
        self.assertEqual(ok.status_code, 201, ok.text)
        self.assertEqual(ok.json()["phone"], "9876501133")
        self.assertEqual(ok.json()["email"], "valid.guest@resort.in")
