from __future__ import annotations

import sys
import unittest
from datetime import date, time, timedelta
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.entities import (
    Customer,
    MenuCategory,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    RestaurantTable,
    TableStatus,
    User,
    UserRole,
)
from app.models.spa import (
    SpaBooking,
    SpaBookingService,
    SpaBookingStatus,
    SpaCustomer,
    SpaInvoice,
    SpaInvoiceItem,
    SpaService,
    SpaServiceCategory,
    SpaStaff,
    SpaStaffAvailability,
)

TEST_DB_URL = "sqlite:///:memory:"


class TestPrompt2CrudIntegrity(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            TEST_DB_URL,
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
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)

    def setUp(self):
        self.db: Session = self.TestingSessionLocal()

        # 1. Restaurant Manager
        self.rest_mgr = User(
            full_name="Restaurant Manager",
            email="rest_manager@dineflow.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.MANAGER,
            business_context="RESTAURANT",
            is_active=True,
        )
        self.db.add(self.rest_mgr)

        # 2. Spa Manager
        self.spa_mgr = User(
            full_name="Spa Manager",
            email="spa_manager@dineflow.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.MANAGER,
            business_context="SPA",
            is_active=True,
        )
        self.db.add(self.spa_mgr)

        # 3. Staff User (Non-manager)
        self.staff_user = User(
            full_name="Floor Staff",
            email="staff_user@dineflow.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.STAFF,
            business_context="RESTAURANT",
            is_active=True,
        )
        self.db.add(self.staff_user)

        self.db.commit()
        self.db.refresh(self.rest_mgr)
        self.db.refresh(self.spa_mgr)
        self.db.refresh(self.staff_user)

        self.rest_token = create_access_token(data={"sub": str(self.rest_mgr.id)})
        self.spa_token = create_access_token(data={"sub": str(self.spa_mgr.id)})
        self.staff_token = create_access_token(data={"sub": str(self.staff_user.id)})

        self.rest_headers = {"Authorization": f"Bearer {self.rest_token}"}
        self.spa_headers = {"Authorization": f"Bearer {self.spa_token}"}
        self.staff_headers = {"Authorization": f"Bearer {self.staff_token}"}

    def tearDown(self):
        self.db.close()
        # Clean database tables for isolation between tests
        with self.engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(table.delete())

    # =========================================================================
    # 1. CONTEXT ISOLATION & ACCESS CONTROL
    # =========================================================================

    def test_restaurant_token_denied_on_spa_endpoint(self):
        """Restaurant manager token cannot access Spa APIs (403 Forbidden)."""
        response = self.client.get("/api/spa/customers", headers=self.rest_headers)
        self.assertEqual(response.status_code, 403)
        self.assertIn("Spa account required", response.json()["detail"])

    def test_spa_token_denied_on_restaurant_endpoint(self):
        """Spa manager token cannot access Restaurant APIs (403 Forbidden)."""
        response = self.client.get("/api/orders/", headers=self.spa_headers)
        self.assertEqual(response.status_code, 403)
        self.assertIn("Restaurant account required", response.json()["detail"])

    def test_staff_role_denied_on_protected_endpoints(self):
        """Staff user without Manager privileges cannot access protected endpoints."""
        res1 = self.client.get("/api/orders/", headers=self.staff_headers)
        self.assertEqual(res1.status_code, 403)

        res2 = self.client.get("/api/spa/customers", headers=self.staff_headers)
        self.assertEqual(res2.status_code, 403)

    # =========================================================================
    # 2. SPA CUSTOMER DELETION & INTEGRITY
    # =========================================================================

    def test_spa_customer_delete_blocked_when_has_bookings(self):
        """Spa Customer with bookings cannot be deleted (409 Conflict)."""
        cust = SpaCustomer(
            full_name="Aarav Mehta",
            phone="9820011223",
            email="aarav@example.com",
            is_active=True,
        )
        staff = SpaStaff(
            employee_code="THR-01",
            full_name="Meera Sen",
            designation="Ayurvedic Therapist",
            phone="9820099887",
            is_therapist=True,
            is_active=True,
        )
        self.db.add_all([cust, staff])
        self.db.commit()
        self.db.refresh(cust)
        self.db.refresh(staff)

        booking = SpaBooking(
            booking_number="SPA-BKG-TEST01",
            customer_id=cust.id,
            staff_id=staff.id,
            booking_date=date.today() + timedelta(days=2),
            start_time=time(10, 0),
            end_time=time(11, 0),
            status=SpaBookingStatus.BOOKED.value,
        )
        self.db.add(booking)
        self.db.commit()

        # Attempt to delete customer
        response = self.client.delete(f"/api/spa/customers/{cust.id}", headers=self.spa_headers)
        self.assertEqual(response.status_code, 409)
        self.assertIn("existing bookings are associated", response.json()["detail"])

    def test_spa_customer_delete_success_when_clean(self):
        """Spa Customer without bookings can be deleted cleanly (200 OK)."""
        cust = SpaCustomer(
            full_name="Karan Johar",
            phone="9811122233",
            email="karan@example.com",
            is_active=True,
        )
        self.db.add(cust)
        self.db.commit()
        self.db.refresh(cust)

        cust_id = cust.id
        response = self.client.delete(f"/api/spa/customers/{cust_id}", headers=self.spa_headers)
        self.assertEqual(response.status_code, 200)

        # Confirm record deleted using a clean lookup
        self.db.expire_all()
        check = self.db.get(SpaCustomer, cust_id)
        self.assertIsNone(check)

    # =========================================================================
    # 3. SPA STAFF / THERAPIST DELETION & LIFECYCLE
    # =========================================================================

    def test_spa_staff_delete_deactivates_when_has_bookings(self):
        """Spa Staff with booking history is deactivated rather than hard-deleted."""
        cust = SpaCustomer(
            full_name="Rohit Sharma",
            phone="9822233344",
            email="rohit@example.com",
            is_active=True,
        )
        staff = SpaStaff(
            employee_code="THR-02",
            full_name="Sunil Joshi",
            designation="Senior Therapist",
            phone="9833344455",
            is_therapist=True,
            is_active=True,
        )
        self.db.add_all([cust, staff])
        self.db.commit()
        self.db.refresh(cust)
        self.db.refresh(staff)

        booking = SpaBooking(
            booking_number="SPA-BKG-TEST02",
            customer_id=cust.id,
            staff_id=staff.id,
            booking_date=date.today() + timedelta(days=3),
            start_time=time(14, 0),
            end_time=time(15, 0),
            status=SpaBookingStatus.COMPLETED.value,
        )
        self.db.add(booking)
        self.db.commit()

        response = self.client.delete(f"/api/spa/staff/{staff.id}", headers=self.spa_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["deactivated"])
        self.assertIn("deactivated to preserve historical records", data["message"])

        # Check DB: staff still exists but is inactive
        self.db.expire_all()
        refreshed_staff = self.db.get(SpaStaff, staff.id)
        self.assertIsNotNone(refreshed_staff)
        self.assertFalse(refreshed_staff.is_active)

    def test_spa_staff_delete_hard_delete_when_clean(self):
        """Spa Staff without bookings is hard-deleted and availability is cascaded."""
        staff = SpaStaff(
            employee_code="THR-03",
            full_name="Rani Mukherjee",
            designation="Junior Therapist",
            phone="9844455566",
            is_therapist=True,
            is_active=True,
        )
        self.db.add(staff)
        self.db.commit()
        self.db.refresh(staff)

        avail = SpaStaffAvailability(
            staff_id=staff.id,
            day_of_week=1,
            start_time=time(9, 0),
            end_time=time(18, 0),
            is_available=True,
        )
        self.db.add(avail)
        self.db.commit()

        staff_id = staff.id
        avail_id = avail.id
        response = self.client.delete(f"/api/spa/staff/{staff_id}", headers=self.spa_headers)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["deactivated"])

        # Confirm staff and availability deleted
        self.db.expire_all()
        self.assertIsNone(self.db.get(SpaStaff, staff_id))
        self.assertIsNone(self.db.get(SpaStaffAvailability, avail_id))

    # =========================================================================
    # 4. SPA SCHEDULING CONFLICT & 15-MINUTE RECOVERY BUFFER
    # =========================================================================

    def test_spa_scheduling_conflict_with_15min_buffer(self):
        """Booking overlapping an existing booking or its 15-min reset buffer is rejected (409 Conflict)."""
        cat = SpaServiceCategory(name="Massage Therapy", is_active=True)
        self.db.add(cat)
        self.db.flush()

        srv = SpaService(
            category_id=cat.id,
            name="Deep Tissue Massage",
            price=Decimal("2000.00"),
            duration_minutes=60,
            is_available=True,
        )
        cust = SpaCustomer(
            full_name="Ananya Roy",
            phone="9855566677",
            email="ananya@example.com",
            is_active=True,
        )
        staff = SpaStaff(
            employee_code="THR-04",
            full_name="Pooja Batra",
            designation="Massage Specialist",
            phone="9866677788",
            is_therapist=True,
            is_active=True,
        )
        self.db.add_all([srv, cust, staff])
        self.db.commit()
        self.db.refresh(srv)
        self.db.refresh(cust)
        self.db.refresh(staff)

        # Set staff working availability 09:00 - 18:00 on Wednesday (day 2)
        b_date = date.today() + timedelta(days=(2 - date.today().weekday()) % 7)
        if b_date <= date.today():
            b_date += timedelta(days=7)

        avail = SpaStaffAvailability(
            staff_id=staff.id,
            day_of_week=b_date.weekday(),
            start_time=time(9, 0),
            end_time=time(18, 0),
            is_available=True,
        )
        self.db.add(avail)

        # Existing booking 10:00 - 11:00 (with 15m buffer, busy until 11:15)
        existing_bkg = SpaBooking(
            booking_number="SPA-BKG-EXIST01",
            customer_id=cust.id,
            staff_id=staff.id,
            booking_date=b_date,
            start_time=time(10, 0),
            end_time=time(11, 0),
            status=SpaBookingStatus.BOOKED.value,
        )
        self.db.add(existing_bkg)
        self.db.commit()

        # Attempt to create booking starting at 11:05 (violates the 15-min buffer ending at 11:15)
        payload = {
            "customer_id": cust.id,
            "staff_id": staff.id,
            "booking_date": b_date.isoformat(),
            "start_time": "11:05",
            "service_items": [{"service_id": srv.id, "quantity": 1}],
        }
        res_conflict = self.client.post("/api/spa/bookings", json=payload, headers=self.spa_headers)
        self.assertEqual(res_conflict.status_code, 409)
        self.assertIn("Scheduling conflict", res_conflict.json()["detail"])

        # Attempt to create booking starting at 11:15 (buffer has cleared -> succeeds)
        payload_valid = {
            "customer_id": cust.id,
            "staff_id": staff.id,
            "booking_date": b_date.isoformat(),
            "start_time": "11:15",
            "service_items": [{"service_id": srv.id, "quantity": 1}],
        }
        res_valid = self.client.post("/api/spa/bookings", json=payload_valid, headers=self.spa_headers)
        self.assertEqual(res_valid.status_code, 201)

    # =========================================================================
    # 5. FINANCIAL INTEGRITY & PAYMENT OVERPAYMENT PREVENTION
    # =========================================================================

    def test_spa_payment_overpayment_rejected(self):
        """Payment exceeding the invoice balance_due is rejected with 400 Bad Request."""
        cust = SpaCustomer(
            full_name="Deepak Chopra",
            phone="9877788899",
            email="deepak@example.com",
            is_active=True,
        )
        staff = SpaStaff(
            employee_code="THR-05",
            full_name="Alok Nath",
            designation="Ayurvedic Doctor",
            phone="9888899900",
            is_therapist=True,
            is_active=True,
        )
        self.db.add_all([cust, staff])
        self.db.commit()

        booking = SpaBooking(
            booking_number="SPA-BKG-FIN01",
            customer_id=cust.id,
            staff_id=staff.id,
            booking_date=date.today(),
            start_time=time(10, 0),
            end_time=time(11, 0),
            status=SpaBookingStatus.COMPLETED.value,
        )
        self.db.add(booking)
        self.db.commit()

        invoice = SpaInvoice(
            invoice_number="SPA-INV-FIN01",
            booking_id=booking.id,
            customer_id=cust.id,
            subtotal=Decimal("1000.00"),
            tax_rate=Decimal("18.00"),
            tax_amount=Decimal("180.00"),
            discount_amount=Decimal("0.00"),
            total_amount=Decimal("1180.00"),
            paid_amount=Decimal("0.00"),
            balance_due=Decimal("1180.00"),
            payment_status="Pending",
        )
        self.db.add(invoice)
        self.db.commit()
        self.db.refresh(invoice)

        # Overpayment attempt: INR 1500 (balance is 1180)
        overpay_payload = {
            "payment_method": "UPI",
            "amount": 1500.00,
            "transaction_reference": "UPI-TXN-123",
        }
        res_overpay = self.client.post(
            f"/api/spa/payments/{invoice.id}", json=overpay_payload, headers=self.spa_headers
        )
        self.assertEqual(res_overpay.status_code, 400)
        self.assertIn("exceeds the remaining balance due", res_overpay.json()["detail"])

        # Zero or negative amount attempt
        zero_payload = {
            "payment_method": "Cash",
            "amount": 0.00,
        }
        res_zero = self.client.post(
            f"/api/spa/payments/{invoice.id}", json=zero_payload, headers=self.spa_headers
        )
        self.assertEqual(res_zero.status_code, 422)  # Pydantic gt=0

    # =========================================================================
    # 6. RESTAURANT ORDER INTEGRITY & TABLE STATUS
    # =========================================================================

    def test_restaurant_order_inactive_table_rejected(self):
        """Creating an order on an inactive restaurant table is rejected (400 Bad Request)."""
        cust = Customer(
            full_name="Rajesh Khanna",
            phone="9899900011",
            email="rajesh@example.com",
        )
        table = RestaurantTable(
            table_number="T-INACTIVE",
            capacity=4,
            status=TableStatus.AVAILABLE,
            is_active=False,  # Inactive table
        )
        cat = MenuCategory(name="Beverages", is_active=True)
        self.db.add_all([cust, table, cat])
        self.db.flush()

        item = MenuItem(
            category_id=cat.id,
            name="Masala Chai",
            price=Decimal("50.00"),
            is_available=True,
        )
        self.db.add(item)
        self.db.commit()

        payload = {
            "customer_id": cust.id,
            "table_id": table.id,
            "items": [{"menu_item_id": item.id, "quantity": 2}],
        }
        response = self.client.post("/api/orders/", json=payload, headers=self.rest_headers)
        self.assertEqual(response.status_code, 400)
        self.assertIn("table is inactive", response.json()["detail"])

    # =========================================================================
    # 7. SCHEMA VALIDATION HARDENING
    # =========================================================================

    def test_spa_customer_validation_hardening(self):
        """Spa Customer rejects invalid email format on update."""
        cust = SpaCustomer(
            full_name="Vikram Seth",
            phone="9812345678",
            email="vikram@example.com",
            is_active=True,
        )
        self.db.add(cust)
        self.db.commit()

        # Update with invalid email
        payload = {"email": "invalid-email-no-domain"}
        response = self.client.put(
            f"/api/spa/customers/{cust.id}", json=payload, headers=self.spa_headers
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
