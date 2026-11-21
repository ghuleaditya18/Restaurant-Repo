from __future__ import annotations

import os
import sys
import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

# Add backend directory to sys.path
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
from app.models.inventory import (
    BaseUnit,
    GoodsReceipt,
    InventoryCategory,
    InventoryItem,
    MovementType,
    POStatus,
    PurchaseOrder,
    Recipe,
    RecipeItem,
    StockCount,
    StockCountStatus,
    StockMovement,
    Supplier,
    SupplierItem,
    WastageReason,
)
from app.services.inventory_service import (
    deduct_inventory_for_order,
    get_menu_item_inventory_status,
    process_goods_receipt,
    reconcile_inventory_ledger,
    record_opening_stock,
    record_stock_adjustment,
    record_wastage,
    reverse_order_inventory_deduction,
)

# Dedicated Isolated In-Memory Test Database for Inventory Tests
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestInventoryModule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Override FastAPI get_db dependency
        app.dependency_overrides[get_db] = override_get_db

        # Create all tables on isolated test database
        Base.metadata.create_all(bind=test_engine)

        cls.client = TestClient(app)
        cls.db = TestingSessionLocal()

        # Seed Test Manager User (Restaurant context)
        cls.manager_user = User(
            full_name="Inventory Test Manager",
            email="inv.manager.fixture@dineflow.com",
            password_hash=hash_password("Manager@123"),
            role=UserRole.MANAGER,
            business_context="RESTAURANT",
            is_active=True,
        )
        cls.db.add(cls.manager_user)

        # Seed Spa User (Spa context - should be rejected by inventory APIs)
        cls.spa_user = User(
            full_name="Spa Receptionist Fixture",
            email="spa.user.fixture@dineflow.com",
            password_hash=hash_password("Spa@123"),
            role=UserRole.MANAGER,
            business_context="SPA",
            is_active=True,
        )
        cls.db.add(cls.spa_user)

        # Seed Restaurant Staff (Staff role - should be rejected by Manager-only APIs)
        cls.staff_user = User(
            full_name="Floor Staff Fixture",
            email="staff.user.fixture@dineflow.com",
            password_hash=hash_password("Staff@123"),
            role=UserRole.STAFF,
            business_context="RESTAURANT",
            is_active=True,
        )
        cls.db.add(cls.staff_user)

        # Seed Restaurant Table and Customer for Order Integration Tests
        cls.table = RestaurantTable(
            table_number="T-INV-1",
            capacity=4,
            status=TableStatus.AVAILABLE,
            is_active=True,
        )
        cls.db.add(cls.table)

        cls.customer = Customer(
            full_name="Inventory Test Guest",
            phone="9876543210",
            email="testguest@dineflow.com",
        )
        cls.db.add(cls.customer)

        # Seed Menu Category & Menu Item
        cls.menu_category = MenuCategory(
            name="Main Course Special",
            description="Special dishes",
            is_active=True,
        )
        cls.db.add(cls.menu_category)
        cls.db.flush()

        cls.dish_paneer = MenuItem(
            category_id=cls.menu_category.id,
            name="Test Paneer Masala",
            description="Cottage cheese curry",
            price=Decimal("350.00"),
            is_available=True,
        )
        cls.dish_biryani = MenuItem(
            category_id=cls.menu_category.id,
            name="Test Veg Biryani",
            description="Rice dish",
            price=Decimal("280.00"),
            is_available=True,
        )
        cls.db.add_all([cls.dish_paneer, cls.dish_biryani])

        cls.db.commit()

        # Auth Headers
        manager_token = create_access_token(data={"sub": str(cls.manager_user.id)})
        cls.manager_headers = {"Authorization": f"Bearer {manager_token}"}

        spa_token = create_access_token(data={"sub": str(cls.spa_user.id)})
        cls.spa_headers = {"Authorization": f"Bearer {spa_token}"}

        staff_token = create_access_token(data={"sub": str(cls.staff_user.id)})
        cls.staff_headers = {"Authorization": f"Bearer {staff_token}"}

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        app.dependency_overrides.clear()

    # ==========================================
    # 1. CATEGORY & ITEM MASTER CRUD TESTS
    # ==========================================

    def test_01_category_crud(self):
        # Create Category
        res = self.client.post(
            "/api/inventory/categories",
            json={"name": "Dairy & Milk", "description": "Dairy products"},
            headers=self.manager_headers,
        )
        self.assertEqual(res.status_code, 201)
        cat_id = res.json()["id"]

        # Duplicate Name Rejection
        dup = self.client.post(
            "/api/inventory/categories",
            json={"name": "Dairy & Milk"},
            headers=self.manager_headers,
        )
        self.assertEqual(dup.status_code, 409)

        # List Categories
        list_res = self.client.get("/api/inventory/categories", headers=self.manager_headers)
        self.assertEqual(list_res.status_code, 200)
        self.assertTrue(any(c["id"] == cat_id for c in list_res.json()))

        # Update Category
        update_res = self.client.patch(
            f"/api/inventory/categories/{cat_id}",
            json={"description": "Fresh Dairy and Milk"},
            headers=self.manager_headers,
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["description"], "Fresh Dairy and Milk")

    def test_02_item_crud_and_opening_stock(self):
        # Get category
        cat = self.db.query(InventoryCategory).first()

        # Create Item with opening stock
        payload = {
            "category_id": cat.id,
            "name": "Fresh Paneer",
            "sku": "SKU-PAN-001",
            "base_unit": "g",
            "reorder_level": 500.0,
            "opening_stock": 2000.0,
            "opening_unit_cost": 0.35,  # 35 paise per gram = 350 per kg
        }
        res = self.client.post("/api/inventory/items", json=payload, headers=self.manager_headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        item_id = data["id"]
        self.assertEqual(float(data["current_stock"]), 2000.0)
        self.assertEqual(data["stock_status"], "IN_STOCK")

        # Duplicate Opening Stock Rejection
        dup_open = self.client.post(
            f"/api/inventory/items/{item_id}/opening-stock",
            json={"quantity": 100.0, "unit_cost": 0.35},
            headers=self.manager_headers,
        )
        self.assertEqual(dup_open.status_code, 400)

        # Update Item details
        patch_res = self.client.patch(
            f"/api/inventory/items/{item_id}",
            json={"reorder_level": 600.0},
            headers=self.manager_headers,
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(float(patch_res.json()["reorder_level"]), 600.0)

        # Verify Movements Logged
        mov_res = self.client.get(f"/api/inventory/items/{item_id}/movements", headers=self.manager_headers)
        self.assertEqual(mov_res.status_code, 200)
        movements = mov_res.json()
        self.assertEqual(len(movements), 1)
        self.assertEqual(movements[0]["movement_type"], "OPENING_STOCK")
        self.assertEqual(float(movements[0]["quantity"]), 2000.0)

    # ==========================================
    # 2. SUPPLIER & PURCHASING TESTS
    # ==========================================

    def test_03_supplier_and_purchase_order_flow(self):
        # 1. Create Supplier
        sup_res = self.client.post(
            "/api/inventory/suppliers",
            json={
                "name": "Apex Dairy Farms",
                "contact_person": "Sunil Kumar",
                "phone": "9812345678",
                "email": "sunil@apexdairy.com",
                "gstin": "27AAAAA0000A1Z5",
            },
            headers=self.manager_headers,
        )
        self.assertEqual(sup_res.status_code, 201)
        supplier_id = sup_res.json()["id"]

        # 2. Link Item to Supplier
        item = self.db.query(InventoryItem).filter(InventoryItem.name == "Fresh Paneer").first()
        link_res = self.client.post(
            f"/api/inventory/suppliers/{supplier_id}/items",
            json={
                "inventory_item_id": item.id,
                "supplier_sku": "APEX-PAN-1",
                "last_purchase_price": 0.34,
                "lead_time_days": 1,
                "is_preferred": True,
            },
            headers=self.manager_headers,
        )
        self.assertEqual(link_res.status_code, 201)

        # 3. Create Purchase Order (Draft)
        po_payload = {
            "supplier_id": supplier_id,
            "order_date": str(date.today()),
            "expected_delivery_date": str(date.today() + timedelta(days=2)),
            "tax_amount": 50.0,
            "items": [
                {
                    "inventory_item_id": item.id,
                    "ordered_quantity": 1000.0,
                    "unit_price": 0.40,
                }
            ],
        }
        po_res = self.client.post("/api/inventory/purchase-orders", json=po_payload, headers=self.manager_headers)
        self.assertEqual(po_res.status_code, 201)
        po_data = po_res.json()
        po_id = po_data["id"]
        po_item_id = po_data["items"][0]["id"]
        self.assertEqual(po_data["status"], "Draft")

        # 4. Transition PO to Ordered
        status_res = self.client.patch(
            f"/api/inventory/purchase-orders/{po_id}/status",
            json={"status": "Ordered"},
            headers=self.manager_headers,
        )
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["status"], "Ordered")

        # 5. Process Partial Goods Receipt (500g received @ 0.40)
        grn_payload = {
            "received_date": str(date.today()),
            "supplier_bill_number": "INV-APEX-9981",
            "items": [
                {
                    "po_item_id": po_item_id,
                    "received_quantity": 500.0,
                    "unit_cost": 0.40,
                }
            ],
        }
        grn_res = self.client.post(
            f"/api/inventory/purchase-orders/{po_id}/receive",
            json=grn_payload,
            headers=self.manager_headers,
        )
        self.assertEqual(grn_res.status_code, 201)

        # Verify PO status became Partially Received
        po_check = self.client.get(f"/api/inventory/purchase-orders/{po_id}", headers=self.manager_headers).json()
        self.assertEqual(po_check["status"], "Partially Received")

        # Verify item stock increased (2000 + 500 = 2500)
        item_check = self.client.get(f"/api/inventory/items/{item.id}", headers=self.manager_headers).json()
        self.assertEqual(float(item_check["current_stock"]), 2500.0)

        # 6. Complete remaining Goods Receipt (500g received @ 0.40)
        grn_payload2 = {
            "received_date": str(date.today()),
            "supplier_bill_number": "INV-APEX-9982",
            "items": [
                {
                    "po_item_id": po_item_id,
                    "received_quantity": 500.0,
                    "unit_cost": 0.40,
                }
            ],
        }
        grn_res2 = self.client.post(
            f"/api/inventory/purchase-orders/{po_id}/receive",
            json=grn_payload2,
            headers=self.manager_headers,
        )
        self.assertEqual(grn_res2.status_code, 201)

        # Verify PO status is now Received (fully fulfilled)
        po_check2 = self.client.get(f"/api/inventory/purchase-orders/{po_id}", headers=self.manager_headers).json()
        self.assertEqual(po_check2["status"], "Received")
        self.assertEqual(float(po_check2["items"][0]["remaining_quantity"]), 0.0)

    # ==========================================
    # 3. RECIPES & ORDER DEDUCTION / REVERSAL TESTS
    # ==========================================

    def test_04_recipe_creation_and_order_deduction_and_reversal(self):
        # 1. Create extra ingredients for recipe: Butter and Gravy Base
        cat = self.db.query(InventoryCategory).first()
        res_butter = self.client.post(
            "/api/inventory/items",
            json={
                "category_id": cat.id,
                "name": "Cooking Butter",
                "base_unit": "g",
                "opening_stock": 500.0,
                "opening_unit_cost": 0.50,
            },
            headers=self.manager_headers,
        )
        butter_id = res_butter.json()["id"]

        paneer_item = self.db.query(InventoryItem).filter(InventoryItem.name == "Fresh Paneer").first()

        # 2. Configure Recipe for Paneer Butter Masala
        # Recipe: 150g Paneer + 50g Butter
        recipe_payload = {
            "yield_servings": 1,
            "preparation_notes": "Standard restaurant prep",
            "items": [
                {"inventory_item_id": paneer_item.id, "quantity": 150.0},
                {"inventory_item_id": butter_id, "quantity": 50.0},
            ],
        }
        rec_res = self.client.put(
            f"/api/inventory/recipes/menu/{self.dish_paneer.id}",
            json=recipe_payload,
            headers=self.manager_headers,
        )
        self.assertEqual(rec_res.status_code, 200)
        rec_data = rec_res.json()
        self.assertEqual(len(rec_data["items"]), 2)
        self.assertGreater(float(rec_data["total_estimated_cost"]), 0.0)

        # 3. Check Live Availability endpoint for the dish
        avail_res = self.client.get(
            f"/api/inventory/menu/{self.dish_paneer.id}/availability",
            headers=self.manager_headers,
        )
        self.assertEqual(avail_res.status_code, 200)
        self.assertEqual(avail_res.json()["inventory_status"], "IN_STOCK")

        # Current stock before order: Paneer = 3000g, Butter = 500g
        initial_paneer = float(self.client.get(f"/api/inventory/items/{paneer_item.id}", headers=self.manager_headers).json()["current_stock"])
        initial_butter = float(self.client.get(f"/api/inventory/items/{butter_id}", headers=self.manager_headers).json()["current_stock"])

        # 4. Create Order with 2x Test Paneer Masala
        order_payload = {
            "customer_id": self.customer.id,
            "table_id": self.table.id,
            "items": [{"menu_item_id": self.dish_paneer.id, "quantity": 2}],
        }
        order_res = self.client.post("/api/orders/", json=order_payload, headers=self.manager_headers)
        self.assertEqual(order_res.status_code, 201)
        order_id = order_res.json()["id"]

        # In 'Pending': Stock must NOT be deducted
        paneer_during_pending = float(self.client.get(f"/api/inventory/items/{paneer_item.id}", headers=self.manager_headers).json()["current_stock"])
        self.assertEqual(paneer_during_pending, initial_paneer)

        # Transition to 'Confirmed': Stock must NOT be deducted
        conf_res = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Confirmed"},
            headers=self.manager_headers,
        )
        self.assertEqual(conf_res.status_code, 200)
        paneer_during_conf = float(self.client.get(f"/api/inventory/items/{paneer_item.id}", headers=self.manager_headers).json()["current_stock"])
        self.assertEqual(paneer_during_conf, initial_paneer)

        # 5. Transition to 'Preparing': ATOMIC DEDUCTION MUST OCCUR
        # Order contains 2 servings -> Needs 300g Paneer + 100g Butter
        prep_res = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Preparing"},
            headers=self.manager_headers,
        )
        self.assertEqual(prep_res.status_code, 200)

        # Verify stock was deducted exactly
        paneer_after_prep = float(self.client.get(f"/api/inventory/items/{paneer_item.id}", headers=self.manager_headers).json()["current_stock"])
        butter_after_prep = float(self.client.get(f"/api/inventory/items/{butter_id}", headers=self.manager_headers).json()["current_stock"])
        self.assertEqual(paneer_after_prep, initial_paneer - 300.0)
        self.assertEqual(butter_after_prep, initial_butter - 100.0)

        # 6. Duplicate Deduction Prevention (Idempotency)
        # Calling deduction again directly must not double deduct
        order_obj = self.db.query(Order).filter(Order.id == order_id).first()
        dup_movements = deduct_inventory_for_order(self.db, order_obj, self.manager_user.id)
        self.assertEqual(len(dup_movements), 0)

        # 7. Cancellation Reversal: Cancel the order after preparing
        cancel_res = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Cancelled", "note": "Customer cancelled after food prep started"},
            headers=self.manager_headers,
        )
        self.assertEqual(cancel_res.status_code, 200)

        # Verify stock was restored to initial levels
        paneer_after_cancel = float(self.client.get(f"/api/inventory/items/{paneer_item.id}", headers=self.manager_headers).json()["current_stock"])
        butter_after_cancel = float(self.client.get(f"/api/inventory/items/{butter_id}", headers=self.manager_headers).json()["current_stock"])
        self.assertEqual(paneer_after_cancel, initial_paneer)
        self.assertEqual(butter_after_cancel, initial_butter)

    def test_05_insufficient_stock_rejection(self):
        # Create an ingredient with very low stock (e.g. 50g)
        cat = self.db.query(InventoryCategory).first()
        res_truffle = self.client.post(
            "/api/inventory/items",
            json={
                "category_id": cat.id,
                "name": "Black Truffle Oil",
                "base_unit": "ml",
                "opening_stock": 20.0,
                "opening_unit_cost": 5.0,
            },
            headers=self.manager_headers,
        )
        truffle_id = res_truffle.json()["id"]

        # Link to Biryani recipe: requires 50ml Truffle Oil
        self.client.put(
            f"/api/inventory/recipes/menu/{self.dish_biryani.id}",
            json={
                "yield_servings": 1,
                "items": [{"inventory_item_id": truffle_id, "quantity": 50.0}],
            },
            headers=self.manager_headers,
        )

        # Create Order for Biryani
        order_res = self.client.post(
            "/api/orders/",
            json={
                "customer_id": self.customer.id,
                "table_id": self.table.id,
                "items": [{"menu_item_id": self.dish_biryani.id, "quantity": 1}],
            },
            headers=self.manager_headers,
        )
        order_id = order_res.json()["id"]

        # Attempt to transition to 'Preparing': MUST BE REJECTED (400)
        prep_fail = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "Preparing"},
            headers=self.manager_headers,
        )
        self.assertEqual(prep_fail.status_code, 400)
        err = prep_fail.json()
        self.assertIn("INSUFFICIENT_STOCK", str(err))

    # ==========================================
    # 4. WASTAGE, ADJUSTMENT & STOCK COUNT TESTS
    # ==========================================

    def test_06_wastage_and_adjustments(self):
        paneer_item_id = self.db.query(InventoryItem.id).filter(InventoryItem.name == "Fresh Paneer").scalar()
        item_before = self.client.get(f"/api/inventory/items/{paneer_item_id}", headers=self.manager_headers).json()
        stock_before = float(item_before["current_stock"])

        # Record Wastage (100g spoiled)
        waste_res = self.client.post(
            "/api/inventory/wastage",
            json={
                "inventory_item_id": paneer_item_id,
                "quantity": 100.0,
                "reason": "SPOILAGE",
                "explanation": "Fridge temperature fluctuation over weekend",
            },
            headers=self.manager_headers,
        )
        self.assertEqual(waste_res.status_code, 201)

        # Verify stock deducted
        item_after_waste = float(self.client.get(f"/api/inventory/items/{paneer_item_id}", headers=self.manager_headers).json()["current_stock"])
        self.assertEqual(item_after_waste, stock_before - 100.0)

        # Record Positive Adjustment (+50g calibration)
        adj_res = self.client.post(
            "/api/inventory/adjustments",
            json={
                "inventory_item_id": paneer_item_id,
                "quantity": 50.0,
                "reason": "Scale calibration discrepancy",
            },
            headers=self.manager_headers,
        )
        self.assertEqual(adj_res.status_code, 201)

        # Verify stock adjusted
        item_after_adj = float(self.client.get(f"/api/inventory/items/{paneer_item_id}", headers=self.manager_headers).json()["current_stock"])
        self.assertEqual(item_after_adj, item_after_waste + 50.0)

    def test_07_physical_stock_count_workflow(self):
        # 1. Start Audit Session
        start_res = self.client.post(
            "/api/inventory/stock-counts",
            json={"count_date": str(date.today()), "notes": "Weekly Physical Inventory Audit"},
            headers=self.manager_headers,
        )
        self.assertEqual(start_res.status_code, 201)
        count_data = start_res.json()
        count_id = count_data["id"]
        self.assertEqual(count_data["status"], "Draft")

        # Pick item to record variance
        paneer_item_id = self.db.query(InventoryItem.id).filter(InventoryItem.name == "Fresh Paneer").scalar()
        item_before = self.client.get(f"/api/inventory/items/{paneer_item_id}", headers=self.manager_headers).json()
        system_qty = float(item_before["current_stock"])
        counted_qty = system_qty - 50.0  # Physical count found 50g less

        # 2. Submit Physical Count
        submit_payload = {
            "counts": [
                {
                    "inventory_item_id": paneer_item_id,
                    "counted_quantity": counted_qty,
                }
            ]
        }
        submit_res = self.client.post(
            f"/api/inventory/stock-counts/{count_id}/submit",
            json=submit_payload,
            headers=self.manager_headers,
        )
        self.assertEqual(submit_res.status_code, 200)
        self.assertEqual(submit_res.json()["status"], "Submitted")

        # Stock must NOT be modified yet upon submission
        stock_during_submit = float(self.client.get(f"/api/inventory/items/{paneer_item_id}", headers=self.manager_headers).json()["current_stock"])
        self.assertEqual(stock_during_submit, system_qty)

        # 3. Approve Audit Session
        approve_res = self.client.post(
            f"/api/inventory/stock-counts/{count_id}/approve",
            headers=self.manager_headers,
        )
        self.assertEqual(approve_res.status_code, 200)
        self.assertEqual(approve_res.json()["status"], "Approved")

        # Stock MUST be updated after approval
        stock_after_approve = float(self.client.get(f"/api/inventory/items/{paneer_item_id}", headers=self.manager_headers).json()["current_stock"])
        self.assertEqual(stock_after_approve, counted_qty)

        # Duplicate approval rejection
        dup_approve = self.client.post(
            f"/api/inventory/stock-counts/{count_id}/approve",
            headers=self.manager_headers,
        )
        self.assertEqual(dup_approve.status_code, 400)

    # ==========================================
    # 5. REPORTS & RECONCILIATION TESTS
    # ==========================================

    def test_08_reports_and_reconciliation(self):
        # 1. Valuation Report
        val_res = self.client.get("/api/inventory/reports/stock-valuation", headers=self.manager_headers)
        self.assertEqual(val_res.status_code, 200)
        self.assertGreater(float(val_res.json()["total_valuation"]), 0.0)

        # 2. Consumption Report
        cons_res = self.client.get("/api/inventory/reports/consumption?preset=all", headers=self.manager_headers)
        self.assertEqual(cons_res.status_code, 200)

        # 3. Wastage Report
        waste_res = self.client.get("/api/inventory/reports/wastage?preset=all", headers=self.manager_headers)
        self.assertEqual(waste_res.status_code, 200)

        # 4. Food Cost Report
        cost_res = self.client.get("/api/inventory/reports/food-cost", headers=self.manager_headers)
        self.assertEqual(cost_res.status_code, 200)

        # 5. Ledger-to-Stock Reconciliation
        rec_res = self.client.get("/api/inventory/reports/reconciliation", headers=self.manager_headers)
        self.assertEqual(rec_res.status_code, 200)
        rec_data = rec_res.json()
        self.assertEqual(rec_data["discrepancy_count"], 0)

    # ==========================================
    # 6. SECURITY & CROSS-CONTEXT ISOLATION
    # ==========================================

    def test_09_security_and_context_isolation(self):
        # 1. Unauthenticated Request -> 401
        res_unauth = self.client.get("/api/inventory/items")
        self.assertEqual(res_unauth.status_code, 401)

        # 2. Staff User (Role: STAFF) -> 403 Forbidden
        res_staff = self.client.get("/api/inventory/items", headers=self.staff_headers)
        self.assertEqual(res_staff.status_code, 403)

        # 3. Spa User (Context: SPA) -> 403 Forbidden (Cross-context isolation)
        res_spa = self.client.get("/api/inventory/items", headers=self.spa_headers)
        self.assertEqual(res_spa.status_code, 403)

        # 4. Valid Restaurant Manager -> 200 OK
        res_manager = self.client.get("/api/inventory/items", headers=self.manager_headers)
        self.assertEqual(res_manager.status_code, 200)


if __name__ == "__main__":
    unittest.main()
