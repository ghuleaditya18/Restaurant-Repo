from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api.auth import router as auth_router
from app.api.staff import router as staff_router
from fastapi.middleware.cors import CORSMiddleware
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
