"""Helpers for saving and removing menu item images.

Place this file at: app/core/image_upload.py
"""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

# <project root>/uploads/menu  (independent of where the server is started from)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = PROJECT_ROOT / "uploads"
MENU_UPLOAD_DIR = UPLOAD_ROOT / "menu"

MENU_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB (same limit as the frontend)


def detect_extension(data: bytes) -> str | None:
    """Detect the real file type from the first bytes, not from the file name."""
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


async def save_menu_image(file: UploadFile) -> str:
    """Validate and save an uploaded image. Returns the path to store in the DB."""
    data = await file.read(MAX_IMAGE_SIZE + 1)

    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller.")

    extension = detect_extension(data)
    if not extension:
        raise HTTPException(
            status_code=400, detail="Only JPG, PNG or WebP images are allowed."
        )

    # Random file name: no collisions and no path tricks from user input
    filename = f"{uuid.uuid4().hex}{extension}"
    (MENU_UPLOAD_DIR / filename).write_bytes(data)

    return f"/uploads/menu/{filename}"


def remove_menu_image(image_url: str | None) -> None:
    """Delete a stored image file. Safe to call with None or a missing file."""
    if not image_url:
        return

    # .name keeps only the file name, so the path can never leave the folder
    (MENU_UPLOAD_DIR / Path(image_url).name).unlink(missing_ok=True)
