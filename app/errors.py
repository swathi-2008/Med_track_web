from datetime import datetime, timezone
from typing import Any
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

class MedTrackException(Exception):
    def __init__(self, message: str, status_code: int = 400, error_code: str = "BAD_REQUEST", field_errors: list[dict[str, Any]] | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.field_errors = field_errors or []

class NotFoundError(MedTrackException):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message=message, status_code=status.HTTP_404_NOT_FOUND, error_code="NOT_FOUND")

class ConflictError(MedTrackException):
    def __init__(self, message: str = "Resource conflict or duplicate"):
        super().__init__(message=message, status_code=status.HTTP_409_CONFLICT, error_code="CONFLICT")

class ValidationError(MedTrackException):
    def __init__(self, message: str, field_errors: list[dict[str, Any]] | None = None):
        super().__init__(message=message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, error_code="VALIDATION_ERROR", field_errors=field_errors)

class AuthenticationError(MedTrackException):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(message=message, status_code=status.HTTP_401_UNAUTHORIZED, error_code="UNAUTHORIZED")

class AuthorizationError(MedTrackException):
    def __init__(self, message: str = "Forbidden: Insufficient permissions"):
        super().__init__(message=message, status_code=status.HTTP_403_FORBIDDEN, error_code="FORBIDDEN")

class BusinessRuleError(MedTrackException):
    def __init__(self, message: str):
        super().__init__(message=message, status_code=status.HTTP_400_BAD_REQUEST, error_code="BUSINESS_RULE_VIOLATION")

class BadRequestError(MedTrackException):
    def __init__(self, message: str = "Bad request"):
        super().__init__(message=message, status_code=status.HTTP_400_BAD_REQUEST, error_code="BAD_REQUEST")

class RateLimitError(MedTrackException):

    def __init__(self, message: str = "Too many failed attempts. Account temporarily locked."):
        super().__init__(message=message, status_code=status.HTTP_429_TOO_MANY_REQUESTS, error_code="RATE_LIMIT_EXCEEDED")

def create_error_response(status_code: int, error_code: str, message: str, field_errors: list[dict[str, Any]] | None = None) -> JSONResponse:
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status_code,
        "error": error_code,
        "message": message,
        "fieldErrors": field_errors or []
    }
    return JSONResponse(status_code=status_code, content=payload)

async def medtrack_exception_handler(request: Request, exc: MedTrackException) -> JSONResponse:
    return create_error_response(
        status_code=exc.status_code,
        error_code=exc.error_code,
        message=exc.message,
        field_errors=exc.field_errors
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    field_errors = []
    for error in exc.errors():
        field_errors.append({
            "field": ".".join(str(loc) for loc in error.get("loc", []) if loc != "body"),
            "message": error.get("msg", "Invalid value"),
            "type": error.get("type", "value_error")
        })
    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        error_code="VALIDATION_ERROR",
        message="Request validation failed. Please check submitted fields.",
        field_errors=field_errors
    )

async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    error_code = "HTTP_ERROR"
    if exc.status_code == 404:
        error_code = "NOT_FOUND"
    elif exc.status_code == 401:
        error_code = "UNAUTHORIZED"
    elif exc.status_code == 403:
        error_code = "FORBIDDEN"
    elif exc.status_code == 405:
        error_code = "METHOD_NOT_ALLOWED"
    
    return create_error_response(
        status_code=exc.status_code,
        error_code=error_code,
        message=str(exc.detail) if exc.detail else "An HTTP error occurred"
    )

async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # In production/clean mode, never leak internal stack traces
    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred. Please contact the administrator."
    )
