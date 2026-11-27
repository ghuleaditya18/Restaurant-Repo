"""Idempotent demo seed script for the isolated Packages development database (newaraai_packages_dev).

Usage:
    python scripts/seed_packages_demo.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

ENV_PACKAGES_LOCAL = BACKEND_DIR / ".env.packages.local"
if ENV_PACKAGES_LOCAL.is_file():
    load_dotenv(ENV_PACKAGES_LOCAL, override=True)

from app.core.date_utils import get_kolkata_today  # noqa: E402
from app.db.session import OPERATIONAL_DB_NAMES  # noqa: E402
from app.models.entities import Customer  # noqa: E402
from app.models.packages import (  # noqa: E402
    Package,
    PackageBlackout,
    PackageBooking,
    PackageBookingItem,
    PackageBookingStatus,
    PackageItem,
    PackageStatus,
)
from app.services.packages_service import (  # noqa: E402
    calculate_package_price,
    create_package_invoice_for_booking,
    generate_package_booking_number,
    money,
    record_package_booking_history,
    record_package_payment,
)


def seed_demo(apply: bool = False) -> None:
    db_url = os.environ.get("PACKAGES_DEV_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("Missing database URL. Configure .env.packages.local first.")
    db_name = (make_url(db_url).database or "").strip()
    if db_name in OPERATIONAL_DB_NAMES:
        raise RuntimeError(f"Refusing to seed operational database '{db_name}'.")
    if "packages" not in db_name.lower():
        raise RuntimeError(f"Refusing to seed non-packages database '{db_name}'.")

    if not apply:
        print(f"Dry run OK against isolated DB '{db_name}'. Re-run with --apply to seed demo data.")
        return

    engine = create_engine(db_url, pool_pre_ping=True)
    Session = sessionmaker(autoflush=False, expire_on_commit=False, bind=engine)
    today = get_kolkata_today()

    try:
        with Session() as db:
            demo_packages = [
                {
                    "package_code": "DEMO-COUPLE-01",
                    "name": "Golden Horizon Couple Retreat",
                    "category": "Couple",
                    "description": "Candlelit terrace dining, private villa stay, and sunset wellness ritual.",
                    "duration_nights": 2,
                    "min_guests": 2,
                    "max_guests": 2,
                    "pricing_type": "Per Package",
                    "price": Decimal("24500.00"),
                    "valid_from": today - timedelta(days=5),
                    "valid_to": today + timedelta(days=90),
                    "applicable_accommodation_types": "Luxury Pool Villa, Cliffside Suite",
                    "is_customizable": True,
                    "is_seasonal_offer": False,
                    "offer_badge": "Couple Favorite",
                    "status": PackageStatus.AVAILABLE.value,
                    "items": [
                        ("Unit Stay", "2 Nights Private Pool Villa Stay", 2, False),
                        ("Meal Plan", "Candlelit 4-Course Terrace Dinner & Breakfast", 2, False),
                        ("Spa Service", "60-Min Couple Aromatherapy Spa Session", 1, False),
                        ("Transport Service", "Chauffeured Airport Pick-up & Drop", 1, True),
                    ],
                },
                {
                    "package_code": "DEMO-FAM-02",
                    "name": "Sunlit Family Poolside Escape",
                    "category": "Family",
                    "description": "All-inclusive family villa retreat with poolside breakfast and nature trails.",
                    "duration_nights": 3,
                    "min_guests": 2,
                    "max_guests": 6,
                    "pricing_type": "Per Night",
                    "price": Decimal("12500.00"),
                    "valid_from": today - timedelta(days=5),
                    "valid_to": today + timedelta(days=120),
                    "applicable_accommodation_types": "2-Bedroom Family Pavilion",
                    "is_customizable": True,
                    "is_seasonal_offer": False,
                    "offer_badge": "Family Value",
                    "status": PackageStatus.AVAILABLE.value,
                    "items": [
                        ("Unit Stay", "3 Nights Family Courtyard Pavilion", 3, False),
                        ("Meal Plan", "Daily Resort Buffet Breakfast & High Tea", 3, False),
                        ("Activity", "Guided Plantation Walk & Kids Craft Hour", 1, True),
                    ],
                },
                {
                    "package_code": "DEMO-WELL-03",
                    "name": "Ayurvedic Serenity Wellness Weekender",
                    "category": "Wellness",
                    "description": "Holistic rejuvenation with daily spa therapies and herbal cuisine.",
                    "duration_nights": 2,
                    "min_guests": 1,
                    "max_guests": 4,
                    "pricing_type": "Per Person",
                    "price": Decimal("8500.00"),
                    "valid_from": today,
                    "valid_to": today + timedelta(days=10),  # Approaching expiry alert!
                    "applicable_accommodation_types": "Garden Serenity Cottage",
                    "is_customizable": False,
                    "is_seasonal_offer": True,
                    "offer_badge": "Ending Soon",
                    "status": PackageStatus.PUBLISHED.value,
                    "items": [
                        ("Unit Stay", "2 Nights Garden Serenity Cottage", 2, False),
                        ("Spa Service", "Daily Abhyanga & Shirodhara Ritual", 2, False),
                        ("Amenity", "Organic Herbal Welcome Hamper", 1, False),
                    ],
                },
                {
                    "package_code": "DEMO-SEAS-04",
                    "name": "Festive Monsoon Lantern Celebration",
                    "category": "Seasonal",
                    "description": "Seasonal festive celebration package with private banquet dining and live acoustic evening.",
                    "duration_nights": 2,
                    "min_guests": 2,
                    "max_guests": 8,
                    "pricing_type": "Per Package",
                    "price": Decimal("32000.00"),
                    "valid_from": today - timedelta(days=2),
                    "valid_to": today + timedelta(days=45),
                    "applicable_accommodation_types": "Royal Pavilion, Pool Villa",
                    "is_customizable": True,
                    "is_seasonal_offer": True,
                    "offer_badge": "Monsoon Special",
                    "status": PackageStatus.AVAILABLE.value,
                    "items": [
                        ("Unit Stay", "2 Nights Royal Garden Pavilion", 2, False),
                        ("Event", "Private Lantern Banquet Setup", 1, False) if False else ("Meal Plan", "Festive 5-Course Gala Banquet", 1, False),
                        ("Amenity", "Festive Welcome Artisanal Sweets", 1, False),
                    ],
                },
                {
                    "package_code": "DEMO-ADV-05",
                    "name": "Sahyadri Ridge Adventure Draft",
                    "category": "Adventure",
                    "description": "Draft adventure package awaiting final inclusion review.",
                    "duration_nights": 2,
                    "min_guests": 2,
                    "max_guests": 6,
                    "pricing_type": "Per Person",
                    "price": Decimal("6800.00"),
                    "valid_from": today + timedelta(days=5),
                    "valid_to": today + timedelta(days=60),
                    "applicable_accommodation_types": "Forest Canopy Tent",
                    "is_customizable": False,
                    "is_seasonal_offer": False,
                    "offer_badge": None,
                    "status": PackageStatus.DRAFT.value,
                    "items": [
                        ("Activity", "Sunrise Ridge Trek with Naturalist", 1, False),
                    ],
                },
                {
                    "package_code": "DEMO-WKND-06",
                    "name": "Winter Mist Upcoming Weekend",
                    "category": "Weekend",
                    "description": "Upcoming winter retreat opening next week.",
                    "duration_nights": 2,
                    "min_guests": 2,
                    "max_guests": 4,
                    "pricing_type": "Per Package",
                    "price": Decimal("18900.00"),
                    "valid_from": today + timedelta(days=10),
                    "valid_to": today + timedelta(days=75),
                    "applicable_accommodation_types": "Hilltop Cottage",
                    "is_customizable": False,
                    "is_seasonal_offer": True,
                    "offer_badge": "Upcoming Drop",
                    "status": PackageStatus.UPCOMING.value,
                    "items": [
                        ("Unit Stay", "2 Nights Hilltop Cottage", 2, False),
                        ("Meal Plan", "Fireplace Dinner & Cocoa Evening", 2, False),
                    ],
                },
                {
                    "package_code": "DEMO-EVT-07",
                    "name": "Gala Lawn Soiree (Paused)",
                    "category": "Event",
                    "description": "Private celebration package temporarily paused during lawn refurbishment.",
                    "duration_nights": 1,
                    "min_guests": 4,
                    "max_guests": 12,
                    "pricing_type": "Per Package",
                    "price": Decimal("45000.00"),
                    "valid_from": today,
                    "valid_to": today + timedelta(days=90),
                    "applicable_accommodation_types": "Heritage Lawn Villa",
                    "is_customizable": True,
                    "is_seasonal_offer": False,
                    "offer_badge": None,
                    "status": PackageStatus.PAUSED.value,
                    "items": [
                        ("Amenity", "Private Lawn Acoustic Decor", 1, False),
                    ],
                },
                {
                    "package_code": "DEMO-EXP-08",
                    "name": "Autumn Harvest Retreat (Expired)",
                    "category": "Weekend",
                    "description": "Past autumn weekend escape whose validity window has ended.",
                    "duration_nights": 2,
                    "min_guests": 2,
                    "max_guests": 4,
                    "pricing_type": "Per Package",
                    "price": Decimal("15500.00"),
                    "valid_from": today - timedelta(days=45),
                    "valid_to": today - timedelta(days=5),
                    "applicable_accommodation_types": "Garden Suite",
                    "is_customizable": False,
                    "is_seasonal_offer": False,
                    "offer_badge": None,
                    "status": PackageStatus.EXPIRED.value,
                    "items": [
                        ("Unit Stay", "2 Nights Garden Suite", 2, False),
                    ],
                },
                {
                    "package_code": "DEMO-ARC-09",
                    "name": "Classic Monsoon Heritage (Archived)",
                    "category": "Seasonal",
                    "description": "Discontinued seasonal heritage showcase package.",
                    "duration_nights": 2,
                    "min_guests": 2,
                    "max_guests": 4,
                    "pricing_type": "Per Package",
                    "price": Decimal("21000.00"),
                    "valid_from": today - timedelta(days=60),
                    "valid_to": today + timedelta(days=30),
                    "applicable_accommodation_types": "Heritage Suite",
                    "is_customizable": False,
                    "is_seasonal_offer": True,
                    "offer_badge": None,
                    "status": PackageStatus.ARCHIVED.value,
                    "items": [
                        ("Unit Stay", "2 Nights Heritage Suite", 2, False),
                    ],
                },
            ]

            created_pkgs: dict[str, Package] = {}
            for spec in demo_packages:
                existing = db.query(Package).filter(Package.package_code == spec["package_code"]).first()
                if existing:
                    created_pkgs[spec["package_code"]] = existing
                    continue
                items_data = spec.pop("items")
                pkg = Package(**spec)
                db.add(pkg)
                db.flush()
                for idx, (itype, desc, qty, opt) in enumerate(items_data):
                    db.add(
                        PackageItem(
                            package_id=pkg.id,
                            inclusion_type=itype,
                            description=desc,
                            quantity=qty,
                            is_optional=opt,
                            sort_order=idx,
                        )
                    )
                if pkg.package_code == "DEMO-SEAS-04":
                    db.add(
                        PackageBlackout(
                            package_id=pkg.id,
                            start_date=today + timedelta(days=20),
                            end_date=today + timedelta(days=22),
                            reason="DEMO: Private Corporate Buyout",
                            is_active=True,
                        )
                    )
                created_pkgs[pkg.package_code] = pkg
            db.commit()

            # Demo Customer + Demo Bookings
            demo_cust = db.query(Customer).filter(Customer.phone == "9890011223").first()
            if not demo_cust:
                demo_cust = Customer(
                    full_name="Ananya Deshmukh (Demo)",
                    phone="9890011223",
                    email="ananya.demo@example.test",
                    address="Koregaon Park, Pune",
                )
                db.add(demo_cust)
                db.commit()
                db.refresh(demo_cust)

            existing_bk = db.query(PackageBooking).filter(PackageBooking.package_id == created_pkgs["DEMO-COUPLE-01"].id).first()
            if not existing_bk:
                pkg = created_pkgs["DEMO-COUPLE-01"]
                total = calculate_package_price(
                    pricing_type=pkg.pricing_type,
                    unit_price=pkg.price,
                    guest_count=2,
                    duration_nights=pkg.duration_nights,
                )
                bk = PackageBooking(
                    business_context="PACKAGE",
                    booking_number=generate_package_booking_number(db),
                    package_id=pkg.id,
                    customer_id=demo_cust.id,
                    booking_date=today,
                    start_date=today + timedelta(days=3),
                    end_date=today + timedelta(days=3 + pkg.duration_nights),
                    guest_count=2,
                    package_name_snapshot=pkg.name,
                    package_code_snapshot=pkg.package_code,
                    package_category_snapshot=pkg.category,
                    pricing_type_snapshot=pkg.pricing_type,
                    unit_price_snapshot=money(pkg.price),
                    duration_nights_snapshot=pkg.duration_nights,
                    total_amount=total,
                    terms_snapshot=pkg.terms_and_conditions,
                    exclusions_snapshot=pkg.exclusions,
                    status=PackageBookingStatus.CONFIRMED.value,
                    notes="DEMO: Anniversary celebration",
                    source_identifier="PACKAGE_BOOKING",
                )
                db.add(bk)
                db.flush()
                for it in pkg.items:
                    db.add(
                        PackageBookingItem(
                            booking_id=bk.id,
                            package_item_id=it.id,
                            inclusion_type=it.inclusion_type,
                            description=it.description,
                            quantity=it.quantity,
                            is_optional=it.is_optional,
                            is_selected=True,
                            billing_source="PACKAGE",
                        )
                    )
                record_package_booking_history(
                    db,
                    booking_id=bk.id,
                    action="CREATED",
                    previous_status=None,
                    new_status=PackageBookingStatus.CONFIRMED.value,
                    changed_by=None,
                    reason="DEMO booking seeded",
                )
                inv = create_package_invoice_for_booking(db, booking=bk, gst_rate=Decimal("18.00"))
                db.commit()
                record_package_payment(
                    db,
                    invoice_id=inv.id,
                    amount=Decimal("10000.00"),
                    payment_method="UPI",
                    payment_type="Advance",
                    reference_number="DEMO-UPI-001",
                    received_by_user_id=None,
                )
        print(f"Demo data seeded cleanly in '{db_name}'.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Apply demo seed data to isolated Packages DB")
    args = parser.parse_args()
    seed_demo(apply=args.apply)
