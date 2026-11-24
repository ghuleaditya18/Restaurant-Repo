"""
Automated Test Isolation & Database Safety Guard Unit Tests.

Verifies:
1. Operational database names (restaurant_db, dineflow_db) are strictly rejected.
2. Direct calls to SessionLocal in test mode trigger the safety guard.
3. Orders placed in IsolatedTestCase leave ZERO stock movements after rollback.
"""
import os
import unittest
from sqlalchemy import text

from tests.base import IsolatedTestCase
from tests.test_config import (
    verify_test_database_safety,
    test_engine,
)
from app.db.session import SessionLocal
from app.models.entities import Customer, RestaurantTable, MenuItem
from app.models.inventory import StockMovement, InventoryItem


class TestDatabaseSafetyGuard(unittest.TestCase):
    """Verifies that the safety guard prevents connecting to operational databases."""

    def test_guard_rejects_operational_database_names(self):
        with self.assertRaises(RuntimeError) as ctx1:
            verify_test_database_safety("postgresql+psycopg://user:pass@localhost:5432/restaurant_db")
        self.assertIn("CRITICAL SAFETY GUARD VIOLATION", str(ctx1.exception))
        self.assertIn("restaurant_db", str(ctx1.exception))

        with self.assertRaises(RuntimeError) as ctx2:
            verify_test_database_safety("postgresql+psycopg://user:pass@localhost:5432/dineflow_db")
        self.assertIn("CRITICAL SAFETY GUARD VIOLATION", str(ctx2.exception))
        self.assertIn("dineflow_db", str(ctx2.exception))

    def test_guard_rejects_empty_or_non_test_url(self):
        with self.assertRaises(RuntimeError):
            verify_test_database_safety("")

        with self.assertRaises(RuntimeError) as ctx:
            verify_test_database_safety("postgresql+psycopg://user:pass@localhost:5432/production_db")
        self.assertIn("must explicitly include 'test'", str(ctx.exception))

    def test_guard_accepts_valid_test_urls(self):
        # Should not raise
        verify_test_database_safety("postgresql+psycopg://user:pass@localhost:5432/dineflow_test_db")
        verify_test_database_safety("sqlite:///:memory:")

    def test_direct_session_local_triggers_safety_guard(self):
        """Verifies that calling operational SessionLocal() in test mode raises RuntimeError."""
        os.environ["DINEFLOW_TEST_MODE"] = "1"
        with self.assertRaises(RuntimeError) as ctx:
            _ = SessionLocal()
        self.assertIn("CRITICAL SAFETY GUARD TRIGGERED", str(ctx.exception))


class TestOrderRollbackIsolation(IsolatedTestCase):
    """Regression test: Verifies that test-created orders and movements leave zero trace after rollback."""

    def test_01_create_order_and_verify_in_test(self):
        customer = self.db.query(Customer).first()
        table = self.db.query(RestaurantTable).first()
        menu_item = self.db.query(MenuItem).filter_by(is_available=True).first()
        paneer = self.db.query(InventoryItem).filter(InventoryItem.name.ilike("%paneer%")).first()

        initial_paneer_stock = float(paneer.current_stock)
        headers = self.get_auth_headers(1)

        # 1. Place order
        resp = self.client.post(
            "/api/orders/",
            json={
                "customer_id": customer.id,
                "table_id": table.id,
                "items": [{"menu_item_id": menu_item.id, "quantity": 2}],
                "special_instructions": "Safety guard regression test",
            },
            headers=headers,
        )
        self.assertEqual(resp.status_code, 201)
        order_id = resp.json()["id"]

        # 2. Transition to Ready to trigger BOM deduction
        ready_resp = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Ready"},
            headers=headers,
        )
        self.assertEqual(ready_resp.status_code, 200)

        # 3. Inside the test transaction, movements exist
        movements = self.db.query(StockMovement).filter(StockMovement.reference_id == order_id).all()
        self.assertEqual(len(movements), 10)

        # 4. Paneer stock was deducted inside the test
        self.db.refresh(paneer)
        self.assertEqual(float(paneer.current_stock), round(initial_paneer_stock - 0.4, 4))

    def test_02_verify_previous_order_and_movements_fully_rolled_back(self):
        """Verifies that after test_01 completed, all orders and movements were rolled back."""
        with test_engine.connect() as conn:
            orders_count = conn.execute(text("SELECT count(*) FROM orders")).scalar()
            movements_count = conn.execute(text("SELECT count(*) FROM stock_movements")).scalar()
            self.assertEqual(orders_count, 0)
            self.assertEqual(movements_count, 0)


if __name__ == "__main__":
    unittest.main()
