from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User

from app.core.security import (
    verify_password,
    create_access_token
)

from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    UserResponse
)

from app.api.deps import get_current_user


router = APIRouter()


# USER LOGIN
@router.post("/login", response_model=TokenResponse)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(
        User.email == login_data.email
    ).first()

    if user is not None:
        user_role = getattr(user.role, "value", user.role)
        if str(user_role).upper() != "MANAGER":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff accounts are not permitted to log in."
            )

    if (
        user is None
        or not verify_password(
            login_data.password,
            user.password_hash
        )
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive"
        )

    access_token = create_access_token(
        data={"sub": str(user.id)}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


# CURRENT USER
@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user)
):

    role = getattr(
        current_user.role,
        "value",
        current_user.role
    )

    return UserResponse(
        id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email,
        role=str(role),
        is_active=current_user.is_active
    )