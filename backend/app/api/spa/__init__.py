from fastapi import APIRouter

from app.api.spa.services import router as services_router
from app.api.spa.customers import router as customers_router
from app.api.spa.staff import router as staff_router
from app.api.spa.bookings import router as bookings_router
from app.api.spa.invoices import router as invoices_router
from app.api.spa.payments import router as payments_router
from app.api.spa.dashboard import router as dashboard_router

spa_router = APIRouter(tags=["Spa Management"])

spa_router.include_router(dashboard_router)
spa_router.include_router(services_router)
spa_router.include_router(customers_router)
spa_router.include_router(staff_router)
spa_router.include_router(bookings_router)
spa_router.include_router(invoices_router)
spa_router.include_router(payments_router)
