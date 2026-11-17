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

from app.core.image_upload import UPLOAD_ROOT
from app.db.session import get_db

app = FastAPI(
    title="Restaurant Management System",
    description="Restaurant Management System API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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

# Serves uploaded menu photos, e.g. http://localhost:8000/uploads/menu/<name>.jpg
# (the folder is created when app.core.image_upload is imported)

app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")


@app.get("/")
def root():
    return {"message": "Restaurant Management System API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/health/db")
def database_health(db: Session = Depends(get_db)):

    try:
        db.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "PostgreSQL",
            "connection": "successful",
        }

    except Exception:
        return {"status": "unhealthy", "database": "PostgreSQL", "connection": "failed"}
