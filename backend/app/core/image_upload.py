"""Helpers for saving and removing menu item and supplier bill images.

Place this file at: app/core/image_upload.py
"""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

# <project root>/uploads/menu, /uploads/bills, /uploads/profiles, /uploads/founders
PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = PROJECT_ROOT / "uploads"
MENU_UPLOAD_DIR = UPLOAD_ROOT / "menu"
BILL_UPLOAD_DIR = UPLOAD_ROOT / "bills"
PROFILE_UPLOAD_DIR = UPLOAD_ROOT / "profiles"
FOUNDER_UPLOAD_DIR = UPLOAD_ROOT / "founders"

MENU_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BILL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROFILE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
FOUNDER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


def detect_extension(data: bytes) -> str | None:
    """Detect the real file type from the first bytes, not from the file name."""
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data.startswith(b"%PDF"):
        return ".pdf"
    return None


async def save_menu_image(file: UploadFile) -> str:
    """Validate and save an uploaded image. Returns the path to store in the DB."""
    data = await file.read(MAX_IMAGE_SIZE + 1)

    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller.")

    extension = detect_extension(data)
    if not extension or extension == ".pdf":
        raise HTTPException(
            status_code=400, detail="Only JPG, PNG or WebP images are allowed."
        )

    filename = f"{uuid.uuid4().hex}{extension}"
    (MENU_UPLOAD_DIR / filename).write_bytes(data)

    return f"/uploads/menu/{filename}"


def remove_menu_image(image_url: str | None) -> None:
    """Delete a stored image file. Safe to call with None or a missing file."""
    if not image_url:
        return

    (MENU_UPLOAD_DIR / Path(image_url).name).unlink(missing_ok=True)


async def save_bill_image(file: UploadFile) -> str:
    """Validate and save an uploaded supplier bill (JPG, PNG, WebP or PDF)."""
    data = await file.read(MAX_IMAGE_SIZE + 1)

    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Bill file must be 5 MB or smaller.")

    extension = detect_extension(data)
    if not extension:
        raise HTTPException(
            status_code=400, detail="Only JPG, PNG, WebP or PDF files are allowed."
        )

    filename = f"{uuid.uuid4().hex}{extension}"
    (BILL_UPLOAD_DIR / filename).write_bytes(data)

    return f"/uploads/bills/{filename}"


def remove_bill_image(bill_url: str | None) -> None:
    """Delete a stored bill file."""
    if not bill_url:
        return

    (BILL_UPLOAD_DIR / Path(bill_url).name).unlink(missing_ok=True)


async def save_profile_image(file: UploadFile) -> str:
    """Validate and save an uploaded user profile image (JPG, PNG, WebP)."""
    data = await file.read(MAX_IMAGE_SIZE + 1)

    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Profile picture must be 5 MB or smaller.")

    extension = detect_extension(data)
    if not extension or extension == ".pdf":
        raise HTTPException(
            status_code=400, detail="Only JPG, PNG or WebP images are allowed for profile pictures."
        )

    filename = f"user_{uuid.uuid4().hex}{extension}"
    (PROFILE_UPLOAD_DIR / filename).write_bytes(data)

    return f"/uploads/profiles/{filename}"


def remove_profile_image(image_url: str | None) -> None:
    """Delete a stored user profile image file."""
    if not image_url:
        return

    (PROFILE_UPLOAD_DIR / Path(image_url).name).unlink(missing_ok=True)


async def save_founder_image(file: UploadFile) -> str:
    """Validate and save an uploaded founder/owner image (JPG, PNG, WebP)."""
    data = await file.read(MAX_IMAGE_SIZE + 1)

    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Founder picture must be 5 MB or smaller.")

    extension = detect_extension(data)
    if not extension or extension == ".pdf":
        raise HTTPException(
            status_code=400, detail="Only JPG, PNG or WebP images are allowed for founder photographs."
        )

    filename = f"founder_{uuid.uuid4().hex}{extension}"
    (FOUNDER_UPLOAD_DIR / filename).write_bytes(data)

    return f"/uploads/founders/{filename}"


def remove_founder_image(image_url: str | None) -> None:
    """Delete a stored founder image file."""
    if not image_url:
        return

    (FOUNDER_UPLOAD_DIR / Path(image_url).name).unlink(missing_ok=True)

