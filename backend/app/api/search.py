from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    Villa,
    Unit,
    VillaGuest,
    StayBooking,
    VillaService,
    VillaInvoice,
    Package,
    PackageBooking,
    TransportVehicle,
    TransportDriver,
    TransportRoute,
    TransportBooking,
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
    Search records within the user's authorized business context (RESTAURANT, SPA, or VILLA).
    Strict isolation is enforced across modules; unsupported contexts are rejected.
    """
    query_text = q.strip()
    if not query_text:
        return SearchResponse(query="", total_matches=0, groups=[])

    pattern = f"%{query_text}%"
    raw_context = getattr(current_user, "business_context", None)
    biz_context = str(getattr(raw_context, "value", raw_context) or "").strip().upper()
    biz_context = {"VILLAS": "VILLA", "NIWARAAI": "VILLA", "PACKAGES": "PACKAGE", "TRANSPORTS": "TRANSPORT"}.get(biz_context, biz_context)
    if biz_context not in {"RESTAURANT", "SPA", "VILLA", "PACKAGE", "TRANSPORT"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: unsupported business context.",
        )

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

    elif biz_context == "VILLA":
        # VILLA CONTEXT - Only Villas & Units entities (never query shared/Restaurant tables directly)
        # 1. Villas
        villas = (
            db.query(Villa)
            .filter(
                or_(
                    Villa.name.ilike(pattern),
                    Villa.address.ilike(pattern),
                )
            )
            .order_by(Villa.name.asc())
            .limit(5)
            .all()
        )
        if villas:
            items = [
                SearchItem(
                    id=v.id,
                    title=v.name,
                    subtitle=f"Villa · {v.address or 'Property'}",
                    entity_type="villa",
                    status="Active" if v.is_active else "Inactive",
                    route="/villas/inventory",
                )
                for v in villas
            ]
            groups.append(SearchGroup(category="Villas", entity_type="villa", items=items))
            total_count += len(items)

        # 2. Units
        units = (
            db.query(Unit)
            .filter(Unit.name.ilike(pattern))
            .order_by(Unit.name.asc())
            .limit(5)
            .all()
        )
        if units:
            items = [
                SearchItem(
                    id=u.id,
                    title=u.name,
                    subtitle=f"Unit · {u.villa.name if u.villa else 'Villa'} · Capacity {u.capacity}",
                    entity_type="unit",
                    status=u.housekeeping_status if u.is_active else "Inactive",
                    route="/villas/inventory",
                )
                for u in units
            ]
            groups.append(SearchGroup(category="Units", entity_type="unit", items=items))
            total_count += len(items)

        # 3. Villas Guests (strictly module-scoped villa_guests table)
        villa_guests = (
            db.query(VillaGuest)
            .filter(
                or_(
                    VillaGuest.full_name.ilike(pattern),
                    VillaGuest.phone.ilike(pattern),
                    VillaGuest.email.ilike(pattern),
                    VillaGuest.guest_reference.ilike(pattern),
                )
            )
            .order_by(VillaGuest.full_name.asc())
            .limit(5)
            .all()
        )
        if villa_guests:
            items = [
                SearchItem(
                    id=vg.id,
                    title=vg.full_name,
                    subtitle=f"Guest · {vg.phone} · {vg.guest_reference}",
                    entity_type="customer",
                    status="Active" if vg.is_active else "Inactive",
                    route=f"/villas/guests?search={vg.full_name}",
                )
                for vg in villa_guests
            ]
            groups.append(SearchGroup(category="Guests", entity_type="customer", items=items))
            total_count += len(items)

        # 4. Stay Bookings (joined strictly to villa_guests)
        stays = (
            db.query(StayBooking)
            .outerjoin(VillaGuest, StayBooking.guest_id == VillaGuest.id)
            .filter(
                or_(
                    StayBooking.booking_number.ilike(pattern),
                    VillaGuest.full_name.ilike(pattern),
                    VillaGuest.phone.ilike(pattern),
                )
            )
            .order_by(desc(StayBooking.id))
            .limit(5)
            .all()
        )
        if stays:
            items = [
                SearchItem(
                    id=s.id,
                    title=f"{s.booking_number} · {s.guest.full_name if s.guest else (s.customer.full_name if s.customer else 'Guest')}",
                    subtitle=f"{s.unit.name if s.unit else 'Unit'} · {s.check_in} to {s.check_out}",
                    entity_type="booking",
                    status=s.status,
                    route="/villas/bookings",
                )
                for s in stays
            ]
            groups.append(SearchGroup(category="Stay Bookings", entity_type="booking", items=items))
            total_count += len(items)

        # 4. Villa Guest Services
        villa_services = (
            db.query(VillaService)
            .filter(
                or_(
                    VillaService.name.ilike(pattern),
                    VillaService.description.ilike(pattern),
                )
            )
            .order_by(VillaService.name.asc())
            .limit(5)
            .all()
        )
        if villa_services:
            items = [
                SearchItem(
                    id=vs.id,
                    title=vs.name,
                    subtitle=f"Guest Service · ₹{float(vs.price):.2f}",
                    entity_type="service",
                    status="Active" if vs.is_active else "Inactive",
                    route="/villas/services",
                )
                for vs in villa_services
            ]
            groups.append(SearchGroup(category="Guest Services", entity_type="service", items=items))
            total_count += len(items)

        # 5. Villa Invoices
        villa_invoices = (
            db.query(VillaInvoice)
            .filter(VillaInvoice.invoice_number.ilike(pattern))
            .order_by(desc(VillaInvoice.id))
            .limit(5)
            .all()
        )
        if villa_invoices:
            items = [
                SearchItem(
                    id=vi.id,
                    title=vi.invoice_number,
                    subtitle=f"Villa Invoice · ₹{float(vi.total_amount):.2f}",
                    entity_type="invoice",
                    status=vi.payment_status,
                    route="/villas/invoices",
                )
                for vi in villa_invoices
            ]
            groups.append(SearchGroup(category="Invoices", entity_type="invoice", items=items))
            total_count += len(items)

    elif biz_context == "RESTAURANT":
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
            .filter(
                Invoice.source_module == "RESTAURANT",
                Invoice.order_id.isnot(None),
                Invoice.invoice_number.ilike(pattern),
            )
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

    elif biz_context == "PACKAGE":
        pkgs = (
            db.query(Package)
            .filter(
                Package.is_deleted.is_(False),
                or_(
                    Package.name.ilike(pattern),
                    Package.package_code.ilike(pattern),
                    Package.category.ilike(pattern),
                ),
            )
            .order_by(Package.name.asc())
            .limit(5)
            .all()
        )
        if pkgs:
            items = [
                SearchItem(
                    id=p.id,
                    title=f"{p.name} ({p.package_code})",
                    subtitle=f"{p.category} · {p.duration_nights}N · ₹{float(p.price):.2f} ({p.pricing_type})",
                    entity_type="package",
                    status=p.status,
                    route=f"/packages/catalog?search={p.package_code}",
                )
                for p in pkgs
            ]
            groups.append(SearchGroup(category="Packages", entity_type="package", items=items))
            total_count += len(items)

        pkg_bookings = (
            db.query(PackageBooking)
            .outerjoin(Customer, PackageBooking.customer_id == Customer.id)
            .filter(
                PackageBooking.is_deleted.is_(False),
                or_(
                    PackageBooking.booking_number.ilike(pattern),
                    PackageBooking.package_name_snapshot.ilike(pattern),
                    Customer.full_name.ilike(pattern),
                    Customer.phone.ilike(pattern),
                ),
            )
            .order_by(desc(PackageBooking.id))
            .limit(5)
            .all()
        )
        if pkg_bookings:
            items = [
                SearchItem(
                    id=b.id,
                    title=f"{b.booking_number} · {b.customer.full_name if b.customer else 'Guest'}",
                    subtitle=f"{b.package_name_snapshot} · Start {b.start_date}",
                    entity_type="booking",
                    status=b.status,
                    route=f"/packages/bookings?search={b.booking_number}",
                )
                for b in pkg_bookings
            ]
            groups.append(SearchGroup(category="Package Bookings", entity_type="booking", items=items))
            total_count += len(items)

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
                    subtitle=f"Customer · {c.phone or c.email or 'Registered Customer'}",
                    entity_type="customer",
                    status=None,
                    route=f"/packages/customers?search={c.full_name}",
                )
                for c in customers
            ]
            groups.append(SearchGroup(category="Customers", entity_type="customer", items=items))
            total_count += len(items)

        pkg_invoices = (
            db.query(Invoice)
            .filter(
                Invoice.source_module == "PACKAGE",
                or_(
                    Invoice.invoice_number.ilike(pattern),
                    Invoice.source_reference_number.ilike(pattern),
                ),
            )
            .order_by(desc(Invoice.id))
            .limit(5)
            .all()
        )
        if pkg_invoices:
            items = [
                SearchItem(
                    id=inv.id,
                    title=inv.invoice_number,
                    subtitle=f"Booking {inv.source_reference_number or '—'} · ₹{float(inv.total_amount):.2f}",
                    entity_type="invoice",
                    status=getattr(inv.payment_status, "value", str(inv.payment_status)),
                    route=f"/packages/invoices?search={inv.invoice_number}",
                )
                for inv in pkg_invoices
            ]
            groups.append(SearchGroup(category="Invoices", entity_type="invoice", items=items))
            total_count += len(items)

    elif biz_context == "TRANSPORT":
        vehicles = (
            db.query(TransportVehicle)
            .filter(
                TransportVehicle.is_deleted.is_(False),
                or_(
                    TransportVehicle.vehicle_name.ilike(pattern),
                    TransportVehicle.registration_number.ilike(pattern),
                    TransportVehicle.make.ilike(pattern),
                    TransportVehicle.model.ilike(pattern),
                ),
            )
            .order_by(TransportVehicle.vehicle_name.asc())
            .limit(5)
            .all()
        )
        if vehicles:
            items = [
                SearchItem(
                    id=v.id,
                    title=f"{v.vehicle_name} ({v.registration_number})",
                    subtitle=f"{v.make} {v.model} · {v.seating_capacity} seats · {v.fuel_type}",
                    entity_type="vehicle",
                    status=v.status,
                    route=f"/transport/vehicles?search={v.registration_number}",
                )
                for v in vehicles
            ]
            groups.append(SearchGroup(category="Vehicles", entity_type="vehicle", items=items))
            total_count += len(items)

        drivers = (
            db.query(TransportDriver)
            .filter(
                TransportDriver.is_deleted.is_(False),
                or_(
                    TransportDriver.driver_name.ilike(pattern),
                    TransportDriver.phone.ilike(pattern),
                    TransportDriver.licence_number.ilike(pattern),
                ),
            )
            .order_by(TransportDriver.driver_name.asc())
            .limit(5)
            .all()
        )
        if drivers:
            items = [
                SearchItem(
                    id=d.id,
                    title=d.driver_name,
                    subtitle=f"Driver · {d.phone} · Licence {d.licence_number}",
                    entity_type="driver",
                    status=d.availability_status,
                    route=f"/transport/drivers?search={d.driver_name}",
                )
                for d in drivers
            ]
            groups.append(SearchGroup(category="Drivers", entity_type="driver", items=items))
            total_count += len(items)

        routes = (
            db.query(TransportRoute)
            .filter(
                TransportRoute.is_deleted.is_(False),
                or_(
                    TransportRoute.route_name.ilike(pattern),
                    TransportRoute.route_code.ilike(pattern),
                    TransportRoute.starting_location.ilike(pattern),
                    TransportRoute.destination.ilike(pattern),
                ),
            )
            .order_by(TransportRoute.route_name.asc())
            .limit(5)
            .all()
        )
        if routes:
            items = [
                SearchItem(
                    id=r.id,
                    title=f"{r.route_name} ({r.route_code})",
                    subtitle=f"{r.starting_location} → {r.destination}",
                    entity_type="route",
                    status="Active" if r.is_active else "Inactive",
                    route=f"/transport/routes?search={r.route_code}",
                )
                for r in routes
            ]
            groups.append(SearchGroup(category="Routes", entity_type="route", items=items))
            total_count += len(items)

        trn_bookings = (
            db.query(TransportBooking)
            .outerjoin(Customer, TransportBooking.customer_id == Customer.id)
            .filter(
                TransportBooking.is_deleted.is_(False),
                or_(
                    TransportBooking.booking_number.ilike(pattern),
                    TransportBooking.pickup_location.ilike(pattern),
                    TransportBooking.drop_location.ilike(pattern),
                    Customer.full_name.ilike(pattern),
                    Customer.phone.ilike(pattern),
                ),
            )
            .order_by(desc(TransportBooking.id))
            .limit(5)
            .all()
        )
        if trn_bookings:
            items = [
                SearchItem(
                    id=b.id,
                    title=f"{b.booking_number} · {b.customer.full_name if b.customer else 'Guest'}",
                    subtitle=f"{b.pickup_location} → {b.drop_location} · {b.pickup_date}",
                    entity_type="booking",
                    status=b.status,
                    route=f"/transport/bookings?search={b.booking_number}",
                )
                for b in trn_bookings
            ]
            groups.append(SearchGroup(category="Transport Bookings", entity_type="booking", items=items))
            total_count += len(items)

        trn_invoices = (
            db.query(Invoice)
            .filter(
                Invoice.source_module == "TRANSPORT",
                or_(
                    Invoice.invoice_number.ilike(pattern),
                    Invoice.source_reference_number.ilike(pattern),
                ),
            )
            .order_by(desc(Invoice.id))
            .limit(5)
            .all()
        )
        if trn_invoices:
            items = [
                SearchItem(
                    id=inv.id,
                    title=inv.invoice_number,
                    subtitle=f"Booking {inv.source_reference_number or '—'} · ₹{float(inv.total_amount):.2f}",
                    entity_type="invoice",
                    status=getattr(inv.payment_status, "value", str(inv.payment_status)),
                    route=f"/transport/invoices?search={inv.invoice_number}",
                )
                for inv in trn_invoices
            ]
            groups.append(SearchGroup(category="Invoices", entity_type="invoice", items=items))
            total_count += len(items)

    return SearchResponse(
        query=query_text,
        total_matches=total_count,
        groups=groups,
    )
