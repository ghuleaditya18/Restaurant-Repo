import unittest
from datetime import timedelta
from decimal import Decimal
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.core.date_utils import get_kolkata_now
from app.models.entities import (
    User,
    UserRole,
    Customer,
    RestaurantTable,
    TableStatus,
    MenuCategory,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    Invoice,
    Payment,
    PaymentStatus,
    PaymentMethod,
)
from app.core.security import create_access_token


class OrderEnhancementsTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.db = SessionLocal()

        # Manager user
        cls.manager = cls.db.query(User).filter_by(email="amit.patil@gmail.com").first()
        if not cls.manager:
            cls.manager = User(
                full_name="Amit Patil",
                email="amit.patil@gmail.com",
                password_hash="test",
                role=UserRole.MANAGER,
                business_context="RESTAURANT",
                is_active=True,
            )
            cls.db.add(cls.manager)
            cls.db.commit()
            cls.db.refresh(cls.manager)

        cls.token = create_access_token(
            data={"sub": str(cls.manager.id), "role": "MANAGER", "business_context": "RESTAURANT"}
        )
        cls.headers = {"Authorization": f"Bearer {cls.token}"}

        # Customer & Table
        cls.customer = cls.db.query(Customer).first()
        cls.table = cls.db.query(RestaurantTable).first()
        cls.menu_item = cls.db.query(MenuItem).filter_by(is_available=True).first()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_01_create_and_progress_order(self):
        # 1. Place order (starts at PENDING / Ordered)
        create_res = self.client.post(
            "/api/orders/",
            json={
                "customer_id": self.customer.id,
                "table_id": self.table.id,
                "items": [{"menu_item_id": self.menu_item.id, "quantity": 2}],
                "special_instructions": "Less spicy please",
            },
            headers=self.headers,
        )
        self.assertEqual(create_res.status_code, 201)
        order_data = create_res.json()
        order_id = order_data["id"]
        self.assertEqual(order_data["status"], "Pending")

        # Verify unit_price and line_total are numeric and present
        self.assertTrue(len(order_data["items"]) > 0)
        item0 = order_data["items"][0]
        self.assertIsNotNone(item0.get("unit_price"))
        self.assertIsNotNone(item0.get("line_total"))
        self.assertIsNotNone(item0.get("price_at_order"))
        self.assertEqual(Decimal(str(item0["price_at_order"])), Decimal(str(item0["unit_price"])))

        # 2. Ordered -> Confirmed
        conf_res = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Confirmed"},
            headers=self.headers,
        )
        self.assertEqual(conf_res.status_code, 200)
        self.assertEqual(conf_res.json()["status"], "Confirmed")

        # 3. Confirmed -> Ready
        ready_res = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Ready"},
            headers=self.headers,
        )
        self.assertEqual(ready_res.status_code, 200)
        self.assertEqual(ready_res.json()["status"], "Ready")

        # 4. Ready -> Served
        served_res = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Served"},
            headers=self.headers,
        )
        self.assertEqual(served_res.status_code, 200)
        self.assertEqual(served_res.json()["status"], "Served")

        # 5. Collect partial payment directly from Order Details
        order_details = served_res.json()
        total_amt = Decimal(str(order_details["total_amount"]))
        self.assertTrue(total_amt > 0)

        partial_amt = (total_amt / Decimal("2")).quantize(Decimal("0.01"))
        part_pay_res = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={"payment_method": "Cash", "amount": float(partial_amt), "reference_number": "CSH-PART-01"},
            headers=self.headers,
        )
        self.assertEqual(part_pay_res.status_code, 200)
        part_data = part_pay_res.json()
        self.assertEqual(part_data["status"], "Served")  # Remains Served
        self.assertEqual(part_data["payment_status"], "Partially Paid")
        self.assertTrue(Decimal(str(part_data["outstanding_balance"])) > 0)

        # 6. Reject overpayment
        remaining_balance = float(part_data["outstanding_balance"])
        overpay_res = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={"payment_method": "UPI", "amount": remaining_balance + 100.0},
            headers=self.headers,
        )
        self.assertEqual(overpay_res.status_code, 400)
        self.assertIn("cannot exceed", overpay_res.json()["detail"].lower())

        # 7. Collect remaining balance -> auto-completes order
        full_pay_res = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={"payment_method": "UPI", "amount": remaining_balance, "reference_number": "UPI-SETTLE-01"},
            headers=self.headers,
        )
        self.assertEqual(full_pay_res.status_code, 200)
        full_data = full_pay_res.json()
        self.assertEqual(full_data["status"], "Completed")  # Completed!
        self.assertEqual(full_data["payment_status"], "Paid")
        self.assertEqual(float(full_data["outstanding_balance"]), 0.0)
        self.assertIsNotNone(full_data["invoice_id"])

    def test_02_pagination_and_filters(self):
        # Test pagination response format
        res = self.client.get("/api/orders/?page=1&page_size=10&paginate=true", headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("items", data)
        self.assertIn("total", data)
        self.assertIn("page", data)
        self.assertIn("page_size", data)
        self.assertIn("total_pages", data)
        self.assertIn("summary_counts", data)
        self.assertEqual(data["page_size"], 10)

        # Test summary counts structure
        sc = data["summary_counts"]
        for key in ["all_active", "ordered", "confirmed", "ready", "served", "completed", "cancelled"]:
            self.assertIn(key, sc)

    def test_03_bulk_archive_and_restore(self):
        # Create an old order directly in DB (> 3 days old, completed and paid)
        four_days_ago = get_kolkata_now() - timedelta(days=4)
        old_order = Order(
            customer_id=self.customer.id,
            table_id=self.table.id,
            created_by_user_id=self.manager.id,
            status=OrderStatus.COMPLETED,
            created_at=four_days_ago,
        )
        self.db.add(old_order)
        self.db.flush()

        old_inv = Invoice(
            order_id=old_order.id,
            subtotal=Decimal("200.00"),
            gst_rate=Decimal("5.00"),
            gst_amount=Decimal("10.00"),
            total_amount=Decimal("210.00"),
            payment_status=PaymentStatus.PAID,
            created_at=four_days_ago,
        )
        self.db.add(old_inv)
        self.db.flush()

        old_pay = Payment(
            invoice_id=old_inv.id,
            payment_method=PaymentMethod.CASH,
            amount=Decimal("210.00"),
            status=PaymentStatus.PAID,
            paid_at=four_days_ago,
            created_at=four_days_ago,
        )
        self.db.add(old_pay)
        self.db.commit()

        # Archive it via API
        arch_res = self.client.post(
            "/api/orders/bulk-archive",
            json={"order_ids": [old_order.id], "older_than_days": 3, "reason": "Test routine cleanup"},
            headers=self.headers,
        )
        self.assertEqual(arch_res.status_code, 200)
        arch_data = arch_res.json()
        self.assertEqual(arch_data["archived_count"], 1)
        self.assertIn(old_order.id, arch_data["archived_ids"])

        # Verify it now appears under archived tab
        get_arch = self.client.get("/api/orders/?tab=archived", headers=self.headers)
        self.assertEqual(get_arch.status_code, 200)
        arch_list = get_arch.json()
        arch_ids = [o["id"] for o in arch_list]
        self.assertIn(old_order.id, arch_ids)

        # Restore it
        rest_res = self.client.post(f"/api/orders/{old_order.id}/restore", headers=self.headers)
        self.assertEqual(rest_res.status_code, 200)
        self.assertIsNone(rest_res.json()["archived_at"])


if __name__ == "__main__":
    unittest.main()
