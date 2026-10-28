import math
from datetime import date
from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.sales import SaleCreateRequest, SaleResponse, SaleItemResponse
from app.security.dependencies import require_roles, verify_csrf, get_current_user
from app.models.user import User
from app.services import sales_service

router = APIRouter(prefix="/sales", tags=["Sales & Checkout"])

@router.post("", dependencies=[Depends(verify_csrf)])
async def create_sale(
    payload: SaleCreateRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "SALES_STAFF")),
):
    return sales_service.process_sale(
        db, payload=payload, user_id=current_user.id, idempotency_key=idempotency_key
    )

@router.get("")
async def get_sales(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "SALES_STAFF")),
):
    # Sales staff can only view their own sales history
    user_filter = current_user.id if current_user.role == "SALES_STAFF" else None

    sales, total = sales_service.list_sales(
        db, user_id=user_filter, from_date=from_date, to_date=to_date, page=page, size=size
    )

    items = []
    for s in sales:
        items.append({
            "id": s.id,
            "reference_number": s.reference_number,
            "user_id": s.user_id,
            "cashier_name": s.user.full_name if s.user else "Staff",
            "total_amount": s.total_amount,
            "total_amount_display": f"₹{s.total_amount / 100:.2f}",
            "status": s.status,
            "created_at": s.created_at,
            "items_count": len(s.items),
        })

    total_pages = math.ceil(total / size) if size > 0 else 1
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "total_pages": total_pages,
    }

@router.get("/{sale_id}")
async def get_sale(
    sale_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "SALES_STAFF")),
):
    user_filter = current_user.id if current_user.role == "SALES_STAFF" else None
    sale = sales_service.get_sale_by_id(db, sale_id=sale_id, restrict_to_user_id=user_filter)

    items_data = []
    for itm in sale.items:
        items_data.append({
            "id": itm.id,
            "batch_id": itm.batch_id,
            "batch_number": itm.batch.batch_number if itm.batch else "Unknown",
            "medicine_id": itm.medicine_id,
            "medicine_name": itm.medicine.name if itm.medicine else "Unknown",
            "quantity": itm.quantity,
            "unit_price_snapshot": itm.unit_price_snapshot,
            "unit_price_display": f"₹{itm.unit_price_snapshot / 100:.2f}",
            "subtotal": itm.subtotal,
            "subtotal_display": f"₹{itm.subtotal / 100:.2f}",
        })

    return {
        "id": sale.id,
        "reference_number": sale.reference_number,
        "user_id": sale.user_id,
        "cashier_name": sale.user.full_name if sale.user else "Staff",
        "total_amount": sale.total_amount,
        "total_amount_display": f"₹{sale.total_amount / 100:.2f}",
        "status": sale.status,
        "created_at": sale.created_at,
        "items": items_data,
    }
