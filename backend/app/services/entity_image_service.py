"""
Service for validating, storing (LargeBinary/BYTEA), retrieving, and deleting
entity profile images for Customer and Staff across Restaurant and Spa contexts.
"""
from __future__ import annotations

import hashlib
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Response, UploadFile, status
from PIL import Image as PILImage, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.models.entities import EntityImage

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIME_TYPES = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"],
}


async def validate_image_file(file: UploadFile) -> tuple[bytes, str, int, str]:
    """
    Validates uploaded image file:
    - Non-empty
    - Under 5 MB size limit
    - Valid MIME type
    - Magic byte header verification
    - PIL image decoding & integrity verification
    - SHA-256 checksum calculation
    Returns: (file_bytes, mime_type, file_size, checksum)
    """
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file uploaded.",
        )

    # Read data
    data = await file.read()
    if not data or len(data) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    file_size = len(data)
    if file_size > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image file size ({file_size / (1024 * 1024):.2f} MB) exceeds maximum allowed limit of 5 MB.",
        )

    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type not in ALLOWED_MIME_TYPES:
        # Fallback detection
        if data.startswith(b"\xff\xd8\xff"):
            content_type = "image/jpeg"
        elif data.startswith(b"\x89PNG\r\n\x1a\n"):
            content_type = "image/png"
        elif data.startswith(b"RIFF") and len(data) > 12 and data[8:12] == b"WEBP":
            content_type = "image/webp"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported image format. Allowed formats: JPG, JPEG, PNG, WebP.",
            )

    # Validate magic bytes
    if content_type == "image/jpeg" and not data.startswith(b"\xff\xd8\xff"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Corrupted or invalid JPEG image header.",
        )
    elif content_type == "image/png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Corrupted or invalid PNG image header.",
        )
    elif content_type == "image/webp":
        if not (data.startswith(b"RIFF") and len(data) > 12 and data[8:12] == b"WEBP"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Corrupted or invalid WebP image header.",
            )

    # Verify image integrity with PIL
    try:
        with io.BytesIO(data) as buf:
            with PILImage.open(buf) as img:
                img.verify()
    except (UnidentifiedImageError, OSError, Exception) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or corrupted image file: {str(exc)}",
        )

    # Compute checksum
    checksum = hashlib.sha256(data).hexdigest()

    return data, content_type, file_size, checksum


def save_or_replace_entity_image(
    db: Session,
    entity_type: str,
    business_context: str,
    entity_id: int,
    image_data: bytes,
    mime_type: str,
    file_size: int,
    checksum: str,
) -> EntityImage:
    """
    Persists raw image bytes into PostgreSQL BYTEA (entity_images table).
    If an image record already exists for this (entity_type, entity_id), it is updated in place.
    """
    existing = (
        db.query(EntityImage)
        .filter(
            EntityImage.business_context == business_context,
            EntityImage.entity_type == entity_type,
            EntityImage.entity_id == entity_id,
        )
        .first()
    )

    now = datetime.now(timezone.utc)

    if existing:
        existing.image_data = image_data
        existing.mime_type = mime_type
        existing.file_size = file_size
        existing.checksum = checksum
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return existing

    new_img = EntityImage(
        entity_type=entity_type,
        business_context=business_context,
        entity_id=entity_id,
        image_data=image_data,
        mime_type=mime_type,
        file_size=file_size,
        checksum=checksum,
        created_at=now,
        updated_at=now,
    )
    db.add(new_img)
    db.commit()
    db.refresh(new_img)
    return new_img


def get_entity_image(
    db: Session,
    entity_type: str,
    entity_id: int,
    business_context: Optional[str] = None,
) -> Optional[EntityImage]:
    """Retrieves the EntityImage record with raw bytes, optionally filtered by business_context."""
    q = db.query(EntityImage).filter(
        EntityImage.entity_type == entity_type,
        EntityImage.entity_id == entity_id,
    )
    if business_context:
        q = q.filter(EntityImage.business_context == business_context)
    return q.first()


def delete_entity_image(
    db: Session,
    entity_type: str,
    entity_id: int,
    business_context: Optional[str] = None,
) -> bool:
    """Deletes image record from database, optionally filtered by business_context."""
    img = get_entity_image(db, entity_type, entity_id, business_context)
    if img:
        db.delete(img)
        db.commit()
        return True
    return False


def build_image_response(
    image: EntityImage,
    if_none_match: Optional[str] = None,
) -> Response:
    """
    Constructs an efficient streaming Response with ETag and Cache-Control.
    Supports HTTP 304 Not Modified when client ETag matches.
    """
    etag = f'"{image.checksum}"'
    if if_none_match and (if_none_match == etag or if_none_match == image.checksum):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED)

    headers = {
        "Content-Type": image.mime_type,
        "Content-Length": str(image.file_size),
        "ETag": etag,
        "Cache-Control": "public, max-age=86400, must-revalidate",
        "Last-Modified": image.updated_at.strftime("%a, %d %b %Y %H:%M:%S GMT")
        if image.updated_at
        else "",
    }
    return Response(
        content=image.image_data,
        media_type=image.mime_type,
        headers=headers,
    )
