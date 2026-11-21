from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import (
    User,
    Customer,
    RestaurantTable,
    MenuItem,
    Order,
    Invoice,
    InventoryItem,
    Supplier,
    PurchaseOrder,
    SpaBooking,
    SpaCustomer,
    SpaService,
    SpaStaff,
    SpaInvoice,
)

router = APIRouter(prefix="/api/search", tags=["Global Search"])


class SearchItem(BaseModel):
    id: int
    title: str
    subtitle: str
    entity_type: str
    status: Optional[str] = None
    route: str


class SearchGroup(BaseModel):
    category: str
    entity_type: str
    items: List[SearchItem]


class SearchResponse(BaseModel):
    query: str
    total_matches: int
    groups: List[SearchGroup]


@router.get("", response_model=SearchResponse)
@router.get("/", response_model=SearchResponse)
def global_search(
    q: str = Query(..., min_length=1, max_length=100, description="Search query string"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search records within the user's authorized business context (RESTAURANT vs SPA).
    Strict isolation is enforced: Spa users only search Spa entities, Restaurant users only search Restaurant entities.
    """
    query_text = q.strip()
    if not query_text:
        return SearchResponse(query="", total_matches=0, groups=[])

    pattern = f"%{query_text}%"
    biz_context = (getattr(current_user, "business_context", None) or "RESTAURANT").upper()
    groups: List[SearchGroup] = []
    total_count = 0

    if biz_context == "SPA":
        # 1. Spa Customers
        customers = (
            db.query(SpaCustomer)
            .filter(
                or_(
                    SpaCustomer.full_name.ilike(pattern),
                    SpaCustomer.phone.ilike(pattern),
                    SpaCustomer.email.ilike(pattern),
                )
            )
            .order_by(SpaCustomer.full_name.asc())
            .limit(5)
            .all()
        )
        if customers:
            items = [
                SearchItem(
                    id=c.id,
                    title=c.full_name,
                    subtitle=f"Guest · {c.phone or c.email or 'Registered Guest'}",
                    entity_type="customer",
                    status="Active" if c.is_active else "Inactive",
                    route=f"/spa/customers?search={c.full_name}",
                )
                for c in customers
            ]
            groups.append(SearchGroup(category="Customers", entity_type="customer", items=items))
            total_count += len(items)

        # 2. Spa Bookings
        bookings_query = (
            db.query(SpaBooking)
            .outerjoin(SpaCustomer, SpaBooking.customer_id == SpaCustomer.id)
            .filter(
                or_(
                    SpaCustomer.full_name.ilike(pattern),
                    SpaCustomer.phone.ilike(pattern),
                )
            )
            .order_by(desc(SpaBooking.id))
            .limit(5)
            .all()
        )
        if bookings_query:
            items = []
            for b in bookings_query:
                cust_name = b.customer.full_name if getattr(b, "customer", None) else f"Guest #{b.customer_id}"
                status_str = getattr(b.status, "value", str(b.status))
                items.append(
                    SearchItem(
                        id=b.id,
                        title=f"Booking #{b.id} · {cust_name}",
                        subtitle=f"Date: {b.booking_date} · Status: {status_str}",
                        entity_type="booking",
                        status=status_str,
                        route=f"/spa/bookings?search={b.id}",
                    )
                )
            groups.append(SearchGroup(category="Appointments", entity_type="booking", items=items))
            total_count += len(items)

        # 3. Spa Services
        services = (
            db.query(SpaService)
            .filter(
                or_(
                    SpaService.name.ilike(pattern),
                    SpaService.description.ilike(pattern),
                )
            )
            .order_by(SpaService.name.asc())
            .limit(5)
            .all()
        )
        if services:
            items = [
                SearchItem(
                    id=s.id,
                    title=s.name,
                    subtitle=f"Treatment · {s.duration_minutes} min · ₹{float(s.price):.2f}",
                    entity_type="service",
                    status="Available" if s.is_available else "Unavailable",
                    route=f"/spa/services?search={s.name}",
                )
                for s in services
            ]
            groups.append(SearchGroup(category="Services", entity_type="service", items=items))
            total_count += len(items)

        # 4. Spa Therapists / Staff
        therapists = (
            db.query(SpaStaff)
            .filter(
                or_(
                    SpaStaff.full_name.ilike(pattern),
                    SpaStaff.employee_code.ilike(pattern),
                    SpaStaff.specialization.ilike(pattern),
                    SpaStaff.phone.ilike(pattern),
                )
            )
            .order_by(SpaStaff.full_name.asc())
            .limit(5)
            .all()
        )
        if therapists:
            items = [
                SearchItem(
                    id=t.id,
                    title=t.full_name,
                    subtitle=f"Therapist · {t.specialization or t.employee_code or 'Wellness Staff'}",
                    entity_type="therapist",
                    status="Active" if t.is_active else "Inactive",
                    route=f"/spa/staff?search={t.full_name}",
                )
                for t in therapists
            ]
            groups.append(SearchGroup(category="Therapists", entity_type="therapist", items=items))
            total_count += len(items)

        # 5. Spa Invoices
        invoices = (
            db.query(SpaInvoice)
            .filter(SpaInvoice.invoice_number.ilike(pattern))
            .order_by(desc(SpaInvoice.id))
            .limit(5)
            .all()
        )
        if invoices:
            items = [
                SearchItem(
                    id=inv.id,
                    title=inv.invoice_number,
                    subtitle=f"Invoice · ₹{float(inv.total_amount):.2f}",
                    entity_type="invoice",
                    status=getattr(inv.payment_status, "value", str(inv.payment_status)) if hasattr(inv, "payment_status") else getattr(inv, "status", None),
                    route=f"/spa/invoices?search={inv.invoice_number}",
                )
                for inv in invoices
            ]
            groups.append(SearchGroup(category="Invoices", entity_type="invoice", items=items))
            total_count += len(items)

    else:
        # RESTAURANT CONTEXT
        # 1. Orders
        orders = (
            db.query(Order)
            .filter(Order.order_number.ilike(pattern))
            .order_by(desc(Order.id))
            .limit(5)
            .all()
        )
        if orders:
            items = []
            for ord_obj in orders:
                table_str = f"Table {ord_obj.table.table_number}" if ord_obj.table else "Takeaway"
                status_str = getattr(ord_obj.status, "value", str(ord_obj.status))
                total_val = 0.0
                if getattr(ord_obj, "invoice", None) and getattr(ord_obj.invoice, "total_amount", None):
                    total_val = float(ord_obj.invoice.total_amount)
                elif getattr(ord_obj, "items", None):
                    total_val = float(sum((getattr(i, "subtotal", 0) for i in ord_obj.items), Decimal(0)))
                items.append(
                    SearchItem(
                        id=ord_obj.id,
                        title=ord_obj.order_number,
                        subtitle=f"Order · {table_str} · ₹{total_val:.2f}",
                        entity_type="order",
                        status=status_str,
                        route=f"/orders?search={ord_obj.order_number}",
                    )
                )
            groups.append(SearchGroup(category="Orders", entity_type="order", items=items))
            total_count += len(items)

        # 2. Customers
        customers = (
            db.query(Customer)
            .filter(
                or_(
                    Customer.full_name.ilike(pattern),
                    Customer.phone.ilike(pattern),
                    Customer.email.ilike(pattern),
                )
            )
            .order_by(Customer.full_name.asc())
            .limit(5)
            .all()
        )
        if customers:
            items = [
                SearchItem(
                    id=c.id,
                    title=c.full_name,
                    subtitle=f"Customer · {c.phone or c.email or 'Dining Guest'}",
                    entity_type="customer",
                    status=None,
                    route=f"/customers?search={c.full_name}",
                )
                for c in customers
            ]
            groups.append(SearchGroup(category="Customers", entity_type="customer", items=items))
            total_count += len(items)

        # 3. Menu Items
        menu_items = (
            db.query(MenuItem)
            .filter(
                or_(
                    MenuItem.name.ilike(pattern),
                    MenuItem.description.ilike(pattern),
                )
            )
            .order_by(MenuItem.name.asc())
            .limit(5)
            .all()
        )
        if menu_items:
            items = [
                SearchItem(
                    id=m.id,
                    title=m.name,
                    subtitle=f"Menu · ₹{float(m.price):.2f}",
                    entity_type="menu_item",
                    status="Available" if m.is_available else "Unavailable",
                    route=f"/menu?search={m.name}",
                )
                for m in menu_items
            ]
            groups.append(SearchGroup(category="Menu Items", entity_type="menu_item", items=items))
            total_count += len(items)

        # 4. Dining Tables
        tables = (
            db.query(RestaurantTable)
            .filter(RestaurantTable.table_number.ilike(pattern))
            .order_by(RestaurantTable.table_number.asc())
            .limit(5)
            .all()
        )
        if tables:
            items = [
                SearchItem(
                    id=t.id,
                    title=f"Table {t.table_number}",
                    subtitle=f"Dining Table · Capacity {t.capacity} guests",
                    entity_type="table",
                    status=getattr(t.status, "value", str(t.status)),
                    route=f"/tables?search={t.table_number}",
                )
                for t in tables
            ]
            groups.append(SearchGroup(category="Dining Tables", entity_type="table", items=items))
            total_count += len(items)

        # 5. Invoices
        invoices = (
            db.query(Invoice)
            .filter(Invoice.invoice_number.ilike(pattern))
            .order_by(desc(Invoice.id))
            .limit(5)
            .all()
        )
        if invoices:
            items = [
                SearchItem(
                    id=inv.id,
                    title=inv.invoice_number,
                    subtitle=f"Invoice · ₹{float(inv.total_amount):.2f}",
                    entity_type="invoice",
                    status=getattr(inv.payment_status, "value", str(inv.payment_status)) if hasattr(inv, "payment_status") else getattr(inv, "status", None),
                    route=f"/invoices?search={inv.invoice_number}",
                )
                for inv in invoices
            ]
            groups.append(SearchGroup(category="Invoices", entity_type="invoice", items=items))
            total_count += len(items)

        # 6. Staff
        staff_members = (
            db.query(User)
            .filter(
                User.business_context == "RESTAURANT",
                or_(
                    User.full_name.ilike(pattern),
                    User.email.ilike(pattern),
                ),
            )
            .order_by(User.full_name.asc())
            .limit(5)
            .all()
        )
        if staff_members:
            items = [
                SearchItem(
                    id=u.id,
                    title=u.full_name,
                    subtitle=f"Staff · {u.email}",
                    entity_type="staff",
                    status="Active" if u.is_active else "Inactive",
                    route=f"/staff?search={u.full_name}",
                )
                for u in staff_members
            ]
            groups.append(SearchGroup(category="Staff", entity_type="staff", items=items))
            total_count += len(items)

        # 7. Inventory Items
        inv_items = (
            db.query(InventoryItem)
            .filter(
                or_(
                    InventoryItem.sku.ilike(pattern),
                    InventoryItem.name.ilike(pattern),
                )
            )
            .order_by(InventoryItem.name.asc())
            .limit(5)
            .all()
        )
        if inv_items:
            items = []
            for itm in inv_items:
                unit_str = getattr(itm.base_unit, "value", str(itm.base_unit))
                sku_str = f" ({itm.sku})" if itm.sku else ""
                is_low = itm.current_stock <= itm.reorder_level and itm.reorder_level > 0
                items.append(
                    SearchItem(
                        id=itm.id,
                        title=f"{itm.name}{sku_str}",
                        subtitle=f"Stock: {float(itm.current_stock):.2f} {unit_str}",
                        entity_type="inventory_item",
                        status="Low Stock" if is_low else "In Stock",
                        route=f"/inventory?search={itm.name}",
                    )
                )
            groups.append(SearchGroup(category="Inventory", entity_type="inventory_item", items=items))
            total_count += len(items)

        # 8. Suppliers
        suppliers = (
            db.query(Supplier)
            .filter(
                or_(
                    Supplier.name.ilike(pattern),
                    Supplier.contact_person.ilike(pattern),
                    Supplier.phone.ilike(pattern),
                )
            )
            .order_by(Supplier.name.asc())
            .limit(5)
            .all()
        )
        if suppliers:
            items = [
                SearchItem(
                    id=s.id,
                    title=s.name,
                    subtitle=f"Supplier · {s.phone or s.contact_person or 'Active Vendor'}",
                    entity_type="supplier",
                    status="Active" if s.is_active else "Inactive",
                    route=f"/inventory?search={s.name}",
                )
                for s in suppliers
            ]
            groups.append(SearchGroup(category="Suppliers", entity_type="supplier", items=items))
            total_count += len(items)

        # 9. Purchase Orders
        pos = (
            db.query(PurchaseOrder)
            .filter(
                or_(
                    PurchaseOrder.po_number.ilike(pattern),
                    PurchaseOrder.notes.ilike(pattern),
                )
            )
            .order_by(desc(PurchaseOrder.id))
            .limit(5)
            .all()
        )
        if pos:
            items = [
                SearchItem(
                    id=po.id,
                    title=po.po_number,
                    subtitle=f"PO · ₹{float(po.total_amount):.2f}",
                    entity_type="purchase_order",
                    status=getattr(po.status, "value", str(po.status)),
                    route=f"/inventory?search={po.po_number}",
                )
                for po in pos
            ]
            groups.append(SearchGroup(category="Purchase Orders", entity_type="purchase_order", items=items))
            total_count += len(items)

    return SearchResponse(
        query=query_text,
        total_matches=total_count,
        groups=groups,
    )
