from __future__ import annotations

import os
import sys
import unittest
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.entities import User, UserRole
from app.models.inventory import (
    InventoryCategory,
    InventoryItem,
    MovementType,
    StockMovement,
    Supplier,
    StockCount,
    StockCountStatus,
    PurchaseOrder,
    PurchaseOrderItem,
    POStatus,
    GoodsReceipt,
    GoodsReceiptItem,
)

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


class TestInventoryCRUDEnhancements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=test_engine)
        cls.client = TestClient(app)
        cls.db = TestingSessionLocal()

        cls.manager = User(
            full_name="Inventory Test Manager",
            email="inv.mgr.enhancements@dineflow.com",
            password_hash=hash_password("Manager@123"),
            role=UserRole.MANAGER,
            business_context="RESTAURANT",
            is_active=True,
        )
        cls.db.add(cls.manager)
        cls.db.commit()

        token = create_access_token(data={"sub": str(cls.manager.id)})
        cls.headers = {"Authorization": f"Bearer {token}"}

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        app.dependency_overrides.clear()

    def test_01_item_eligibility_and_safe_delete(self):
        cat = InventoryCategory(name="Produce Cat", is_active=True)
        self.db.add(cat)
        self.db.commit()

        clean_item = InventoryItem(
            category_id=cat.id,
            name="Clean Ingredient Zero Dependencies",
            sku="CLN-ING-01",
            base_unit="g",
            current_stock=Decimal("0.0000"),
            reorder_level=Decimal("10.0000"),
            average_cost=Decimal("1.5000"),
            is_active=True,
            created_by_user_id=self.manager.id,
        )
        dep_item = InventoryItem(
            category_id=cat.id,
            name="Dependent Ingredient With History",
            sku="DEP-ING-01",
            base_unit="kg",
            current_stock=Decimal("15.0000"),
            reorder_level=Decimal("5.0000"),
            average_cost=Decimal("250.0000"),
            is_active=True,
            created_by_user_id=self.manager.id,
        )
        self.db.add_all([clean_item, dep_item])
        self.db.commit()

        # Add movement for dep_item
        mov = StockMovement(
            inventory_item_id=dep_item.id,
            movement_type=MovementType.OPENING_STOCK,
            quantity=Decimal("15.0000"),
            unit_cost=Decimal("250.0000"),
            balance_after=Decimal("15.0000"),
            reference_type="OPENING",
            reference_id=1,
            created_by_user_id=self.manager.id,
        )
        self.db.add(mov)
        self.db.commit()

        # 1. Check clean item eligibility
        res_clean = self.client.get(f"/api/inventory/items/{clean_item.id}/eligibility", headers=self.headers)
        self.assertEqual(res_clean.status_code, 200)
        self.assertTrue(res_clean.json()["can_delete"])
        self.assertEqual(len(res_clean.json()["reasons"]), 0)

        # 2. Check dependent item eligibility
        res_dep = self.client.get(f"/api/inventory/items/{dep_item.id}/eligibility", headers=self.headers)
        self.assertEqual(res_dep.status_code, 200)
        self.assertFalse(res_dep.json()["can_delete"])
        self.assertGreaterEqual(len(res_dep.json()["reasons"]), 1)

        # 3. Attempt DELETE on dependent item -> 409 Conflict
        del_dep = self.client.delete(f"/api/inventory/items/{dep_item.id}", headers=self.headers)
        self.assertEqual(del_dep.status_code, 409)

        # 4. Attempt DELETE on clean item -> 200 OK
        del_clean = self.client.delete(f"/api/inventory/items/{clean_item.id}", headers=self.headers)
        self.assertEqual(del_clean.status_code, 200)

    def test_02_item_archive_and_bulk_check(self):
        dep_item = self.db.query(InventoryItem).filter(InventoryItem.name == "Dependent Ingredient With History").first()
        self.assertIsNotNone(dep_item)

        # Archive item
        res_arch = self.client.post(
            f"/api/inventory/items/{dep_item.id}/archive",
            json={"reason": "Discontinued seasonal menu"},
            headers=self.headers,
        )
        self.assertEqual(res_arch.status_code, 200)
        self.assertTrue(res_arch.json()["is_archived"])
        self.assertEqual(res_arch.json()["archive_reason"], "Discontinued seasonal menu")

        # Unarchive item
        res_unarch = self.client.post(f"/api/inventory/items/{dep_item.id}/unarchive", headers=self.headers)
        self.assertEqual(res_unarch.status_code, 200)
        self.assertFalse(res_unarch.json()["is_archived"])

        # Bulk check
        bulk_check = self.client.post(
            "/api/inventory/items/bulk-check",
            json={"item_ids": [dep_item.id]},
            headers=self.headers,
        )
        self.assertEqual(bulk_check.status_code, 200)
        data = bulk_check.json()
        self.assertEqual(data["total_selected"], 1)
        self.assertEqual(len(data["require_archiving"]), 1)
        self.assertEqual(len(data["eligible_for_deletion"]), 0)

    def test_03_movement_bulk_archive_protects_immutable_sales(self):
        dep_item = self.db.query(InventoryItem).filter(InventoryItem.name == "Dependent Ingredient With History").first()

        m_waste = StockMovement(
            inventory_item_id=dep_item.id,
            movement_type=MovementType.WASTAGE,
            quantity=Decimal("-2.0000"),
            unit_cost=Decimal("250.0000"),
            balance_after=Decimal("13.0000"),
            reference_type="WASTAGE",
            reference_id=0,
            created_by_user_id=self.manager.id,
        )
        m_sale = StockMovement(
            inventory_item_id=dep_item.id,
            movement_type=MovementType.SALE_CONSUMPTION,
            quantity=Decimal("-1.0000"),
            unit_cost=Decimal("250.0000"),
            balance_after=Decimal("12.0000"),
            reference_type="ORDER",
            reference_id=10,
            created_by_user_id=self.manager.id,
        )
        self.db.add_all([m_waste, m_sale])
        self.db.commit()

        page = self.client.get(
            "/api/inventory/movements?preset=all&page=1&page_size=1&search=Dependent",
            headers=self.headers,
        )
        self.assertEqual(page.status_code, 200)
        page_data = page.json()
        self.assertEqual(page_data["total"], 3)  # opening + wastage + sale
        self.assertEqual(page_data["page"], 1)
        self.assertEqual(page_data["page_size"], 1)
        self.assertEqual(len(page_data["items"]), 1)

        before_stock = dep_item.current_stock
        res = self.client.post(
            "/api/inventory/movements/bulk-archive",
            json={"movement_ids": [m_waste.id, m_sale.id], "reason": "Test audit cleanup"},
            headers=self.headers,
        )
        self.assertEqual(res.status_code, 409)
        self.db.refresh(m_waste)
        self.db.refresh(m_sale)
        self.db.refresh(dep_item)
        self.assertFalse(m_waste.is_archived)
        self.assertFalse(m_sale.is_archived)
        self.assertEqual(dep_item.current_stock, before_stock)

        valid = self.client.post(
            "/api/inventory/movements/bulk-archive",
            json={"movement_ids": [m_waste.id], "reason": "Test audit cleanup"},
            headers=self.headers,
        )
        self.assertEqual(valid.status_code, 200)
        self.assertEqual(valid.json()["archived_count"], 1)

    def test_06_manual_movement_reversal_is_reasoned_and_idempotent(self):
        dep_item = self.db.query(InventoryItem).filter(InventoryItem.name == "Dependent Ingredient With History").first()
        original = StockMovement(
            inventory_item_id=dep_item.id,
            movement_type=MovementType.ADJUSTMENT,
            quantity=Decimal("-1.0000"),
            unit_cost=Decimal("250.0000"),
            balance_after=Decimal("11.0000"),
            reference_type="ADJUSTMENT",
            reference_id=0,
            created_by_user_id=self.manager.id,
        )
        self.db.add(original)
        self.db.commit()

        missing_reason = self.client.post(
            f"/api/inventory/movements/{original.id}/reverse", json={"reason": "   "}, headers=self.headers
        )
        self.assertEqual(missing_reason.status_code, 400)

        reversed_response = self.client.post(
            f"/api/inventory/movements/{original.id}/reverse",
            json={"reason": "Corrected entry"},
            headers=self.headers,
        )
        self.assertEqual(reversed_response.status_code, 200)
        reversal = reversed_response.json()
        self.assertEqual(reversal["reference_type"], "REVERSAL")
        self.assertEqual(reversal["reference_id"], original.id)
        self.assertEqual(Decimal(reversal["quantity"]), Decimal("1.0000"))

        duplicate = self.client.post(
            f"/api/inventory/movements/{original.id}/reverse",
            json={"reason": "Second attempt"},
            headers=self.headers,
        )
        self.assertEqual(duplicate.status_code, 409)

    def test_07_system_adjustment_cannot_be_archived_or_reversed(self):
        dep_item = self.db.query(InventoryItem).filter(InventoryItem.name == "Dependent Ingredient With History").first()
        system_adjustment = StockMovement(
            inventory_item_id=dep_item.id,
            movement_type=MovementType.ADJUSTMENT,
            quantity=Decimal("1.0000"),
            unit_cost=Decimal("250.0000"),
            balance_after=Decimal("13.0000"),
            reference_type="STOCK_COUNT",
            reference_id=77,
            created_by_user_id=self.manager.id,
        )
        self.db.add(system_adjustment)
        self.db.commit()

        archived = self.client.post(
            "/api/inventory/movements/bulk-archive",
            json={"movement_ids": [system_adjustment.id], "reason": "No"},
            headers=self.headers,
        )
        self.assertEqual(archived.status_code, 409)
        reversed_response = self.client.post(
            f"/api/inventory/movements/{system_adjustment.id}/reverse",
            json={"reason": "Nope"},
            headers=self.headers,
        )
        self.assertEqual(reversed_response.status_code, 409)

    def test_04_stock_count_delete_draft_safety(self):
        draft_count = StockCount(
            count_number="STK-2026-TEST1",
            count_date=date.today(),
            status=StockCountStatus.DRAFT,
            conducted_by_user_id=self.manager.id,
        )
        approved_count = StockCount(
            count_number="STK-2026-TEST2",
            count_date=date.today(),
            status=StockCountStatus.APPROVED,
            conducted_by_user_id=self.manager.id,
        )
        self.db.add_all([draft_count, approved_count])
        self.db.commit()

        # Approved count deletion -> 400 Bad Request
        res_app = self.client.delete(f"/api/inventory/stock-counts/{approved_count.id}", headers=self.headers)
        self.assertEqual(res_app.status_code, 400)

        # Draft count deletion -> 200 OK
        res_draft = self.client.delete(f"/api/inventory/stock-counts/{draft_count.id}", headers=self.headers)
        self.assertEqual(res_draft.status_code, 200)

    def test_05_goods_receipt_update_and_reversal(self):
        # 1. Setup supplier and item
        sup = Supplier(name="Test Reversal Supplier", phone="9876543210", is_active=True, created_by_user_id=self.manager.id)
        self.db.add(sup)
        self.db.commit()

        cat = self.db.query(InventoryCategory).first()
        item = InventoryItem(
            category_id=cat.id,
            name="Item For GRN Reversal",
            sku="REV-ING-01",
            base_unit="kg",
            current_stock=Decimal("10.0000"),
            reorder_level=Decimal("2.0000"),
            average_cost=Decimal("100.0000"),
            is_active=True,
            created_by_user_id=self.manager.id,
        )
        self.db.add(item)
        self.db.commit()

        # 2. Setup PO and GRN
        po = PurchaseOrder(
            supplier_id=sup.id,
            order_date=date.today(),
            status=POStatus.RECEIVED,
            subtotal=Decimal("1000.00"),
            total_amount=Decimal("1000.00"),
            created_by_user_id=self.manager.id,
        )
        self.db.add(po)
        self.db.commit()

        po_item = PurchaseOrderItem(
            po_id=po.id,
            inventory_item_id=item.id,
            ordered_quantity=Decimal("10.0000"),
            received_quantity=Decimal("10.0000"),
            unit_price=Decimal("100.0000"),
            line_total=Decimal("1000.00"),
        )
        self.db.add(po_item)
        self.db.commit()

        grn = GoodsReceipt(
            po_id=po.id,
            supplier_bill_number="BILL-REV-01",
            bill_date=date.today(),
            received_date=date.today(),
            total_received_amount=Decimal("1000.00"),
            received_by_user_id=self.manager.id,
        )
        self.db.add(grn)
        self.db.commit()

        grn_item = GoodsReceiptItem(
            goods_receipt_id=grn.id,
            po_item_id=po_item.id,
            inventory_item_id=item.id,
            received_quantity=Decimal("10.0000"),
            unit_cost=Decimal("100.0000"),
            line_total=Decimal("1000.00"),
        )
        self.db.add(grn_item)
        self.db.commit()

        # 3. Test PATCH /goods-receipts/{grn.id} (metadata update)
        patch_res = self.client.patch(
            f"/api/inventory/goods-receipts/{grn.id}",
            json={"supplier_bill_number": "BILL-UPDATED-99", "notes": "Updated delivery note"},
            headers=self.headers,
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["supplier_bill_number"], "BILL-UPDATED-99")
        self.assertEqual(patch_res.json()["notes"], "Updated delivery note")

        # 4. Test POST /goods-receipts/{grn.id}/reverse (controlled reversal)
        rev_res = self.client.post(
            f"/api/inventory/goods-receipts/{grn.id}/reverse",
            json={"reason": "Damaged batch returned to vendor"},
            headers=self.headers,
        )
        self.assertEqual(rev_res.status_code, 200)
        grn_data = rev_res.json()
        self.assertTrue(grn_data["is_reversed"])
        self.assertEqual(grn_data["reversal_reason"], "Damaged batch returned to vendor")

        # Verify stock was deducted
        self.db.refresh(item)
        self.assertEqual(item.current_stock, Decimal("0.0000"))

        # Verify PO was reverted to ORDERED
        self.db.refresh(po)
        self.assertEqual(po.status, POStatus.ORDERED)

        # 5. Attempt second reversal -> 400
        second_rev = self.client.post(
            f"/api/inventory/goods-receipts/{grn.id}/reverse",
            json={"reason": "Second attempt"},
            headers=self.headers,
        )
        self.assertEqual(second_rev.status_code, 400)


if __name__ == "__main__":
    unittest.main()
