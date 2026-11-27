"""Isolated FastAPI application for the Activities Management module.

Runs on port 8003 with its own database (newaraai_activities_dev).
Only registers the auth router and the activities router.
No Restaurant, Spa, Villas or Packages routers are mounted here.

Usage:
    # From backend/ directory, with .env.activities.local in place:
    $env:ENV_FILE=".env.activities.local"
    uvicorn main_activities:app --host 127.0.0.1 --port 8003 --reload
"""

from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Load the activities-specific environment file BEFORE importing app modules
# so that settings are overridden correctly.
# ---------------------------------------------------------------------------
_env_file = os.environ.get("ENV_FILE", ".env.activities.local")
_env_path = Path(__file__).parent / _env_file
if _env_path.is_file():
    from dotenv import load_dotenv
    load_dotenv(_env_path, override=True)
else:
    # Fall back to .env if the activities env file is missing (will likely
    # point at the wrong DB, but we guard against that in provisioning).
    print(
        f"[main_activities] WARNING: '{_env_path}' not found. "
        "Copy .env.activities.local.example and fill in DB credentials."
    )

# ---------------------------------------------------------------------------
# App construction
# ---------------------------------------------------------------------------
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.business_profile import router as business_profile_router
from app.api.activities import router as activities_router
from app.core.image_upload import UPLOAD_ROOT
from app.db.session import engine

app = FastAPI(
    title="NewaraAI Activities Management API",
    description="Isolated API server for the Activities Management module (port 8003)",
    version="1.0.0",
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

# Auth & Business Profile are shared — both enforce context=ACTIVITY from the JWT
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(business_profile_router, prefix="/api/business-profile", tags=["Business Profile"])

# Activities router provides all module endpoints under /api/activities
app.include_router(activities_router, prefix="/api/activities", tags=["Activities"])

# Serve uploaded images (shared uploads directory)
if UPLOAD_ROOT.exists():
    app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")


@app.get("/")
def root():
    return {
        "message": "NewaraAI Activities Management API is running",
        "port": 8003,
        "module": "ACTIVITY",
        "db": engine.url.database if hasattr(engine.url, "database") else "n/a",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy", "module": "ACTIVITY"}
