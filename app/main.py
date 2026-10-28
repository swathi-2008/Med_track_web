from fastapi import FastAPI, Request, APIRouter
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import os

from app.config import settings
from app.errors import (
    MedTrackException,
    medtrack_exception_handler,
    validation_exception_handler,
    http_exception_handler,
    generic_exception_handler,
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'self' *;"
        )
        return response

api_router = APIRouter(prefix="/api")

@api_router.get("/health")
async def health_check():
    return {"status": "ok", "app": "MedTrack", "env": settings.env}

def create_app() -> FastAPI:
    docs_url = "/docs" if settings.openapi_docs else None
    redoc_url = "/redoc" if settings.openapi_docs else None
    openapi_url = "/openapi.json" if settings.openapi_docs else None

    app = FastAPI(
        title="MedTrack — Pharmacy Stock and Expiry Manager",
        description="Enterprise pharmacy management web application with FEFO sales, batch tracking, and dual-risk intelligence.",
        version="1.0.0",
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )

    # Middleware
    app.add_middleware(SecurityHeadersMiddleware)

    # Exception Handlers
    app.add_exception_handler(MedTrackException, medtrack_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    # Include API router before static mount
    app.include_router(api_router)

    # Mount static frontend
    frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
    if os.path.isdir(frontend_dir):
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

    return app

# Import routers and register with api_router
from app.routers import (
    auth,
    medicines,
    suppliers,
    batches,
    stock,
    sales,
    purchasing,
    stock_adjustments,
    intelligence,
    dashboard,
    reports,
    users,
    audit,
)
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(medicines.router)
api_router.include_router(suppliers.router)
api_router.include_router(batches.router)
api_router.include_router(stock.router)
api_router.include_router(sales.router)
api_router.include_router(purchasing.router)
api_router.include_router(stock_adjustments.router)
api_router.include_router(intelligence.router)
api_router.include_router(reports.router)
api_router.include_router(users.router)
api_router.include_router(audit.router)

app = create_app()

