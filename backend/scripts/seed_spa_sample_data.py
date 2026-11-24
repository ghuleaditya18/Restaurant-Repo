"""Add realistic, fictitious spa catalog and profile data to the configured DB.

Safe to run more than once: existing categories, services, staff, and customers
are preserved, and matching seed records are skipped.
"""

from datetime import time
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import engine
from app.models.spa import (
    SpaCustomer,
    SpaService,
    SpaServiceCategory,
    SpaStaff,
    SpaStaffAvailability,
)


CATEGORIES = [
    ("Facials & Skin Care", "Facial treatments focused on cleansing, hydration, and skin tone."),
    ("Ayurveda & Shirodhara", "Traditional Ayurvedic oil therapies and calming head treatments."),
    ("Body Scrubs & Polish", "Exfoliating treatments that leave skin feeling smooth and refreshed."),
    ("Aromatherapy", "Relaxation treatments using carefully selected essential oil blends."),
    ("Reflexology & Foot Care", "Foot rituals and pressure-point treatments for relaxation."),
    ("Hair & Scalp Care", "Nourishing scalp rituals and relaxing head treatments."),
    ("Hydrotherapy & Bath Rituals", "Water, steam, and mineral based spa experiences."),
    ("Body Wraps & Masks", "Nourishing body masks and wraps for a restorative treatment."),
    ("Couples & Shared Rituals", "Treatments designed for two guests to enjoy together."),
    ("Mindfulness & Relaxation", "Guided relaxation sessions supporting rest and wellbeing."),
]

# category name, service name, description, price (INR), duration (minutes)
SERVICES = [
    ("Massage Therapy", "Deep Tissue Therapy", "Focused massage using firm pressure on areas of muscle tension.", "2199.00", 60),
    ("Massage Therapy", "Hot Stone Relaxation Massage", "A soothing full-body massage with warmed smooth stones.", "2499.00", 75),
    ("Facials & Skin Care", "Classic Hydrating Facial", "A cleansing and hydrating facial with a gentle face massage.", "1599.00", 60),
    ("Facials & Skin Care", "Vitamin C Brightening Facial", "A brightening facial with antioxidant-rich skin care products.", "1899.00", 75),
    ("Ayurveda & Shirodhara", "Abhyanga Full Body Ritual", "A traditional warm-oil full-body massage ritual.", "2699.00", 75),
    ("Ayurveda & Shirodhara", "Shirodhara Calm Ritual", "A relaxing head treatment with a gentle, steady flow of warm oil.", "2999.00", 60),
    ("Body Scrubs & Polish", "Coffee Body Scrub", "A full-body exfoliation using a coffee-based scrub.", "1799.00", 50),
    ("Body Scrubs & Polish", "Sea Salt Body Polish", "A refreshing salt polish followed by a moisturizing application.", "1899.00", 60),
    ("Aromatherapy", "Lavender Aroma Massage", "A light-pressure massage with a calming lavender oil blend.", "2299.00", 60),
    ("Aromatherapy", "Citrus Renewal Massage", "A refreshing massage using a bright citrus aroma blend.", "2299.00", 60),
    ("Reflexology & Foot Care", "Foot Reflexology Session", "A focused foot pressure-point session with a warm towel finish.", "1199.00", 45),
    ("Reflexology & Foot Care", "Herbal Foot Renewal", "A warm herbal foot soak followed by a relaxing foot massage.", "1399.00", 50),
    ("Hair & Scalp Care", "Nourishing Scalp Massage", "A relaxing scalp massage with nourishing hair oil.", "999.00", 40),
    ("Hair & Scalp Care", "Herbal Scalp & Hair Mask", "A scalp treatment with a nourishing herbal hair mask.", "1499.00", 60),
    ("Hydrotherapy & Bath Rituals", "Mineral Soak Ritual", "A private mineral bath experience followed by a relaxation period.", "1999.00", 45),
    ("Hydrotherapy & Bath Rituals", "Herbal Steam & Bath", "A gentle herbal steam session with a warm bath ritual.", "1799.00", 50),
    ("Body Wraps & Masks", "Detoxifying Clay Body Wrap", "A full-body clay wrap with a warm towel removal and moisturizer.", "2199.00", 70),
    ("Body Wraps & Masks", "Aloe Comfort Body Mask", "A cooling aloe body mask followed by a gentle moisturizer.", "1999.00", 60),
    ("Couples & Shared Rituals", "Couples Relaxation Massage", "A side-by-side relaxation massage for two guests.", "4499.00", 60),
    ("Couples & Shared Rituals", "Couples Aroma Ritual", "A shared aroma massage experience for two guests.", "4999.00", 75),
    ("Mindfulness & Relaxation", "Guided Mindfulness Session", "A private guided breathing and mindfulness session.", "899.00", 40),
    ("Mindfulness & Relaxation", "Restorative Breathwork Ritual", "A guided breathwork and relaxation session in a quiet room.", "999.00", 45),
]

STAFF = [
    ("SPA-SMP-101", "Ananya Desai", "Senior Skin Therapist", "9000000101", "therapist101@example.test", "Facials & Skin Care"),
    ("SPA-SMP-102", "Riya Menon", "Ayurvedic Therapist", "9000000102", "therapist102@example.test", "Ayurveda & Shirodhara"),
    ("SPA-SMP-103", "Kavya Iyer", "Body Treatment Therapist", "9000000103", "therapist103@example.test", "Body Scrubs & Polish; Body Wraps & Masks"),
    ("SPA-SMP-104", "Nisha Rao", "Aromatherapy Therapist", "9000000104", "therapist104@example.test", "Aromatherapy"),
    ("SPA-SMP-105", "Meera Kulkarni", "Foot Reflexologist", "9000000105", "therapist105@example.test", "Reflexology & Foot Care"),
    ("SPA-SMP-106", "Sana Kapoor", "Scalp Care Therapist", "9000000106", "therapist106@example.test", "Hair & Scalp Care"),
    ("SPA-SMP-107", "Aditi Shah", "Hydrotherapy Therapist", "9000000107", "therapist107@example.test", "Hydrotherapy & Bath Rituals"),
    ("SPA-SMP-108", "Isha Nair", "Wellness Therapist", "9000000108", "therapist108@example.test", "Mindfulness & Relaxation"),
    ("SPA-SMP-109", "Pooja Bhat", "Massage Therapist", "9000000109", "therapist109@example.test", "Massage Therapy; Aromatherapy"),
    ("SPA-SMP-110", "Tara Fernandes", "Couples Spa Therapist", "9000000110", "therapist110@example.test", "Couples & Shared Rituals; Massage Therapy"),
]

CUSTOMERS = [
    ("Aarav Mehta", "9100000101", "guest101@example.test", "Sample guest profile for spa booking workflows."),
    ("Diya Joshi", "9100000102", "guest102@example.test", "Prefers afternoon appointments."),
    ("Kabir Sethi", "9100000103", "guest103@example.test", "Interested in massage and relaxation treatments."),
    ("Mira Kapoor", "9100000104", "guest104@example.test", "Sample guest profile for spa booking workflows."),
    ("Arjun Rao", "9100000105", "guest105@example.test", "Prefers gentle pressure treatments."),
    ("Ira Kulkarni", "9100000106", "guest106@example.test", "Interested in skin care services."),
    ("Neil Thomas", "9100000107", "guest107@example.test", "Sample guest profile for spa booking workflows."),
    ("Sia Malhotra", "9100000108", "guest108@example.test", "Interested in Ayurvedic rituals."),
    ("Rehan Patel", "9100000109", "guest109@example.test", "Sample guest profile for spa booking workflows."),
    ("Avni Shah", "9100000110", "guest110@example.test", "Interested in couples and shared rituals."),
]


def seed() -> dict[str, int]:
    added = {"categories": 0, "services": 0, "staff": 0, "availability_rows": 0, "customers": 0}
    with Session(engine) as session:
        categories = {
            row.name: row
            for row in session.scalars(select(SpaServiceCategory)).all()
        }
        for name, description in CATEGORIES:
            if name not in categories:
                category = SpaServiceCategory(name=name, description=description, is_active=True)
                session.add(category)
                session.flush()
                categories[name] = category
                added["categories"] += 1

        for category_name, name, description, price, duration in SERVICES:
            category = categories.get(category_name)
            if category is None:
                raise RuntimeError(f"Required category missing: {category_name}")
            existing = session.scalar(
                select(SpaService.id).where(
                    SpaService.category_id == category.id,
                    SpaService.name == name,
                )
            )
            if existing is None:
                session.add(
                    SpaService(
                        category_id=category.id,
                        name=name,
                        description=description,
                        price=Decimal(price),
                        duration_minutes=duration,
                        is_available=True,
                    )
                )
                added["services"] += 1

        for code, name, designation, phone, email, specialization in STAFF:
            existing = session.scalar(
                select(SpaStaff.id).where(
                    (SpaStaff.employee_code == code) | (SpaStaff.email == email)
                )
            )
            if existing is not None:
                continue
            staff = SpaStaff(
                employee_code=code,
                full_name=name,
                designation=designation,
                phone=phone,
                email=email,
                specialization=specialization,
                is_therapist=True,
                is_active=True,
            )
            session.add(staff)
            session.flush()
            added["staff"] += 1
            # Monday through Saturday, 10:00–18:00; Sunday is unavailable.
            for day in range(7):
                session.add(
                    SpaStaffAvailability(
                        staff_id=staff.id,
                        day_of_week=day,
                        start_time=time(10, 0),
                        end_time=time(18, 0),
                        is_available=(day < 6),
                    )
                )
                added["availability_rows"] += 1

        for name, phone, email, notes in CUSTOMERS:
            existing = session.scalar(
                select(SpaCustomer.id).where(
                    (SpaCustomer.email == email) | (SpaCustomer.phone == phone)
                )
            )
            if existing is None:
                session.add(
                    SpaCustomer(
                        full_name=name,
                        phone=phone,
                        email=email,
                        notes=notes,
                        is_active=True,
                    )
                )
                added["customers"] += 1

        session.commit()
        return added


if __name__ == "__main__":
    print(seed())
