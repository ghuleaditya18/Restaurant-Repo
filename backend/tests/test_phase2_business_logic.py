import sys
from pathlib import Path
from decimal import Decimal
from datetime import timedelta
import unittest
import jwt

# Add backend to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from starlette.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.date_utils import get_kolkata_now, get_date_range
from app.db.session import SessionLocal
from app.models.entities import (
    User,
    Customer,
    RestaurantTable,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    OrderStatusHistory,
    TableStatus,
    Invoice,
    Payment,
    PaymentStatus,
    PaymentMethod,
)
from app.services.order_service import cancel_stale_orders


def get_auth_header(user_id: int = 1) -> dict:
    token = jwt.encode(
        {"sub": str(user_id)},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return {"Authorization": f"Bearer {token}"}


class Phase2BusinessLogicTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.headers = get_auth_header(1)

    def setUp(self):
        self.db = SessionLocal()
        self.created_order_ids = []
        self.created_invoice_ids = []
        self.created_payment_ids = []
        self.created_customer_ids = []

    def tearDown(self):
        # Clean up any test fixtures created during the test to avoid DB pollution
        try:
            if self.created_payment_ids:
                self.db.query(Payment).filter(Payment.id.in_(self.created_payment_ids)).delete(synchronize_session=False)
            if self.created_invoice_ids:
                self.db.query(Invoice).filter(Invoice.id.in_(self.created_invoice_ids)).delete(synchronize_session=False)
            if self.created_order_ids:
                self.db.query(OrderStatusHistory).filter(OrderStatusHistory.order_id.in_(self.created_order_ids)).delete(synchronize_session=False)
                self.db.query(OrderItem).filter(OrderItem.order_id.in_(self.created_order_ids)).delete(synchronize_session=False)
                self.db.query(Order).filter(Order.id.in_(self.created_order_ids)).delete(synchronize_session=False)
            if self.created_customer_ids:
                self.db.query(Customer).filter(Customer.id.in_(self.created_customer_ids)).delete(synchronize_session=False)
            self.db.commit()
        except Exception:
            self.db.rollback()
        finally:
            self.db.close()

    # =========================================================================
    # 1. PREVIOUS-DAY OCCUPIED TABLES FIX
    # =========================================================================
    def test_previous_day_tables_are_available_today(self):
        """
        Tables with orders from previous days must NOT be occupied today
        unless active orders exist for the current business date in Asia/Kolkata.
        """
        # Call API to fetch tables
        response = self.client.get("/api/tables/", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        tables = response.json()

        # Check Table 1 (table_number "1" or ID 3 in DB)
        # Previous orders were from Nov 17/18. Today is Nov 19.
        # Should be AVAILABLE if no orders were placed today.
        today_start, today_end = get_date_range("today")
        t1 = next((t for t in tables if t["table_number"] == "1"), None)
        self.assertIsNotNone(t1)

        active_orders_today = (
            self.db.query(Order)
            .filter(
                Order.table_id == t1["id"],
                Order.status.notin_([OrderStatus.COMPLETED, OrderStatus.CANCELLED]),
                Order.created_at >= today_start,
                Order.created_at <= today_end,
            )
            .count()
        )
        expected = "Occupied" if active_orders_today > 0 else "Available"
        self.assertEqual(t1["status"], expected)

    def test_dashboard_table_occupancy_date_awareness(self):
        """
        Dashboard summary occupancy statistics must reflect only current business date.
        """
        response = self.client.get("/api/dashboard/summary?preset=today", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        stats = data["statistics"]
        self.assertIn("available_tables", stats)
        self.assertIn("occupied_tables", stats)
        self.assertIn("total_tables", stats)
        self.assertEqual(stats["total_tables"], stats["available_tables"] + stats["occupied_tables"])

    # =========================================================================
    # 2. STALE ORDER EXPIRATION
    # =========================================================================
    def test_stale_order_auto_cancellation(self):
        """
        Orders in Ordered / In Progress exceeding timeout are cancelled.
        Served and Completed orders are NEVER auto-cancelled.
        """
        customer = self.db.query(Customer).first()
        table = self.db.query(RestaurantTable).filter(RestaurantTable.is_active.is_(True)).first()
        user = self.db.query(User).filter(User.is_active.is_(True)).first()
        menu_item = self.db.query(MenuItem).filter(MenuItem.is_available.is_(True)).first()

        past_time = get_kolkata_now() - timedelta(hours=36)

        # Create a stale Pending order
        stale_order = Order(
            customer_id=customer.id,
            table_id=table.id,
            created_by_user_id=user.id,
            status=OrderStatus.PENDING,
            created_at=past_time,
            updated_at=past_time,
        )
        self.db.add(stale_order)
        self.db.flush()

        item = OrderItem(
            order_id=stale_order.id,
            menu_item_id=menu_item.id,
            item_name=menu_item.name,
            quantity=1,
            unit_price=menu_item.price,
            line_total=menu_item.price,
        )
        self.db.add(item)

        # Create an old Served order (should NOT be cancelled)
        served_order = Order(
            customer_id=customer.id,
            table_id=table.id,
            created_by_user_id=user.id,
            status=OrderStatus.SERVED,
            created_at=past_time,
            updated_at=past_time,
        )
        self.db.add(served_order)
        self.db.flush()

        # Create an old Completed order (should NOT be cancelled)
        completed_order = Order(
            customer_id=customer.id,
            table_id=table.id,
            created_by_user_id=user.id,
            status=OrderStatus.COMPLETED,
            created_at=past_time,
            updated_at=past_time,
        )
        self.db.add(completed_order)
        self.db.commit()

        self.created_order_ids.extend([stale_order.id, served_order.id, completed_order.id])

        # Run stale orders cancellation with default 24h timeout
        cancelled = cancel_stale_orders(self.db, timeout_hours=24)
        self.assertIn(stale_order.id, cancelled)
        self.assertNotIn(served_order.id, cancelled)
        self.assertNotIn(completed_order.id, cancelled)

        # Check DB states
        self.db.refresh(stale_order)
        self.assertEqual(stale_order.status, OrderStatus.CANCELLED)

        # Check OrderStatusHistory note
        history = (
            self.db.query(OrderStatusHistory)
            .filter(OrderStatusHistory.order_id == stale_order.id)
            .order_by(OrderStatusHistory.id.desc())
            .first()
        )
        self.assertIsNotNone(history)
        self.assertEqual(history.new_status, OrderStatus.CANCELLED)
        self.assertIn("inactivity exceeding", history.note)

        # Check that served and completed were NOT cancelled
        self.db.refresh(served_order)
        self.assertEqual(served_order.status, OrderStatus.SERVED)
        self.db.refresh(completed_order)
        self.assertEqual(completed_order.status, OrderStatus.COMPLETED)

        # Test idempotence: running again changes nothing
        cancelled_again = cancel_stale_orders(self.db, timeout_hours=24)
        self.assertNotIn(stale_order.id, cancelled_again)

    # =========================================================================
    # 3. ORDER STATUS WORKFLOW & INVOICE-PAYMENT-COMPLETION RULES
    # =========================================================================
    def test_invoice_and_order_completion_workflow(self):
        """
        Verify complete order workflow:
        1. Newly created order starts in Pending (Ordered).
        2. Invoice CANNOT be generated while Pending, Confirmed, Preparing, or Ready.
        3. Transition to In Progress (Preparing).
        4. Transition to Served.
        5. Cannot complete order without invoice.
        6. Generate invoice -> Initial status is Pending.
        7. Cannot create duplicate invoice for same order.
        8. Cannot complete order while invoice payment is Pending.
        9. Record payment and mark Paid.
        10. Complete order -> Succeeds!
        """
        customer = self.db.query(Customer).first()
        table = self.db.query(RestaurantTable).filter(RestaurantTable.is_active.is_(True)).first()
        menu_item = self.db.query(MenuItem).filter(MenuItem.is_available.is_(True)).first()

        # Step 1: Create Order
        create_payload = {
            "customer_id": customer.id,
            "table_id": table.id,
            "special_instructions": "Phase 2 Automated Test Order",
            "items": [
                {
                    "menu_item_id": menu_item.id,
                    "quantity": 2,
                }
            ],
        }
        res = self.client.post("/api/orders/", json=create_payload, headers=self.headers)
        self.assertEqual(res.status_code, 201)
        order_data = res.json()
        order_id = order_data["id"]
        self.created_order_ids.append(order_id)
        self.assertEqual(order_data["status"], "Pending")

        # Step 2: Try to create invoice while in Pending -> Should fail with 400
        inv_payload = {"order_id": order_id, "gst_rate": "5.00"}
        res_inv_fail = self.client.post("/api/invoices/", json=inv_payload, headers=self.headers)
        self.assertEqual(res_inv_fail.status_code, 400)
        self.assertIn("served orders", res_inv_fail.json()["detail"].lower())

        # Step 3: Transition Ordered (Pending) -> In Progress (Preparing)
        res_prep = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Preparing", "note": "Kitchen started cooking"},
            headers=self.headers,
        )
        self.assertEqual(res_prep.status_code, 200)
        self.assertEqual(res_prep.json()["status"], "Preparing")

        # Try invoice while Preparing -> Should fail
        res_inv_fail2 = self.client.post("/api/invoices/", json=inv_payload, headers=self.headers)
        self.assertEqual(res_inv_fail2.status_code, 400)

        # Step 4: Transition to Served
        res_served = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Served", "note": "Food served to table"},
            headers=self.headers,
        )
        self.assertEqual(res_served.status_code, 200)
        self.assertEqual(res_served.json()["status"], "Served")

        # Step 5: Try to complete order without invoice -> Should fail with 400
        res_complete_fail = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Completed"},
            headers=self.headers,
        )
        self.assertEqual(res_complete_fail.status_code, 400)
        self.assertIn("invoice", res_complete_fail.json()["detail"].lower())

        # Step 6: Create invoice now that order is Served -> Should succeed
        res_inv = self.client.post("/api/invoices/", json=inv_payload, headers=self.headers)
        self.assertEqual(res_inv.status_code, 201)
        inv_data = res_inv.json()
        invoice_id = inv_data["id"]
        self.created_invoice_ids.append(invoice_id)
        self.assertEqual(inv_data["payment_status"], "Pending")

        # Step 7: Duplicate invoice attempt -> Should fail with 409
        res_inv_dup = self.client.post("/api/invoices/", json=inv_payload, headers=self.headers)
        self.assertEqual(res_inv_dup.status_code, 409)

        # Step 8: Try to complete order while invoice is Pending -> Should fail with 400
        res_complete_fail2 = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Completed"},
            headers=self.headers,
        )
        self.assertEqual(res_complete_fail2.status_code, 400)
        self.assertIn("paid", res_complete_fail2.json()["detail"].lower())

        # Step 9: Record payment and mark Paid
        payment_payload = {
            "payment_method": "UPI",
            "reference_number": "UPI-TEST-12345",
        }
        res_pay = self.client.post(
            f"/api/payments/invoice/{invoice_id}",
            json=payment_payload,
            headers=self.headers,
        )
        self.assertEqual(res_pay.status_code, 201)
        payment_id = res_pay.json()["id"]
        self.created_payment_ids.append(payment_id)

        # Update payment status to Paid
        res_pay_status = self.client.patch(
            f"/api/payments/{payment_id}/status",
            json={"status": "Paid"},
            headers=self.headers,
        )
        self.assertEqual(res_pay_status.status_code, 200)
        self.assertEqual(res_pay_status.json()["status"], "Paid")
        self.assertIsNotNone(res_pay_status.json()["paid_at"])

        # Step 10: Now complete the order -> Should succeed!
        res_complete = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Completed", "note": "Final settlement done"},
            headers=self.headers,
        )
        self.assertEqual(res_complete.status_code, 200)
        self.assertEqual(res_complete.json()["status"], "Completed")

    # =========================================================================
    # 4. CUSTOMER MANDATORY EMAIL VALIDATION
    # =========================================================================
    def test_customer_email_mandatory_validation(self):
        """
        Verify mandatory customer email:
        - Creation without email is rejected (422).
        - Creation with empty email is rejected (422).
        - Creation with malformed email is rejected (422).
        - Creation with valid email succeeds and normalizes email.
        - Update with empty/invalid email is rejected (422).
        - Partial update without email retains existing email.
        """
        # Test 1: Missing email
        res1 = self.client.post(
            "/api/customers/",
            json={"full_name": "Test User", "phone": "9876543210"},
            headers=self.headers,
        )
        self.assertEqual(res1.status_code, 422)

        # Test 2: Empty email
        res2 = self.client.post(
            "/api/customers/",
            json={"full_name": "Test User", "phone": "9876543210", "email": ""},
            headers=self.headers,
        )
        self.assertEqual(res2.status_code, 422)

        # Test 3: Whitespace email
        res3 = self.client.post(
            "/api/customers/",
            json={"full_name": "Test User", "phone": "9876543210", "email": "   "},
            headers=self.headers,
        )
        self.assertEqual(res3.status_code, 422)

        # Test 4: Invalid email format
        res4 = self.client.post(
            "/api/customers/",
            json={"full_name": "Test User", "phone": "9876543210", "email": "invalid-email"},
            headers=self.headers,
        )
        self.assertEqual(res4.status_code, 422)

        # Test 5: Valid email with uppercase and whitespace padding -> Must normalize
        test_email_raw = "  Customer.Test99@DineFlow.Com  "
        res5 = self.client.post(
            "/api/customers/",
            json={"full_name": "Customer NinetyNine", "phone": "9876543210", "email": test_email_raw},
            headers=self.headers,
        )
        self.assertEqual(res5.status_code, 201)
        created_customer = res5.json()
        self.assertEqual(created_customer["email"], "customer.test99@dineflow.com")
        cust_id = created_customer["id"]
        self.created_customer_ids.append(cust_id)

        # Test 6: Update customer with empty email -> Must reject
        res6 = self.client.patch(
            f"/api/customers/{cust_id}",
            json={"email": ""},
            headers=self.headers,
        )
        self.assertEqual(res6.status_code, 422)

        # Test 7: Update customer with invalid email -> Must reject
        res7 = self.client.patch(
            f"/api/customers/{cust_id}",
            json={"email": "not-an-email"},
            headers=self.headers,
        )
        self.assertEqual(res7.status_code, 422)

        # Test 8: Partial update without email field -> Must retain existing email
        res8 = self.client.patch(
            f"/api/customers/{cust_id}",
            json={"full_name": "Customer NinetyNine Updated"},
            headers=self.headers,
        )
        self.assertEqual(res8.status_code, 200)
        self.assertEqual(res8.json()["full_name"], "Customer NinetyNine Updated")
        self.assertEqual(res8.json()["email"], "customer.test99@dineflow.com")

        # Test 9: Fetch all customers including historical ones with null email
        res9 = self.client.get("/api/customers/", headers=self.headers)
        self.assertEqual(res9.status_code, 200)
        all_custs = res9.json()
        self.assertTrue(len(all_custs) > 0)


if __name__ == "__main__":
    unittest.main()
