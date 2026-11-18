import jwt

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import User


# HTTP Bearer Authentication
security = HTTPBearer()


# Get currently authenticated user
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):

    # Extract JWT token
    token = credentials.credentials

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"}
    )

    try:

        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise credentials_exception

        user_id = int(user_id)

    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise credentials_exception

    # Find user in database
    user = db.get(User, user_id)

    if user is None:
        raise credentials_exception

    # Check whether user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    # Operational access is restricted to the Receptionist role (internally MANAGER); Staff accounts cannot access protected endpoints
    user_role = getattr(user.role, "value", user.role)
    if str(user_role).upper() != "MANAGER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff accounts are not permitted to access protected resources"
        )

    return user


# Role-based authorization
def require_roles(*allowed_roles: str):

    normalized_roles = {
        role.upper() for role in allowed_roles
    }

    def role_checker(
        current_user: User = Depends(get_current_user)
    ):

        current_role = getattr(
            current_user.role,
            "value",
            current_user.role
        )

        if str(current_role).upper() not in normalized_roles:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource"
            )

        return current_user

    return role_checker