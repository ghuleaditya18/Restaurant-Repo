from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user, require_restaurant_context, require_roles
from app.core.date_utils import get_date_range, get_kolkata_now
from app.core.image_upload import remove_bill_image, save_bill_image
from app.db.session import get_db
from app.models.entities import MenuItem, Order, OrderItem, OrderStatus, User
from app.models.inventory import (
    GoodsReceipt,
    GoodsReceiptItem,
    InventoryCategory,
    InventoryItem,
    MovementType,
    POStatus,
    PurchaseOrder,
    PurchaseOrderItem,
    Recipe,
    RecipeItem,
    StockCount,
    StockCountItem,
    StockCountStatus,
    StockMovement,
    Supplier,
    SupplierItem,
    WastageReason,
)
from app.schemas.inventory import (
    ConsumptionReport,
    ConsumptionReportItem,
    FoodCostReportItem,
    GoodsReceiptCreate,
    GoodsReceiptItemResponse,
    GoodsReceiptResponse,
    InventoryCategoryCreate,
    InventoryCategoryResponse,
    InventoryCategoryUpdate,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemStatusUpdate,
    InventoryItemUpdate,
    MenuItemInventoryStatus,
    OpeningStockCreate,
    POStatusUpdate,
    PurchaseOrderCreate,
    PurchaseOrderItemResponse,
    PurchaseOrderResponse,
    PurchaseOrderUpdate,
    RecipeCreateOrUpdate,
    RecipeItemResponse,
    RecipeResponse,
    ReconciliationItem,
    ReconciliationReport,
    StockAdjustmentCreate,
    StockCountCreate,
    StockCountItemEntry,
    StockCountItemResponse,
    StockCountResponse,
    StockCountSubmit,
    StockMovementReversalRequest,
    StockMovementResponse,
    StockValuationItem,
    StockValuationReport,
    SupplierCreate,
    SupplierItemCreate,
    SupplierItemResponse,
    SupplierItemUpdate,
    SupplierResponse,
    SupplierUpdate,
    WastageCreate,
    WastageReport,
    WastageReportItem,
)
from app.services.inventory_service import (
    approve_stock_count_session,
    calculate_weighted_average_cost,
    create_stock_count_session,
    get_menu_item_inventory_status,
    process_goods_receipt,
    reconcile_inventory_ledger,
    record_opening_stock,
    record_stock_adjustment,
    record_wastage,
    reverse_wastage_or_adjustment_movement,
)

router = APIRouter(
    prefix="/api/inventory",
    tags=["Inventory Management"],
    dependencies=[Depends(require_roles("MANAGER")), Depends(require_restaurant_context)],
)


# ==========================================
# 1. INVENTORY CATEGORIES
# ==========================================

@router.get("/categories", response_model=list[InventoryCategoryResponse])
def get_categories(
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(InventoryCategory)
    if is_active is not None:
        query = query.filter(InventoryCategory.is_active == is_active)

    categories = query.order_by(InventoryCategory.name.asc()).all()
    results = []
    for cat in categories:
        count = db.query(func.count(InventoryItem.id)).filter(InventoryItem.category_id == cat.id).scalar() or 0
        resp = InventoryCategoryResponse.model_validate(cat)
        resp.items_count = count
        results.append(resp)
    return results


@router.post("/categories", response_model=InventoryCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    data: InventoryCategoryCreate,
    db: Session = Depends(get_db),
):
    existing = db.query(InventoryCategory).filter(InventoryCategory.name.ilike(data.name)).first()
    if existing:
        raise HTTPException(status_code=409, detail="A category with this name already exists.")

    category = InventoryCategory(
        name=data.name,
        description=data.description,
        is_active=True,
    )
    try:
        db.add(category)
        db.commit()
        db.refresh(category)
        return category
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category creation failed due to database constraint.")


@router.patch("/categories/{category_id}", response_model=InventoryCategoryResponse)
def update_category(
    category_id: int,
    data: InventoryCategoryUpdate,
    db: Session = Depends(get_db),
):
    category = db.query(InventoryCategory).filter(InventoryCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")

    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        existing = (
            db.query(InventoryCategory)
            .filter(InventoryCategory.name.ilike(updates["name"]), InventoryCategory.id != category_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Another category already uses this name.")

    # Prevent deactivating category if it has active items
    if updates.get("is_active") is False:
        active_items = db.query(InventoryItem).filter(InventoryItem.category_id == category_id, InventoryItem.is_active.is_(True)).count()
        if active_items > 0:
            raise HTTPException(status_code=400, detail=f"Cannot deactivate category with {active_items} active items. Deactivate items first.")

    for k, v in updates.items():
        setattr(category, k, v)

    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
):
    category = db.query(InventoryCategory).filter(InventoryCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")

    items_count = db.query(InventoryItem).filter(InventoryItem.category_id == category_id).count()
    if items_count > 0:
        raise HTTPException(status_code=409, detail=f"Cannot delete category associated with {items_count} inventory items. Deactivate it instead.")

    db.delete(category)
    db.commit()
    return {"message": "Category deleted successfully"}


# ==========================================
# 2. INVENTORY ITEMS (MASTER)
# ==========================================

def _enrich_item_response(item: InventoryItem) -> InventoryItemResponse:
    stock_status = "IN_STOCK"
    if item.current_stock <= Decimal("0.0000"):
        stock_status = "OUT_OF_STOCK"
    elif item.current_stock <= item.reorder_level:
        stock_status = "LOW_STOCK"

    total_val = (item.current_stock * item.average_cost).quantize(Decimal("0.01"))

    return InventoryItemResponse(
        id=item.id,
        category_id=item.category_id,
        category_name=item.category.name if item.category else "",
        name=item.name,
        sku=item.sku,
        base_unit=item.base_unit,
        current_stock=item.current_stock,
        reorder_level=item.reorder_level,
        average_cost=item.average_cost,
        is_active=item.is_active,
        created_by_user_id=item.created_by_user_id,
        created_at=item.created_at,
        updated_at=item.updated_at,
        stock_status=stock_status,
        total_valuation=total_val,
    )


@router.get("/items", response_model=list[InventoryItemResponse])
def get_inventory_items(
    category_id: int | None = None,
    is_active: bool | None = None,
    low_stock: bool | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(InventoryItem).options(joinedload(InventoryItem.category))

    if category_id is not None:
        query = query.filter(InventoryItem.category_id == category_id)
    if is_active is not None:
        query = query.filter(InventoryItem.is_active == is_active)
    if low_stock is True:
        query = query.filter(InventoryItem.current_stock <= InventoryItem.reorder_level)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(InventoryItem.name.ilike(term), InventoryItem.sku.ilike(term)))

    items = query.order_by(InventoryItem.name.asc()).all()
    return [_enrich_item_response(it) for it in items]


@router.post("/items", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_item(
    data: InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = db.query(InventoryCategory).filter(InventoryCategory.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Specified category does not exist.")
    if not category.is_active:
        raise HTTPException(status_code=400, detail="Cannot create items under an inactive category.")

    # Unique name check
    if db.query(InventoryItem).filter(InventoryItem.name.ilike(data.name)).first():
        raise HTTPException(status_code=409, detail="An inventory item with this name already exists.")
    if data.sku and db.query(InventoryItem).filter(InventoryItem.sku.ilike(data.sku)).first():
        raise HTTPException(status_code=409, detail="An inventory item with this SKU already exists.")

    item = InventoryItem(
        category_id=data.category_id,
        name=data.name,
        sku=data.sku,
        base_unit=data.base_unit,
        reorder_level=data.reorder_level,
        current_stock=Decimal("0.0000"),
        average_cost=data.opening_unit_cost if data.opening_stock > 0 else Decimal("0.0000"),
        is_active=True,
        created_by_user_id=current_user.id,
    )
    db.add(item)
    db.flush()

    # Optional initial opening stock
    if data.opening_stock > Decimal("0.0000"):
        record_opening_stock(
            db=db,
            item_id=item.id,
            quantity=data.opening_stock,
            unit_cost=data.opening_unit_cost,
            user_id=current_user.id,
            notes="Initial opening stock recorded at item creation",
        )

    db.commit()
    db.refresh(item)
    return _enrich_item_response(item)


@router.get("/items/{item_id}", response_model=InventoryItemResponse)
def get_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    item = db.query(InventoryItem).options(joinedload(InventoryItem.category)).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")
    return _enrich_item_response(item)


@router.patch("/items/{item_id}", response_model=InventoryItemResponse)
def update_inventory_item(
    item_id: int,
    data: InventoryItemUpdate,
    db: Session = Depends(get_db),
):
    item = db.query(InventoryItem).options(joinedload(InventoryItem.category)).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    updates = data.model_dump(exclude_unset=True)

    if "category_id" in updates and updates["category_id"]:
        cat = db.query(InventoryCategory).filter(InventoryCategory.id == updates["category_id"]).first()
        if not cat or not cat.is_active:
            raise HTTPException(status_code=400, detail="Invalid or inactive category.")

    if "name" in updates and updates["name"]:
        existing = db.query(InventoryItem).filter(InventoryItem.name.ilike(updates["name"]), InventoryItem.id != item_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Another item with this name already exists.")

    if "sku" in updates and updates["sku"]:
        existing = db.query(InventoryItem).filter(InventoryItem.sku.ilike(updates["sku"]), InventoryItem.id != item_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Another item with this SKU already exists.")

    for k, v in updates.items():
        setattr(item, k, v)

    db.commit()
    db.refresh(item)
    return _enrich_item_response(item)


@router.patch("/items/{item_id}/status", response_model=InventoryItemResponse)
def update_item_status(
    item_id: int,
    data: InventoryItemStatusUpdate,
    db: Session = Depends(get_db),
):
    item = db.query(InventoryItem).options(joinedload(InventoryItem.category)).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    if data.is_active and not item.category.is_active:
        raise HTTPException(status_code=400, detail="Cannot activate item under an inactive category.")

    item.is_active = data.is_active
    db.commit()
    db.refresh(item)
    return _enrich_item_response(item)


@router.post("/items/{item_id}/opening-stock", response_model=StockMovementResponse)
def add_opening_stock(
    item_id: int,
    data: OpeningStockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    movement = record_opening_stock(
        db=db,
        item_id=item_id,
        quantity=data.quantity,
        unit_cost=data.unit_cost,
        user_id=current_user.id,
        notes=data.notes,
    )
    db.commit()
    db.refresh(movement)
    return movement


@router.get("/items/{item_id}/movements", response_model=list[StockMovementResponse])
def get_item_movements(
    item_id: int,
    preset: str = Query(default="all"),
    start_date: date | None = None,
    end_date: date | None = None,
    movement_type: MovementType | None = None,
    db: Session = Depends(get_db),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    start_dt, end_dt = get_date_range(preset=preset, start_date=start_date, end_date=end_date)
    query = db.query(StockMovement).filter(StockMovement.inventory_item_id == item_id)

    if start_dt and end_dt:
        query = query.filter(StockMovement.created_at >= start_dt, StockMovement.created_at <= end_dt)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)

    movements = query.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).all()
    results = []
    for m in movements:
        resp = StockMovementResponse.model_validate(m)
        resp.inventory_item_name = item.name
        resp.inventory_item_unit = item.base_unit
        results.append(resp)
    return results


# ==========================================
# 3. SUPPLIERS & SUPPLIER ITEMS
# ==========================================

@router.get("/suppliers", response_model=list[SupplierResponse])
def get_suppliers(
    is_active: bool | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Supplier)
    if is_active is not None:
        query = query.filter(Supplier.is_active == is_active)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(Supplier.name.ilike(term), Supplier.contact_person.ilike(term), Supplier.phone.ilike(term)))

    suppliers = query.order_by(Supplier.name.asc()).all()
    results = []
    for s in suppliers:
        items_cnt = db.query(SupplierItem).filter(SupplierItem.supplier_id == s.id).count()
        orders_cnt = db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == s.id).count()
        resp = SupplierResponse.model_validate(s)
        resp.supplied_items_count = items_cnt
        resp.total_orders_count = orders_cnt
        results.append(resp)
    return results


@router.post("/suppliers", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(
    data: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Supplier).filter(Supplier.name.ilike(data.name)).first():
        raise HTTPException(status_code=409, detail="A supplier with this name already exists.")

    supplier = Supplier(
        name=data.name,
        contact_person=data.contact_person,
        phone=data.phone,
        email=data.email,
        gstin=data.gstin,
        address=data.address,
        is_active=True,
        created_by_user_id=current_user.id,
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/suppliers/{supplier_id}", response_model=SupplierResponse)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    items_cnt = db.query(SupplierItem).filter(SupplierItem.supplier_id == s.id).count()
    orders_cnt = db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == s.id).count()
    resp = SupplierResponse.model_validate(s)
    resp.supplied_items_count = items_cnt
    resp.total_orders_count = orders_cnt
    return resp


@router.patch("/suppliers/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    db: Session = Depends(get_db),
):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        existing = db.query(Supplier).filter(Supplier.name.ilike(updates["name"]), Supplier.id != supplier_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Another supplier already uses this name.")

    for k, v in updates.items():
        setattr(s, k, v)

    db.commit()
    db.refresh(s)
    return s


@router.get("/suppliers/{supplier_id}/items", response_model=list[SupplierItemResponse])
def get_supplier_items(supplier_id: int, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    links = (
        db.query(SupplierItem)
        .options(joinedload(SupplierItem.inventory_item))
        .filter(SupplierItem.supplier_id == supplier_id)
        .all()
    )
    results = []
    for l in links:
        resp = SupplierItemResponse.model_validate(l)
        if l.inventory_item:
            resp.inventory_item_name = l.inventory_item.name
            resp.inventory_item_unit = l.inventory_item.base_unit
        results.append(resp)
    return results


@router.post("/suppliers/{supplier_id}/items", response_model=SupplierItemResponse, status_code=status.HTTP_201_CREATED)
def add_supplier_item(
    supplier_id: int,
    data: SupplierItemCreate,
    db: Session = Depends(get_db),
):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    inv_item = db.query(InventoryItem).filter(InventoryItem.id == data.inventory_item_id).first()
    if not inv_item:
        raise HTTPException(status_code=400, detail="Inventory item does not exist.")

    existing = db.query(SupplierItem).filter(
        SupplierItem.supplier_id == supplier_id,
        SupplierItem.inventory_item_id == data.inventory_item_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="This item is already linked to this supplier.")

    link = SupplierItem(
        supplier_id=supplier_id,
        inventory_item_id=data.inventory_item_id,
        supplier_sku=data.supplier_sku,
        last_purchase_price=data.last_purchase_price,
        lead_time_days=data.lead_time_days,
        is_preferred=data.is_preferred,
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    resp = SupplierItemResponse.model_validate(link)
    resp.inventory_item_name = inv_item.name
    resp.inventory_item_unit = inv_item.base_unit
    return resp


@router.delete("/suppliers/{supplier_id}/items/{supplier_item_id}")
def remove_supplier_item(supplier_id: int, supplier_item_id: int, db: Session = Depends(get_db)):
    link = db.query(SupplierItem).filter(SupplierItem.id == supplier_item_id, SupplierItem.supplier_id == supplier_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Supplier-item link not found.")
    db.delete(link)
    db.commit()
    return {"message": "Supplier-item link removed successfully"}


# ==========================================
# 4. RECIPES (BILL OF MATERIALS)
# ==========================================

def _enrich_recipe_response(recipe: Recipe) -> RecipeResponse:
    items_resp = []
    total_cost = Decimal("0.0000")

    for it in recipe.items:
        avg_cost = it.inventory_item.average_cost if it.inventory_item else Decimal("0.0000")
        line_cost = (it.quantity * avg_cost).quantize(Decimal("0.0001"))
        total_cost += line_cost

        items_resp.append(
            RecipeItemResponse(
                id=it.id,
                inventory_item_id=it.inventory_item_id,
                inventory_item_name=it.inventory_item.name if it.inventory_item else "",
                inventory_item_unit=it.inventory_item.base_unit if it.inventory_item else "",
                inventory_item_average_cost=avg_cost,
                quantity=it.quantity,
                line_cost=line_cost,
            )
        )

    menu_price = recipe.menu_item.price if hasattr(recipe, "menu_item") and recipe.menu_item else Decimal("0.00")
    food_cost_pct = Decimal("0.00")
    gross_margin_pct = Decimal("0.00")

    if menu_price > Decimal("0.00"):
        food_cost_pct = ((total_cost / menu_price) * Decimal("100.00")).quantize(Decimal("0.01"))
        gross_margin_pct = (((menu_price - total_cost) / menu_price) * Decimal("100.00")).quantize(Decimal("0.01"))

    return RecipeResponse(
        id=recipe.id,
        menu_item_id=recipe.menu_item_id,
        menu_item_name=recipe.menu_item.name if hasattr(recipe, "menu_item") and recipe.menu_item else "",
        menu_item_price=menu_price,
        yield_servings=recipe.yield_servings,
        preparation_notes=recipe.preparation_notes,
        is_active=recipe.is_active,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
        items=items_resp,
        total_estimated_cost=total_cost.quantize(Decimal("0.01")),
        food_cost_percentage=food_cost_pct,
        gross_margin_percentage=gross_margin_pct,
    )


@router.get("/recipes", response_model=list[RecipeResponse])
def get_recipes(db: Session = Depends(get_db)):
    recipes = (
        db.query(Recipe)
        .options(
            selectinload(Recipe.items).joinedload(RecipeItem.inventory_item),
            joinedload(Recipe.menu_item),
        )
        .all()
    )
    return [_enrich_recipe_response(r) for r in recipes]


@router.get("/recipes/menu/{menu_item_id}", response_model=RecipeResponse)
def get_recipe_by_menu_item(menu_item_id: int, db: Session = Depends(get_db)):
    recipe = (
        db.query(Recipe)
        .options(
            selectinload(Recipe.items).joinedload(RecipeItem.inventory_item),
            joinedload(Recipe.menu_item),
        )
        .filter(Recipe.menu_item_id == menu_item_id)
        .first()
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="No recipe configured for this menu item.")
    return _enrich_recipe_response(recipe)


@router.put("/recipes/menu/{menu_item_id}", response_model=RecipeResponse)
def create_or_update_recipe(
    menu_item_id: int,
    data: RecipeCreateOrUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    menu_item = db.query(MenuItem).filter(MenuItem.id == menu_item_id).first()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    # Validate ingredients exist and are active
    item_ids = [it.inventory_item_id for it in data.items]
    valid_items = db.query(InventoryItem).filter(InventoryItem.id.in_(item_ids), InventoryItem.is_active.is_(True)).all()
    if len(valid_items) != len(item_ids):
        raise HTTPException(status_code=400, detail="One or more specified ingredients are inactive or do not exist.")

    recipe = db.query(Recipe).filter(Recipe.menu_item_id == menu_item_id).first()
    if not recipe:
        recipe = Recipe(
            menu_item_id=menu_item_id,
            yield_servings=data.yield_servings,
            preparation_notes=data.preparation_notes,
            is_active=True,
            created_by_user_id=current_user.id,
        )
        db.add(recipe)
        db.flush()
    else:
        recipe.yield_servings = data.yield_servings
        recipe.preparation_notes = data.preparation_notes
        # Delete old recipe items to replace prospectively
        db.query(RecipeItem).filter(RecipeItem.recipe_id == recipe.id).delete(synchronize_session=False)

    for it in data.items:
        r_item = RecipeItem(
            recipe_id=recipe.id,
            inventory_item_id=it.inventory_item_id,
            quantity=it.quantity,
        )
        db.add(r_item)

    db.commit()

    # Re-fetch for response
    refreshed = (
        db.query(Recipe)
        .options(
            selectinload(Recipe.items).joinedload(RecipeItem.inventory_item),
            joinedload(Recipe.menu_item),
        )
        .filter(Recipe.id == recipe.id)
        .first()
    )
    return _enrich_recipe_response(refreshed)


@router.delete("/recipes/menu/{menu_item_id}")
def delete_recipe_by_menu_item(
    menu_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = db.query(Recipe).filter(Recipe.menu_item_id == menu_item_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="No recipe found for this menu item.")

    # Guard: prevent deleting recipe if active dining orders reference this menu item
    active_orders = (
        db.query(Order.order_number)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .filter(
            OrderItem.menu_item_id == menu_item_id,
            Order.status.in_([
                OrderStatus.PENDING,
                OrderStatus.CONFIRMED,
                OrderStatus.PREPARING,
                OrderStatus.READY,
                OrderStatus.SERVED,
            ]),
        )
        .all()
    )
    if active_orders:
        order_nums = ", ".join([o[0] for o in active_orders[:3]])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete recipe: Item is currently part of active dining order(s) ({order_nums}). Complete or cancel active orders first.",
        )

    # Delete recipe BOM items without deleting the menu item
    db.query(RecipeItem).filter(RecipeItem.recipe_id == recipe.id).delete(synchronize_session=False)
    db.delete(recipe)
    db.commit()
    return {"message": "Recipe BOM configuration deleted successfully."}


# ==========================================
# 5. PURCHASE ORDERS & GOODS RECEIPTS
# ==========================================

def _enrich_po_response(po: PurchaseOrder) -> PurchaseOrderResponse:
    items_resp = []
    total_received_amount = Decimal("0.00")

    for it in po.items:
        rem_qty = max(Decimal("0.0000"), it.ordered_quantity - it.received_quantity)
        total_received_amount += (it.received_quantity * it.unit_price).quantize(Decimal("0.01"))
        items_resp.append(
            PurchaseOrderItemResponse(
                id=it.id,
                po_id=it.po_id,
                inventory_item_id=it.inventory_item_id,
                inventory_item_name=it.inventory_item.name if it.inventory_item else "",
                inventory_item_unit=it.inventory_item.base_unit if it.inventory_item else "",
                ordered_quantity=it.ordered_quantity,
                received_quantity=it.received_quantity,
                remaining_quantity=rem_qty,
                unit_price=it.unit_price,
                line_total=it.line_total,
            )
        )

    return PurchaseOrderResponse(
        id=po.id,
        po_number=po.po_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier.name if po.supplier else "",
        order_date=po.order_date,
        expected_delivery_date=po.expected_delivery_date,
        subtotal=po.subtotal,
        tax_amount=po.tax_amount,
        total_amount=po.total_amount,
        status=po.status,
        notes=po.notes,
        created_by_user_id=po.created_by_user_id,
        created_at=po.created_at,
        updated_at=po.updated_at,
        items=items_resp,
        received_amount=total_received_amount,
    )


@router.get("/purchase-orders", response_model=list[PurchaseOrderResponse])
def get_purchase_orders(
    supplier_id: int | None = None,
    status_filter: POStatus | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            selectinload(PurchaseOrder.items).joinedload(PurchaseOrderItem.inventory_item),
        )
    )
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    if status_filter:
        query = query.filter(PurchaseOrder.status == status_filter)

    pos = query.order_by(PurchaseOrder.id.desc()).all()
    return [_enrich_po_response(po) for po in pos]


@router.post("/purchase-orders", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
def create_purchase_order(
    data: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
    if not supplier or not supplier.is_active:
        raise HTTPException(status_code=400, detail="Supplier not found or inactive.")

    subtotal = Decimal("0.00")
    for it in data.items:
        inv_item = db.query(InventoryItem).filter(InventoryItem.id == it.inventory_item_id).first()
        if not inv_item or not inv_item.is_active:
            raise HTTPException(status_code=400, detail=f"Inventory item ID {it.inventory_item_id} is invalid or inactive.")
        subtotal += (it.ordered_quantity * it.unit_price).quantize(Decimal("0.01"))

    total_amount = subtotal + data.tax_amount

    po = PurchaseOrder(
        supplier_id=data.supplier_id,
        order_date=data.order_date,
        expected_delivery_date=data.expected_delivery_date,
        subtotal=subtotal,
        tax_amount=data.tax_amount,
        total_amount=total_amount,
        status=POStatus.DRAFT,
        notes=data.notes,
        created_by_user_id=current_user.id,
    )
    db.add(po)
    db.flush()

    for it in data.items:
        line_total = (it.ordered_quantity * it.unit_price).quantize(Decimal("0.01"))
        po_item = PurchaseOrderItem(
            po_id=po.id,
            inventory_item_id=it.inventory_item_id,
            ordered_quantity=it.ordered_quantity,
            received_quantity=Decimal("0.0000"),
            unit_price=it.unit_price,
            line_total=line_total,
        )
        db.add(po_item)

    db.commit()

    refreshed = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            selectinload(PurchaseOrder.items).joinedload(PurchaseOrderItem.inventory_item),
        )
        .filter(PurchaseOrder.id == po.id)
        .first()
    )
    return _enrich_po_response(refreshed)


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderResponse)
def get_purchase_order(po_id: int, db: Session = Depends(get_db)):
    po = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            selectinload(PurchaseOrder.items).joinedload(PurchaseOrderItem.inventory_item),
        )
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    return _enrich_po_response(po)


@router.patch("/purchase-orders/{po_id}/status", response_model=PurchaseOrderResponse)
def update_po_status(
    po_id: int,
    data: POStatusUpdate,
    db: Session = Depends(get_db),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")

    if data.status == POStatus.CANCELLED and po.status in {POStatus.PARTIALLY_RECEIVED, POStatus.RECEIVED}:
        raise HTTPException(status_code=400, detail="Cannot cancel a purchase order that has already been partially or fully received.")

    po.status = data.status
    if data.notes:
        po.notes = f"{po.notes or ''}\nStatus update: {data.notes}".strip()

    db.commit()

    refreshed = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            selectinload(PurchaseOrder.items).joinedload(PurchaseOrderItem.inventory_item),
        )
        .filter(PurchaseOrder.id == po.id)
        .first()
    )
    return _enrich_po_response(refreshed)


@router.put("/purchase-orders/{po_id}", response_model=PurchaseOrderResponse)
@router.patch("/purchase-orders/{po_id}", response_model=PurchaseOrderResponse)
def update_purchase_order(
    po_id: int,
    data: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")

    if po.status != POStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only Draft purchase orders can be edited.")

    if data.supplier_id is not None:
        supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
        if not supplier or not supplier.is_active:
            raise HTTPException(status_code=400, detail="Supplier not found or inactive.")
        po.supplier_id = data.supplier_id

    if data.order_date is not None:
        po.order_date = data.order_date
    if data.expected_delivery_date is not None:
        po.expected_delivery_date = data.expected_delivery_date
    if data.notes is not None:
        po.notes = data.notes

    if data.items is not None:
        if len(data.items) == 0:
            raise HTTPException(status_code=400, detail="Purchase order must contain at least one item.")
        # Delete existing items
        db.query(PurchaseOrderItem).filter(PurchaseOrderItem.po_id == po.id).delete(synchronize_session=False)
        subtotal = Decimal("0.00")
        for it in data.items:
            inv_item = db.query(InventoryItem).filter(InventoryItem.id == it.inventory_item_id).first()
            if not inv_item or not inv_item.is_active:
                raise HTTPException(status_code=400, detail=f"Inventory item ID {it.inventory_item_id} is invalid or inactive.")
            line_total = (it.ordered_quantity * it.unit_price).quantize(Decimal("0.01"))
            subtotal += line_total
            po_item = PurchaseOrderItem(
                po_id=po.id,
                inventory_item_id=it.inventory_item_id,
                ordered_quantity=it.ordered_quantity,
                received_quantity=Decimal("0.0000"),
                unit_price=it.unit_price,
                line_total=line_total,
            )
            db.add(po_item)
        po.subtotal = subtotal
        tax = data.tax_amount if data.tax_amount is not None else po.tax_amount
        po.tax_amount = tax
        po.total_amount = subtotal + tax
    elif data.tax_amount is not None:
        po.tax_amount = data.tax_amount
        po.total_amount = po.subtotal + data.tax_amount

    db.commit()

    refreshed = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            selectinload(PurchaseOrder.items).joinedload(PurchaseOrderItem.inventory_item),
        )
        .filter(PurchaseOrder.id == po.id)
        .first()
    )
    return _enrich_po_response(refreshed)


@router.delete("/purchase-orders/{po_id}")
def delete_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")

    if po.status != POStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only Draft purchase orders can be deleted. Cancel non-draft purchase orders instead.")

    # Check if any GRN was attached
    grn_count = db.query(GoodsReceipt).filter(GoodsReceipt.po_id == po.id).count()
    if grn_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete purchase order with associated goods receipts.")

    db.query(PurchaseOrderItem).filter(PurchaseOrderItem.po_id == po.id).delete(synchronize_session=False)
    db.delete(po)
    db.commit()
    return {"message": "Purchase order deleted successfully."}


@router.post("/purchase-orders/{po_id}/receive", response_model=GoodsReceiptResponse, status_code=status.HTTP_201_CREATED)
def receive_goods(
    po_id: int,
    data: GoodsReceiptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    grn = process_goods_receipt(
        db=db,
        po_id=po_id,
        data=data,
        user_id=current_user.id,
    )
    db.commit()

    refreshed_grn = (
        db.query(GoodsReceipt)
        .options(
            joinedload(GoodsReceipt.purchase_order).joinedload(PurchaseOrder.supplier),
            selectinload(GoodsReceipt.items).joinedload(GoodsReceiptItem.inventory_item),
        )
        .filter(GoodsReceipt.id == grn.id)
        .first()
    )

    items_resp = [
        GoodsReceiptItemResponse(
            id=it.id,
            goods_receipt_id=it.goods_receipt_id,
            po_item_id=it.po_item_id,
            inventory_item_id=it.inventory_item_id,
            inventory_item_name=it.inventory_item.name if it.inventory_item else "",
            inventory_item_unit=it.inventory_item.base_unit if it.inventory_item else "",
            received_quantity=it.received_quantity,
            unit_cost=it.unit_cost,
            line_total=it.line_total,
        )
        for it in refreshed_grn.items
    ]

    return GoodsReceiptResponse(
        id=refreshed_grn.id,
        grn_number=refreshed_grn.grn_number,
        po_id=refreshed_grn.po_id,
        po_number=refreshed_grn.purchase_order.po_number if refreshed_grn.purchase_order else "",
        supplier_name=refreshed_grn.purchase_order.supplier.name if refreshed_grn.purchase_order and refreshed_grn.purchase_order.supplier else "",
        supplier_bill_number=refreshed_grn.supplier_bill_number,
        bill_date=refreshed_grn.bill_date,
        bill_image_url=refreshed_grn.bill_image_url,
        received_date=refreshed_grn.received_date,
        total_received_amount=refreshed_grn.total_received_amount,
        notes=refreshed_grn.notes,
        received_by_user_id=refreshed_grn.received_by_user_id,
        created_at=refreshed_grn.created_at,
        items=items_resp,
    )


@router.get("/goods-receipts", response_model=list[GoodsReceiptResponse])
def get_goods_receipts(db: Session = Depends(get_db)):
    grns = (
        db.query(GoodsReceipt)
        .options(
            joinedload(GoodsReceipt.purchase_order).joinedload(PurchaseOrder.supplier),
            selectinload(GoodsReceipt.items).joinedload(GoodsReceiptItem.inventory_item),
        )
        .order_by(GoodsReceipt.id.desc())
        .all()
    )
    results = []
    for grn in grns:
        items_resp = [
            GoodsReceiptItemResponse(
                id=it.id,
                goods_receipt_id=it.goods_receipt_id,
                po_item_id=it.po_item_id,
                inventory_item_id=it.inventory_item_id,
                inventory_item_name=it.inventory_item.name if it.inventory_item else "",
                inventory_item_unit=it.inventory_item.base_unit if it.inventory_item else "",
                received_quantity=it.received_quantity,
                unit_cost=it.unit_cost,
                line_total=it.line_total,
            )
            for it in grn.items
        ]
        results.append(
            GoodsReceiptResponse(
                id=grn.id,
                grn_number=grn.grn_number,
                po_id=grn.po_id,
                po_number=grn.purchase_order.po_number if grn.purchase_order else "",
                supplier_name=grn.purchase_order.supplier.name if grn.purchase_order and grn.purchase_order.supplier else "",
                supplier_bill_number=grn.supplier_bill_number,
                bill_date=grn.bill_date,
                bill_image_url=grn.bill_image_url,
                received_date=grn.received_date,
                total_received_amount=grn.total_received_amount,
                notes=grn.notes,
                received_by_user_id=grn.received_by_user_id,
                created_at=grn.created_at,
                items=items_resp,
            )
        )
    return results


@router.get("/goods-receipts/{grn_id}", response_model=GoodsReceiptResponse)
def get_goods_receipt(grn_id: int, db: Session = Depends(get_db)):
    grn = (
        db.query(GoodsReceipt)
        .options(
            joinedload(GoodsReceipt.purchase_order).joinedload(PurchaseOrder.supplier),
            selectinload(GoodsReceipt.items).joinedload(GoodsReceiptItem.inventory_item),
        )
        .filter(GoodsReceipt.id == grn_id)
        .first()
    )
    if not grn:
        raise HTTPException(status_code=404, detail="Goods receipt not found.")

    items_resp = [
        GoodsReceiptItemResponse(
            id=it.id,
            goods_receipt_id=it.goods_receipt_id,
            po_item_id=it.po_item_id,
            inventory_item_id=it.inventory_item_id,
            inventory_item_name=it.inventory_item.name if it.inventory_item else "",
            inventory_item_unit=it.inventory_item.base_unit if it.inventory_item else "",
            received_quantity=it.received_quantity,
            unit_cost=it.unit_cost,
            line_total=it.line_total,
        )
        for it in grn.items
    ]
    return GoodsReceiptResponse(
        id=grn.id,
        grn_number=grn.grn_number,
        po_id=grn.po_id,
        po_number=grn.purchase_order.po_number if grn.purchase_order else "",
        supplier_name=grn.purchase_order.supplier.name if grn.purchase_order and grn.purchase_order.supplier else "",
        supplier_bill_number=grn.supplier_bill_number,
        bill_date=grn.bill_date,
        bill_image_url=grn.bill_image_url,
        received_date=grn.received_date,
        total_received_amount=grn.total_received_amount,
        notes=grn.notes,
        received_by_user_id=grn.received_by_user_id,
        created_at=grn.created_at,
        items=items_resp,
    )


@router.post("/goods-receipts/{grn_id}/bill")
async def upload_grn_bill(
    grn_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    grn = db.query(GoodsReceipt).filter(GoodsReceipt.id == grn_id).first()
    if not grn:
        raise HTTPException(status_code=404, detail="Goods receipt not found.")

    new_bill_url = await save_bill_image(file)
    old_bill_url = grn.bill_image_url
    grn.bill_image_url = new_bill_url
    db.commit()

    if old_bill_url:
        remove_bill_image(old_bill_url)

    return {"message": "Bill uploaded successfully", "bill_image_url": new_bill_url}


# ==========================================
# 6. WASTAGE & STOCK ADJUSTMENTS
# ==========================================

@router.post("/wastage", response_model=StockMovementResponse, status_code=status.HTTP_201_CREATED)
def create_wastage(
    data: WastageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv_item = db.query(InventoryItem).filter(InventoryItem.id == data.inventory_item_id).first()
    if not inv_item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    movement = record_wastage(
        db=db,
        inventory_item_id=data.inventory_item_id,
        quantity=data.quantity,
        reason=data.reason,
        explanation=data.explanation,
        user_id=current_user.id,
    )
    db.commit()
    db.refresh(movement)

    resp = StockMovementResponse.model_validate(movement)
    resp.inventory_item_name = inv_item.name
    resp.inventory_item_unit = inv_item.base_unit
    return resp


@router.post("/adjustments", response_model=StockMovementResponse, status_code=status.HTTP_201_CREATED)
def create_adjustment(
    data: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv_item = db.query(InventoryItem).filter(InventoryItem.id == data.inventory_item_id).first()
    if not inv_item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    movement = record_stock_adjustment(
        db=db,
        inventory_item_id=data.inventory_item_id,
        quantity=data.quantity,
        reason=data.reason,
        user_id=current_user.id,
        notes=data.notes,
    )
    db.commit()
    db.refresh(movement)

    resp = StockMovementResponse.model_validate(movement)
    resp.inventory_item_name = inv_item.name
    resp.inventory_item_unit = inv_item.base_unit
    return resp


@router.get("/movements", response_model=list[StockMovementResponse])
def get_all_movements(
    preset: str = Query(default="today"),
    start_date: date | None = None,
    end_date: date | None = None,
    movement_type: MovementType | None = None,
    item_id: int | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    start_dt, end_dt = get_date_range(preset=preset, start_date=start_date, end_date=end_date)
    query = db.query(StockMovement).options(joinedload(StockMovement.inventory_item))

    if start_dt and end_dt:
        query = query.filter(StockMovement.created_at >= start_dt, StockMovement.created_at <= end_dt)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    if item_id:
        query = query.filter(StockMovement.inventory_item_id == item_id)

    movements = query.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit).all()
    results = []
    for m in movements:
        resp = StockMovementResponse.model_validate(m)
        if m.inventory_item:
            resp.inventory_item_name = m.inventory_item.name
            resp.inventory_item_unit = m.inventory_item.base_unit
        results.append(resp)
    return results


@router.post("/movements/{movement_id}/reverse", response_model=StockMovementResponse)
def reverse_movement(
    movement_id: int,
    data: StockMovementReversalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rev_movement = reverse_wastage_or_adjustment_movement(
        db=db,
        movement_id=movement_id,
        reason=data.reason,
        user_id=current_user.id,
    )
    db.commit()
    db.refresh(rev_movement)

    inv_item = db.query(InventoryItem).filter(InventoryItem.id == rev_movement.inventory_item_id).first()
    resp = StockMovementResponse.model_validate(rev_movement)
    if inv_item:
        resp.inventory_item_name = inv_item.name
        resp.inventory_item_unit = inv_item.base_unit
    return resp


# ==========================================
# 7. PHYSICAL STOCK COUNT SESSIONS
# ==========================================

def _enrich_count_response(sc: StockCount) -> StockCountResponse:
    items_resp = []
    total_var_value = Decimal("0.00")

    for it in sc.items:
        total_var_value += it.variance_value
        items_resp.append(
            StockCountItemResponse(
                id=it.id,
                stock_count_id=it.stock_count_id,
                inventory_item_id=it.inventory_item_id,
                inventory_item_name=it.inventory_item.name if it.inventory_item else "",
                inventory_item_unit=it.inventory_item.base_unit if it.inventory_item else "",
                system_quantity=it.system_quantity,
                counted_quantity=it.counted_quantity,
                variance_quantity=it.variance_quantity,
                unit_cost=it.unit_cost,
                variance_value=it.variance_value,
            )
        )

    return StockCountResponse(
        id=sc.id,
        count_number=sc.count_number,
        count_date=sc.count_date,
        status=sc.status,
        notes=sc.notes,
        conducted_by_user_id=sc.conducted_by_user_id,
        approved_by_user_id=sc.approved_by_user_id,
        approved_at=sc.approved_at,
        created_at=sc.created_at,
        updated_at=sc.updated_at,
        items_count=len(sc.items),
        total_variance_value=total_var_value,
        items=items_resp,
    )


@router.get("/stock-counts", response_model=list[StockCountResponse])
def get_stock_counts(db: Session = Depends(get_db)):
    counts = (
        db.query(StockCount)
        .options(selectinload(StockCount.items).joinedload(StockCountItem.inventory_item))
        .order_by(StockCount.id.desc())
        .all()
    )
    return [_enrich_count_response(c) for c in counts]


@router.post("/stock-counts", response_model=StockCountResponse, status_code=status.HTTP_201_CREATED)
def start_stock_count(
    data: StockCountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sc = create_stock_count_session(
        db=db,
        count_date=data.count_date,
        user_id=current_user.id,
        notes=data.notes,
        item_ids=data.item_ids,
    )
    db.commit()

    refreshed = (
        db.query(StockCount)
        .options(selectinload(StockCount.items).joinedload(StockCountItem.inventory_item))
        .filter(StockCount.id == sc.id)
        .first()
    )
    return _enrich_count_response(refreshed)


@router.get("/stock-counts/{count_id}", response_model=StockCountResponse)
def get_stock_count(count_id: int, db: Session = Depends(get_db)):
    sc = (
        db.query(StockCount)
        .options(selectinload(StockCount.items).joinedload(StockCountItem.inventory_item))
        .filter(StockCount.id == count_id)
        .first()
    )
    if not sc:
        raise HTTPException(status_code=404, detail="Stock count session not found.")
    return _enrich_count_response(sc)


@router.post("/stock-counts/{count_id}/submit", response_model=StockCountResponse)
def submit_stock_count(
    count_id: int,
    data: StockCountSubmit,
    db: Session = Depends(get_db),
):
    sc = (
        db.query(StockCount)
        .options(selectinload(StockCount.items))
        .filter(StockCount.id == count_id)
        .first()
    )
    if not sc:
        raise HTTPException(status_code=404, detail="Stock count session not found.")
    if sc.status != StockCountStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only DRAFT stock counts can be edited or submitted.")

    item_map = {item.inventory_item_id: item for item in sc.items}
    for entry in data.counts:
        c_item = item_map.get(entry.inventory_item_id)
        if c_item:
            c_item.counted_quantity = entry.counted_quantity
            c_item.variance_quantity = entry.counted_quantity - c_item.system_quantity
            c_item.variance_value = (c_item.variance_quantity * c_item.unit_cost).quantize(Decimal("0.01"))

    sc.status = StockCountStatus.SUBMITTED
    db.commit()

    refreshed = (
        db.query(StockCount)
        .options(selectinload(StockCount.items).joinedload(StockCountItem.inventory_item))
        .filter(StockCount.id == count_id)
        .first()
    )
    return _enrich_count_response(refreshed)


@router.post("/stock-counts/{count_id}/approve", response_model=StockCountResponse)
def approve_stock_count(
    count_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sc = approve_stock_count_session(db=db, count_id=count_id, user_id=current_user.id)
    db.commit()

    refreshed = (
        db.query(StockCount)
        .options(selectinload(StockCount.items).joinedload(StockCountItem.inventory_item))
        .filter(StockCount.id == count_id)
        .first()
    )
    return _enrich_count_response(refreshed)


@router.post("/stock-counts/{count_id}/cancel", response_model=StockCountResponse)
def cancel_stock_count(count_id: int, db: Session = Depends(get_db)):
    sc = db.query(StockCount).filter(StockCount.id == count_id).first()
    if not sc:
        raise HTTPException(status_code=404, detail="Stock count session not found.")
    if sc.status == StockCountStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Cannot cancel an approved stock count.")
    sc.status = StockCountStatus.CANCELLED
    db.commit()
    return _enrich_count_response(sc)


# ==========================================
# 8. REPORTS & ANALYTICS
# ==========================================

@router.get("/reports/stock-valuation", response_model=StockValuationReport)
def get_valuation_report(db: Session = Depends(get_db)):
    items = db.query(InventoryItem).options(joinedload(InventoryItem.category)).filter(InventoryItem.is_active.is_(True)).all()

    total_val = Decimal("0.00")
    low_cnt = 0
    out_cnt = 0
    rows = []

    for it in items:
        item_val = (it.current_stock * it.average_cost).quantize(Decimal("0.01"))
        total_val += item_val

        status_str = "IN_STOCK"
        if it.current_stock <= Decimal("0.0000"):
            status_str = "OUT_OF_STOCK"
            out_cnt += 1
        elif it.current_stock <= it.reorder_level:
            status_str = "LOW_STOCK"
            low_cnt += 1

        rows.append(
            StockValuationItem(
                item_id=it.id,
                item_name=it.name,
                category_name=it.category.name if it.category else "",
                base_unit=it.base_unit,
                current_stock=it.current_stock,
                average_cost=it.average_cost,
                total_valuation=item_val,
                stock_status=status_str,
            )
        )

    return StockValuationReport(
        total_items=len(items),
        total_valuation=total_val,
        low_stock_count=low_cnt,
        out_of_stock_count=out_cnt,
        items=rows,
    )


@router.get("/reports/consumption", response_model=ConsumptionReport)
def get_consumption_report(
    preset: str = Query(default="today"),
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    start_dt, end_dt = get_date_range(preset=preset, start_date=start_date, end_date=end_date)
    query = (
        db.query(
            StockMovement.inventory_item_id,
            func.abs(func.sum(StockMovement.quantity)).label("total_qty"),
            func.sum(func.abs(StockMovement.quantity) * StockMovement.unit_cost).label("total_cost"),
            func.count(func.distinct(StockMovement.reference_id)).label("orders_count"),
        )
        .filter(StockMovement.movement_type == MovementType.SALE_CONSUMPTION)
    )

    if start_dt and end_dt:
        query = query.filter(StockMovement.created_at >= start_dt, StockMovement.created_at <= end_dt)

    raw_items = query.group_by(StockMovement.inventory_item_id).all()

    total_cost = Decimal("0.00")
    items_out = []

    for row in raw_items:
        inv = db.query(InventoryItem).options(joinedload(InventoryItem.category)).filter(InventoryItem.id == row.inventory_item_id).first()
        raw_cost = Decimal(str(row.total_cost or 0))
        line_cost = raw_cost.quantize(Decimal("0.01"))
        total_cost += line_cost
        raw_qty = Decimal(str(row.total_qty or 0))
        items_out.append(
            ConsumptionReportItem(
                item_id=row.inventory_item_id,
                item_name=inv.name if inv else "Unknown Item",
                category_name=inv.category.name if inv and inv.category else "",
                base_unit=inv.base_unit if inv else "",
                total_consumed_quantity=raw_qty.quantize(Decimal("0.0001")),
                total_cost=line_cost,
                order_count=row.orders_count or 0,
            )
        )

    return ConsumptionReport(
        start_date=start_date,
        end_date=end_date,
        total_consumption_cost=total_cost,
        items=items_out,
    )


@router.get("/reports/wastage", response_model=WastageReport)
def get_wastage_report(
    preset: str = Query(default="this_month"),
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    start_dt, end_dt = get_date_range(preset=preset, start_date=start_date, end_date=end_date)
    query = (
        db.query(
            StockMovement.inventory_item_id,
            func.abs(func.sum(StockMovement.quantity)).label("total_qty"),
            func.sum(func.abs(StockMovement.quantity) * StockMovement.unit_cost).label("total_loss"),
            func.count(StockMovement.id).label("incidents_count"),
        )
        .filter(StockMovement.movement_type == MovementType.WASTAGE)
    )

    if start_dt and end_dt:
        query = query.filter(StockMovement.created_at >= start_dt, StockMovement.created_at <= end_dt)

    raw_rows = query.group_by(StockMovement.inventory_item_id).all()

    total_loss = Decimal("0.00")
    items_out = []

    for row in raw_rows:
        inv = db.query(InventoryItem).options(joinedload(InventoryItem.category)).filter(InventoryItem.id == row.inventory_item_id).first()
        raw_loss = Decimal(str(row.total_loss or 0))
        line_loss = raw_loss.quantize(Decimal("0.01"))
        total_loss += line_loss
        raw_qty = Decimal(str(row.total_qty or 0))

        items_out.append(
            WastageReportItem(
                item_id=row.inventory_item_id,
                item_name=inv.name if inv else "Unknown Item",
                category_name=inv.category.name if inv and inv.category else "",
                base_unit=inv.base_unit if inv else "",
                total_wasted_quantity=raw_qty.quantize(Decimal("0.0001")),
                total_loss_value=line_loss,
                incidents_count=row.incidents_count or 0,
                primary_reason="SPOILAGE",
            )
        )

    return WastageReport(
        start_date=start_date,
        end_date=end_date,
        total_wastage_loss=total_loss,
        items=items_out,
    )


@router.get("/reports/food-cost", response_model=list[FoodCostReportItem])
def get_food_cost_report(db: Session = Depends(get_db)):
    menu_items = db.query(MenuItem).options(joinedload(MenuItem.category)).all()
    results = []

    for m in menu_items:
        recipe = (
            db.query(Recipe)
            .options(selectinload(Recipe.items).joinedload(RecipeItem.inventory_item))
            .filter(Recipe.menu_item_id == m.id, Recipe.is_active.is_(True))
            .first()
        )

        recipe_cost = Decimal("0.00")
        has_recipe = False

        if recipe and recipe.items:
            has_recipe = True
            for r_item in recipe.items:
                avg = r_item.inventory_item.average_cost if r_item.inventory_item else Decimal("0.00")
                recipe_cost += r_item.quantity * avg

        recipe_cost = recipe_cost.quantize(Decimal("0.01"))
        margin_amt = (m.price - recipe_cost).quantize(Decimal("0.01"))
        food_cost_pct = Decimal("0.00")
        gross_margin_pct = Decimal("0.00")

        if m.price > Decimal("0.00") and has_recipe:
            food_cost_pct = ((recipe_cost / m.price) * Decimal("100.00")).quantize(Decimal("0.01"))
            gross_margin_pct = ((margin_amt / m.price) * Decimal("100.00")).quantize(Decimal("0.01"))

        results.append(
            FoodCostReportItem(
                menu_item_id=m.id,
                menu_item_name=m.name,
                category_name=m.category.name if m.category else "",
                selling_price=m.price,
                recipe_cost=recipe_cost,
                gross_margin_amount=margin_amt,
                food_cost_percentage=food_cost_pct,
                gross_margin_percentage=gross_margin_pct,
                has_active_recipe=has_recipe,
            )
        )

    return results


@router.get("/reports/reconciliation", response_model=ReconciliationReport)
def get_reconciliation_report(db: Session = Depends(get_db)):
    rows = reconcile_inventory_ledger(db)
    discrepancies = sum(1 for r in rows if not r["is_balanced"])

    return ReconciliationReport(
        total_items_checked=len(rows),
        discrepancy_count=discrepancies,
        items=[ReconciliationItem(**r) for r in rows],
    )


# ==========================================
# 9. MENU ITEM LIVE INVENTORY AVAILABILITY
# ==========================================

@router.get("/menu/{menu_item_id}/availability", response_model=MenuItemInventoryStatus)
def check_dish_availability(menu_item_id: int, db: Session = Depends(get_db)):
    return get_menu_item_inventory_status(db=db, menu_item_id=menu_item_id)
