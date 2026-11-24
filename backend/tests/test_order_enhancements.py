import unittest
from datetime import timedelta
from decimal import Decimal

from tests.base import IsolatedTestCase
from app.core.date_utils import get_kolkata_now
from app.models.entities import (
    User,
    UserRole,
    Customer,
    RestaurantTable,
    MenuItem,
    Order,
    OrderStatus,
    Invoice,
    Payment,
    PaymentStatus,
    PaymentMethod,
)
from app.core.security import create_access_token


class OrderEnhancementsTestCase(IsolatedTestCase):
    def setUp(self):
        super().setUp()

        # Manager user
        self.manager = self.db.query(User).filter_by(role=UserRole.MANAGER).first()
        if not self.manager:
            self.manager = User(
                full_name="Amit Patil",
                email="amit.patil.test@dineflow.com",
                password_hash="test",
                role=UserRole.MANAGER,
                business_context="RESTAURANT",
                is_active=True,
            )
            self.db.add(self.manager)
            self.db.commit()
            self.db.refresh(self.manager)

        self.token = create_access_token(
            data={"sub": str(self.manager.id), "role": "MANAGER", "business_context": "RESTAURANT"}
        )
        self.headers = {"Authorization": f"Bearer {self.token}"}

        # Customer & Table & MenuItem
        self.customer = self.db.query(Customer).first()
        self.table = self.db.query(RestaurantTable).first()
        self.menu_item = self.db.query(MenuItem).filter_by(is_available=True).first()

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

        # 3. Confirmed -> Ready (triggers BOM deduction in isolated test DB)
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

    def test_04_today_and_history_tab_filtering(self):
        """Verify tab='today' only includes today's orders, and tab='history' only includes older orders."""
        now = get_kolkata_now()

        # 1. Today order
        today_order = Order(
            order_number=f"ORD-TODAY-{int(now.timestamp())}",
            customer_id=self.customer.id,
            table_id=self.table.id,
            created_by_user_id=self.manager.id,
            status=OrderStatus.COMPLETED,
            created_at=now,
        )
        self.db.add(today_order)

        # 2. Historical order from 2 days ago
        historical_order = Order(
            order_number=f"ORD-HIST-{int(now.timestamp())}",
            customer_id=self.customer.id,
            table_id=self.table.id,
            created_by_user_id=self.manager.id,
            status=OrderStatus.COMPLETED,
            created_at=now - timedelta(days=2),
        )
        self.db.add(historical_order)
        self.db.commit()

        # 3. Query tab=today
        res_today = self.client.get("/api/orders/?tab=today&paginate=true", headers=self.headers)
        self.assertEqual(res_today.status_code, 200)
        data_today = res_today.json()
        today_ids = [o["id"] for o in data_today["items"]]
        self.assertIn(today_order.id, today_ids)
        self.assertNotIn(historical_order.id, today_ids)
        self.assertGreaterEqual(data_today["summary_counts"]["recent_today"], 1)

        # 4. Query tab=history
        res_hist = self.client.get("/api/orders/?tab=history&paginate=true", headers=self.headers)
        self.assertEqual(res_hist.status_code, 200)
        data_hist = res_hist.json()
        hist_ids = [o["id"] for o in data_hist["items"]]
        self.assertIn(historical_order.id, hist_ids)
        self.assertNotIn(today_order.id, hist_ids)
        self.assertGreaterEqual(data_hist["summary_counts"]["history"], 1)

    def test_05_archived_order_permanent_deletion_safeguards(self):
        """Test permanent deletion rules and safeguards for archived orders."""
        from app.models.inventory import StockMovement, MovementType

        now = get_kolkata_now()

        # 1. Clean eligible archived order (no invoice, no movements)
        eligible_order = Order(
            order_number=f"ORD-ELIG-{int(now.timestamp())}",
            customer_id=self.customer.id,
            table_id=self.table.id,
            created_by_user_id=self.manager.id,
            status=OrderStatus.COMPLETED,
            created_at=now - timedelta(days=10),
            archived_at=now - timedelta(days=2),
            archived_by=self.manager.id,
            archive_reason="Routine archive",
        )
        # 2. Protected archived order with issued invoice
        protected_invoice_order = Order(
            order_number=f"ORD-PROT-INV-{int(now.timestamp())}",
            customer_id=self.customer.id,
            table_id=self.table.id,
            created_by_user_id=self.manager.id,
            status=OrderStatus.COMPLETED,
            created_at=now - timedelta(days=10),
            archived_at=now - timedelta(days=2),
            archived_by=self.manager.id,
            archive_reason="Routine archive",
        )
        self.db.add_all([eligible_order, protected_invoice_order])
        self.db.commit()

        inv = Invoice(
            order_id=protected_invoice_order.id,
            invoice_number=f"INV-TEST-{int(now.timestamp())}",
            subtotal=Decimal("500.00"),
            gst_rate=Decimal("5.00"),
            gst_amount=Decimal("25.00"),
            total_amount=Decimal("525.00"),
            payment_status=PaymentStatus.PAID,
        )
        self.db.add(inv)
        self.db.commit()

        # 3. Protected archived order with stock movements
        protected_stock_order = Order(
            order_number=f"ORD-PROT-STK-{int(now.timestamp())}",
            customer_id=self.customer.id,
            table_id=self.table.id,
            created_by_user_id=self.manager.id,
            status=OrderStatus.COMPLETED,
            created_at=now - timedelta(days=10),
            archived_at=now - timedelta(days=2),
            archived_by=self.manager.id,
            archive_reason="Routine archive",
        )
        self.db.add(protected_stock_order)
        self.db.commit()

        mov = StockMovement(
            inventory_item_id=1,
            movement_type=MovementType.SALE_CONSUMPTION,
            quantity=Decimal("-2.0000"),
            unit_cost=Decimal("50.0000"),
            balance_after=Decimal("100.0000"),
            reference_type="ORDER",
            reference_id=protected_stock_order.id,
            created_by_user_id=self.manager.id,
        )
        self.db.add(mov)
        self.db.commit()

        # 4. Check eligibility endpoint
        check_res = self.client.post(
            "/api/orders/check-archive-deletion",
            json={"order_ids": [eligible_order.id, protected_invoice_order.id, protected_stock_order.id]},
            headers=self.headers,
        )
        self.assertEqual(check_res.status_code, 200)
        check_data = check_res.json()
        self.assertEqual(check_data["eligible_count"], 1)
        self.assertEqual(check_data["protected_count"], 2)
        self.assertEqual(check_data["eligible_ids"], [eligible_order.id])

        # 5. Attempt single deletion on protected order -> 400
        del_prot_res = self.client.delete(f"/api/orders/{protected_invoice_order.id}", headers=self.headers)
        self.assertEqual(del_prot_res.status_code, 400)
        self.assertIn("financial invoice", del_prot_res.json()["detail"])

        # 6. Delete single eligible order -> 200
        del_elig_res = self.client.delete(f"/api/orders/{eligible_order.id}", headers=self.headers)
        self.assertEqual(del_elig_res.status_code, 200)
        self.assertIsNone(self.db.query(Order).filter_by(id=eligible_order.id).first())

        # 7. Bulk restore protected orders back to active
        restore_res = self.client.post(
            "/api/orders/bulk-restore",
            json={"order_ids": [protected_invoice_order.id, protected_stock_order.id]},
            headers=self.headers,
        )
        self.assertEqual(restore_res.status_code, 200)
        self.assertEqual(restore_res.json()["restored_count"], 2)


if __name__ == "__main__":
    unittest.main()
