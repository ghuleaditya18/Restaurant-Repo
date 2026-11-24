import os
import sys
import unittest
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.entities import User, UserRole
from app.models.spa import (
    SpaBooking,
    SpaBookingService,
    SpaBookingStatus,
    SpaBookingStatusHistory,
    SpaCustomer,
    SpaInvoice,
    SpaInvoiceItem,
    SpaPayment,
    SpaPaymentMethod,
    SpaPaymentStatus,
    SpaService,
    SpaServiceCategory,
    SpaStaff,
    SpaStaffAvailability,
)

# Dedicated Isolated Test Database
TEST_DB_PATH = Path(__file__).resolve().parent / "test_spa_isolated.db"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{TEST_DB_PATH.as_posix()}")

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in TEST_DATABASE_URL else {},
    poolclass=StaticPool if ":memory:" in TEST_DATABASE_URL else None,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestSpaModule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Override FastAPI DB dependency to use the isolated test database exclusively
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=test_engine)

        cls.client = TestClient(app)
        cls.db = TestingSessionLocal()

        # Seed isolated test users directly in the isolated test database
        cls.restaurant_user = User(
            full_name="Restaurant Test Manager",
            email="test.restaurant.fixture@dineflow.com",
            password_hash=hash_password("Test@123"),
            role=UserRole.MANAGER,
            business_context="RESTAURANT",
            is_active=True,
        )
        cls.spa_user = User(
            full_name="Spa Test Manager",
            email="test.spa.fixture@dineflow.com",
            password_hash=hash_password("Test@123"),
            role=UserRole.MANAGER,
            business_context="SPA",
            is_active=True,
        )
        cls.db.add_all([cls.restaurant_user, cls.spa_user])
        cls.db.commit()
        cls.db.refresh(cls.restaurant_user)
        cls.db.refresh(cls.spa_user)

        cls.restaurant_token = create_access_token(
            data={
                "sub": str(cls.restaurant_user.id),
                "email": cls.restaurant_user.email,
                "role": "MANAGER",
                "business_context": "RESTAURANT",
            }
        )
        cls.spa_token = create_access_token(
            data={
                "sub": str(cls.spa_user.id),
                "email": cls.spa_user.email,
                "role": "MANAGER",
                "business_context": "SPA",
            }
        )

        cls.restaurant_headers = {"Authorization": f"Bearer {cls.restaurant_token}"}
        cls.spa_headers = {"Authorization": f"Bearer {cls.spa_token}"}

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()
        if TEST_DB_PATH.exists():
            try:
                TEST_DB_PATH.unlink()
            except Exception:
                pass

    def setUp(self):
        self.created_payment_ids = []
        self.created_invoice_ids = []
        self.created_booking_ids = []
        self.created_customer_ids = []
        self.created_staff_ids = []
        self.created_service_ids = []
        self.created_category_ids = []

    def tearDown(self):
        with TestingSessionLocal() as db:
            if self.created_payment_ids:
                db.query(SpaPayment).filter(SpaPayment.id.in_(self.created_payment_ids)).delete(synchronize_session=False)
            if self.created_invoice_ids:
                db.query(SpaInvoiceItem).filter(SpaInvoiceItem.invoice_id.in_(self.created_invoice_ids)).delete(synchronize_session=False)
                db.query(SpaInvoice).filter(SpaInvoice.id.in_(self.created_invoice_ids)).delete(synchronize_session=False)
            if self.created_booking_ids:
                db.query(SpaBookingStatusHistory).filter(SpaBookingStatusHistory.booking_id.in_(self.created_booking_ids)).delete(synchronize_session=False)
                db.query(SpaBookingService).filter(SpaBookingService.booking_id.in_(self.created_booking_ids)).delete(synchronize_session=False)
                db.query(SpaBooking).filter(SpaBooking.id.in_(self.created_booking_ids)).delete(synchronize_session=False)
            if self.created_customer_ids:
                db.query(SpaCustomer).filter(SpaCustomer.id.in_(self.created_customer_ids)).delete(synchronize_session=False)
            if self.created_staff_ids:
                db.query(SpaStaffAvailability).filter(SpaStaffAvailability.staff_id.in_(self.created_staff_ids)).delete(synchronize_session=False)
                db.query(SpaStaff).filter(SpaStaff.id.in_(self.created_staff_ids)).delete(synchronize_session=False)
            if self.created_service_ids:
                db.query(SpaService).filter(SpaService.id.in_(self.created_service_ids)).delete(synchronize_session=False)
            if self.created_category_ids:
                db.query(SpaServiceCategory).filter(SpaServiceCategory.id.in_(self.created_category_ids)).delete(synchronize_session=False)
            db.commit()

    # ==========================================
    # 1. SHARED AUTH & ISOLATION TESTS
    # ==========================================

    def test_shared_login_and_business_context_return(self):
        """Verify login returns business_context for both Restaurant and Spa users."""
        res_resp = self.client.post("/api/auth/login", json={
            "email": self.restaurant_user.email,
            "password": "Test@123",
        })
        self.assertEqual(res_resp.status_code, 200)
        self.assertEqual(res_resp.json()["business_context"], "RESTAURANT")

        spa_resp = self.client.post("/api/auth/login", json={
            "email": self.spa_user.email,
            "password": "Test@123",
        })
        self.assertEqual(spa_resp.status_code, 200)
        self.assertEqual(spa_resp.json()["business_context"], "SPA")

    def test_cross_business_authorization_enforcement(self):
        """Verify Restaurant users cannot call Spa endpoints and Spa users cannot call Restaurant endpoints."""
        # Restaurant user calls Spa endpoint -> 403 Forbidden
        spa_res = self.client.get("/api/spa/dashboard/summary", headers=self.restaurant_headers)
        self.assertEqual(spa_res.status_code, 403)
        self.assertIn("Spa account required", spa_res.json()["detail"])

        # Spa user calls Restaurant endpoints -> 403 Forbidden
        rest_orders = self.client.get("/api/orders", headers=self.spa_headers)
        self.assertEqual(rest_orders.status_code, 403)
        self.assertIn("Restaurant account required", rest_orders.json()["detail"])

        rest_tables = self.client.get("/api/tables", headers=self.spa_headers)
        self.assertEqual(rest_tables.status_code, 403)
        self.assertIn("Restaurant account required", rest_tables.json()["detail"])

    # ==========================================
    # 2. SERVICES & CATEGORIES CRUD
    # ==========================================

    def test_service_category_and_service_lifecycle(self):
        """Verify Category & Service creation, price/duration validation, and deactivation."""
        # Create category
        cat_res = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": "Ayurvedic Massage Therapy",
            "description": "Ancient wellness therapies",
            "is_active": True,
        })
        self.assertEqual(cat_res.status_code, 201)
        cat_id = cat_res.json()["id"]
        self.created_category_ids.append(cat_id)

        # Negative price rejected
        inv_price = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat_id,
            "name": "Abhyanga Body Massage",
            "price": -50.0,
            "duration_minutes": 60,
        })
        self.assertEqual(inv_price.status_code, 422)

        # Zero duration rejected
        inv_dur = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat_id,
            "name": "Abhyanga Body Massage",
            "price": 1800.0,
            "duration_minutes": 0,
        })
        self.assertEqual(inv_dur.status_code, 422)

        # Valid service
        svc_res = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat_id,
            "name": "Abhyanga Body Massage",
            "description": "Full-body warm herbal oil massage",
            "price": 1800.0,
            "duration_minutes": 60,
            "is_available": True,
        })
        self.assertEqual(svc_res.status_code, 201)
        svc_id = svc_res.json()["id"]
        self.created_service_ids.append(svc_id)

        # Deactivate
        del_res = self.client.delete(f"/api/spa/services/{svc_id}", headers=self.spa_headers)
        self.assertEqual(del_res.status_code, 200)

        get_res = self.client.get(f"/api/spa/services/{svc_id}", headers=self.spa_headers)
        self.assertFalse(get_res.json()["is_available"])

    # ==========================================
    # 3. CUSTOMER MANAGEMENT
    # ==========================================

    def test_customer_creation_search_and_duplicate(self):
        """Verify Spa Customer creation, search, and duplicate phone handling."""
        cust_res = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Meera Nambiar",
            "phone": "9876543210",
            "email": "meera.nambiar@example.com",
            "notes": "Prefers lavender essential oils",
        })
        self.assertEqual(cust_res.status_code, 201)
        cust_id = cust_res.json()["id"]
        self.created_customer_ids.append(cust_id)

        # Duplicate phone rejected with 409
        dup_res = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Meera Clone",
            "phone": "9876543210",
        })
        self.assertEqual(dup_res.status_code, 409)

        # Search customer
        search_res = self.client.get("/api/spa/customers?search=Meera", headers=self.spa_headers)
        self.assertEqual(search_res.status_code, 200)
        self.assertTrue(any(c["id"] == cust_id for c in search_res.json()))

    # ==========================================
    # 4. STAFF, THERAPIST & SCHEDULING CONFLICTS
    # ==========================================

    def test_therapist_scheduling_conflict_and_reschedule(self):
        """Verify therapist overlap prevention, duration calculation, and rescheduling validation."""
        # 1. Create Category and Service
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": "Deep Tissue Therapy",
            "is_active": True,
        }).json()
        self.created_category_ids.append(cat["id"])

        svc = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": "Swedish Deep Tissue",
            "price": 2000.0,
            "duration_minutes": 60,
            "is_available": True,
        }).json()
        self.created_service_ids.append(svc["id"])

        # 2. Create Therapist
        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": "TH-TEST-001",
            "full_name": "Kavita Rao",
            "designation": "Senior Massage Specialist",
            "phone": "9123456789",
            "email": "kavita.rao@spa.com",
            "is_therapist": True,
            "is_active": True,
        }).json()
        self.created_staff_ids.append(therapist["id"])

        # 3. Create Non-Therapist Staff
        attendant = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": "ST-TEST-002",
            "full_name": "Sunil Kumar",
            "designation": "Spa Receptionist / Attendant",
            "phone": "9123456780",
            "is_therapist": False,
            "is_active": True,
        }).json()
        self.created_staff_ids.append(attendant["id"])

        # Configure weekly availability for therapist (Mon-Sun 09:00-18:00)
        avail_res = self.client.put(f"/api/spa/staff/{therapist['id']}/availability", headers=self.spa_headers, json=[
            {"day_of_week": i, "start_time": "09:00", "end_time": "18:00", "is_available": True}
            for i in range(7)
        ])
        self.assertEqual(avail_res.status_code, 200)
        self.assertEqual(len(avail_res.json()), 7)

        # Verify staff list loads with availability records without Pydantic time serialization errors
        staff_list_res = self.client.get("/api/spa/staff", headers=self.spa_headers)
        self.assertEqual(staff_list_res.status_code, 200)
        staff_data = staff_list_res.json()
        self.assertTrue(len(staff_data) >= 2)
        therapist_found = next(s for s in staff_data if s["id"] == therapist["id"])
        self.assertEqual(len(therapist_found["availabilities"]), 7)
        self.assertEqual(therapist_found["availabilities"][0]["start_time"], "09:00")
        self.assertEqual(therapist_found["availabilities"][0]["end_time"], "18:00")

        # 4. Create Customer
        cust = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Ravi Shastri",
            "phone": "9988776655",
        }).json()
        self.created_customer_ids.append(cust["id"])

        test_date = (date.today() + timedelta(days=2)).isoformat()

        # Non-therapist assigned to booking -> 400 Bad Request
        bad_assign = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": attendant["id"],
            "booking_date": test_date,
            "start_time": "10:00",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(bad_assign.status_code, 400)
        self.assertIn("non-therapist", bad_assign.json()["detail"])

        # 5. Create valid booking 1 (10:00 - 11:00)
        bkg1 = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": test_date,
            "start_time": "10:00",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(bkg1.status_code, 201)
        bkg1_data = bkg1.json()
        self.created_booking_ids.append(bkg1_data["id"])
        self.assertEqual(bkg1_data["start_time"], "10:00")
        self.assertEqual(bkg1_data["end_time"], "11:00")
        self.assertEqual(Decimal(str(bkg1_data["estimated_total"])), Decimal("2000.00"))

        # 6. Attempt overlapping booking for same therapist (10:30 - 11:30) -> 409 Conflict
        overlap_res = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": test_date,
            "start_time": "10:30",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(overlap_res.status_code, 409)
        self.assertIn("Scheduling conflict", overlap_res.json()["detail"])

        # 7. Attempt booking during therapist mandatory break (11:00 - 12:00) -> 409 Conflict
        break_conflict = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": test_date,
            "start_time": "11:00",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(break_conflict.status_code, 409)
        self.assertIn("Scheduling conflict", break_conflict.json()["detail"])

        # 8. Valid booking immediately after 15-minute break concludes (11:15 - 12:15) -> 201 Created
        bkg2 = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": test_date,
            "start_time": "11:15",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(bkg2.status_code, 201)
        self.created_booking_ids.append(bkg2.json()["id"])
        self.assertEqual(bkg2.json()["start_time"], "11:15")
        self.assertEqual(bkg2.json()["end_time"], "12:15")

        # 9. Attempt to reschedule Booking 2 into Booking 1's slot or break (10:15 or 11:00) -> 409 Conflict
        resched_conflict = self.client.post(f"/api/spa/bookings/{bkg2.json()['id']}/reschedule", headers=self.spa_headers, json={
            "booking_date": test_date,
            "start_time": "10:15",
        })
        self.assertEqual(resched_conflict.status_code, 409)

    # ==========================================
    # 5. BOOKING STATUS WORKFLOW, INVOICE & PAYMENT
    # ==========================================

    def test_booking_workflow_invoice_and_payment_settlement(self):
        """End-to-end test of status transitions, invoice generation, PDF creation, and multi-step payment settlement."""
        # 1. Setup entities
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": "Luxury Body Scrubs",
        }).json()
        self.created_category_ids.append(cat["id"])

        svc = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": "Himalayan Salt Glow",
            "price": 2000.0,
            "duration_minutes": 45,
            "is_available": True,
        }).json()
        self.created_service_ids.append(svc["id"])

        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": "TH-PAY-003",
            "full_name": "Ananya Sen",
            "designation": "Master Therapist",
            "phone": "9887766554",
            "is_therapist": True,
            "is_active": True,
        }).json()
        self.created_staff_ids.append(therapist["id"])

        cust = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Deepak Chopra",
            "phone": "9776655443",
            "email": "deepak.chopra@example.com",
        }).json()
        self.created_customer_ids.append(cust["id"])

        # 2. Create Booking
        mock_now = datetime.combine(date.today(), time(9, 0), tzinfo=ZoneInfo("Asia/Kolkata"))
        with patch("app.services.spa_service.get_kolkata_now", return_value=mock_now):
            bkg_res = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
                "customer_id": cust["id"],
                "staff_id": therapist["id"],
                "booking_date": date.today().isoformat(),
                "start_time": "14:00",
                "service_items": [{"service_id": svc["id"], "quantity": 1}],
            })
        self.assertEqual(bkg_res.status_code, 201)
        bkg = bkg_res.json()
        bkg_id = bkg["id"]
        self.created_booking_ids.append(bkg_id)
        self.assertEqual(bkg["status"], "Booked")

        # 3. Attempt invoice on non-completed booking -> 400 Bad Request
        early_inv = self.client.post("/api/spa/invoices", headers=self.spa_headers, json={
            "booking_id": bkg_id,
        })
        self.assertEqual(early_inv.status_code, 400)
        self.assertIn("Completed bookings", early_inv.json()["detail"])

        # 4. Progress through approved three-stage workflow: Booked -> In Progress -> Completed
        # Invalid direct jump: Booked -> Completed must fail with 400 Bad Request
        inv_jump = self.client.patch(f"/api/spa/bookings/{bkg_id}/status", headers=self.spa_headers, json={"status": "Completed"})
        self.assertEqual(inv_jump.status_code, 400)

        # Stage 1 -> 2: Booked -> In Progress (Check-in / Start Therapy)
        c1 = self.client.patch(f"/api/spa/bookings/{bkg_id}/status", headers=self.spa_headers, json={"status": "In Progress"}).json()
        self.assertEqual(c1["status"], "In Progress")

        # Backward transition: In Progress -> Booked must fail with 400 Bad Request
        inv_back = self.client.patch(f"/api/spa/bookings/{bkg_id}/status", headers=self.spa_headers, json={"status": "Booked"})
        self.assertEqual(inv_back.status_code, 400)

        # Stage 2 -> 3: In Progress -> Completed (Complete Session)
        before_session_end = datetime.combine(date.today(), time(14, 30), tzinfo=ZoneInfo("Asia/Kolkata"))
        with patch("app.services.spa_service.get_kolkata_now", return_value=before_session_end):
            too_early = self.client.patch(f"/api/spa/bookings/{bkg_id}/status", headers=self.spa_headers, json={"status": "Completed"})
        self.assertEqual(too_early.status_code, 400)
        with patch("app.services.spa_service.get_kolkata_now", return_value=datetime.combine(date.today(), time(14, 45), tzinfo=ZoneInfo("Asia/Kolkata"))):
            c2 = self.client.patch(f"/api/spa/bookings/{bkg_id}/status", headers=self.spa_headers, json={"status": "Completed"}).json()
        self.assertEqual(c2["status"], "Completed")

        # Terminal state: Completed -> In Progress or Booked must fail with 400 Bad Request
        inv_term = self.client.patch(f"/api/spa/bookings/{bkg_id}/status", headers=self.spa_headers, json={"status": "In Progress"})
        self.assertEqual(inv_term.status_code, 400)

        # Verify Historical Snapshot Preservation: update service price to 3500.0
        self.client.put(f"/api/spa/services/{svc['id']}", headers=self.spa_headers, json={
            "price": 3500.0,
            "name": "Updated Salt Glow",
        })
        # Existing booking must preserve original price and name
        bkg_preservation = self.client.get(f"/api/spa/bookings/{bkg_id}", headers=self.spa_headers).json()
        self.assertEqual(Decimal(str(bkg_preservation["booking_services"][0]["unit_price"])), Decimal("2000.00"))
        self.assertEqual(bkg_preservation["booking_services"][0]["service_name"], "Himalayan Salt Glow")

        # 5. Generate Invoice using business-configured default tax rate (omitting tax_rate in payload)
        # Subtotal: 2000.00, Default Tax (18%): 360.00, Total: 2360.00
        inv_res = self.client.post("/api/spa/invoices", headers=self.spa_headers, json={
            "booking_id": bkg_id,
        })
        self.assertEqual(inv_res.status_code, 201)
        inv = inv_res.json()
        inv_id = inv["id"]
        self.created_invoice_ids.append(inv_id)

        self.assertEqual(Decimal(str(inv["subtotal"])), Decimal("2000.00"))
        self.assertEqual(Decimal(str(inv["tax_amount"])), Decimal("360.00"))
        self.assertEqual(Decimal(str(inv["total_amount"])), Decimal("2360.00"))
        self.assertEqual(Decimal(str(inv["paid_amount"])), Decimal("0.00"))
        self.assertEqual(Decimal(str(inv["balance_due"])), Decimal("2360.00"))
        self.assertEqual(inv["payment_status"], "Pending")

        # Verify duplicate invoice prevention
        dup_inv = self.client.post("/api/spa/invoices", headers=self.spa_headers, json={
            "booking_id": bkg_id,
        })
        self.assertEqual(dup_inv.status_code, 400)

        # 6. Verify PDF Download
        pdf_res = self.client.get(f"/api/spa/invoices/{inv_id}/download", headers=self.spa_headers)
        self.assertEqual(pdf_res.status_code, 200)
        self.assertEqual(pdf_res.headers["content-type"], "application/pdf")
        self.assertGreater(len(pdf_res.content), 1000)

        # 7. Record Partial Payment (₹1,000 via UPI)
        p1_res = self.client.post(f"/api/spa/payments/{inv_id}", headers=self.spa_headers, json={
            "payment_method": "UPI",
            "amount": 1000.0,
            "transaction_reference": "UPI-TXN-12345",
        })
        self.assertEqual(p1_res.status_code, 201)
        p1 = p1_res.json()
        self.created_payment_ids.append(p1["id"])

        inv_after_p1 = self.client.get(f"/api/spa/invoices/{inv_id}", headers=self.spa_headers).json()
        self.assertEqual(Decimal(str(inv_after_p1["paid_amount"])), Decimal("1000.00"))
        self.assertEqual(Decimal(str(inv_after_p1["balance_due"])), Decimal("1360.00"))
        self.assertEqual(inv_after_p1["payment_status"], "Partially Paid")

        # 8. Attempt Overpayment (trying to pay ₹1,500 when balance is ₹1,360) -> 400 Bad Request
        overpay_res = self.client.post(f"/api/spa/payments/{inv_id}", headers=self.spa_headers, json={
            "payment_method": "Cash",
            "amount": 1500.0,
        })
        self.assertEqual(overpay_res.status_code, 400)
        self.assertIn("exceeds the remaining balance", overpay_res.json()["detail"])

        # 9. Settle Remaining Balance (₹1,360 via Cash)
        p2_res = self.client.post(f"/api/spa/payments/{inv_id}", headers=self.spa_headers, json={
            "payment_method": "Cash",
            "amount": 1360.0,
        })
        self.assertEqual(p2_res.status_code, 201)
        p2 = p2_res.json()
        self.created_payment_ids.append(p2["id"])

        inv_settled = self.client.get(f"/api/spa/invoices/{inv_id}", headers=self.spa_headers).json()
        self.assertEqual(Decimal(str(inv_settled["paid_amount"])), Decimal("2360.00"))
        self.assertEqual(Decimal(str(inv_settled["balance_due"])), Decimal("0.00"))
        self.assertEqual(inv_settled["payment_status"], "Paid")

        # Booking remains Completed
        bkg_final = self.client.get(f"/api/spa/bookings/{bkg_id}", headers=self.spa_headers).json()
        self.assertEqual(bkg_final["status"], "Completed")

        # 10. Verify Dashboard Summary metrics reflect the data
        summary = self.client.get("/api/spa/dashboard/summary", headers=self.spa_headers).json()
        self.assertGreaterEqual(summary["completed_appointments_today"], 1)
        self.assertGreaterEqual(Decimal(str(summary["today_revenue"])), Decimal("2360.00"))

    # ==========================================
    # 6. DYNAMIC TIME SLOTS & CONCURRENCY TESTS
    # ==========================================

    def test_dynamic_available_slots_generation(self):
        """Test slot generation within 10:00-18:00 with 15-min intervals and multi-service duration."""
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": f"Cat-Slots-{datetime.now().strftime('%f')}",
        }).json()
        self.created_category_ids.append(cat["id"])

        # Create therapist
        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": f"TH-SLOT-{datetime.now().strftime('%f')}",
            "full_name": "Aanya Verma",
            "designation": "Senior Therapist",
            "phone": "9811223344",
            "is_therapist": True,
            "availabilities": [
                {"day_of_week": i, "start_time": "10:00", "end_time": "18:00", "is_available": True}
                for i in range(7)
            ],
        }).json()
        self.created_staff_ids.append(therapist["id"])

        # Create service (60 minutes)
        svc = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": f"Deep Tissue 60m {datetime.now().strftime('%f')}",
            "price": 2500.0,
            "duration_minutes": 60,
        }).json()
        self.created_service_ids.append(svc["id"])

        # Query slots for future date (tomorrow)
        future_date = (date.today() + timedelta(days=2)).isoformat()
        res = self.client.get(
            f"/api/spa/bookings/available-slots?staff_id={therapist['id']}&booking_date={future_date}&service_ids={svc['id']}",
            headers=self.spa_headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_duration_minutes"], 60)
        slots = data["slots"]
        self.assertGreater(len(slots), 0)

        # First slot starts at 10:00, ends at 11:00 (Buffer until 11:15)
        self.assertEqual(slots[0]["start_time"], "10:00")
        self.assertEqual(slots[0]["end_time"], "11:00")

        # Second fixed slot starts after 15 min break buffer: 11:15 - 12:15
        self.assertEqual(slots[1]["start_time"], "11:15")
        self.assertEqual(slots[1]["end_time"], "12:15")

        # Exactly 6 fixed non-overlapping slots between 10:00 and 18:00
        self.assertEqual(len(slots), 6)
        # Last slot starts at 16:15, ends at 17:15 (Buffer until 17:30 <= 18:00)
        self.assertEqual(slots[-1]["start_time"], "16:15")
        self.assertEqual(slots[-1]["end_time"], "17:15")

    def test_slots_past_time_exclusion_for_today(self):
        """Past slots on current date must be excluded."""
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": f"Cat-Today-{datetime.now().strftime('%f')}",
        }).json()
        self.created_category_ids.append(cat["id"])

        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": f"TH-TODAY-{datetime.now().strftime('%f')}",
            "full_name": "Rohan Mehra",
            "designation": "Therapist",
            "phone": "9822334455",
            "is_therapist": True,
            "availabilities": [
                {"day_of_week": i, "start_time": "10:00", "end_time": "18:00", "is_available": True}
                for i in range(7)
            ],
        }).json()
        self.created_staff_ids.append(therapist["id"])

        svc = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": f"Swedish 30m {datetime.now().strftime('%f')}",
            "price": 1800.0,
            "duration_minutes": 30,
        }).json()
        self.created_service_ids.append(svc["id"])

        # Mock current time at 14:15 today
        today = date.today()
        mock_now = datetime.combine(today, time(14, 15), tzinfo=ZoneInfo("Asia/Kolkata"))
        with patch("app.services.spa_service.get_kolkata_now", return_value=mock_now):
            res = self.client.get(
                f"/api/spa/bookings/available-slots?staff_id={therapist['id']}&booking_date={today.isoformat()}&service_ids={svc['id']}",
                headers=self.spa_headers,
            )
            self.assertEqual(res.status_code, 200)
            slots = res.json()["slots"]
            # No slot with start_time <= 14:15 should exist
            for s in slots:
                st_time = time.fromisoformat(s["start_time"])
                self.assertGreater(st_time, time(14, 15))
            # First available slot after 14:15 is fixed slot 5 at 15:00
            self.assertEqual(slots[0]["start_time"], "15:00")

    def test_slots_active_booking_overlap_exclusion_and_reschedule(self):
        """Active bookings must exclude overlapping candidate slots; exclude_booking_id restores them."""
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": f"Cat-Over-{datetime.now().strftime('%f')}",
        }).json()
        self.created_category_ids.append(cat["id"])

        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": f"TH-OVER-{datetime.now().strftime('%f')}",
            "full_name": "Kavita Rao",
            "designation": "Lead Therapist",
            "phone": "9833445566",
            "is_therapist": True,
            "availabilities": [
                {"day_of_week": i, "start_time": "10:00", "end_time": "18:00", "is_available": True}
                for i in range(7)
            ],
        }).json()
        self.created_staff_ids.append(therapist["id"])

        cust = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Maya Sen",
            "phone": "9844556677",
        }).json()
        self.created_customer_ids.append(cust["id"])

        svc = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": f"Aroma 60m {datetime.now().strftime('%f')}",
            "price": 2200.0,
            "duration_minutes": 60,
        }).json()
        self.created_service_ids.append(svc["id"])

        future_date = (date.today() + timedelta(days=3)).isoformat()

        # Create booking for 11:15 - 12:15
        bkg = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": future_date,
            "start_time": "11:15",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        }).json()
        self.created_booking_ids.append(bkg["id"])

        # Query available slots without exclude_booking_id
        res1 = self.client.get(
            f"/api/spa/bookings/available-slots?staff_id={therapist['id']}&booking_date={future_date}&service_ids={svc['id']}",
            headers=self.spa_headers,
        )
        slots1 = res1.json()["slots"]
        slot_starts1 = [s["start_time"] for s in slots1]

        # 11:15 is occupied, so it must not appear in slots1:
        self.assertNotIn("11:15", slot_starts1)

        # Query slots WITH exclude_booking_id (for rescheduling this same booking)
        res2 = self.client.get(
            f"/api/spa/bookings/available-slots?staff_id={therapist['id']}&booking_date={future_date}&booking_id={bkg['id']}",
            headers=self.spa_headers,
        )
        slots2 = res2.json()["slots"]
        slot_starts2 = [s["start_time"] for s in slots2]
        self.assertIn("11:15", slot_starts2)

    def test_past_time_and_operating_hours_booking_validation(self):
        """Direct booking creation attempts in the past or outside operating hours must be rejected."""
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": f"Cat-Val-{datetime.now().strftime('%f')}",
        }).json()
        self.created_category_ids.append(cat["id"])

        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": f"TH-VAL-{datetime.now().strftime('%f')}",
            "full_name": "Arjun Das",
            "designation": "Therapist",
            "phone": "9855667788",
            "is_therapist": True,
        }).json()
        self.created_staff_ids.append(therapist["id"])

        cust = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Sunita Nair",
            "phone": "9866778899",
        }).json()
        self.created_customer_ids.append(cust["id"])

        svc = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": f"Quick 30m {datetime.now().strftime('%f')}",
            "price": 1000.0,
            "duration_minutes": 30,
        }).json()
        self.created_service_ids.append(svc["id"])

        # Past date -> 400 Bad Request
        past_date = (date.today() - timedelta(days=1)).isoformat()
        res_past_date = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": past_date,
            "start_time": "11:00",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(res_past_date.status_code, 400)
        self.assertIn("past date", res_past_date.json()["detail"])

        # Outside operating hours (08:00 before 10:00 opening) -> 400 Bad Request
        future_date = (date.today() + timedelta(days=5)).isoformat()
        res_early = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": future_date,
            "start_time": "08:00",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(res_early.status_code, 400)
        self.assertIn("operating hours", res_early.json()["detail"])

        # Outside operating hours (17:45 for 30m service -> ends at 18:15 after 18:00 close)
        res_late = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": future_date,
            "start_time": "17:45",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(res_late.status_code, 400)
        self.assertIn("operating hours", res_late.json()["detail"])

    def test_concurrency_safe_booking_prevention(self):
        """Simulate concurrent double-booking attempts for the same therapist slot."""
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": f"Cat-Conc-{datetime.now().strftime('%f')}",
        }).json()
        self.created_category_ids.append(cat["id"])

        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": f"TH-CONC-{datetime.now().strftime('%f')}",
            "full_name": "Vikram Sethi",
            "designation": "Therapist",
            "phone": "9877889900",
            "is_therapist": True,
        }).json()
        self.created_staff_ids.append(therapist["id"])

        cust1 = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Rani Mukherjee",
            "phone": "9888990011",
        }).json()
        self.created_customer_ids.append(cust1["id"])

        cust2 = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Saif Ali",
            "phone": "9899001122",
        }).json()
        self.created_customer_ids.append(cust2["id"])

        svc = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": f"Reflexology 45m {datetime.now().strftime('%f')}",
            "price": 1500.0,
            "duration_minutes": 45,
        }).json()
        self.created_service_ids.append(svc["id"])

        future_date = (date.today() + timedelta(days=4)).isoformat()

        # First request succeeds
        res1 = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust1["id"],
            "staff_id": therapist["id"],
            "booking_date": future_date,
            "start_time": "14:00",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(res1.status_code, 201)
        self.created_booking_ids.append(res1.json()["id"])

        # Second conflicting request receives 409 Conflict
        res2 = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust2["id"],
            "staff_id": therapist["id"],
            "booking_date": future_date,
            "start_time": "14:15",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(res2.status_code, 409)
        self.assertIn("The selected time slot is no longer available. Please select another time.", res2.json()["detail"])

    def test_spa_invoice_workflow_and_partial_payment_settlement(self):
        """Test complete invoice lifecycle: Completed booking -> Invoice -> Partial Payment -> Settled -> Constraints."""
        # 1. Setup entities
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": f"Cat-Inv-{datetime.now().strftime('%f')}",
        }).json()
        self.created_category_ids.append(cat["id"])

        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": f"TH-INV-{datetime.now().strftime('%f')}",
            "full_name": "Meera Nair",
            "designation": "Therapist",
            "phone": "9911223344",
            "is_therapist": True,
        }).json()
        self.created_staff_ids.append(therapist["id"])

        cust = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Ananya Roy",
            "phone": "9922334455",
        }).json()
        self.created_customer_ids.append(cust["id"])

        svc = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": f"Aromatherapy 60m {datetime.now().strftime('%f')}",
            "price": 2000.0,
            "duration_minutes": 60,
        }).json()
        self.created_service_ids.append(svc["id"])

        future_date = (date.today() + timedelta(days=5)).isoformat()

        # 2. Book appointment
        bkg_res = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": future_date,
            "start_time": "11:00",
            "service_items": [{"service_id": svc["id"], "quantity": 1}],
        })
        self.assertEqual(bkg_res.status_code, 201)
        bkg_id = bkg_res.json()["id"]
        self.created_booking_ids.append(bkg_id)

        # 3. Cannot generate invoice while Booked
        inv_premature = self.client.post("/api/spa/invoices", headers=self.spa_headers, json={
            "booking_id": bkg_id,
            "tax_rate": 18.0,
        })
        self.assertEqual(inv_premature.status_code, 400)
        self.assertIn("Completed", inv_premature.json()["detail"])

        # 4. Advance: Booked -> In Progress -> Completed
        res_in_prog = self.client.patch(f"/api/spa/bookings/{bkg_id}/status", headers=self.spa_headers, json={
            "status": "In Progress",
            "note": "Client arrived.",
        })
        self.assertEqual(res_in_prog.status_code, 200)

        session_end = datetime.combine(date.today() + timedelta(days=5), time(12, 0), tzinfo=ZoneInfo("Asia/Kolkata"))
        with patch("app.services.spa_service.get_kolkata_now", return_value=session_end):
            res_completed = self.client.patch(f"/api/spa/bookings/{bkg_id}/status", headers=self.spa_headers, json={
                "status": "Completed",
                "note": "Treatment done.",
            })
        self.assertEqual(res_completed.status_code, 200)

        # 5. Generate Invoice
        # Subtotal = 2000.00, GST 18% = 360.00, Total = 2360.00
        inv_res = self.client.post("/api/spa/invoices", headers=self.spa_headers, json={
            "booking_id": bkg_id,
            "tax_rate": 18.0,
            "discount_amount": 0.0,
        })
        self.assertEqual(inv_res.status_code, 201)
        inv_data = inv_res.json()
        inv_id = inv_data["id"]
        self.assertEqual(float(inv_data["subtotal"]), 2000.0)
        self.assertEqual(float(inv_data["tax_amount"]), 360.0)
        self.assertEqual(float(inv_data["total_amount"]), 2360.0)
        self.assertEqual(float(inv_data["paid_amount"]), 0.0)
        self.assertEqual(float(inv_data["balance_due"]), 2360.0)
        self.assertEqual(inv_data["payment_status"], "Pending")
        self.assertEqual(len(inv_data["items"]), 1)
        self.assertEqual(inv_data["items"][0]["duration_minutes"], 60)

        # 6. Duplicate invoice generation is prevented
        inv_dup = self.client.post("/api/spa/invoices", headers=self.spa_headers, json={
            "booking_id": bkg_id,
            "tax_rate": 18.0,
        })
        self.assertEqual(inv_dup.status_code, 400)

        # 7. List invoices with date filters
        inv_list_today = self.client.get("/api/spa/invoices?preset=today", headers=self.spa_headers)
        self.assertEqual(inv_list_today.status_code, 200)
        self.assertTrue(any(i["id"] == inv_id for i in inv_list_today.json()))

        inv_list_all = self.client.get("/api/spa/invoices?preset=all", headers=self.spa_headers)
        self.assertEqual(inv_list_all.status_code, 200)
        self.assertTrue(any(i["id"] == inv_id for i in inv_list_all.json()))

        # 8. Record First Partial Payment: 1000.00 via UPI
        pay1 = self.client.post(f"/api/spa/payments/{inv_id}", headers=self.spa_headers, json={
            "payment_method": "UPI",
            "amount": 1000.0,
            "transaction_reference": "UPI-REF-001",
        })
        self.assertEqual(pay1.status_code, 201)
        pay1_data = pay1.json()
        self.assertEqual(float(pay1_data["amount"]), 1000.0)
        self.assertEqual(pay1_data["invoice_number"], inv_data["invoice_number"])
        self.assertEqual(pay1_data["booking_number"], inv_data["booking_number"])
        self.assertEqual(pay1_data["customer_name"], "Ananya Roy")

        # Verify invoice is now Partially Paid
        inv_check1 = self.client.get(f"/api/spa/invoices/{inv_id}", headers=self.spa_headers).json()
        self.assertEqual(inv_check1["payment_status"], "Partially Paid")
        self.assertEqual(float(inv_check1["paid_amount"]), 1000.0)
        self.assertEqual(float(inv_check1["balance_due"]), 1360.0)

        # 9. Validation: Cannot pay negative or more than balance due
        pay_excess = self.client.post(f"/api/spa/payments/{inv_id}", headers=self.spa_headers, json={
            "payment_method": "Card",
            "amount": 2000.0,
        })
        self.assertEqual(pay_excess.status_code, 400)
        self.assertIn("exceeds", pay_excess.json()["detail"].lower())

        # 10. Record Second Payment: Settle remaining 1360.00 via Cash
        pay2 = self.client.post(f"/api/spa/payments/{inv_id}", headers=self.spa_headers, json={
            "payment_method": "Cash",
            "amount": 1360.0,
        })
        self.assertEqual(pay2.status_code, 201)

        # Verify invoice is now fully Paid
        inv_check2 = self.client.get(f"/api/spa/invoices/{inv_id}", headers=self.spa_headers).json()
        self.assertEqual(inv_check2["payment_status"], "Paid")
        self.assertEqual(float(inv_check2["paid_amount"]), 2360.0)
        self.assertEqual(float(inv_check2["balance_due"]), 0.0)

        # 11. Cannot record further payments on settled invoice
        pay_after_settled = self.client.post(f"/api/spa/payments/{inv_id}", headers=self.spa_headers, json={
            "payment_method": "Cash",
            "amount": 100.0,
        })
        self.assertEqual(pay_after_settled.status_code, 400)
        self.assertIn("settled", pay_after_settled.json()["detail"].lower())

        # 12. Booking status is still Completed
        bkg_final = self.client.get(f"/api/spa/bookings/{bkg_id}", headers=self.spa_headers).json()
        self.assertEqual(bkg_final["status"], "Completed")

        # 13. List payments with date & method filters
        payments_res = self.client.get(f"/api/spa/payments?invoice_id={inv_id}&payment_method=UPI", headers=self.spa_headers)
        self.assertEqual(payments_res.status_code, 200)
        self.assertEqual(len(payments_res.json()), 1)
        self.assertEqual(payments_res.json()[0]["payment_method"], "UPI")

        # 14. PDF download verification
        pdf_res = self.client.get(f"/api/spa/invoices/{inv_id}/download", headers=self.spa_headers)
        self.assertEqual(pdf_res.status_code, 200)
        self.assertEqual(pdf_res.headers.get("content-type"), "application/pdf")

    # ==========================================
    # 6. THERAPY SCHEDULING REFINEMENT & 15-MIN BREAK BUFFER
    # ==========================================

    def test_mandatory_15_minute_buffer_break_and_12h_format(self):
        """Verify 15-min post-therapy break buffer, multi-service duration sum, and 12-hour AM/PM slot presentation."""
        # 1. Setup Category and Services
        cat = self.client.post("/api/spa/service-categories", headers=self.spa_headers, json={
            "name": f"Buffer-Test-Cat-{datetime.now().strftime('%f')}",
        }).json()
        self.created_category_ids.append(cat["id"])

        svc30 = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": f"Express 30m {datetime.now().strftime('%f')}",
            "price": 1000.0,
            "duration_minutes": 30,
        }).json()
        self.created_service_ids.append(svc30["id"])

        svc60 = self.client.post("/api/spa/services", headers=self.spa_headers, json={
            "category_id": cat["id"],
            "name": f"Swedish 60m {datetime.now().strftime('%f')}",
            "price": 2000.0,
            "duration_minutes": 60,
        }).json()
        self.created_service_ids.append(svc60["id"])

        # 2. Therapist with operating hours 10:00 - 18:00
        therapist = self.client.post("/api/spa/staff", headers=self.spa_headers, json={
            "employee_code": f"TH-BUF-{datetime.now().strftime('%f')}",
            "full_name": "Ananya Sharma",
            "designation": "Master Therapist",
            "phone": "9811223344",
            "is_therapist": True,
            "availabilities": [
                {"day_of_week": i, "start_time": "10:00", "end_time": "18:00", "is_available": True}
                for i in range(7)
            ],
        }).json()
        self.created_staff_ids.append(therapist["id"])

        cust = self.client.post("/api/spa/customers", headers=self.spa_headers, json={
            "full_name": "Deepak Mehta",
            "phone": "9876543210",
        }).json()
        self.created_customer_ids.append(cust["id"])

        booking_date = (date.today() + timedelta(days=4)).isoformat()

        # 3. Create 30-min booking: 10:00 to 10:30
        bkg1 = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": booking_date,
            "start_time": "10:00",
            "service_items": [{"service_id": svc30["id"], "quantity": 1}],
        })
        self.assertEqual(bkg1.status_code, 201)
        self.created_booking_ids.append(bkg1.json()["id"])
        self.assertEqual(bkg1.json()["start_time"], "10:00")
        self.assertEqual(bkg1.json()["end_time"], "10:30")

        # 4. Attempt booking at 10:30 (during mandatory 15-min break 10:30-10:45) -> 409 Conflict
        conflict_break = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": booking_date,
            "start_time": "10:30",
            "service_items": [{"service_id": svc30["id"], "quantity": 1}],
        })
        self.assertEqual(conflict_break.status_code, 409)

        # 5. Booking at 10:45 (immediately when break ends) -> 201 Created
        bkg2 = self.client.post("/api/spa/bookings", headers=self.spa_headers, json={
            "customer_id": cust["id"],
            "staff_id": therapist["id"],
            "booking_date": booking_date,
            "start_time": "10:45",
            "service_items": [{"service_id": svc60["id"], "quantity": 1}],
        })
        self.assertEqual(bkg2.status_code, 201)
        self.created_booking_ids.append(bkg2.json()["id"])
        self.assertEqual(bkg2.json()["start_time"], "10:45")
        self.assertEqual(bkg2.json()["end_time"], "11:45")
        # bkg2 therapy ends at 11:45. Mandatory break is 11:45 - 12:00.

        # 6. Verify Available Slots generation
        # Query available slots for a 60-min service
        slots_res = self.client.get(
            f"/api/spa/bookings/available-slots?staff_id={therapist['id']}&booking_date={booking_date}&service_ids={svc60['id']}",
            headers=self.spa_headers,
        )
        self.assertEqual(slots_res.status_code, 200)
        data = slots_res.json()
        self.assertEqual(data["buffer_minutes"], 15)
        self.assertEqual(data["total_duration_minutes"], 60)

        slots = data["slots"]
        slot_starts = [s["start_time"] for s in slots]

        # 10:00 (bkg1), 11:15 (bkg2) must be excluded
        for invalid in ["10:00", "11:15"]:
            self.assertNotIn(invalid, slot_starts)

        # Earliest available fixed start time after bkg2 break (11:45 - 12:00) is 12:30!
        self.assertIn("12:30", slot_starts)
        slot_12 = next(s for s in slots if s["start_time"] == "12:30")
        self.assertEqual(slot_12["end_time"], "13:30")
        self.assertEqual(slot_12["buffer_end_time"], "13:45")
        self.assertEqual(slot_12["display_text"], "12:30 PM - 01:30 PM")

        # 7. Multi-Service Duration Summing (30m + 60m = 90m)
        multi_slots_res = self.client.get(
            f"/api/spa/bookings/available-slots?staff_id={therapist['id']}&booking_date={booking_date}&service_ids={svc30['id']},{svc60['id']}",
            headers=self.spa_headers,
        )
        self.assertEqual(multi_slots_res.status_code, 200)
        multi_data = multi_slots_res.json()
        self.assertEqual(multi_data["total_duration_minutes"], 90)
        multi_slot_12 = next(s for s in multi_data["slots"] if s["start_time"] == "12:30")
        self.assertEqual(multi_slot_12["end_time"], "14:00")
        self.assertEqual(multi_slot_12["buffer_end_time"], "14:15")
        self.assertEqual(multi_slot_12["display_text"], "12:30 PM - 02:00 PM")

        # 8. Check-Conflict endpoint verification
        check_res = self.client.get(
            f"/api/spa/bookings/check-conflict?staff_id={therapist['id']}&booking_date={booking_date}&start_time=12:30&duration_minutes=60",
            headers=self.spa_headers,
        )
        self.assertEqual(check_res.status_code, 200)
        chk = check_res.json()
        self.assertTrue(chk["available"])
        self.assertEqual(chk["display_text"], "12:30 PM - 01:30 PM")

        # Check conflict during break (11:45)
        check_conflict_res = self.client.get(
            f"/api/spa/bookings/check-conflict?staff_id={therapist['id']}&booking_date={booking_date}&start_time=11:45&duration_minutes=30",
            headers=self.spa_headers,
        )
        self.assertEqual(check_conflict_res.status_code, 200)
        self.assertFalse(check_conflict_res.json()["available"])


if __name__ == "__main__":
    unittest.main()
