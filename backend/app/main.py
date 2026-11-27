import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.auth import router as auth_router
from app.api.staff import router as staff_router
from fastapi.middleware.cors import CORSMiddleware
from app.api.menu import router as menu_router
from app.api.customer import router as customer_router
from app.api.table import router as table_router
from app.api.order import router as order_router
from app.api.invoice import router as invoice_router
from app.api.payment import router as payment_router
from app.api.dashboard import router as dashboard_router
from app.api.spa import spa_router
from app.api.inventory import router as inventory_router
from app.api.search import router as search_router
from app.api.business_profile import router as business_profile_router
from app.api.villas import router as villas_router
from app.api.packages import router as packages_router
from app.api.activities import router as activities_router
from app.api.transport import router as transport_router

from app.core.image_upload import UPLOAD_ROOT
from app.db.session import engine, get_db
from app.services.order_service import stale_orders_background_worker
from app.core.branding import APP_NAME


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background worker for automatic stale order expiration
    worker_task = asyncio.create_task(stale_orders_background_worker(interval_seconds=300))
    try:
        yield
    finally:
        worker_task.cancel()
        try:
            await worker_task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(
    title=f"{APP_NAME} Unified Resort Management API",
    description=f"{APP_NAME} APIs for Restaurant, Spa & Wellness, and Villas & Units",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])

app.include_router(staff_router, prefix="/api/staff", tags=["Staff Management"])

app.include_router(menu_router, prefix="/api/menu")

app.include_router(customer_router, prefix="/api/customers")

app.include_router(table_router, prefix="/api/tables")

app.include_router(order_router, prefix="/api/orders")

app.include_router(invoice_router, prefix="/api/invoices")

app.include_router(payment_router, prefix="/api/payments")

app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard"])

app.include_router(spa_router, prefix="/api/spa")

app.include_router(inventory_router)

app.include_router(search_router)

app.include_router(business_profile_router, prefix="/api/business-profile", tags=["Business Profile"])

app.include_router(villas_router, prefix="/api/villas", tags=["Villas & Units"])

app.include_router(packages_router, prefix="/api/packages", tags=["Packages"])

app.include_router(activities_router, prefix="/api/activities", tags=["Activities"])

app.include_router(transport_router, prefix="/api/transport", tags=["Transport"])

# Serves uploaded menu photos and supplier bills
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")


@app.get("/")
def root():
    return {"message": f"{APP_NAME} Unified Resort Management API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/health/db")
def database_health(db: Session = Depends(get_db)):

    try:
        db.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": engine.dialect.name,
            "connection": "successful",
        }

    except Exception:
        return {"status": "unhealthy", "database": engine.dialect.name, "connection": "failed"}
