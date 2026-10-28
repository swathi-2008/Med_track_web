import json
from datetime import date, datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, update, text

from app.clock import get_today, get_utcnow
from app.errors import NotFoundError, BusinessRuleError, ValidationError, ConflictError
from app.database import begin_immediate
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.sales import Sale, SaleItem
from app.models.stock import StockTransaction
from app.models.user import User
from app.models.audit import AuditLog, IdempotencyKey
from app.schemas.sales import SaleCreateRequest, SaleResponse, SaleItemResponse

def generate_sale_reference(db: Session, today: date) -> str:
    """Generates unique sequential sale reference SAL-yyyyMMdd-0001."""
    date_str = today.strftime("%Y%m%d")
    prefix = f"SAL-{date_str}-"

    latest = (
        db.query(Sale.reference_number)
        .filter(Sale.reference_number.like(f"{prefix}%"))
        .order_by(Sale.reference_number.desc())
        .first()
    )

    if latest and latest[0]:
        try:
            seq = int(latest[0].split("-")[-1]) + 1
        except Exception:
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"

def list_sales(
    db: Session,
    user_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    page: int = 1,
    size: int = 50,
) -> tuple[list[Sale], int]:
    query = db.query(Sale)

    if user_id:
        query = query.filter(Sale.user_id == user_id)

    if from_date:
        start_dt = datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc)
        query = query.filter(Sale.created_at >= start_dt)

    if to_date:
        end_dt = datetime.combine(to_date, datetime.max.time(), tzinfo=timezone.utc)
        query = query.filter(Sale.created_at <= end_dt)

    total = query.count()
    sales = query.order_by(Sale.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return sales, total

def get_sale_by_id(db: Session, sale_id: str, restrict_to_user_id: str | None = None) -> Sale:
    query = db.query(Sale).filter(Sale.id == sale_id)
    if restrict_to_user_id:
        query = query.filter(Sale.user_id == restrict_to_user_id)
    sale = query.first()
    if not sale:
        raise NotFoundError(f"Sale with ID '{sale_id}' not found.")
    return sale

def process_sale(
    db: Session,
    payload: SaleCreateRequest,
    user_id: str,
    idempotency_key: str | None = None,
) -> dict:
    """
    Executes an atomic checkout transaction:
    - Validates server-side prices
    - Performs guarded row-count atomic deductions on batches
    - Records stock ledger and audit logs
    - Supports Idempotency-Key
    """
    # 1. Idempotency Check
    if idempotency_key:
        cached = (
            db.query(IdempotencyKey)
            .filter(IdempotencyKey.key == idempotency_key.strip())
            .first()
        )
        if cached:
            try:
                return json.loads(cached.response_body)
            except Exception:
                pass

    today = get_today()
    cashier = db.query(User).filter(User.id == user_id).first()
    cashier_name = cashier.full_name if cashier else "Staff"

    # Start immediate write transaction
    begin_immediate(db)

    try:
        ref_number = generate_sale_reference(db, today)
        total_sale_amount = 0
        sale_items_data = []

        # Generate Sale record
        sale = Sale(
            reference_number=ref_number,
            user_id=user_id,
            total_amount=0,
            status="COMPLETED",
            created_at=get_utcnow(),
        )
        db.add(sale)
        db.flush()  # Populates sale.id

        for item in payload.items:
            if item.quantity <= 0:
                raise ValidationError(f"Quantity must be greater than zero.")

            med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first()
            if not med:
                raise NotFoundError(f"Medicine with ID '{item.medicine_id}' not found.")
            if not med.active:
                raise BusinessRuleError(f"Medicine '{med.name}' is deactivated and cannot be sold.")

            unit_price = med.selling_price

            # If specific batch requested
            if item.batch_id:
                b = db.query(Batch).filter(Batch.id == item.batch_id).first()
                if not b or b.medicine_id != med.id:
                    raise NotFoundError(f"Batch '{item.batch_id}' not found for medicine '{med.name}'.")
                if b.status != "ACTIVE":
                    raise BusinessRuleError(f"Batch '{b.batch_number}' is {b.status} and cannot be sold.")
                if b.expiry_date < today:
                    raise BusinessRuleError(f"Batch '{b.batch_number}' has expired ({b.expiry_date}) and cannot be sold.")

                # Guarded atomic update
                stmt = (
                    update(Batch)
                    .where(Batch.id == b.id, Batch.quantity_available >= item.quantity)
                    .values(quantity_available=Batch.quantity_available - item.quantity)
                )
                res = db.execute(stmt)
                if res.rowcount != 1:
                    raise BusinessRuleError(
                        f"Insufficient stock in batch '{b.batch_number}' for medicine '{med.name}'. "
                        f"Requested: {item.quantity}, Available: {b.quantity_available}"
                    )

                subtotal = item.quantity * unit_price
                total_sale_amount += subtotal

                sale_item = SaleItem(
                    sale_id=sale.id,
                    batch_id=b.id,
                    medicine_id=med.id,
                    quantity=item.quantity,
                    unit_price_snapshot=unit_price,
                    subtotal=subtotal,
                )
                db.add(sale_item)

                # Stock transaction ledger
                st = StockTransaction(
                    transaction_type="SALE",
                    medicine_id=med.id,
                    batch_id=b.id,
                    signed_quantity=-item.quantity,
                    reference_type="SALE",
                    reference_id=sale.id,
                    user_id=user_id,
                    reason=f"Sale {ref_number}",
                )
                db.add(st)

                sale_items_data.append({
                    "id": "",
                    "batch_id": b.id,
                    "batch_number": b.batch_number,
                    "medicine_id": med.id,
                    "medicine_name": med.name,
                    "quantity": item.quantity,
                    "unit_price_snapshot": unit_price,
                    "unit_price_display": f"₹{unit_price / 100:.2f}",
                    "subtotal": subtotal,
                    "subtotal_display": f"₹{subtotal / 100:.2f}",
                })

            else:
                # FEFO automatic allocation
                eligible_batches = (
                    db.query(Batch)
                    .filter(
                        Batch.medicine_id == med.id,
                        Batch.status == "ACTIVE",
                        Batch.expiry_date >= today,
                        Batch.quantity_available > 0,
                    )
                    .order_by(Batch.expiry_date.asc(), Batch.id.asc())
                    .all()
                )

                total_avail = sum(b.quantity_available for b in eligible_batches)
                if total_avail < item.quantity:
                    raise BusinessRuleError(
                        f"Insufficient stock for medicine '{med.name}'. "
                        f"Requested: {item.quantity}, Available in active unexpired batches: {total_avail}."
                    )

                remaining_to_deduct = item.quantity
                for b in eligible_batches:
                    if remaining_to_deduct <= 0:
                        break

                    take_qty = min(b.quantity_available, remaining_to_deduct)

                    # Guarded row-count update
                    stmt = (
                        update(Batch)
                        .where(Batch.id == b.id, Batch.quantity_available >= take_qty)
                        .values(quantity_available=Batch.quantity_available - take_qty)
                    )
                    res = db.execute(stmt)
                    if res.rowcount != 1:
                        raise BusinessRuleError(
                            f"Concurrent checkout conflict: batch '{b.batch_number}' stock was modified. Transaction rolled back."
                        )

                    subtotal = take_qty * unit_price
                    total_sale_amount += subtotal

                    sale_item = SaleItem(
                        sale_id=sale.id,
                        batch_id=b.id,
                        medicine_id=med.id,
                        quantity=take_qty,
                        unit_price_snapshot=unit_price,
                        subtotal=subtotal,
                    )
                    db.add(sale_item)

                    st = StockTransaction(
                        transaction_type="SALE",
                        medicine_id=med.id,
                        batch_id=b.id,
                        signed_quantity=-take_qty,
                        reference_type="SALE",
                        reference_id=sale.id,
                        user_id=user_id,
                        reason=f"Sale {ref_number}",
                    )
                    db.add(st)

                    sale_items_data.append({
                        "id": "",
                        "batch_id": b.id,
                        "batch_number": b.batch_number,
                        "medicine_id": med.id,
                        "medicine_name": med.name,
                        "quantity": take_qty,
                        "unit_price_snapshot": unit_price,
                        "unit_price_display": f"₹{unit_price / 100:.2f}",
                        "subtotal": subtotal,
                        "subtotal_display": f"₹{subtotal / 100:.2f}",
                    })

                    remaining_to_deduct -= take_qty

        # Finalize Sale
        sale.total_amount = total_sale_amount
        db.flush()

        audit = AuditLog(
            user_id=user_id,
            action="SALE_COMPLETED",
            entity_type="Sale",
            entity_id=sale.id,
            reference_id=ref_number,
            reason=f"Completed sale for ₹{total_sale_amount / 100:.2f} ({len(payload.items)} lines)",
        )
        db.add(audit)
        db.commit()

        response_dict = {
            "id": sale.id,
            "reference_number": ref_number,
            "user_id": user_id,
            "cashier_name": cashier_name,
            "total_amount": total_sale_amount,
            "total_amount_display": f"₹{total_sale_amount / 100:.2f}",
            "status": "COMPLETED",
            "created_at": sale.created_at.isoformat(),
            "items": sale_items_data,
        }

        # Store in Idempotency table if key provided
        if idempotency_key:
            try:
                idem_row = IdempotencyKey(
                    key=idempotency_key.strip(),
                    user_id=user_id,
                    endpoint="/api/sales",
                    response_code=200,
                    response_body=json.dumps(response_dict),
                )
                db.add(idem_row)
                db.commit()
            except Exception:
                db.rollback()

        return response_dict

    except Exception:
        db.rollback()
        raise
