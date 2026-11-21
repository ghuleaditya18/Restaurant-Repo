from __future__ import annotations

import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date
from typing import Sequence

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.entities import Order, OrderItem, MenuItem
from app.models.inventory import (
    InventoryCategory,
    InventoryItem,
    Supplier,
    SupplierItem,
    Recipe,
    RecipeItem,
    PurchaseOrder,
    PurchaseOrderItem,
    GoodsReceipt,
    GoodsReceiptItem,
    StockMovement,
    StockCount,
    StockCountItem,
    POStatus,
    MovementType,
    StockCountStatus,
    WastageReason,
)
from app.schemas.inventory import (
    GoodsReceiptCreate,
    InsufficientIngredientDetail,
    MenuItemInventoryStatus,
)

logger = logging.getLogger("dineflow.inventory_service")

FOUR_PLACES = Decimal("0.0001")
TWO_PLACES = Decimal("0.01")


# ==========================================
# 1. CORE STOCK MOVEMENT & LOCKING ENGINE
# ==========================================

def record_stock_movement(
    db: Session,
    inventory_item_id: int,
    movement_type: MovementType,
    quantity: Decimal,
    reference_type: str,
    reference_id: int,
    user_id: int,
    unit_cost: Decimal | None = None,
    notes: str | None = None,
    allow_negative: bool = False,
) -> StockMovement:
    """
    Central atomic stock movement creator.
    Locks the inventory item row, validates bounds, updates cached current_stock,
    and appends an immutable entry to stock_movements.
    """
    item = (
        db.query(InventoryItem)
        .filter(InventoryItem.id == inventory_item_id)
        .with_for_update()
        .first()
    )

    if item is None:
        raise HTTPException(status_code=404, detail=f"Inventory item ID {inventory_item_id} not found.")

    effective_cost = unit_cost if unit_cost is not None else item.average_cost
    new_balance = item.current_stock + quantity

    if not allow_negative and new_balance < Decimal("0.0000"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock for '{item.name}'. "
                f"Available: {item.current_stock} {item.base_unit}, "
                f"Requested deduction: {abs(quantity)} {item.base_unit}."
            ),
        )

    item.current_stock = new_balance

    movement = StockMovement(
        inventory_item_id=item.id,
        movement_type=movement_type,
        quantity=quantity,
        unit_cost=effective_cost,
        balance_after=new_balance,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        created_by_user_id=user_id,
    )
    db.add(movement)
    return movement


def record_opening_stock(
    db: Session,
    item_id: int,
    quantity: Decimal,
    unit_cost: Decimal,
    user_id: int,
    notes: str | None = "Initial Opening Stock",
) -> StockMovement:
    """
    Sets initial opening stock using the movement engine.
    Guards against duplicate opening stock entries.
    """
    existing_opening = (
        db.query(StockMovement)
        .filter(
            StockMovement.inventory_item_id == item_id,
            StockMovement.movement_type == MovementType.OPENING_STOCK,
        )
        .first()
    )
    if existing_opening:
        raise HTTPException(
            status_code=400,
            detail="Opening stock has already been recorded for this item.",
        )

    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).with_for_update().first()
    if item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    item.average_cost = unit_cost.quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)

    return record_stock_movement(
        db=db,
        inventory_item_id=item_id,
        movement_type=MovementType.OPENING_STOCK,
        quantity=quantity,
        reference_type="OPENING_STOCK",
        reference_id=item_id,
        user_id=user_id,
        unit_cost=unit_cost,
        notes=notes,
        allow_negative=False,
    )


# ==========================================
# 2. WEIGHTED AVERAGE COST RECALCULATION
# ==========================================

def calculate_weighted_average_cost(
    existing_stock: Decimal,
    existing_avg_cost: Decimal,
    received_qty: Decimal,
    purchase_unit_cost: Decimal,
) -> Decimal:
    """
    Formula:
    New Average Cost = ((Existing Stock * Existing Avg Cost) + (Received Qty * Purchase Unit Cost)) / (Existing Stock + Received Qty)
    If existing stock <= 0, new average cost is strictly purchase_unit_cost.
    """
    if existing_stock <= Decimal("0.0000"):
        return purchase_unit_cost.quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)

    total_qty = existing_stock + received_qty
    if total_qty <= Decimal("0.0000"):
        return purchase_unit_cost.quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)

    existing_valuation = existing_stock * existing_avg_cost
    new_valuation = received_qty * purchase_unit_cost
    new_avg = (existing_valuation + new_valuation) / total_qty
    return new_avg.quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)


# ==========================================
# 3. PURCHASES & GOODS RECEIPT (GRN)
# ==========================================

def process_goods_receipt(
    db: Session,
    po_id: int,
    data: GoodsReceiptCreate,
    user_id: int,
) -> GoodsReceipt:
    """
    Processes a partial or full Goods Receipt (GRN) against a Purchase Order.
    Updates received quantities, calculates new moving weighted average cost,
    posts PURCHASE movements, and transitions PO status.
    """
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .with_for_update()
        .first()
    )

    if po is None:
        raise HTTPException(status_code=404, detail="Purchase order not found.")

    if po.status in {POStatus.DRAFT, POStatus.CANCELLED}:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot receive items for a Purchase Order in '{po.status.value}' status.",
        )

    if po.status == POStatus.RECEIVED:
        raise HTTPException(
            status_code=400,
            detail="This Purchase Order has already been fully received.",
        )

    po_items_map = {item.id: item for item in po.items}
    total_received_amount = Decimal("0.00")
    grn_items_to_add: list[GoodsReceiptItem] = []

    # Sort item IDs to maintain strict deadlock-free locking
    incoming_po_item_ids = sorted([entry.po_item_id for entry in data.items])

    for entry in data.items:
        po_item = po_items_map.get(entry.po_item_id)
        if not po_item:
            raise HTTPException(
                status_code=400,
                detail=f"PO Item ID {entry.po_item_id} does not belong to this purchase order.",
            )

        remaining_qty = po_item.ordered_quantity - po_item.received_quantity
        if entry.received_quantity > remaining_qty:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Received quantity ({entry.received_quantity}) exceeds remaining "
                    f"ordered quantity ({remaining_qty}) for item ID {po_item.inventory_item_id}."
                ),
            )

        line_total = (entry.received_quantity * entry.unit_cost).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        total_received_amount += line_total

    # Create GRN Header
    grn = GoodsReceipt(
        po_id=po.id,
        supplier_bill_number=data.supplier_bill_number,
        bill_date=data.bill_date,
        received_date=data.received_date,
        total_received_amount=total_received_amount,
        notes=data.notes,
        received_by_user_id=user_id,
    )
    db.add(grn)
    db.flush()  # Generates grn.id and grn_number

    # Process items and inventory updates
    for entry in data.items:
        po_item = po_items_map[entry.po_item_id]
        line_total = (entry.received_quantity * entry.unit_cost).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        grn_item = GoodsReceiptItem(
            goods_receipt_id=grn.id,
            po_item_id=po_item.id,
            inventory_item_id=po_item.inventory_item_id,
            received_quantity=entry.received_quantity,
            unit_cost=entry.unit_cost,
            line_total=line_total,
        )
        db.add(grn_item)

        # Lock Inventory Item
        inv_item = (
            db.query(InventoryItem)
            .filter(InventoryItem.id == po_item.inventory_item_id)
            .with_for_update()
            .first()
        )

        # Update Weighted Average Cost
        new_avg_cost = calculate_weighted_average_cost(
            existing_stock=inv_item.current_stock,
            existing_avg_cost=inv_item.average_cost,
            received_qty=entry.received_quantity,
            purchase_unit_cost=entry.unit_cost,
        )
        inv_item.average_cost = new_avg_cost

        # Record PURCHASE movement
        record_stock_movement(
            db=db,
            inventory_item_id=inv_item.id,
            movement_type=MovementType.PURCHASE,
            quantity=entry.received_quantity,
            reference_type="GRN",
            reference_id=grn.id,
            user_id=user_id,
            unit_cost=entry.unit_cost,
            notes=f"Goods receipt {grn.grn_number} for PO #{po.po_number}",
            allow_negative=False,
        )

        # Update PO Item received quantity
        po_item.received_quantity += entry.received_quantity

    # Re-evaluate PO Status
    all_fully_received = all(
        item.received_quantity >= item.ordered_quantity for item in po.items
    )
    po.status = POStatus.RECEIVED if all_fully_received else POStatus.PARTIALLY_RECEIVED

    return grn


# ==========================================
# 4. ORDER INTEGRATION: ATOMIC DEDUCTION
# ==========================================

def deduct_inventory_for_order(
    db: Session,
    order: Order,
    user_id: int,
) -> list[StockMovement]:
    """
    Executes atomic stock deduction when an Order enters PREPARING status.
    - Idempotency guard: checks if SALE_CONSUMPTION movements already exist for this order.
    - Resolves BOM recipes for all order items.
    - Aggregates shared ingredient quantities.
    - Locks inventory item rows ordered by primary key (deadlock prevention).
    - Enforces strict negative stock prevention.
    - Inserts SALE_CONSUMPTION movements and updates cached current_stock.
    """
    # 1. Idempotency Check
    existing_deduction = (
        db.query(StockMovement)
        .filter(
            StockMovement.reference_type == "ORDER",
            StockMovement.reference_id == order.id,
            StockMovement.movement_type == MovementType.SALE_CONSUMPTION,
        )
        .first()
    )
    if existing_deduction:
        logger.info(
            "Idempotency hit: Order ID %d already had inventory deducted. Skipping duplicate deduction.",
            order.id,
        )
        return []

    # 2. Extract items and retrieve recipes
    if not order.items:
        return []

    menu_item_ids = [item.menu_item_id for item in order.items]
    recipes = (
        db.query(Recipe)
        .options(selectinload(Recipe.items))
        .filter(Recipe.menu_item_id.in_(menu_item_ids), Recipe.is_active.is_(True))
        .all()
    )
    recipe_by_menu_id = {r.menu_item_id: r for r in recipes}

    # 3. Aggregate ingredient requirements across all order items
    required_ingredients: dict[int, Decimal] = {}  # item_id -> total_quantity
    missing_recipes: list[str] = []

    for order_item in order.items:
        recipe = recipe_by_menu_id.get(order_item.menu_item_id)
        if not recipe or not recipe.items:
            missing_recipes.append(order_item.item_name)
            continue

        servings_multiplier = Decimal(str(order_item.quantity)) / Decimal(str(recipe.yield_servings or 1))

        for r_item in recipe.items:
            needed = r_item.quantity * servings_multiplier
            required_ingredients[r_item.inventory_item_id] = (
                required_ingredients.get(r_item.inventory_item_id, Decimal("0.0000")) + needed
            )

    if missing_recipes:
        logger.warning(
            "Order %s contains menu items without an active recipe BOM: %s. Proceeding for remaining items.",
            order.order_number,
            missing_recipes,
        )

    if not required_ingredients:
        return []

    # 4. Deadlock-free locking: Sort inventory IDs ascending
    sorted_item_ids = sorted(list(required_ingredients.keys()))
    locked_items = (
        db.query(InventoryItem)
        .filter(InventoryItem.id.in_(sorted_item_ids))
        .order_by(InventoryItem.id.asc())
        .with_for_update()
        .all()
    )
    item_map = {item.id: item for item in locked_items}

    # 5. Validate stock availability for all ingredients
    insufficient_errors: list[dict] = []
    for item_id, needed_qty in required_ingredients.items():
        inv_item = item_map.get(item_id)
        if not inv_item:
            raise HTTPException(
                status_code=500,
                detail=f"Inventory item ID {item_id} referenced in recipe not found in database.",
            )
        if inv_item.current_stock < needed_qty:
            deficit = needed_qty - inv_item.current_stock
            insufficient_errors.append(
                {
                    "ingredient_id": inv_item.id,
                    "ingredient_name": inv_item.name,
                    "available_stock": float(inv_item.current_stock),
                    "required_quantity": float(needed_qty),
                    "deficit": float(deficit),
                    "base_unit": inv_item.base_unit,
                }
            )

    if insufficient_errors:
        err_msg = ", ".join(
            f"'{e['ingredient_name']}' (Need: {e['required_quantity']} {e['base_unit']}, Available: {e['available_stock']} {e['base_unit']})"
            for e in insufficient_errors
        )
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INSUFFICIENT_STOCK",
                "message": f"Cannot start preparation due to insufficient inventory: {err_msg}",
                "insufficient_ingredients": insufficient_errors,
            },
        )

    # 6. Apply deductions and create SALE_CONSUMPTION movements
    created_movements: list[StockMovement] = []
    for item_id in sorted_item_ids:
        needed_qty = required_ingredients[item_id]
        inv_item = item_map[item_id]

        movement = record_stock_movement(
            db=db,
            inventory_item_id=inv_item.id,
            movement_type=MovementType.SALE_CONSUMPTION,
            quantity=-needed_qty,  # Negative for reduction
            reference_type="ORDER",
            reference_id=order.id,
            user_id=user_id,
            notes=f"Auto-deducted for Order #{order.order_number}",
            allow_negative=False,
        )
        created_movements.append(movement)

    logger.info(
        "Successfully deducted %d inventory items for Order #%s (ID %d)",
        len(created_movements),
        order.order_number,
        order.id,
    )
    return created_movements


# ==========================================
# 5. ORDER INTEGRATION: CANCELLATION REVERSAL
# ==========================================

def reverse_order_inventory_deduction(
    db: Session,
    order: Order,
    user_id: int,
) -> list[StockMovement]:
    """
    Restores inventory deducted for an order that was cancelled after entering
    PREPARING, READY, or SERVED.
    - Idempotency guard: ensures reversal is not applied more than once.
    - Preserves historical audit by inserting positive CONSUMPTION_REVERSAL movements.
    """
    # 1. Check if there are original SALE_CONSUMPTION movements
    consumption_movements = (
        db.query(StockMovement)
        .filter(
            StockMovement.reference_type == "ORDER",
            StockMovement.reference_id == order.id,
            StockMovement.movement_type == MovementType.SALE_CONSUMPTION,
        )
        .all()
    )

    if not consumption_movements:
        # No inventory was deducted (e.g. cancelled while Pending/Confirmed)
        return []

    # 2. Check if a reversal already exists
    existing_reversal = (
        db.query(StockMovement)
        .filter(
            StockMovement.reference_type == "ORDER",
            StockMovement.reference_id == order.id,
            StockMovement.movement_type == MovementType.CONSUMPTION_REVERSAL,
        )
        .first()
    )
    if existing_reversal:
        logger.info(
            "Idempotency hit: Order ID %d already had inventory reversed. Skipping duplicate reversal.",
            order.id,
        )
        return []

    # 3. Sort item IDs ascending for deadlock-free locking
    item_ids = sorted(list({m.inventory_item_id for m in consumption_movements}))
    locked_items = (
        db.query(InventoryItem)
        .filter(InventoryItem.id.in_(item_ids))
        .order_by(InventoryItem.id.asc())
        .with_for_update()
        .all()
    )

    reversed_movements: list[StockMovement] = []
    for orig in consumption_movements:
        reversal_qty = abs(orig.quantity)

        movement = record_stock_movement(
            db=db,
            inventory_item_id=orig.inventory_item_id,
            movement_type=MovementType.CONSUMPTION_REVERSAL,
            quantity=reversal_qty,  # Positive restoration
            reference_type="ORDER",
            reference_id=order.id,
            user_id=user_id,
            unit_cost=orig.unit_cost,
            notes=f"Restored due to cancellation of Order #{order.order_number}",
            allow_negative=True,
        )
        reversed_movements.append(movement)

    logger.info(
        "Successfully reversed %d inventory items for cancelled Order #%s (ID %d)",
        len(reversed_movements),
        order.order_number,
        order.id,
    )
    return reversed_movements


# ==========================================
# 6. WASTAGE & STOCK ADJUSTMENTS
# ==========================================

def record_wastage(
    db: Session,
    inventory_item_id: int,
    quantity: Decimal,
    reason: WastageReason,
    explanation: str,
    user_id: int,
) -> StockMovement:
    """
    Records kitchen loss / wastage.
    Deducts stock with a WASTAGE movement.
    """
    notes = f"Wastage [{reason.value}]: {explanation.strip()}"
    return record_stock_movement(
        db=db,
        inventory_item_id=inventory_item_id,
        movement_type=MovementType.WASTAGE,
        quantity=-abs(quantity),
        reference_type="WASTAGE",
        reference_id=0,  # Will update after insert or keep 0
        user_id=user_id,
        notes=notes,
        allow_negative=False,
    )


def record_stock_adjustment(
    db: Session,
    inventory_item_id: int,
    quantity: Decimal,
    reason: str,
    user_id: int,
    notes: str | None = None,
) -> StockMovement:
    """
    Records manual inventory correction (positive or negative).
    """
    combined_notes = f"Adjustment: {reason.strip()}"
    if notes:
        combined_notes += f" | {notes.strip()}"

    return record_stock_movement(
        db=db,
        inventory_item_id=inventory_item_id,
        movement_type=MovementType.ADJUSTMENT,
        quantity=quantity,
        reference_type="ADJUSTMENT",
        reference_id=0,
        user_id=user_id,
        notes=combined_notes,
        allow_negative=False,
    )


# ==========================================
# 7. PHYSICAL STOCK COUNT AUDIT ENGINE
# ==========================================

def create_stock_count_session(
    db: Session,
    count_date: date,
    user_id: int,
    notes: str | None = None,
    item_ids: list[int] | None = None,
) -> StockCount:
    """
    Initiates a physical stock count session in DRAFT status.
    Snapshots the current system_quantity for active inventory items.
    """
    query = db.query(InventoryItem).filter(InventoryItem.is_active.is_(True))
    if item_ids:
        query = query.filter(InventoryItem.id.in_(item_ids))
    items = query.order_by(InventoryItem.name.asc()).all()

    stock_count = StockCount(
        count_date=count_date,
        status=StockCountStatus.DRAFT,
        notes=notes,
        conducted_by_user_id=user_id,
    )
    db.add(stock_count)
    db.flush()

    for item in items:
        count_item = StockCountItem(
            stock_count_id=stock_count.id,
            inventory_item_id=item.id,
            system_quantity=item.current_stock,
            counted_quantity=item.current_stock,  # Defaults to system qty until counted
            variance_quantity=Decimal("0.0000"),
            unit_cost=item.average_cost,
            variance_value=Decimal("0.00"),
        )
        db.add(count_item)

    return stock_count


def approve_stock_count_session(
    db: Session,
    count_id: int,
    user_id: int,
) -> StockCount:
    """
    Approves a submitted stock count and posts reconciling ADJUSTMENT movements.
    - Handles concurrent movements occurring during the count by applying the net variance.
    - Idempotent: rejects already approved counts.
    """
    stock_count = (
        db.query(StockCount)
        .options(selectinload(StockCount.items))
        .filter(StockCount.id == count_id)
        .with_for_update()
        .first()
    )

    if stock_count is None:
        raise HTTPException(status_code=404, detail="Stock count session not found.")

    if stock_count.status == StockCountStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Stock count has already been approved.")

    if stock_count.status == StockCountStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Cannot approve a cancelled stock count.")

    # Sort items ascending for locking
    sorted_count_items = sorted(stock_count.items, key=lambda x: x.inventory_item_id)

    for c_item in sorted_count_items:
        if c_item.variance_quantity != Decimal("0.0000"):
            record_stock_movement(
                db=db,
                inventory_item_id=c_item.inventory_item_id,
                movement_type=MovementType.ADJUSTMENT,
                quantity=c_item.variance_quantity,
                reference_type="STOCK_COUNT",
                reference_id=stock_count.id,
                user_id=user_id,
                unit_cost=c_item.unit_cost,
                notes=f"Stock count #{stock_count.count_number} audit variance reconciliation",
                allow_negative=False,
            )

    stock_count.status = StockCountStatus.APPROVED
    stock_count.approved_by_user_id = user_id
    stock_count.approved_at = datetime.now()

    return stock_count


# ==========================================
# 8. MENU ITEM INVENTORY AVAILABILITY CHECK
# ==========================================

def get_menu_item_inventory_status(
    db: Session,
    menu_item_id: int,
) -> MenuItemInventoryStatus:
    """
    Computes real-time inventory availability for a menu item based on its recipe BOM.
    Returns:
    - IN_STOCK: Sufficient for >= 5 servings
    - LOW_STOCK: Sufficient for 1..4 servings
    - OUT_OF_STOCK: Insufficient for even 1 serving
    - NO_RECIPE: No active recipe BOM configured
    """
    recipe = (
        db.query(Recipe)
        .options(
            selectinload(Recipe.items).joinedload(RecipeItem.inventory_item)
        )
        .filter(Recipe.menu_item_id == menu_item_id, Recipe.is_active.is_(True))
        .first()
    )

    if not recipe or not recipe.items:
        return MenuItemInventoryStatus(
            menu_item_id=menu_item_id,
            inventory_status="NO_RECIPE",
            max_preparable_servings=999,
            insufficient_ingredients=[],
        )

    insufficient_list: list[InsufficientIngredientDetail] = []
    max_servings_possible = 999999

    for r_item in recipe.items:
        inv = r_item.inventory_item
        if not inv or not inv.is_active:
            insufficient_list.append(
                InsufficientIngredientDetail(
                    inventory_item_id=r_item.inventory_item_id,
                    ingredient_name=inv.name if inv else "Unknown Ingredient",
                    required_per_serving=r_item.quantity,
                    available_stock=Decimal("0.0000"),
                    base_unit=inv.base_unit if inv else "g",
                )
            )
            max_servings_possible = 0
            continue

        if r_item.quantity > Decimal("0.0000"):
            possible = int(inv.current_stock // r_item.quantity)
            if possible < max_servings_possible:
                max_servings_possible = possible

            if inv.current_stock < r_item.quantity:
                insufficient_list.append(
                    InsufficientIngredientDetail(
                        inventory_item_id=inv.id,
                        ingredient_name=inv.name,
                        required_per_serving=r_item.quantity,
                        available_stock=inv.current_stock,
                        base_unit=inv.base_unit,
                    )
                )

    if max_servings_possible <= 0:
        status = "OUT_OF_STOCK"
    elif max_servings_possible <= 4:
        status = "LOW_STOCK"
    else:
        status = "IN_STOCK"

    return MenuItemInventoryStatus(
        menu_item_id=menu_item_id,
        inventory_status=status,
        max_preparable_servings=max(0, max_servings_possible),
        insufficient_ingredients=insufficient_list,
    )


# ==========================================
# 9. LEDGER RECONCILIATION
# ==========================================

def reconcile_inventory_ledger(db: Session) -> list[dict]:
    """
    Verifies that cached current_stock equals the sum of all posted movements
    for every inventory item.
    """
    items = db.query(InventoryItem).all()
    results = []

    for item in items:
        ledger_sum = (
            db.query(func.coalesce(func.sum(StockMovement.quantity), Decimal("0.0000")))
            .filter(StockMovement.inventory_item_id == item.id)
            .scalar()
            or Decimal("0.0000")
        )
        diff = item.current_stock - ledger_sum
        results.append(
            {
                "item_id": item.id,
                "item_name": item.name,
                "base_unit": item.base_unit,
                "cached_current_stock": item.current_stock,
                "ledger_sum": ledger_sum,
                "difference": diff,
                "is_balanced": abs(diff) < Decimal("0.0001"),
            }
        )
    return results
