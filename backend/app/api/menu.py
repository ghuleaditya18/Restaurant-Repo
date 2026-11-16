from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.entities import MenuCategory, MenuItem
from app.api.deps import require_roles
from app.core.image_upload import save_menu_image, remove_menu_image

from app.schemas.menu import (
    MenuCategoryCreate,
    MenuCategoryUpdate,
    MenuCategoryResponse,
    MenuItemCreate,
    MenuItemUpdate,
    MenuItemAvailabilityUpdate,
    MenuItemResponse,
)

router = APIRouter(
    tags=["Menu Management"], dependencies=[Depends(require_roles("MANAGER"))]
)


# ==========================================
# COMMON HELPER FUNCTIONS
# ==========================================


def get_category_record(db: Session, category_id: int):

    category = db.query(MenuCategory).filter(MenuCategory.id == category_id).first()

    if category is None:
        raise HTTPException(status_code=404, detail="Menu category not found.")

    return category


def get_menu_item_record(db: Session, item_id: int):

    item = (
        db.query(MenuItem)
        .options(joinedload(MenuItem.category))
        .filter(MenuItem.id == item_id)
        .first()
    )

    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    return item


def menu_item_to_response(item):

    return MenuItemResponse(
        id=item.id,
        category_id=item.category_id,
        category_name=item.category.name,
        name=item.name,
        description=item.description,
        price=item.price,
        is_available=item.is_available,
        image_url=item.image_url,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def check_category_name(db: Session, name: str, category_id=None):

    query = db.query(MenuCategory).filter(MenuCategory.name == name)

    if category_id is not None:
        query = query.filter(MenuCategory.id != category_id)

    if query.first():
        raise HTTPException(status_code=409, detail="Category name already exists.")


def get_active_category(db: Session, category_id: int):

    category = get_category_record(db, category_id)

    if not category.is_active:
        raise HTTPException(
            status_code=400, detail="Cannot assign menu items to an inactive category."
        )

    return category


# ==========================================
# MENU CATEGORY MANAGEMENT
# ==========================================

# 1. CREATE CATEGORY


@router.post("/categories/", response_model=MenuCategoryResponse, status_code=201)
def create_category(
    data: MenuCategoryCreate,
    db: Session = Depends(get_db),
):

    check_category_name(db, data.name)

    new_category = MenuCategory(
        name=data.name,
        description=data.description,
        is_active=True,
    )

    try:
        db.add(new_category)
        db.commit()
        db.refresh(new_category)

        return new_category

    except IntegrityError:

        db.rollback()

        raise HTTPException(status_code=409, detail="Category name already exists.")


# 2. GET ALL CATEGORIES


@router.get("/categories/", response_model=list[MenuCategoryResponse])
def get_all_categories(
    db: Session = Depends(get_db),
):

    return db.query(MenuCategory).order_by(MenuCategory.id.desc()).all()


# 3. GET SINGLE CATEGORY


@router.get("/categories/{category_id}", response_model=MenuCategoryResponse)
def get_category(
    category_id: int,
    db: Session = Depends(get_db),
):

    return get_category_record(db, category_id)


# 4. UPDATE CATEGORY


@router.patch("/categories/{category_id}", response_model=MenuCategoryResponse)
def update_category(
    category_id: int,
    data: MenuCategoryUpdate,
    db: Session = Depends(get_db),
):

    category = get_category_record(db, category_id)

    updates = data.model_dump(exclude_unset=True)

    if "name" in updates:

        check_category_name(db, updates["name"], category_id)

    # Prevent deactivating a category
    # while it still has available menu items.

    if updates.get("is_active") is False:

        available_item = (
            db.query(MenuItem)
            .filter(
                MenuItem.category_id == category_id, MenuItem.is_available.is_(True)
            )
            .first()
        )

        if available_item:

            raise HTTPException(
                status_code=409,
                detail=(
                    "Deactivate or mark all available menu items "
                    "unavailable before deactivating this category."
                ),
            )

    try:

        for field, value in updates.items():
            setattr(category, field, value)

        db.commit()
        db.refresh(category)

        return category

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Category update conflicts with existing information.",
        )


# 5. DELETE CATEGORY


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
):

    category = get_category_record(db, category_id)

    existing_item = (
        db.query(MenuItem).filter(MenuItem.category_id == category_id).first()
    )

    if existing_item:

        raise HTTPException(
            status_code=409,
            detail=(
                "Category cannot be deleted because menu items "
                "are associated with it. Deactivate the category instead."
            ),
        )

    db.delete(category)
    db.commit()

    return {"message": "Menu category deleted successfully."}


# ==========================================
# MENU ITEM MANAGEMENT
# ==========================================

# 6. CREATE MENU ITEM


@router.post("/items/", response_model=MenuItemResponse, status_code=201)
def create_menu_item(
    data: MenuItemCreate,
    db: Session = Depends(get_db),
):

    get_active_category(db, data.category_id)

    new_item = MenuItem(
        category_id=data.category_id,
        name=data.name,
        description=data.description,
        price=data.price,
        is_available=data.is_available,
    )

    try:

        db.add(new_item)
        db.commit()

        item = get_menu_item_record(db, new_item.id)

        return menu_item_to_response(item)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Menu item conflicts with existing database information.",
        )


# 7. GET ALL MENU ITEMS


@router.get("/items/", response_model=list[MenuItemResponse])
def get_all_menu_items(
    category_id: int | None = None,
    is_available: bool | None = None,
    db: Session = Depends(get_db),
):

    query = db.query(MenuItem).options(joinedload(MenuItem.category))

    if category_id is not None:
        query = query.filter(MenuItem.category_id == category_id)

    if is_available is not None:
        query = query.filter(MenuItem.is_available == is_available)

    items = query.order_by(MenuItem.id.desc()).all()

    return [menu_item_to_response(item) for item in items]


# 8. GET SINGLE MENU ITEM


@router.get("/items/{item_id}", response_model=MenuItemResponse)
def get_menu_item(
    item_id: int,
    db: Session = Depends(get_db),
):

    item = get_menu_item_record(db, item_id)

    return menu_item_to_response(item)


# 9. UPDATE MENU ITEM


@router.patch("/items/{item_id}", response_model=MenuItemResponse)
def update_menu_item(
    item_id: int,
    data: MenuItemUpdate,
    db: Session = Depends(get_db),
):

    item = get_menu_item_record(db, item_id)

    updates = data.model_dump(exclude_unset=True)

    if "category_id" in updates:

        get_active_category(db, updates["category_id"])

    try:

        for field, value in updates.items():
            setattr(item, field, value)

        db.commit()

        item = get_menu_item_record(db, item_id)

        return menu_item_to_response(item)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Menu item update conflicts with existing information.",
        )


# 10. UPDATE MENU ITEM AVAILABILITY


@router.patch("/items/{item_id}/availability", response_model=MenuItemResponse)
def update_menu_item_availability(
    item_id: int,
    data: MenuItemAvailabilityUpdate,
    db: Session = Depends(get_db),
):

    item = get_menu_item_record(db, item_id)

    if data.is_available and not item.category.is_active:

        raise HTTPException(
            status_code=400,
            detail="Cannot activate an item under an inactive category.",
        )

    item.is_available = data.is_available

    db.commit()

    item = get_menu_item_record(db, item_id)

    return menu_item_to_response(item)


# 11. DELETE MENU ITEM


@router.delete("/items/{item_id}")
def delete_menu_item(
    item_id: int,
    db: Session = Depends(get_db),
):

    item = get_menu_item_record(db, item_id)

    # Preserve menu items referenced by historical orders.
    if item.order_items:

        raise HTTPException(
            status_code=409,
            detail=(
                "This menu item is associated with existing orders "
                "and cannot be deleted. Mark it unavailable instead."
            ),
        )

    # Remember the image path before the record is removed
    image_url = item.image_url

    db.delete(item)
    db.commit()

    # Remove the image file only after the database delete succeeded
    remove_menu_image(image_url)

    return {"message": "Menu item deleted successfully."}


# ==========================================
# MENU ITEM IMAGE MANAGEMENT
# ==========================================

# 12. UPLOAD / REPLACE MENU ITEM IMAGE


@router.post("/items/{item_id}/image", response_model=MenuItemResponse)
async def upload_menu_item_image(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):

    item = get_menu_item_record(db, item_id)

    # Validates size and real file type, then saves the file
    new_image_url = await save_menu_image(file)

    old_image_url = item.image_url

    try:

        item.image_url = new_image_url
        db.commit()

    except Exception:

        # Do not leave an unused file behind if the database update failed
        db.rollback()
        remove_menu_image(new_image_url)

        raise HTTPException(
            status_code=500, detail="Image could not be saved. Please try again."
        )

    # Delete the previous image only after the new one is stored
    remove_menu_image(old_image_url)

    item = get_menu_item_record(db, item_id)

    return menu_item_to_response(item)


# 13. REMOVE MENU ITEM IMAGE


@router.delete("/items/{item_id}/image", response_model=MenuItemResponse)
def delete_menu_item_image(
    item_id: int,
    db: Session = Depends(get_db),
):

    item = get_menu_item_record(db, item_id)

    old_image_url = item.image_url

    if old_image_url:

        item.image_url = None
        db.commit()

        remove_menu_image(old_image_url)

        item = get_menu_item_record(db, item_id)

    return menu_item_to_response(item)
