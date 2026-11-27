"""Isolated integration tests for the NewaraAI Transport Management Module."""
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
from app.main import app
from app.models import Customer, Staff, User
from app.models.entities import UserRole
from app.services import transport_service

TEST_DB_PATH = Path(__file__).resolve().parent / "test_transport_isolated.db"
TEST_PDF_DIR = Path(__file__).resolve().parent / "_tmp_transport_pdfs"
TEST_DATABASE_URL = os.environ.get(
    "TRANSPORT_TEST_DATABASE_URL",
    f"sqlite:///{TEST_DB_PATH.as_posix()}",
)
parsed_url = make_url(TEST_DATABASE_URL)
db_name = (parsed_url.database or "").lower()
if db_name in {"resort_db", "restaurant_db", "dineflow_db"}:
    raise RuntimeError("Transport tests are blocked from connecting to operational databases.")
if "test" not in db_name and ":memory:" not in TEST_DATABASE_URL.lower():
    raise RuntimeError("Transport tests require an isolated test database.")

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


class TestTransportModule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DINEFLOW_TEST_MODE"] = "1"
        transport_service.TRANSPORT_INVOICE_PDF_DIR = TEST_PDF_DIR
        Base.metadata.drop_all(bind=test_engine)
        Base.metadata.create_all(bind=test_engine)

        db = TestSession()
        cls.trn_manager = User(
            full_name="Test Transport Coordinator",
            email="trn.test.mgr@example.test",
            password_hash=hash_password("TestSecret#101"),
            role=UserRole.MANAGER,
            business_context="TRANSPORT",
            is_active=True,
        )
        cls.rest_manager = User(
            full_name="Test Restaurant Coordinator",
            email="rest.test.mgr@example.test",
            password_hash=hash_password("TestSecret#102"),
            role=UserRole.MANAGER,
            business_context="RESTAURANT",
            is_active=True,
        )
        cls.staff_user = User(
            full_name="Suresh Driver Staff",
            email="suresh.staff@example.test",
            password_hash=hash_password("TestSecret#103"),
            role=UserRole.STAFF,
            business_context="TRANSPORT",
            is_active=True,
        )
        cls.customer = Customer(
            full_name="Aarti Deshmukh",
            phone="9876501234",
            email="aarti@example.test",
            address="Panaji, Goa",
        )
        db.add_all([cls.trn_manager, cls.rest_manager, cls.staff_user, cls.customer])
        db.flush()
        cls.staff_rec = Staff(
            user_id=cls.staff_user.id,
            employee_code="DRV-001",
            phone="9876509999",
            designation="Senior Chauffeur",
            joining_date=get_kolkata_today(),
        )
        db.add(cls.staff_rec)
        db.commit()
        for obj in [cls.trn_manager, cls.rest_manager, cls.staff_user, cls.customer, cls.staff_rec]:
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

        cls.trn_headers = {
            "Authorization": f"Bearer {create_access_token({'sub': str(cls.trn_manager.id), 'role': 'manager', 'business_context': 'TRANSPORT'})}"
        }
        cls.rest_headers = {
            "Authorization": f"Bearer {create_access_token({'sub': str(cls.rest_manager.id), 'role': 'manager', 'business_context': 'RESTAURANT'})}"
        }

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        test_engine.dispose()
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()
        if TEST_PDF_DIR.exists():
            import shutil
            shutil.rmtree(TEST_PDF_DIR, ignore_errors=True)

    def test_01_context_isolation(self):
        # Restaurant manager blocked from Transport
        r1 = self.client.get("/api/transport/dashboard", headers=self.rest_headers)
        self.assertEqual(r1.status_code, 403)

        # Transport manager blocked from Restaurant, Spa, Villas, Packages, Activities
        for path in ["/api/menu/items", "/api/spa/dashboard/summary", "/api/villas/dashboard", "/api/packages/dashboard", "/api/activities/dashboard"]:
            res = self.client.get(path, headers=self.trn_headers)
            self.assertEqual(res.status_code, 403, f"Expected 403 for {path}, got {res.status_code}")

        # Transport manager allowed on Transport dashboard
        r2 = self.client.get("/api/transport/dashboard", headers=self.trn_headers)
        self.assertEqual(r2.status_code, 200)
        self.assertIn("statistics", r2.json())

    def test_02_fleet_drivers_routes_services_and_booking_workflow(self):
        today = get_kolkata_today()
        tomorrow = today + timedelta(days=1)

        # Categories seeded automatically
        cats = self.client.get("/api/transport/categories", headers=self.trn_headers).json()
        self.assertGreaterEqual(len(cats), 8)
        sedan_cat_id = next(c["id"] for c in cats if c["name"] == "Sedan")
        suv_cat_id = next(c["id"] for c in cats if c["name"] == "SUV")

        # Create 2 vehicles (Sedan 4 seats, SUV 7 seats)
        v1 = self.client.post(
            "/api/transport/vehicles",
            headers=self.trn_headers,
            json={
                "vehicle_name": "Resort Dzire 01",
                "registration_number": "GA-07-T-1001",
                "category_id": sedan_cat_id,
                "vehicle_type": "Sedan",
                "make": "Maruti Suzuki",
                "model": "Dzire ZXi",
                "year": 2025,
                "seating_capacity": 4,
                "fuel_type": "Petrol",
                "transmission_type": "Automatic",
                "insurance_expiry": (today + timedelta(days=180)).isoformat(),
            },
        )
        self.assertEqual(v1.status_code, 201, v1.text)
        v1_id = v1.json()["id"]

        v2 = self.client.post(
            "/api/transport/vehicles",
            headers=self.trn_headers,
            json={
                "vehicle_name": "Innova Hycross VIP",
                "registration_number": "GA-07-T-2002",
                "category_id": suv_cat_id,
                "vehicle_type": "SUV",
                "make": "Toyota",
                "model": "Innova Hycross",
                "year": 2026,
                "seating_capacity": 7,
                "fuel_type": "Hybrid",
                "transmission_type": "Automatic",
            },
        )
        self.assertEqual(v2.status_code, 201, v2.text)
        v2_id = v2.json()["id"]

        # Upload & retrieve vehicle image
        img_up = self.client.post(
            f"/api/transport/vehicles/{v1_id}/image",
            headers=self.trn_headers,
            files={"file": ("sedan.png", VALID_PNG, "image/png")},
        )
        self.assertEqual(img_up.status_code, 200, img_up.text)
        self.assertTrue(img_up.json()["image_url"])
        img_get = self.client.get(f"/api/transport/vehicles/{v1_id}/image", headers=self.trn_headers)
        self.assertEqual(img_get.status_code, 200)

        # Create driver linked to staff_rec + second driver
        d1 = self.client.post(
            "/api/transport/drivers",
            headers=self.trn_headers,
            json={
                "driver_name": "Suresh Naik",
                "phone": "9876509999",
                "licence_number": "GA07-2020-001122",
                "licence_validity": (today + timedelta(days=365)).isoformat(),
                "experience_years": 8,
                "staff_id": self.staff_rec.id,
                "assigned_vehicle_id": v1_id,
            },
        )
        self.assertEqual(d1.status_code, 201, d1.text)
        d1_id = d1.json()["id"]

        d2 = self.client.post(
            "/api/transport/drivers",
            headers=self.trn_headers,
            json={
                "driver_name": "Mahesh Sawant",
                "phone": "9876508888",
                "licence_number": "GA07-2021-003344",
                "licence_validity": (today - timedelta(days=5)).isoformat(),  # Expired licence!
                "experience_years": 5,
            },
        )
        self.assertEqual(d2.status_code, 201, d2.text)
        d2_id = d2.json()["id"]

        # Route & Service
        rt = self.client.post(
            "/api/transport/routes",
            headers=self.trn_headers,
            json={
                "route_name": "Mopa Airport to Resort",
                "route_code": "RT-GOX-RES",
                "starting_location": "Manohar International Airport (GOX)",
                "destination": "NewaraAI Resort Lobby",
                "approximate_distance_km": "32.50",
                "estimated_duration_minutes": 60,
                "route_type": "Airport Transfer",
                "standard_price": "2400.00",
            },
        )
        self.assertEqual(rt.status_code, 201, rt.text)
        route_id = rt.json()["id"]

        svc = self.client.post(
            "/api/transport/services",
            headers=self.trn_headers,
            json={
                "service_name": "Airport Transfer Sedan/SUV",
                "service_code": "SVC-AIR-01",
                "pricing_model": "Per Km",
                "base_price": "500.00",
                "price_per_km": "50.00",
                "applicable_category_ids": [sedan_cat_id, suv_cat_id],
            },
        )
        self.assertEqual(svc.status_code, 201, svc.text)
        svc_id = svc.json()["id"]

        # Availability check for 6 passengers -> v1 (4 seats) excluded, v2 (7 seats) included; d2 (expired licence) excluded
        avail = self.client.get(
            "/api/transport/availability",
            headers=self.trn_headers,
            params={
                "pickup_date": tomorrow.isoformat(),
                "pickup_time": "10:00",
                "duration_minutes": 60,
                "passenger_count": 6,
                "service_type_id": svc_id,
            },
        )
        self.assertEqual(avail.status_code, 200, avail.text)
        avail_veh_ids = [v["id"] for v in avail.json()["available_vehicles"]]
        avail_drv_ids = [d["id"] for d in avail.json()["available_drivers"]]
        self.assertNotIn(v1_id, avail_veh_ids)
        self.assertIn(v2_id, avail_veh_ids)
        self.assertIn(d1_id, avail_drv_ids)
        self.assertNotIn(d2_id, avail_drv_ids)

        # Passenger capacity violation rejected (6 pax in 4-seat v1)
        bad_cap = self.client.post(
            "/api/transport/bookings",
            headers=self.trn_headers,
            json={
                "booking_type": "Airport Transfer",
                "customer_id": self.customer.id,
                "service_type_id": svc_id,
                "route_id": route_id,
                "pickup_location": "GOX Airport",
                "drop_location": "Resort",
                "pickup_date": tomorrow.isoformat(),
                "pickup_time": "10:00",
                "estimated_distance_km": "32.50",
                "estimated_duration_minutes": 60,
                "passenger_count": 6,
                "vehicle_id": v1_id,
                "driver_id": d1_id,
            },
        )
        self.assertEqual(bad_cap.status_code, 422)

        # Expired driver licence rejected (409)
        bad_drv = self.client.post(
            "/api/transport/bookings",
            headers=self.trn_headers,
            json={
                "booking_type": "Airport Transfer",
                "customer_id": self.customer.id,
                "service_type_id": svc_id,
                "route_id": route_id,
                "pickup_location": "GOX Airport",
                "drop_location": "Resort",
                "pickup_date": tomorrow.isoformat(),
                "pickup_time": "10:00",
                "estimated_distance_km": "32.50",
                "estimated_duration_minutes": 60,
                "passenger_count": 4,
                "vehicle_id": v2_id,
                "driver_id": d2_id,
            },
        )
        self.assertEqual(bad_drv.status_code, 409)

        # Valid booking with v2 & d1: 500 + 32.50 * 50 = 2125.00
        bk = self.client.post(
            "/api/transport/bookings",
            headers=self.trn_headers,
            json={
                "booking_type": "Airport Transfer",
                "customer_id": self.customer.id,
                "service_type_id": svc_id,
                "route_id": route_id,
                "pickup_location": "GOX Airport",
                "drop_location": "Resort",
                "pickup_date": tomorrow.isoformat(),
                "pickup_time": "10:00",
                "estimated_distance_km": "32.50",
                "estimated_duration_minutes": 60,
                "passenger_count": 5,
                "vehicle_id": v2_id,
                "driver_id": d1_id,
                "additional_charges": "100.00",
                "discount_amount": "25.00",
            },
        )
        self.assertEqual(bk.status_code, 201, bk.text)
        bk_data = bk.json()
        bk_id = bk_data["id"]
        self.assertEqual(bk_data["status"], "Assigned")
        self.assertEqual(Decimal(bk_data["total_amount"]), Decimal("2200.00"))

        # Overlapping assignment on v2 at 10:30 rejected (409)
        overlap = self.client.post(
            "/api/transport/bookings",
            headers=self.trn_headers,
            json={
                "booking_type": "Local Travel",
                "customer_id": self.customer.id,
                "pickup_location": "Resort",
                "drop_location": "City",
                "pickup_date": tomorrow.isoformat(),
                "pickup_time": "10:30",
                "estimated_duration_minutes": 60,
                "passenger_count": 2,
                "vehicle_id": v2_id,
                "driver_id": d1_id,
            },
        )
        self.assertEqual(overlap.status_code, 409)

        # Invalid lifecycle jump Assigned -> Completed rejected (422)
        bad_jump = self.client.patch(
            f"/api/transport/bookings/{bk_id}/status",
            headers=self.trn_headers,
            json={"status": "Completed"},
        )
        self.assertEqual(bad_jump.status_code, 422)

        # Valid lifecycle Assigned -> Driver En Route -> In Progress -> Completed
        for step_payload in [
            {"status": "Driver En Route"},
            {"status": "In Progress", "start_odometer_km": 12000},
            {"status": "Completed", "end_odometer_km": 12035, "remarks": "Smooth airport pickup"},
        ]:
            st = self.client.patch(f"/api/transport/bookings/{bk_id}/status", headers=self.trn_headers, json=step_payload)
            self.assertEqual(st.status_code, 200, st.text)
        self.assertEqual(st.json()["status"], "Completed")

        # Maintenance makes vehicle unavailable and restores on completion
        maint = self.client.post(
            "/api/transport/maintenance",
            headers=self.trn_headers,
            json={
                "vehicle_id": v2_id,
                "maintenance_type": "Routine Service",
                "service_date": today.isoformat(),
                "service_description": "10,000 km service & brake check",
                "cost": "4500.00",
                "status": "In Progress",
            },
        )
        self.assertEqual(maint.status_code, 201, maint.text)
        maint_id = maint.json()["id"]

        veh_check = self.client.get(f"/api/transport/vehicles/{v2_id}", headers=self.trn_headers).json()
        self.assertEqual(veh_check["status"], "Maintenance")

        # Cannot delete vehicle with history/maintenance
        del_v2 = self.client.delete(f"/api/transport/vehicles/{v2_id}", headers=self.trn_headers)
        self.assertEqual(del_v2.status_code, 409)

        # Complete maintenance -> restores Available
        self.assertEqual(
            self.client.patch(f"/api/transport/maintenance/{maint_id}", headers=self.trn_headers, json={"status": "Completed"}).status_code,
            200,
        )
        veh_check2 = self.client.get(f"/api/transport/vehicles/{v2_id}", headers=self.trn_headers).json()
        self.assertEqual(veh_check2["status"], "Available")

        # Fuel expense
        exp = self.client.post(
            "/api/transport/expenses",
            headers=self.trn_headers,
            json={
                "vehicle_id": v2_id,
                "record_date": today.isoformat(),
                "expense_category": "Fuel",
                "fuel_type": "Petrol",
                "quantity": "20.00",
                "cost_per_unit": "100.00",
            },
        )
        self.assertEqual(exp.status_code, 201, exp.text)

        # Invoice + Partial Payment + Full Payment + PDF + Reports + Global Search
        inv = self.client.post(
            "/api/transport/invoices",
            headers=self.trn_headers,
            json={"booking_id": bk_id, "gst_rate": "5.00"},
        )
        self.assertEqual(inv.status_code, 201, inv.text)
        inv_id = inv.json()["id"]
        self.assertEqual(Decimal(inv.json()["total_amount"]), Decimal("2310.00"))

        p1 = self.client.post(
            f"/api/transport/invoices/{inv_id}/payments",
            headers=self.trn_headers,
            json={"amount": "1000.00", "payment_method": "UPI", "payment_type": "Advance"},
        )
        self.assertEqual(p1.status_code, 200, p1.text)
        self.assertEqual(p1.json()["invoice"]["payment_status"], "Partially Paid")

        p2 = self.client.post(
            f"/api/transport/invoices/{inv_id}/payments",
            headers=self.trn_headers,
            json={"amount": "1310.00", "payment_method": "Card", "payment_type": "Full"},
        )
        self.assertEqual(p2.status_code, 200, p2.text)
        self.assertEqual(p2.json()["invoice"]["payment_status"], "Paid")

        pdf_res = self.client.get(f"/api/transport/invoices/{inv_id}/pdf", headers=self.trn_headers)
        self.assertEqual(pdf_res.status_code, 200)
        self.assertIn("application/pdf", pdf_res.headers["content-type"])

        rep = self.client.get("/api/transport/reports", headers=self.trn_headers, params={"report_type": "vehicle_utilization"})
        self.assertEqual(rep.status_code, 200)
        self.assertGreaterEqual(len(rep.json()["items"]), 2)

        csv_res = self.client.get("/api/transport/reports/export", headers=self.trn_headers, params={"report_type": "revenue"})
        self.assertEqual(csv_res.status_code, 200)

        srch = self.client.get("/api/search", headers=self.trn_headers, params={"q": "Hycross"})
        self.assertEqual(srch.status_code, 200)
        self.assertGreaterEqual(srch.json()["total_matches"], 1)

    def test_03_minimal_vehicle_driver_filter_auto_route_code_and_booking_edit(self):
        today = get_kolkata_today()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)

        # 1. Minimal vehicle creation (ss1: only core fields required)
        cats = self.client.get("/api/transport/categories", headers=self.trn_headers).json()
        suv_id = next(c["id"] for c in cats if c["name"] == "SUV")
        v_min = self.client.post(
            "/api/transport/vehicles",
            headers=self.trn_headers,
            json={
                "vehicle_name": "Safari Minimal SUV",
                "registration_number": "MH-12-XY-9999",
                "category_id": suv_id,
                "seating_capacity": 6,
                "status": "Available",
                "notes": "VIP resort SUV",
            },
        )
        self.assertEqual(v_min.status_code, 201, v_min.text)
        self.assertEqual(v_min.json()["vehicle_type"], "SUV")

        # 2. Staff lookup returns ONLY staff with designation matching driver (ss3)
        db = TestSession()
        u_waiter = User(
            full_name="Test Waiter",
            email="waiter.lookup@example.test",
            password_hash=hash_password("Pass@1234"),
            role=UserRole.STAFF,
            business_context="RESTAURANT",
            is_active=True,
        )
        u_driver = User(
            full_name="Test Driver Staff",
            email="driver.lookup@example.test",
            password_hash=hash_password("Pass@1234"),
            role=UserRole.STAFF,
            business_context="TRANSPORT",
            is_active=True,
        )
        db.add_all([u_waiter, u_driver])
        db.flush()
        db.add_all([
            Staff(user_id=u_waiter.id, employee_code="WTR-901", phone="9999900001", designation="Waiter"),
            Staff(user_id=u_driver.id, employee_code="DRV-902", phone="9999900002", designation="Driver"),
        ])
        db.commit()
        db.close()

        lookup = self.client.get("/api/transport/staff-lookup", headers=self.trn_headers)
        self.assertEqual(lookup.status_code, 200)
        designations = [s["designation"] for s in lookup.json()]
        self.assertIn("Driver", designations)
        self.assertNotIn("Waiter", designations)

        # 3. Auto-generated unique route_code when omitted (ss5)
        rt_auto = self.client.post(
            "/api/transport/routes",
            headers=self.trn_headers,
            json={
                "route_name": "Pune Airport to Resort",
                "starting_location": "Pune Airport (PNQ)",
                "destination": "The Grand Niwara Resort",
                "approximate_distance_km": "14.50",
                "estimated_duration_minutes": 35,
                "route_type": "Airport Transfer",
                "standard_price": "800.00",
            },
        )
        self.assertEqual(rt_auto.status_code, 201, rt_auto.text)
        self.assertTrue(rt_auto.json()["route_code"].startswith("RT-AIR-"))

        # 4. Past date/time availability & booking rejected (ss7/ss8)
        past_avail = self.client.get(
            "/api/transport/availability",
            headers=self.trn_headers,
            params={"pickup_date": yesterday.isoformat(), "pickup_time": "10:00", "passenger_count": 2},
        )
        self.assertEqual(past_avail.status_code, 422)

        past_bk = self.client.post(
            "/api/transport/bookings",
            headers=self.trn_headers,
            json={
                "booking_type": "Airport Transfer",
                "customer_id": self.customer.id,
                "pickup_location": "Pune Airport",
                "drop_location": "Resort",
                "pickup_date": yesterday.isoformat(),
                "pickup_time": "10:00",
                "passenger_count": 2,
            },
        )
        self.assertEqual(past_bk.status_code, 422)

        # 5. Create future booking and edit it (ss6)
        bk2 = self.client.post(
            "/api/transport/bookings",
            headers=self.trn_headers,
            json={
                "booking_type": "Airport Transfer",
                "customer_id": self.customer.id,
                "pickup_location": "Pune Airport",
                "drop_location": "Resort",
                "pickup_date": tomorrow.isoformat(),
                "pickup_time": "12:00",
                "passenger_count": 2,
                "base_price": "1200.00",
            },
        )
        self.assertEqual(bk2.status_code, 201, bk2.text)
        bk2_id = bk2.json()["id"]

        edited = self.client.patch(
            f"/api/transport/bookings/{bk2_id}",
            headers=self.trn_headers,
            json={
                "pickup_location": "Pune Railway Station",
                "passenger_count": 4,
                "base_price": "1500.00",
                "notes": "Updated to 4 pax",
            },
        )
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["pickup_location"], "Pune Railway Station")
        self.assertEqual(edited.json()["passenger_count"], 4)
        self.assertEqual(Decimal(edited.json()["total_amount"]), Decimal("1500.00"))


if __name__ == "__main__":
    unittest.main()
