from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import get_db

app = FastAPI(
    title="Restaurant Management System",
    description="Restaurant Management System API",
    version="1.0.0"
)


@app.get("/")
def root():
    return {
        "message": "Restaurant Management System API is running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }


@app.get("/health/db")
def database_health(db: Session = Depends(get_db)):

    try:
        db.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "PostgreSQL",
            "connection": "successful"
        }

    except Exception:
        return {
            "status": "unhealthy",
            "database": "PostgreSQL",
            "connection": "failed"
        }