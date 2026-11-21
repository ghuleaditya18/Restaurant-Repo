import sys
from decimal import Decimal

from app.db.session import SessionLocal
from app.models.entities import MenuItem, User, UserRole
from app.models.inventory import (
    InventoryCategory,
    InventoryItem,
    Supplier,
    SupplierItem,
    Recipe,
    RecipeItem,
    StockMovement,
    MovementType,
)


def seed_inventory_data():
    db = SessionLocal()
    try:
        print("Starting Inventory Seed...")

        # Find manager user for created_by_user_id
        manager = db.query(User).filter(User.role == UserRole.MANAGER, User.business_context == "RESTAURANT").first()
        if not manager:
            manager = db.query(User).filter(User.business_context == "RESTAURANT").first()
        manager_id = manager.id if manager else 1
        print(f"Using Manager User ID: {manager_id}")

        # Check existing categories and clean up prior inventory data if necessary
        existing_cats = db.query(InventoryCategory).all()
        if existing_cats:
            print(f"Existing categories found: {len(existing_cats)}. Resetting inventory tables...")
            db.query(StockMovement).delete()
            db.query(RecipeItem).delete()
            db.query(Recipe).delete()
            db.query(SupplierItem).delete()
            db.query(Supplier).delete()
            db.query(InventoryItem).delete()
            db.query(InventoryCategory).delete()
            db.commit()
            print("Previous inventory data cleared cleanly.")

        # ---------------------------------------------------------
        # 1. CATEGORIES (4 Categories)
        # ---------------------------------------------------------
        categories_data = [
            {
                "name": "Fresh Produce & Vegetables",
                "description": "Farm-fresh vegetables, leafy greens, aromatics, and culinary root produce.",
            },
            {
                "name": "Dairy & Creamery",
                "description": "Pasteurized milk, farm butter, fresh malai paneer, curd, cheeses, and heavy cream.",
            },
            {
                "name": "Spices, Condiments & Oils",
                "description": "Authentic Indian ground spices, whole aromatics, culinary seasonings, and cooking oils.",
            },
            {
                "name": "Beverages & Packaging",
                "description": "Premium tea blends, filter coffee, beverage concentrates, takeout containers, and eco-bags.",
            },
        ]

        created_categories = {}
        for cat_info in categories_data:
            cat = InventoryCategory(
                name=cat_info["name"],
                description=cat_info["description"],
                is_active=True,
            )
            db.add(cat)
            db.flush()
            created_categories[cat.name] = cat
            print(f"Created Category: {cat.name} (ID: {cat.id})")

        # ---------------------------------------------------------
        # 2. ITEMS (5 Items per category = 20 total)
        # ---------------------------------------------------------
        items_data = [
            # Category 1: Fresh Produce & Vegetables
            {
                "category": "Fresh Produce & Vegetables",
                "sku": "VEG-ONION-01",
                "name": "Red Onions (Nashik)",
                "base_unit": "kg",
                "current_stock": Decimal("45.0000"),
                "reorder_level": Decimal("15.0000"),
                "average_cost": Decimal("32.5000"),
            },
            {
                "category": "Fresh Produce & Vegetables",
                "sku": "VEG-TOMATO-02",
                "name": "Hybrid Tomatoes (Ripe)",
                "base_unit": "kg",
                "current_stock": Decimal("32.0000"),
                "reorder_level": Decimal("10.0000"),
                "average_cost": Decimal("38.0000"),
            },
            {
                "category": "Fresh Produce & Vegetables",
                "sku": "VEG-GINGER-03",
                "name": "Fresh Ginger Root",
                "base_unit": "kg",
                "current_stock": Decimal("8.5000"),
                "reorder_level": Decimal("3.0000"),
                "average_cost": Decimal("120.0000"),
            },
            {
                "category": "Fresh Produce & Vegetables",
                "sku": "VEG-GARLIC-04",
                "name": "Peeled Garlic Cloves",
                "base_unit": "kg",
                "current_stock": Decimal("12.0000"),
                "reorder_level": Decimal("4.0000"),
                "average_cost": Decimal("165.0000"),
            },
            {
                "category": "Fresh Produce & Vegetables",
                "sku": "VEG-CAPS-05",
                "name": "Green Bell Peppers (Capsicum)",
                "base_unit": "kg",
                "current_stock": Decimal("16.0000"),
                "reorder_level": Decimal("5.0000"),
                "average_cost": Decimal("58.0000"),
            },

            # Category 2: Dairy & Creamery
            {
                "category": "Dairy & Creamery",
                "sku": "DRY-PAN-01",
                "name": "Fresh Malai Paneer (Block)",
                "base_unit": "kg",
                "current_stock": Decimal("24.0000"),
                "reorder_level": Decimal("8.0000"),
                "average_cost": Decimal("340.0000"),
            },
            {
                "category": "Dairy & Creamery",
                "sku": "DRY-BUT-02",
                "name": "Salted Cooking Butter (Amul)",
                "base_unit": "kg",
                "current_stock": Decimal("18.5000"),
                "reorder_level": Decimal("5.0000"),
                "average_cost": Decimal("485.0000"),
            },
            {
                "category": "Dairy & Creamery",
                "sku": "DRY-CRM-03",
                "name": "Fresh Cooking Cream 25%",
                "base_unit": "L",
                "current_stock": Decimal("15.0000"),
                "reorder_level": Decimal("4.0000"),
                "average_cost": Decimal("215.0000"),
            },
            {
                "category": "Dairy & Creamery",
                "sku": "DRY-CURD-04",
                "name": "Thick Set Dahi / Curd",
                "base_unit": "kg",
                "current_stock": Decimal("22.0000"),
                "reorder_level": Decimal("6.0000"),
                "average_cost": Decimal("68.0000"),
            },
            {
                "category": "Dairy & Creamery",
                "sku": "DRY-CHZ-05",
                "name": "Processed Cheddar Cheese Block",
                "base_unit": "kg",
                "current_stock": Decimal("9.5000"),
                "reorder_level": Decimal("3.0000"),
                "average_cost": Decimal("430.0000"),
            },

            # Category 3: Spices, Condiments & Oils
            {
                "category": "Spices, Condiments & Oils",
                "sku": "SPC-OIL-01",
                "name": "Refined Sunflower Cooking Oil",
                "base_unit": "L",
                "current_stock": Decimal("55.0000"),
                "reorder_level": Decimal("15.0000"),
                "average_cost": Decimal("138.0000"),
            },
            {
                "category": "Spices, Condiments & Oils",
                "sku": "SPC-GAR-02",
                "name": "Royal Shahi Garam Masala Blend",
                "base_unit": "g",
                "current_stock": Decimal("3500.0000"),
                "reorder_level": Decimal("1000.0000"),
                "average_cost": Decimal("0.8500"),
            },
            {
                "category": "Spices, Condiments & Oils",
                "sku": "SPC-KAS-03",
                "name": "Nagori Kasuri Methi (Fenugreek)",
                "base_unit": "g",
                "current_stock": Decimal("1400.0000"),
                "reorder_level": Decimal("400.0000"),
                "average_cost": Decimal("0.4800"),
            },
            {
                "category": "Spices, Condiments & Oils",
                "sku": "SPC-CHI-04",
                "name": "Kashmiri Deggi Mirch Powder",
                "base_unit": "g",
                "current_stock": Decimal("4200.0000"),
                "reorder_level": Decimal("1200.0000"),
                "average_cost": Decimal("0.5500"),
            },
            {
                "category": "Spices, Condiments & Oils",
                "sku": "SPC-HAL-05",
                "name": "Organic Turmeric Powder (Haldi)",
                "base_unit": "g",
                "current_stock": Decimal("3000.0000"),
                "reorder_level": Decimal("800.0000"),
                "average_cost": Decimal("0.3200"),
            },

            # Category 4: Beverages & Packaging
            {
                "category": "Beverages & Packaging",
                "sku": "BEV-TEA-01",
                "name": "Assam CTC Gold Dust Tea",
                "base_unit": "kg",
                "current_stock": Decimal("14.0000"),
                "reorder_level": Decimal("3.5000"),
                "average_cost": Decimal("380.0000"),
            },
            {
                "category": "Beverages & Packaging",
                "sku": "BEV-COF-02",
                "name": "Coorg Roast Filter Coffee (80/20)",
                "base_unit": "kg",
                "current_stock": Decimal("8.0000"),
                "reorder_level": Decimal("2.5000"),
                "average_cost": Decimal("540.0000"),
            },
            {
                "category": "Beverages & Packaging",
                "sku": "PKG-BOX-03",
                "name": "Meal Box 750ml Microwaveable",
                "base_unit": "pcs",
                "current_stock": Decimal("350.0000"),
                "reorder_level": Decimal("100.0000"),
                "average_cost": Decimal("6.8000"),
            },
            {
                "category": "Beverages & Packaging",
                "sku": "PKG-BAG-04",
                "name": "Heavy Kraft Paper Delivery Bag",
                "base_unit": "pcs",
                "current_stock": Decimal("400.0000"),
                "reorder_level": Decimal("120.0000"),
                "average_cost": Decimal("4.5000"),
            },
            {
                "category": "Beverages & Packaging",
                "sku": "BEV-LEM-05",
                "name": "Pure Citrus Lemon Juice Extract",
                "base_unit": "L",
                "current_stock": Decimal("6.5000"),
                "reorder_level": Decimal("2.0000"),
                "average_cost": Decimal("185.0000"),
            },
        ]

        created_items = {}
        for item_info in items_data:
            cat = created_categories[item_info["category"]]
            item = InventoryItem(
                category_id=cat.id,
                name=item_info["name"],
                sku=item_info["sku"],
                base_unit=item_info["base_unit"],
                current_stock=item_info["current_stock"],
                reorder_level=item_info["reorder_level"],
                average_cost=item_info["average_cost"],
                is_active=True,
                created_by_user_id=manager_id,
            )
            db.add(item)
            db.flush()
            created_items[item.sku] = item

            # Record Opening Stock Movement for Double-Entry Ledger Reconciliation
            movement = StockMovement(
                inventory_item_id=item.id,
                movement_type=MovementType.OPENING_STOCK,
                quantity=item.current_stock,
                unit_cost=item.average_cost,
                balance_after=item.current_stock,
                reference_type="OPENING_STOCK",
                reference_id=item.id,
                notes="Verified Opening Stock Balance",
                created_by_user_id=manager_id,
            )
            db.add(movement)
            print(f"  Created Item: [{item.sku}] {item.name} | Stock: {item.current_stock} {item.base_unit} @ ₹{item.average_cost}")

        # ---------------------------------------------------------
        # 3. SUPPLIERS & SUPPLIER ITEMS
        # ---------------------------------------------------------
        suppliers_data = [
            {
                "name": "Green Valley Farm Supplies",
                "contact_person": "Rajesh V. Patil",
                "email": "orders@greenvalleyfresh.in",
                "phone": "+91 98230 11223",
                "gstin": "27AABCG1234F1Z8",
                "address": "Gala No. 14, APMC Wholesale Market Yard, Sector 19, Vashi, Navi Mumbai",
                "items": [
                    ("VEG-ONION-01", "GV-ON-RED", Decimal("30.0000")),
                    ("VEG-TOMATO-02", "GV-TM-HYB", Decimal("36.0000")),
                    ("VEG-GINGER-03", "GV-GN-NAT", Decimal("115.0000")),
                    ("VEG-GARLIC-04", "GV-GL-PEL", Decimal("160.0000")),
                    ("VEG-CAPS-05", "GV-CP-GRN", Decimal("54.0000")),
                ]
            },
            {
                "name": "Heritage Dairy & Provisions",
                "contact_person": "Mahesh S. Deshmukh",
                "email": "supply@heritagedairy.com",
                "phone": "+91 97654 33445",
                "gstin": "27AAACH5678J1Z2",
                "address": "Plot 42, Hinjewadi Phase 1, MIDC Area, Pune - 411057",
                "items": [
                    ("DRY-PAN-01", "HD-PAN-MLI", Decimal("335.0000")),
                    ("DRY-BUT-02", "HD-BUT-AML", Decimal("480.0000")),
                    ("DRY-CRM-03", "HD-CRM-25P", Decimal("210.0000")),
                    ("DRY-CURD-04", "HD-CURD-SET", Decimal("65.0000")),
                    ("DRY-CHZ-05", "HD-CHZ-CHD", Decimal("420.0000")),
                    ("SPC-OIL-01", "HD-OIL-SUN", Decimal("135.0000")),
                ]
            },
        ]

        for s_info in suppliers_data:
            supplier = Supplier(
                name=s_info["name"],
                contact_person=s_info["contact_person"],
                email=s_info["email"],
                phone=s_info["phone"],
                gstin=s_info["gstin"],
                address=s_info["address"],
                is_active=True,
                created_by_user_id=manager_id,
            )
            db.add(supplier)
            db.flush()
            print(f"Created Supplier: {supplier.name} (ID: {supplier.id})")

            for sku, sup_sku, price in s_info["items"]:
                inv_item = created_items.get(sku)
                if inv_item:
                    sup_item = SupplierItem(
                        supplier_id=supplier.id,
                        inventory_item_id=inv_item.id,
                        supplier_sku=sup_sku,
                        last_purchase_price=price,
                        lead_time_days=1,
                        is_preferred=True,
                    )
                    db.add(sup_item)

        # ---------------------------------------------------------
        # 4. RECIPES (Linking Menu Items to Inventory Items)
        # ---------------------------------------------------------
        pbm = db.query(MenuItem).filter(MenuItem.name.ilike("%Paneer Butter Masala%")).first()
        pt = db.query(MenuItem).filter(MenuItem.name.ilike("%Paneer Tikka%")).first()

        if pbm and "DRY-PAN-01" in created_items:
            recipe_pbm = Recipe(
                menu_item_id=pbm.id,
                yield_servings=1,
                preparation_notes="Rich North Indian butter gravy recipe with fresh paneer cubes and cream garnish.",
                is_active=True,
                created_by_user_id=manager_id,
            )
            db.add(recipe_pbm)
            db.flush()

            pbm_ingredients = [
                ("DRY-PAN-01", Decimal("0.2000")),   # 200g paneer
                ("DRY-BUT-02", Decimal("0.0300")),   # 30g butter
                ("DRY-CRM-03", Decimal("0.0500")),   # 50ml cream
                ("VEG-ONION-01", Decimal("0.1500")), # 150g onions
                ("VEG-TOMATO-02", Decimal("0.2000")),# 200g tomatoes
                ("VEG-GINGER-03", Decimal("0.0150")),# 15g ginger
                ("VEG-GARLIC-04", Decimal("0.0150")),# 15g garlic
                ("SPC-GAR-02", Decimal("5.0000")),   # 5g garam masala
                ("SPC-CHI-04", Decimal("6.0000")),   # 6g kashmiri chilli
                ("SPC-KAS-03", Decimal("2.0000")),   # 2g kasuri methi
            ]
            for sku, qty in pbm_ingredients:
                db.add(RecipeItem(
                    recipe_id=recipe_pbm.id,
                    inventory_item_id=created_items[sku].id,
                    quantity=qty,
                ))
            print(f"Created Recipe for Menu Item: {pbm.name} (Recipe ID: {recipe_pbm.id})")

        if pt and "DRY-PAN-01" in created_items:
            recipe_pt = Recipe(
                menu_item_id=pt.id,
                yield_servings=1,
                preparation_notes="Tandoori marinated cottage cheese skewers with crunchy bell peppers and onions.",
                is_active=True,
                created_by_user_id=manager_id,
            )
            db.add(recipe_pt)
            db.flush()

            pt_ingredients = [
                ("DRY-PAN-01", Decimal("0.2200")),   # 220g paneer
                ("VEG-CAPS-05", Decimal("0.1000")),  # 100g capsicum
                ("VEG-ONION-01", Decimal("0.0800")), # 80g onions
                ("DRY-CURD-04", Decimal("0.0800")),  # 80g curd
                ("VEG-GINGER-03", Decimal("0.0100")),# 10g ginger
                ("VEG-GARLIC-04", Decimal("0.0100")),# 10g garlic
                ("SPC-GAR-02", Decimal("4.0000")),   # 4g garam masala
                ("SPC-CHI-04", Decimal("8.0000")),   # 8g chilli
                ("SPC-OIL-01", Decimal("0.0200")),   # 20ml oil
            ]
            for sku, qty in pt_ingredients:
                db.add(RecipeItem(
                    recipe_id=recipe_pt.id,
                    inventory_item_id=created_items[sku].id,
                    quantity=qty,
                ))
            print(f"Created Recipe for Menu Item: {pt.name} (Recipe ID: {recipe_pt.id})")

        db.commit()
        print("\nSUCCESS! Inventory Seed completed with 4 categories, 20 items, 2 suppliers, and 2 complete recipes.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding inventory: {e}", file=sys.stderr)
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_inventory_data()
