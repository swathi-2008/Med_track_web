from sqlalchemy.orm import Session
from app.clock import get_utcnow
from app.errors import NotFoundError, BusinessRuleError, ValidationError
from app.database import begin_immediate
from app.models.batch import Batch
from app.models.stock import StockAdjustment, StockTransaction
from app.models.user import User
from app.models.audit import AuditLog
from app.schemas.adjustments import StockAdjustmentCreate

def list_adjustments(db: Session, status: str | None = None) -> list[dict]:
    query = db.query(StockAdjustment)
    if status:
        query = query.filter(StockAdjustment.status == status)

    adjs = query.order_by(StockAdjustment.created_at.desc()).all()
    results = []
    for a in adjs:
        results.append({
            "id": a.id,
            "medicine_id": a.medicine_id,
            "medicine_name": a.medicine.name if a.medicine else "Unknown",
            "batch_id": a.batch_id,
            "batch_number": a.batch.batch_number if a.batch else "Unknown",
            "adjusted_quantity": a.adjusted_quantity,
            "reason": a.reason,
            "status": a.status,
            "requested_by_id": a.requested_by_id,
            "requested_by_name": a.requested_by.full_name if a.requested_by else "Staff",
            "reviewed_by_id": a.reviewed_by_id,
            "reviewed_by_name": a.reviewed_by.full_name if a.reviewed_by else None,
            "review_reason": a.review_reason,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        })
    return results

def create_adjustment(db: Session, payload: StockAdjustmentCreate, user_id: str) -> dict:
    batch = db.query(Batch).filter(Batch.id == payload.batch_id).first()
    if not batch:
        raise NotFoundError(f"Batch '{payload.batch_id}' not found.")

    if payload.adjusted_quantity == 0:
        raise ValidationError("Adjustment quantity must be non-zero (positive or negative).")

    if payload.adjusted_quantity < 0 and (batch.quantity_available + payload.adjusted_quantity) < 0:
        raise BusinessRuleError(
            f"Negative adjustment of {payload.adjusted_quantity} exceeds available stock ({batch.quantity_available}) in batch {batch.batch_number}."
        )

    adj = StockAdjustment(
        medicine_id=batch.medicine_id,
        batch_id=batch.id,
        adjusted_quantity=payload.adjusted_quantity,
        reason=payload.reason.strip(),
        status="PENDING",
        requested_by_id=user_id,
        created_at=get_utcnow(),
        updated_at=get_utcnow(),
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)

    audit = AuditLog(
        user_id=user_id,
        action="REQUEST_STOCK_ADJUSTMENT",
        entity_type="StockAdjustment",
        entity_id=adj.id,
        reason=f"Requested adjustment of {payload.adjusted_quantity} for batch {batch.batch_number}: {payload.reason}",
    )
    db.add(audit)
    db.commit()

    return list_adjustments(db)[0]

def approve_adjustment(db: Session, adjustment_id: str, reviewer_id: str) -> dict:
    adj = db.query(StockAdjustment).filter(StockAdjustment.id == adjustment_id).first()
    if not adj:
        raise NotFoundError(f"Adjustment '{adjustment_id}' not found.")

    if adj.status != "PENDING":
        raise BusinessRuleError(f"Cannot approve adjustment with status '{adj.status}'.")

    begin_immediate(db)
    try:
        batch = db.query(Batch).filter(Batch.id == adj.batch_id).first()
        if not batch:
            raise NotFoundError(f"Batch '{adj.batch_id}' no longer exists.")

        new_qty = batch.quantity_available + adj.adjusted_quantity
        if new_qty < 0:
            raise BusinessRuleError(
                f"Cannot approve: resulting stock ({new_qty}) would be negative. Current available: {batch.quantity_available}."
            )

        batch.quantity_available = new_qty

        # Write stock transaction
        st = StockTransaction(
            transaction_type="ADJUSTMENT",
            medicine_id=adj.medicine_id,
            batch_id=adj.batch_id,
            signed_quantity=adj.adjusted_quantity,
            reference_type="STOCK_ADJUSTMENT",
            reference_id=adj.id,
            user_id=reviewer_id,
            reason=f"Approved adjustment: {adj.reason}",
        )
        db.add(st)

        adj.status = "APPROVED"
        adj.reviewed_by_id = reviewer_id
        adj.updated_at = get_utcnow()

        audit = AuditLog(
            user_id=reviewer_id,
            action="APPROVE_STOCK_ADJUSTMENT",
            entity_type="StockAdjustment",
            entity_id=adj.id,
            reason=f"Approved stock adjustment delta {adj.adjusted_quantity}",
        )
        db.add(audit)
        db.commit()

        return list_adjustments(db)[0]

    except Exception:
        db.rollback()
        raise

def reject_adjustment(db: Session, adjustment_id: str, reviewer_id: str, reason: str | None) -> dict:
    if not reason or len(reason.strip()) < 3:
        raise ValidationError("Rejection reason is mandatory (minimum 3 characters).")

    adj = db.query(StockAdjustment).filter(StockAdjustment.id == adjustment_id).first()
    if not adj:
        raise NotFoundError(f"Adjustment '{adjustment_id}' not found.")

    if adj.status != "PENDING":
        raise BusinessRuleError(f"Cannot reject adjustment with status '{adj.status}'.")

    adj.status = "REJECTED"
    adj.reviewed_by_id = reviewer_id
    adj.review_reason = reason.strip()
    adj.updated_at = get_utcnow()
    db.commit()

    audit = AuditLog(
        user_id=reviewer_id,
        action="REJECT_STOCK_ADJUSTMENT",
        entity_type="StockAdjustment",
        entity_id=adj.id,
        reason=f"Rejected: {reason.strip()}",
    )
    db.add(audit)
    db.commit()

    return list_adjustments(db)[0]
