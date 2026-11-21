from __future__ import annotations

import sys
import unittest
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
    RestaurantTable,
    TableStatus,
    User,
    UserRole,
)
from app.models.spa import (
    SpaCustomer,
    SpaService,
    SpaServiceCategory,
    SpaStaff,
)

TEST_DB_URL = "sqlite:///:memory:"


class TestGlobalSearch(unittest.TestCase):

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

        # Create Restaurant Manager
        self.rest_user = User(
            full_name="Restaurant Manager",
            email="rest_mgr@dineflow.com",
            password_hash=hash_password("Secret123!"),
            role=UserRole.MANAGER,
            business_context="RESTAURANT",
            is_active=True,
        )
        self.db.add(self.rest_user)

        # Create Spa Manager
        self.spa_user = User(
            full_name="Spa Manager",
            email="spa_mgr@dineflow.com",
            password_hash=hash_password("Secret123!"),
            role=UserRole.MANAGER,
            business_context="SPA",
            is_active=True,
        )
        self.db.add(self.spa_user)

        # Create sample Restaurant records
        self.rest_customer = Customer(
            full_name="Sanjay Raut",
            phone="9876543210",
            email="sanjay@example.com",
        )
        self.db.add(self.rest_customer)

        self.table = RestaurantTable(
            table_number="T-01",
            capacity=4,
            status=TableStatus.AVAILABLE,
            is_active=True,
        )
        self.db.add(self.table)

        self.category = MenuCategory(name="Main Course", is_active=True)
        self.db.add(self.category)
        self.db.flush()

        self.dish = MenuItem(
            category_id=self.category.id,
            name="Butter Chicken",
            price=Decimal("450.00"),
            is_available=True,
        )
        self.db.add(self.dish)

        # Create sample Spa records
        self.spa_customer = SpaCustomer(
            full_name="Sanjay Verma",
            phone="9123456780",
            email="sanjay.spa@example.com",
            is_active=True,
        )
        self.db.add(self.spa_customer)

        self.spa_cat = SpaServiceCategory(name="Massage Therapy")
        self.db.add(self.spa_cat)
        self.db.flush()

        self.spa_service = SpaService(
            category_id=self.spa_cat.id,
            name="Swedish Massage",
            duration_minutes=60,
            price=Decimal("2500.00"),
            is_available=True,
        )
        self.db.add(self.spa_service)

        self.therapist = SpaStaff(
            full_name="Anita Sharma",
            employee_code="TH-001",
            designation="Senior Therapist",
            specialization="Aromatherapy",
            phone="9876543211",
            is_active=True,
        )
        self.db.add(self.therapist)

        # Additional Restaurant records: Order, Invoice, InventoryItem, Supplier
        from app.models.entities import Invoice, OrderStatus, PaymentStatus
        from app.models.inventory import InventoryItem, Supplier, InventoryCategory, BaseUnit

        self.order = Order(
            order_number="ORD-2026-0001",
            table_id=self.table.id,
            customer_id=self.rest_customer.id,
            created_by_user_id=self.rest_user.id,
            status=OrderStatus.CONFIRMED,
        )
        self.db.add(self.order)
        self.db.flush()

        self.invoice = Invoice(
            order_id=self.order.id,
            invoice_number="INV-2026-0001",
            subtotal=Decimal("450.00"),
            gst_rate=Decimal("5.00"),
            gst_amount=Decimal("22.50"),
            total_amount=Decimal("472.50"),
            payment_status=PaymentStatus.PAID,
        )
        self.db.add(self.invoice)

        self.inv_cat = InventoryCategory(name="Dairy", is_active=True)
        self.db.add(self.inv_cat)
        self.db.flush()

        self.inv_item = InventoryItem(
            name="Amul Butter 500g",
            sku="RAW-BTR-01",
            category_id=self.inv_cat.id,
            base_unit="kg",
            current_stock=Decimal("12.50"),
            reorder_level=Decimal("5.00"),
            average_cost=Decimal("260.00"),
            created_by_user_id=self.rest_user.id,
            is_active=True,
        )
        self.db.add(self.inv_item)

        self.supplier = Supplier(
            name="Metro Dairy Distributors",
            contact_person="Vikas Gupta",
            phone="9822012345",
            email="vikas@metrodairy.com",
            created_by_user_id=self.rest_user.id,
            is_active=True,
        )
        self.db.add(self.supplier)

        # Additional Spa records: SpaBooking, SpaInvoice
        from app.models.spa import SpaBooking, SpaInvoice, SpaPaymentStatus
        from datetime import date, time

        self.spa_booking = SpaBooking(
            customer_id=self.spa_customer.id,
            staff_id=self.therapist.id,
            booking_date=date.today(),
            start_time=time(14, 0),
            end_time=time(15, 0),
            status="Booked",
            estimated_total=Decimal("2500.00"),
        )
        self.db.add(self.spa_booking)
        self.db.flush()

        self.spa_invoice = SpaInvoice(
            booking_id=self.spa_booking.id,
            customer_id=self.spa_customer.id,
            invoice_number="SPA-INV-2026-0001",
            subtotal=Decimal("2500.00"),
            tax_amount=Decimal("125.00"),
            total_amount=Decimal("2625.00"),
            paid_amount=Decimal("2625.00"),
            balance_due=Decimal("0.00"),
            payment_status="Paid",
        )
        self.db.add(self.spa_invoice)

        self.db.commit()

        # Tokens
        self.rest_token = create_access_token(
            data={"sub": str(self.rest_user.id), "role": "manager"}
        )
        self.spa_token = create_access_token(
            data={"sub": str(self.spa_user.id), "role": "manager"}
        )

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        with self.engine.connect() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(table.delete())
            conn.commit()

    def test_restaurant_search_returns_restaurant_records(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        res = self.client.get("/api/search?q=Sanjay", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["query"], "Sanjay")
        self.assertGreaterEqual(data["total_matches"], 1)

        # Check that Sanjay Raut is present
        titles = [item["title"] for group in data["groups"] for item in group["items"]]
        self.assertIn("Sanjay Raut", titles)
        # Check that Spa customer Sanjay Verma is NOT present (strict isolation)
        self.assertNotIn("Sanjay Verma", titles)

    def test_spa_search_returns_spa_records(self):
        headers = {"Authorization": f"Bearer {self.spa_token}"}
        res = self.client.get("/api/search?q=Sanjay", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["query"], "Sanjay")
        self.assertGreaterEqual(data["total_matches"], 1)

        # Check that Sanjay Verma is present
        titles = [item["title"] for group in data["groups"] for item in group["items"]]
        self.assertIn("Sanjay Verma", titles)
        # Check that Restaurant customer Sanjay Raut is NOT present (strict isolation)
        self.assertNotIn("Sanjay Raut", titles)

    def test_search_menu_item(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        res = self.client.get("/api/search?q=Butter", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        titles = [item["title"] for group in data["groups"] for item in group["items"]]
        self.assertIn("Butter Chicken", titles)

    def test_restaurant_search_order_and_invoice(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        # Search Order
        res_ord = self.client.get("/api/search?q=ORD-2026", headers=headers)
        self.assertEqual(res_ord.status_code, 200)
        titles_ord = [item["title"] for group in res_ord.json()["groups"] for item in group["items"]]
        self.assertIn("ORD-2026-0001", titles_ord)

        # Search Invoice
        res_inv = self.client.get("/api/search?q=INV-2026", headers=headers)
        self.assertEqual(res_inv.status_code, 200)
        titles_inv = [item["title"] for group in res_inv.json()["groups"] for item in group["items"]]
        self.assertIn("INV-2026-0001", titles_inv)

    def test_restaurant_search_inventory_item_and_supplier(self):
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        # Search Inventory Item
        res_inv = self.client.get("/api/search?q=RAW-BTR", headers=headers)
        self.assertEqual(res_inv.status_code, 200)
        titles_inv = [item["title"] for group in res_inv.json()["groups"] for item in group["items"]]
        self.assertTrue(any("Amul Butter" in t for t in titles_inv))

        # Search Supplier
        res_sup = self.client.get("/api/search?q=Metro%20Dairy", headers=headers)
        self.assertEqual(res_sup.status_code, 200)
        titles_sup = [item["title"] for group in res_sup.json()["groups"] for item in group["items"]]
        self.assertIn("Metro Dairy Distributors", titles_sup)

    def test_spa_search_booking_and_invoice(self):
        headers = {"Authorization": f"Bearer {self.spa_token}"}
        # Search Booking (by customer name)
        res_bk = self.client.get("/api/search?q=Sanjay", headers=headers)
        self.assertEqual(res_bk.status_code, 200)
        types_bk = [item["entity_type"] for group in res_bk.json()["groups"] for item in group["items"]]
        self.assertIn("booking", types_bk)

        # Search Spa Invoice
        res_inv = self.client.get("/api/search?q=SPA-INV", headers=headers)
        self.assertEqual(res_inv.status_code, 200)
        titles_inv = [item["title"] for group in res_inv.json()["groups"] for item in group["items"]]
        self.assertIn("SPA-INV-2026-0001", titles_inv)

    def test_context_isolation_cross_leakage_prevented(self):
        # Ensure Spa user searching 'Butter' gets 0 matches (no restaurant dish or raw butter item)
        headers = {"Authorization": f"Bearer {self.spa_token}"}
        res = self.client.get("/api/search?q=Butter", headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["total_matches"], 0)

        # Ensure Restaurant user searching 'Swedish Massage' gets 0 matches
        headers_rest = {"Authorization": f"Bearer {self.rest_token}"}
        res_rest = self.client.get("/api/search?q=Swedish", headers=headers_rest)
        self.assertEqual(res_rest.status_code, 200)
        self.assertEqual(res_rest.json()["total_matches"], 0)

    def test_unauthenticated_search_rejected(self):
        res = self.client.get("/api/search?q=test")
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
