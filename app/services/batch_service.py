from sqlalchemy.orm import Session
from sqlalchemy import func
from app.errors import NotFoundError, ConflictError, ValidationError, BusinessRuleError
from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch
from app.models.stock import StockTransaction
from app.models.audit import AuditLog
from app.schemas.batch import BatchCreate, BatchStatusUpdate
from app.clock import get_today

def compute_batch_risk(expiry_date, today) -> tuple[int, str]:
    days_left = (expiry_date - today).days
    if days_left < 0:
        return days_left, "EXPIRED"
    elif days_left <= 7:
        return days_left, "CRITICAL"
    elif days_left <= 30:
        return days_left, "HIGH"
    elif days_left <= 60:
        return days_left, "MEDIUM"
    else:
        return days_left, "LOW"

def list_batches(
    db: Session,
    medicine_id: str | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 50,
) -> tuple[list[dict], int]:
    query = db.query(Batch)

    if medicine_id:
        query = query.filter(Batch.medicine_id == medicine_id)

    if status:
        query = query.filter(Batch.status == status)

    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(Batch.batch_number).like(search))

    total = query.count()
    batches = (
        query.order_by(Batch.expiry_date.asc(), Batch.batch_number.asc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    today = get_today()
    results = []
    for b in batches:
        days_left, risk_cat = compute_batch_risk(b.expiry_date, today)
        results.append({
            "id": b.id,
            "medicine_id": b.medicine_id,
            "medicine_name": b.medicine.name if b.medicine else None,
            "supplier_id": b.supplier_id,
            "supplier_name": b.supplier.name if b.supplier else None,
            "batch_number": b.batch_number,
            "expiry_date": b.expiry_date,
            "quantity_received": b.quantity_received,
            "quantity_available": b.quantity_available,
            "purchase_price": b.purchase_price,
            "purchase_price_display": f"₹{b.purchase_price / 100:.2f}",
            "status": b.status,
            "days_to_expiry": days_left,
            "risk_category": risk_cat,
            "created_at": b.created_at,
            "updated_at": b.updated_at,
        })

    return results, total

def get_batch(db: Session, batch_id: str) -> dict:
    b = db.query(Batch).filter(Batch.id == batch_id).first()
    if not b:
        raise NotFoundError(f"Batch with ID '{batch_id}' not found.")

    today = get_today()
    days_left, risk_cat = compute_batch_risk(b.expiry_date, today)
    return {
        "id": b.id,
        "medicine_id": b.medicine_id,
        "medicine_name": b.medicine.name if b.medicine else None,
        "supplier_id": b.supplier_id,
        "supplier_name": b.supplier.name if b.supplier else None,
        "batch_number": b.batch_number,
        "expiry_date": b.expiry_date,
        "quantity_received": b.quantity_received,
        "quantity_available": b.quantity_available,
        "purchase_price": b.purchase_price,
        "purchase_price_display": f"₹{b.purchase_price / 100:.2f}",
        "status": b.status,
        "days_to_expiry": days_left,
        "risk_category": risk_cat,
        "created_at": b.created_at,
        "updated_at": b.updated_at,
    }

def create_batch(db: Session, data: BatchCreate, user_id: str) -> Batch:
    med = db.query(Medicine).filter(Medicine.id == data.medicine_id).first()
    if not med:
        raise NotFoundError(f"Medicine with ID '{data.medicine_id}' not found.")
    if not med.active:
        raise BusinessRuleError(f"Cannot add batch to deactivated medicine '{med.name}'.")

    if data.supplier_id:
        supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
        if not supplier:
            raise NotFoundError(f"Supplier with ID '{data.supplier_id}' not found.")

    # Unique constraint check
    existing = (
        db.query(Batch)
        .filter(Batch.medicine_id == data.medicine_id, Batch.batch_number == data.batch_number.strip())
        .first()
    )
    if existing:
        raise ConflictError(f"Batch number '{data.batch_number}' already exists for medicine '{med.name}'.")

    qty_avail = data.quantity_available if data.quantity_available is not None else data.quantity_received
    if qty_avail > data.quantity_received:
        raise ValidationError(
            "Available quantity cannot exceed received quantity.",
            field_errors=[{"field": "quantity_available", "message": "Cannot exceed received quantity."}]
        )

    batch = Batch(
        medicine_id=data.medicine_id,
        supplier_id=data.supplier_id,
        batch_number=data.batch_number.strip(),
        expiry_date=data.expiry_date,
        quantity_received=data.quantity_received,
        quantity_available=qty_avail,
        purchase_price=data.purchase_price,
        status="ACTIVE",
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    # Record stock movement transaction
    if qty_avail > 0:
        tx = StockTransaction(
            transaction_type="RECEIPT",
            medicine_id=med.id,
            batch_id=batch.id,
            signed_quantity=qty_avail,
            reference_type="DIRECT_BATCH_CREATION",
            reference_id=batch.id,
            user_id=user_id,
            reason="Initial batch intake",
        )
        db.add(tx)

    audit = AuditLog(
        user_id=user_id,
        action="CREATE_BATCH",
        entity_type="Batch",
        entity_id=batch.id,
        reason=f"Created batch {batch.batch_number} for {med.name} with {qty_avail} units",
    )
    db.add(audit)
    db.commit()

    return batch

def update_batch_status(db: Session, batch_id: str, data: BatchStatusUpdate, user_id: str) -> Batch:
    b = db.query(Batch).filter(Batch.id == batch_id).first()
    if not b:
        raise NotFoundError(f"Batch with ID '{batch_id}' not found.")

    old_status = b.status
    new_status = data.status
    if old_status == new_status:
        return b

    b.status = new_status
    db.commit()
    db.refresh(b)

    # Stock transaction if quarantined or recalled
    if new_status in ("QUARANTINED", "RECALLED"):
        tx = StockTransaction(
            transaction_type="QUARANTINE",
            medicine_id=b.medicine_id,
            batch_id=b.id,
            signed_quantity=-b.quantity_available,
            reference_type="STATUS_CHANGE",
            reference_id=b.id,
            user_id=user_id,
            reason=f"Status set to {new_status}: {data.reason}",
        )
        db.add(tx)

    audit = AuditLog(
        user_id=user_id,
        action="BATCH_STATUS_CHANGE",
        entity_type="Batch",
        entity_id=b.id,
        reason=f"Changed status from {old_status} to {new_status}. Reason: {data.reason}",
    )
    db.add(audit)
    db.commit()

    return b
