from fastapi import HTTPException, status


class NotFoundError(HTTPException):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class ConflictError(HTTPException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "Access denied"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class UnauthorizedError(HTTPException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ValidationError(HTTPException):
    def __init__(self, detail: str = "Validation error"):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


class AssetConflictError(ConflictError):
    """Объект уже занят в выбранный интервал (пересечение бронирований)."""

    def __init__(self, asset_name: str | None = None, *, detail: str | None = None) -> None:
        if detail is not None:
            super().__init__(detail=detail)
        elif asset_name is not None:
            super().__init__(
                detail=f"Объект «{asset_name}» уже занят на выбранное время"
            )
        else:
            super().__init__(detail="Выбранное время занято")


class InsufficientPaymentError(ValidationError):
    def __init__(self, detail: str = "Payment amount exceeds deal debt"):
        super().__init__(detail=detail)
