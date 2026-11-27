"""Isolated integration tests for the NewaraAI Activities Management Module."""
import io
import os
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
from app.models import Customer, User
from app.models.entities import UserRole
from main_activities import app

TEST_DB_PATH = Path(__file__).resolve().parent / "test_activities_isolated.db"
TEST_DATABASE_URL = os.environ.get(
    "ACTIVITIES_TEST_DATABASE_URL",
    f"sqlite:///{TEST_DB_PATH.as_posix()}",
)
parsed_url = make_url(TEST_DATABASE_URL)
db_name = (parsed_url.database or "").lower()
if db_name in {"resort_db", "restaurant_db", "dineflow_db"}:
    raise RuntimeError("Activities tests are blocked from connecting to operational databases.")
if "test" not in db_name and ":memory:" not in TEST_DATABASE_URL.lower():
    raise RuntimeError("Activities tests require an isolated test database.")

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


class TestActivitiesModule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DINEFLOW_TEST_MODE"] = "1"
        Base.metadata.drop_all(bind=test_engine)
        Base.metadata.create_all(bind=test_engine)
        db = TestSession()
        cls.act_manager = User(
            full_name="Activities Manager",
            email="activities.mgr@example.test",
            password_hash=hash_password("ActivityTest@123"),
            role=UserRole.MANAGER,
            business_context="ACTIVITY",
            is_active=True,
        )
        cls.act_instructor = User(
            full_name="Yoga Instructor",
            email="instructor@example.test",
            password_hash=hash_password("InstructorTest@123"),
            role=UserRole.MANAGER,
            business_context="ACTIVITY",
            is_active=True,
        )
        cls.pkg_manager = User(
            full_name="Packages Manager",
            email="pkg.mgr@example.test",
            password_hash=hash_password("PackageTest@123"),
            role=UserRole.MANAGER,
            business_context="PACKAGE",
            is_active=True,
        )
        cls.rest_manager = User(
            full_name="Restaurant Manager",
            email="rest.mgr@example.test",
            password_hash=hash_password("RestTest@123"),
            role=UserRole.MANAGER,
            business_context="RESTAURANT",
            is_active=True,
        )
        cls.customer = Customer(
            full_name="Rohan Kapoor",
            phone="9876543210",
            email="rohan@example.test",
            address="Goa",
        )
        db.add_all([cls.act_manager, cls.act_instructor, cls.pkg_manager, cls.rest_manager, cls.customer])
        db.commit()
        for obj in [cls.act_manager, cls.act_instructor, cls.pkg_manager, cls.rest_manager, cls.customer]:
            db.refresh(obj)
        db.close()

        def override_get_db():
            session = TestSession()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

        cls.act_headers = {
            "Authorization": f"Bearer {create_access_token({'sub': str(cls.act_manager.id), 'role': 'manager', 'business_context': 'ACTIVITY'})}"
        }
        cls.pkg_headers = {
            "Authorization": f"Bearer {create_access_token({'sub': str(cls.pkg_manager.id), 'role': 'manager', 'business_context': 'PACKAGE'})}"
        }
        cls.rest_headers = {
            "Authorization": f"Bearer {create_access_token({'sub': str(cls.rest_manager.id), 'role': 'manager', 'business_context': 'RESTAURANT'})}"
        }

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        test_engine.dispose()
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink(missing_ok=True)

    def test_01_context_isolation_and_auth_login(self):
        # Cross-context users are rejected on /api/activities/dashboard
        self.assertEqual(self.client.get("/api/activities/dashboard", headers=self.pkg_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/activities/dashboard", headers=self.rest_headers).status_code, 403)

        # Wrong context on login fails cleanly
        bad_login = self.client.post(
            "/api/auth/login",
            json={"email": "activities.mgr@example.test", "password": "ActivityTest@123", "business_context": "PACKAGE"},
        )
        self.assertEqual(bad_login.status_code, 401)

        # Valid ACTIVITY login succeeds
        good_login = self.client.post(
            "/api/auth/login",
            json={"email": "activities.mgr@example.test", "password": "ActivityTest@123", "business_context": "ACTIVITY"},
        )
        self.assertEqual(good_login.status_code, 200)
        self.assertEqual(good_login.json()["business_context"], "ACTIVITY")

    def test_02_time_slot_resource_overlap_and_409(self):
        today = get_kolkata_today()
        act_res = self.client.post(
            "/api/activities/activities",
            headers=self.act_headers,
            json={
                "name": "Tennis Court",
                "activity_code": "ACT-TENNIS-01",
                "category": "Outdoor",
                "booking_type": "time_slot",
                "duration_minutes": 60,
                "min_participants": 1,
                "max_participants": 4,
                "price_per_group": "800.00",
                "status": "Active",
            },
        )
        self.assertEqual(act_res.status_code, 201)
        act_id = act_res.json()["id"]

        res_create = self.client.post(
            f"/api/activities/activities/{act_id}/resources",
            headers=self.act_headers,
            json={"name": "Court 1", "capacity": 4},
        )
        self.assertEqual(res_create.status_code, 201)
        resource_id = res_create.json()["id"]

        # Book 10:00-11:00
        bk1 = self.client.post(
            "/api/activities/bookings",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "customer_id": self.customer.id,
                "resource_id": resource_id,
                "booking_date": str(today),
                "slot_date": str(today),
                "slot_start_time": "10:00",
                "slot_end_time": "11:00",
                "participant_count": 2,
                "pricing_method": "per_group",
            },
        )
        self.assertEqual(bk1.status_code, 201)

        # Overlapping 10:30-11:30 must return 409
        bk_overlap = self.client.post(
            "/api/activities/bookings",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "customer_id": self.customer.id,
                "resource_id": resource_id,
                "booking_date": str(today),
                "slot_date": str(today),
                "slot_start_time": "10:30",
                "slot_end_time": "11:30",
                "participant_count": 2,
                "pricing_method": "per_group",
            },
        )
        self.assertEqual(bk_overlap.status_code, 409)

        # Non-overlapping 11:00-12:00 must succeed
        bk2 = self.client.post(
            "/api/activities/bookings",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "customer_id": self.customer.id,
                "resource_id": resource_id,
                "booking_date": str(today),
                "slot_date": str(today),
                "slot_start_time": "11:00",
                "slot_end_time": "12:00",
                "participant_count": 2,
                "pricing_method": "per_group",
            },
        )
        self.assertEqual(bk2.status_code, 201)

        # Cannot reduce activity max_participants below existing booking size (2)
        cap_reduce = self.client.patch(
            f"/api/activities/activities/{act_id}",
            headers=self.act_headers,
            json={"max_participants": 1},
        )
        self.assertEqual(cap_reduce.status_code, 409)

    def test_03_session_capacity_staff_conflict_age_and_waiver(self):
        today = get_kolkata_today()
        act_res = self.client.post(
            "/api/activities/activities",
            headers=self.act_headers,
            json={
                "name": "Ridge Trek",
                "activity_code": "ACT-TREK-01",
                "category": "Adventure",
                "booking_type": "session",
                "duration_minutes": 120,
                "min_participants": 2,
                "max_participants": 6,
                "min_age": 16,
                "requires_waiver": True,
                "price_per_person": "1500.00",
                "status": "Active",
            },
        )
        self.assertEqual(act_res.status_code, 201)
        act_id = act_res.json()["id"]

        # Create session capacity=3 assigned to instructor
        sess_res = self.client.post(
            "/api/activities/sessions",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "session_date": str(today + timedelta(days=1)),
                "start_time": "07:00",
                "end_time": "09:00",
                "capacity": 3,
                "assigned_staff_id": self.act_instructor.id,
            },
        )
        self.assertEqual(sess_res.status_code, 201)
        sess_id = sess_res.json()["id"]

        # Overlapping session for same instructor must fail with 409
        sess_conflict = self.client.post(
            "/api/activities/sessions",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "session_date": str(today + timedelta(days=1)),
                "start_time": "08:00",
                "end_time": "10:00",
                "capacity": 4,
                "assigned_staff_id": self.act_instructor.id,
            },
        )
        self.assertEqual(sess_conflict.status_code, 409)

        # Under-age participant fails 422
        underage = self.client.post(
            "/api/activities/bookings",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "customer_id": self.customer.id,
                "session_id": sess_id,
                "booking_date": str(today),
                "participant_count": 2,
                "pricing_method": "per_person",
                "participants": [
                    {"participant_name": "Kid", "age": 12, "waiver_signed": False},
                    {"participant_name": "Adult", "age": 30, "waiver_signed": True},
                ],
            },
        )
        self.assertEqual(underage.status_code, 422)

        # Valid 2-person booking with unsigned waiver succeeds
        bk = self.client.post(
            "/api/activities/bookings",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "customer_id": self.customer.id,
                "session_id": sess_id,
                "booking_date": str(today),
                "participant_count": 2,
                "pricing_method": "per_person",
                "participants": [
                    {"participant_name": "Guest 1", "age": 25, "waiver_signed": False},
                    {"participant_name": "Guest 2", "age": 28, "waiver_signed": True},
                ],
            },
        )
        self.assertEqual(bk.status_code, 201)
        bk_id = bk.json()["id"]

        # Overselling remaining 1 seat with party of 2 fails 409
        oversell = self.client.post(
            "/api/activities/bookings",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "customer_id": self.customer.id,
                "session_id": sess_id,
                "booking_date": str(today),
                "participant_count": 2,
                "pricing_method": "per_person",
            },
        )
        self.assertEqual(oversell.status_code, 409)

        # Confirm then try Complete without signed waiver -> 422
        self.assertEqual(
            self.client.patch(
                f"/api/activities/bookings/{bk_id}/status",
                headers=self.act_headers,
                json={"status": "Confirmed"},
            ).status_code,
            200,
        )
        complete_fail = self.client.patch(
            f"/api/activities/bookings/{bk_id}/status",
            headers=self.act_headers,
            json={"status": "Completed"},
        )
        self.assertEqual(complete_fail.status_code, 422)

        # Sign waiver on participant then Complete succeeds
        parts = self.client.get(f"/api/activities/bookings/{bk_id}/participants", headers=self.act_headers).json()
        unsigned = [p for p in parts if not p["waiver_signed"]][0]
        self.assertEqual(
            self.client.patch(
                f"/api/activities/participants/{unsigned['id']}",
                headers=self.act_headers,
                json={"waiver_signed": True, "attendance_status": "Present"},
            ).status_code,
            200,
        )
        complete_ok = self.client.patch(
            f"/api/activities/bookings/{bk_id}/status",
            headers=self.act_headers,
            json={"status": "Completed"},
        )
        self.assertEqual(complete_ok.status_code, 200)

        # Invoice + Payment + PDF
        inv = self.client.post(
            "/api/activities/invoices",
            headers=self.act_headers,
            json={"booking_id": bk_id, "gst_rate": "18.00"},
        )
        self.assertEqual(inv.status_code, 201)
        inv_id = inv.json()["id"]
        total_due = inv.json()["total_amount"]
        pay = self.client.post(
            f"/api/activities/invoices/{inv_id}/payments",
            headers=self.act_headers,
            json={"amount": total_due, "payment_method": "UPI", "payment_type": "Full"},
        )
        self.assertEqual(pay.status_code, 201)
        self.assertEqual(pay.json()["invoice"]["payment_status"], "Paid")
        pdf_res = self.client.get(f"/api/activities/invoices/{inv_id}/pdf", headers=self.act_headers)
        self.assertEqual(pdf_res.status_code, 200)
        self.assertEqual(pdf_res.headers["content-type"], "application/pdf")

    def test_04_walkin_media_dashboard_and_reports(self):
        today = get_kolkata_today()
        walk_act = self.client.post(
            "/api/activities/activities",
            headers=self.act_headers,
            json={
                "name": "Lagoon Kayaking",
                "activity_code": "ACT-KAYAK-01",
                "category": "Water",
                "booking_type": "walk_in",
                "duration_minutes": 60,
                "min_participants": 1,
                "max_participants": 2,
                "price_per_person": "500.00",
                "status": "Active",
            },
        )
        self.assertEqual(walk_act.status_code, 201)
        act_id = walk_act.json()["id"]

        # Upload cover media
        up = self.client.post(
            f"/api/activities/activities/{act_id}/media",
            headers=self.act_headers,
            files={"file": ("kayak.png", VALID_PNG, "image/png")},
            data={"media_type": "cover", "caption": "Kayak cover"},
        )
        self.assertEqual(up.status_code, 201)

        # Usage log (auto-calculates 2 * 500 = 1000)
        log = self.client.post(
            "/api/activities/usage-logs",
            headers=self.act_headers,
            json={"activity_id": act_id, "usage_date": str(today), "participant_count": 2},
        )
        self.assertEqual(log.status_code, 201)

        dash = self.client.get("/api/activities/dashboard", headers=self.act_headers)
        self.assertEqual(dash.status_code, 200)
        self.assertGreaterEqual(dash.json()["statistics"]["total_activities"], 3)

        csv_res = self.client.get("/api/activities/reports/export?report_type=bookings", headers=self.act_headers)
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn("text/csv", csv_res.headers["content-type"])

    def test_05_email_required_and_single_bulk_clear_endpoints(self):
        today = get_kolkata_today()

        # 1. Customer requires valid email
        no_email = self.client.post(
            "/api/activities/customers",
            headers=self.act_headers,
            json={"full_name": "Missing Email", "phone": "9876500001", "email": ""},
        )
        self.assertEqual(no_email.status_code, 422)

        bad_email = self.client.post(
            "/api/activities/customers",
            headers=self.act_headers,
            json={"full_name": "Bad Email", "phone": "9876500001", "email": "not-an-email"},
        )
        self.assertEqual(bad_email.status_code, 422)

        c1 = self.client.post(
            "/api/activities/customers",
            headers=self.act_headers,
            json={"full_name": "Clear Guest 1", "phone": "9876500001", "email": "clear1@example.test"},
        )
        c2 = self.client.post(
            "/api/activities/customers",
            headers=self.act_headers,
            json={"full_name": "Clear Guest 2", "phone": "9876500002", "email": "clear2@example.test"},
        )
        self.assertEqual(c1.status_code, 201)
        self.assertEqual(c2.status_code, 201)
        c1_id, c2_id = c1.json()["id"], c2.json()["id"]

        # 2. Activity + Schedule + Session + Bookings + Pending Invoice + Usage Log
        act = self.client.post(
            "/api/activities/activities",
            headers=self.act_headers,
            json={
                "name": "Temp Clear Session",
                "activity_code": "ACT-CLEAR-01",
                "category": "Outdoor",
                "booking_type": "session",
                "duration_minutes": 45,
                "min_participants": 1,
                "max_participants": 6,
                "price_per_person": "300.00",
                "status": "Active",
            },
        )
        self.assertEqual(act.status_code, 201)
        act_id = act.json()["id"]

        sched = self.client.post(
            f"/api/activities/activities/{act_id}/schedules",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "operating_weekdays": [0, 1, 2],
                "start_time": "09:00",
                "end_time": "10:00",
                "valid_from": str(today),
                "valid_to": str(today + timedelta(days=7)),
                "default_capacity": 6,
            },
        )
        self.assertEqual(sched.status_code, 201)
        sched_id = sched.json()["id"]

        sess = self.client.post(
            "/api/activities/sessions",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "session_date": str(today + timedelta(days=2)),
                "start_time": "09:00",
                "end_time": "10:00",
                "capacity": 6,
            },
        )
        self.assertEqual(sess.status_code, 201)
        sess_id = sess.json()["id"]

        bk1 = self.client.post(
            "/api/activities/bookings",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "customer_id": c1_id,
                "session_id": sess_id,
                "booking_date": str(today),
                "participant_count": 2,
                "pricing_method": "per_person",
                "participants": [
                    {"participant_name": "P1", "age": 22, "waiver_signed": False},
                    {"participant_name": "P2", "age": 24, "waiver_signed": False},
                ],
            },
        )
        self.assertEqual(bk1.status_code, 201)
        bk1_id = bk1.json()["id"]

        # Bulk update participants (roster checkboxes)
        parts = self.client.get(f"/api/activities/bookings/{bk1_id}/participants", headers=self.act_headers).json()
        p_ids = [p["id"] for p in parts]
        bulk_p = self.client.post(
            "/api/activities/participants/bulk-update",
            headers=self.act_headers,
            json={"ids": p_ids, "waiver_signed": True, "attendance_status": "Present"},
        )
        self.assertEqual(bulk_p.status_code, 200)
        self.assertEqual(bulk_p.json()["updated"], 2)

        # Unpaid invoice can be cleared via DELETE
        inv = self.client.post(
            "/api/activities/invoices",
            headers=self.act_headers,
            json={"booking_id": bk1_id, "gst_rate": "18.00"},
        )
        self.assertEqual(inv.status_code, 201)
        inv_id = inv.json()["id"]
        self.assertEqual(
            self.client.delete(f"/api/activities/invoices/{inv_id}", headers=self.act_headers).status_code,
            200,
        )

        # Customer with active booking cannot be deleted (409), Session cannot be deleted (409)
        self.assertEqual(
            self.client.delete(f"/api/activities/customers/{c1_id}", headers=self.act_headers).status_code,
            409,
        )
        self.assertEqual(
            self.client.delete(f"/api/activities/sessions/{sess_id}", headers=self.act_headers).status_code,
            409,
        )

        # Clear booking, then session, schedule, and customers cleanly via bulk/single delete
        self.assertEqual(
            self.client.post(
                "/api/activities/bookings/bulk-delete",
                headers=self.act_headers,
                json={"ids": [bk1_id]},
            ).json()["deleted"],
            1,
        )
        self.assertEqual(
            self.client.delete(f"/api/activities/sessions/{sess_id}", headers=self.act_headers).status_code,
            200,
        )
        self.assertEqual(
            self.client.delete(f"/api/activities/schedules/{sched_id}", headers=self.act_headers).status_code,
            200,
        )
        bulk_cust = self.client.post(
            "/api/activities/customers/bulk-delete",
            headers=self.act_headers,
            json={"ids": [c1_id, c2_id]},
        )
        self.assertEqual(bulk_cust.status_code, 200)
        self.assertEqual(bulk_cust.json()["deleted"], 2)

        # Walk-in usage log single delete
        walk_act = self.client.post(
            "/api/activities/activities",
            headers=self.act_headers,
            json={
                "name": "Temp Walkin Clear",
                "activity_code": "ACT-WLK-CLR",
                "category": "Indoor",
                "booking_type": "walk_in",
                "duration_minutes": 30,
                "min_participants": 1,
                "max_participants": 4,
                "is_complimentary": True,
                "status": "Active",
            },
        )
        w_id = walk_act.json()["id"]
        wlog = self.client.post(
            "/api/activities/usage-logs",
            headers=self.act_headers,
            json={"activity_id": w_id, "usage_date": str(today), "participant_count": 1},
        )
        self.assertEqual(wlog.status_code, 201)
        wlog_id = wlog.json()["id"]
        self.assertEqual(
            self.client.post(
                "/api/activities/usage-logs/bulk-delete",
                headers=self.act_headers,
                json={"ids": [wlog_id]},
            ).json()["deleted"],
            1,
        )
        self.assertEqual(
            self.client.post(
                "/api/activities/activities/bulk-delete",
                headers=self.act_headers,
                json={"ids": [act_id, w_id]},
            ).json()["cleared"],
            2,
        )

    def test_06_staff_creation_activity_assignment_and_live_notifications(self):
        today = get_kolkata_today()
        act = self.client.post(
            "/api/activities/activities",
            headers=self.act_headers,
            json={
                "name": "Sunset Pilates",
                "activity_code": "ACT-PILATES-01",
                "category": "Indoor",
                "booking_type": "session",
                "duration_minutes": 60,
                "min_participants": 1,
                "max_participants": 8,
                "price_per_person": "400.00",
                "status": "Active",
            },
        )
        self.assertEqual(act.status_code, 201)
        act_id = act.json()["id"]

        # Create instructor linked to this specific activity
        ins1 = self.client.post(
            "/api/activities/staff",
            headers=self.act_headers,
            json={
                "full_name": "Meera Coach",
                "email": "meera.coach@example.test",
                "phone": "9876511111",
                "designation": "Pilates Instructor",
                "activity_ids": [act_id],
            },
        )
        self.assertEqual(ins1.status_code, 201)
        ins1_id = ins1.json()["id"]
        self.assertEqual(ins1.json()["assigned_activity_ids"], [act_id])

        ins2 = self.client.post(
            "/api/activities/staff",
            headers=self.act_headers,
            json={
                "full_name": "Arav Guide",
                "email": "arav.guide@example.test",
                "phone": "9876522222",
                "designation": "Trail Guide",
                "activity_ids": [],
            },
        )
        self.assertEqual(ins2.status_code, 201)
        ins2_id = ins2.json()["id"]

        # Filtering/prioritizing by activity_id marks Meera as assigned to activity
        staff_list = self.client.get(
            f"/api/activities/staff?activity_id={act_id}&assigned_only=true",
            headers=self.act_headers,
        ).json()
        self.assertEqual([s["id"] for s in staff_list], [ins1_id])

        # Create unassigned session today -> notifications include unassigned_staff
        sess = self.client.post(
            "/api/activities/sessions",
            headers=self.act_headers,
            json={
                "activity_id": act_id,
                "session_date": str(today),
                "start_time": "17:00",
                "end_time": "18:00",
                "capacity": 8,
            },
        )
        self.assertEqual(sess.status_code, 201)
        sess_id = sess.json()["id"]

        notif_before = self.client.get("/api/activities/notifications", headers=self.act_headers).json()
        self.assertTrue(any(n["id"] == "unassigned_staff" for n in notif_before["items"]))

        # Assign instructor -> unassigned_staff notification clears
        self.assertEqual(
            self.client.patch(
                f"/api/activities/sessions/{sess_id}",
                headers=self.act_headers,
                json={"assigned_staff_id": ins1_id},
            ).status_code,
            200,
        )
        notif_after = self.client.get("/api/activities/notifications", headers=self.act_headers).json()
        self.assertFalse(any(n["id"] == "unassigned_staff" for n in notif_after["items"]))

        # Cannot delete instructor assigned to upcoming session (409)
        self.assertEqual(
            self.client.delete(f"/api/activities/staff/{ins1_id}", headers=self.act_headers).status_code,
            409,
        )

        # Unassign and clear session + delete both instructors cleanly
        self.client.patch(
            f"/api/activities/sessions/{sess_id}",
            headers=self.act_headers,
            json={"assigned_staff_id": None},
        )
        self.assertEqual(
            self.client.delete(f"/api/activities/sessions/{sess_id}", headers=self.act_headers).status_code,
            200,
        )
        bulk_del = self.client.post(
            "/api/activities/staff/bulk-delete",
            headers=self.act_headers,
            json={"ids": [ins1_id, ins2_id]},
        )
        self.assertEqual(bulk_del.status_code, 200)
        self.assertEqual(bulk_del.json()["deleted"], 2)


if __name__ == "__main__":
    unittest.main()
