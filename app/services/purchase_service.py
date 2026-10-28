import json
from datetime import date, datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.clock import get_today, get_utcnow
from app.errors import NotFoundError, BusinessRuleError, ValidationError, ConflictError
from app.database import begin_immediate
from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch
from app.models.purchasing import (
    PurchaseRequest,
    PurchaseRequestItem,
    PurchaseOrder,
    PurchaseOrderItem,
    GoodsReceipt,
    GoodsReceiptItem,
)
from app.models.stock import StockTransaction
from app.models.user import User
from app.models.audit import AuditLog, IdempotencyKey
from app.schemas.purchasing import (
    PurchaseRequestCreate,
    PurchaseOrderCreate,
    GoodsReceiptCreate,
)

def generate_doc_number(db: Session, model, column, prefix_code: str, today: date) -> str:
    date_str = today.strftime("%Y%m%d")
    prefix = f"{prefix_code}-{date_str}-"

    latest = (
        db.query(column)
        .filter(column.like(f"{prefix}%"))
        .order_by(column.desc())
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

# --- Purchase Requests ---
def list_purchase_requests(db: Session, status: str | None = None) -> list[dict]:
    query = db.query(PurchaseRequest)
    if status:
        query = query.filter(PurchaseRequest.status == status)

    prs = query.order_by(PurchaseRequest.created_at.desc()).all()
    results = []
    for pr in prs:
        items = []
        for itm in pr.items:
            items.append({
                "id": itm.id,
                "medicine_id": itm.medicine_id,
                "medicine_name": itm.medicine.name if itm.medicine else "Unknown",
                "strength": itm.medicine.strength if itm.medicine else "",
                "unit": itm.medicine.unit if itm.medicine else "",
                "quantity_requested": itm.quantity_requested,
                "notes": itm.notes,
            })
        results.append({
            "id": pr.id,
            "request_number": pr.request_number,
            "requested_by_id": pr.requested_by_id,
            "requested_by_name": pr.requested_by.full_name if pr.requested_by else "Staff",
            "status": pr.status,
            "reviewed_by_id": pr.reviewed_by_id,
            "reviewed_by_name": pr.reviewed_by.full_name if pr.reviewed_by else None,
            "review_reason": pr.review_reason,
            "created_at": pr.created_at,
            "updated_at": pr.updated_at,
            "items": items,
        })
    return results

def create_purchase_request(db: Session, payload: PurchaseRequestCreate, user_id: str) -> dict:
    today = get_today()
    req_number = generate_doc_number(db, PurchaseRequest, PurchaseRequest.request_number, "PR", today)

    pr = PurchaseRequest(
        request_number=req_number,
        requested_by_id=user_id,
        status="PENDING",
        created_at=get_utcnow(),
        updated_at=get_utcnow(),
    )
    db.add(pr)
    db.flush()

    for itm in payload.items:
        med = db.query(Medicine).filter(Medicine.id == itm.medicine_id).first()
        if not med:
            raise NotFoundError(f"Medicine with ID '{itm.medicine_id}' not found.")
        pri = PurchaseRequestItem(
            request_id=pr.id,
            medicine_id=med.id,
            quantity_requested=itm.quantity_requested,
            notes=itm.notes,
        )
        db.add(pri)

    audit = AuditLog(
        user_id=user_id,
        action="CREATE_PURCHASE_REQUEST",
        entity_type="PurchaseRequest",
        entity_id=pr.id,
        reference_id=req_number,
        reason=f"Created PR {req_number} with {len(payload.items)} lines",
    )
    db.add(audit)
    db.commit()

    return list_purchase_requests(db, status=None)[0]

def approve_purchase_request(db: Session, request_id: str, reviewer_id: str) -> dict:
    pr = db.query(PurchaseRequest).filter(PurchaseRequest.id == request_id).first()
    if not pr:
        raise NotFoundError(f"Purchase request '{request_id}' not found.")

    if pr.status != "PENDING":
        raise BusinessRuleError(f"Cannot approve request with status '{pr.status}'. Only PENDING requests can be approved.")

    # Strict rule: Cannot approve own request
    if pr.requested_by_id == reviewer_id:
        raise BusinessRuleError("Self-approval prohibited. A different manager or administrator must review this request.")

    pr.status = "APPROVED"
    pr.reviewed_by_id = reviewer_id
    pr.updated_at = get_utcnow()
    db.commit()

    audit = AuditLog(
        user_id=reviewer_id,
        action="APPROVE_PURCHASE_REQUEST",
        entity_type="PurchaseRequest",
        entity_id=pr.id,
        reference_id=pr.request_number,
        reason="Purchase request approved by manager",
    )
    db.add(audit)
    db.commit()

    return list_purchase_requests(db)[0]

def reject_purchase_request(db: Session, request_id: str, reviewer_id: str, reason: str | None) -> dict:
    if not reason or len(reason.strip()) < 3:
        raise ValidationError(
            "Rejection reason is mandatory (minimum 3 characters).",
            field_errors=[{"field": "reason", "message": "Reason is required when rejecting a request."}]
        )

    pr = db.query(PurchaseRequest).filter(PurchaseRequest.id == request_id).first()
    if not pr:
        raise NotFoundError(f"Purchase request '{request_id}' not found.")

    if pr.status != "PENDING":
        raise BusinessRuleError(f"Cannot reject request with status '{pr.status}'.")

    pr.status = "REJECTED"
    pr.reviewed_by_id = reviewer_id
    pr.review_reason = reason.strip()
    pr.updated_at = get_utcnow()
    db.commit()

    audit = AuditLog(
        user_id=reviewer_id,
        action="REJECT_PURCHASE_REQUEST",
        entity_type="PurchaseRequest",
        entity_id=pr.id,
        reference_id=pr.request_number,
        reason=f"Rejected: {reason.strip()}",
    )
    db.add(audit)
    db.commit()

    return list_purchase_requests(db)[0]

# --- Purchase Orders ---
def list_purchase_orders(db: Session, status: str | None = None) -> list[dict]:
    query = db.query(PurchaseOrder)
    if status:
        query = query.filter(PurchaseOrder.status == status)

    pos = query.order_by(PurchaseOrder.created_at.desc()).all()
    results = []
    for po in pos:
        items = []
        for itm in po.items:
            outstanding = itm.quantity_ordered - itm.quantity_received
            items.append({
                "id": itm.id,
                "medicine_id": itm.medicine_id,
                "medicine_name": itm.medicine.name if itm.medicine else "Unknown",
                "quantity_ordered": itm.quantity_ordered,
                "quantity_received": itm.quantity_received,
                "outstanding_quantity": max(0, outstanding),
                "unit_price": itm.unit_price,
                "unit_price_display": f"₹{itm.unit_price / 100:.2f}",
            })
        results.append({
            "id": po.id,
            "po_number": po.po_number,
            "supplier_id": po.supplier_id,
            "supplier_name": po.supplier.name if po.supplier else "Unknown",
            "request_id": po.request_id,
            "status": po.status,
            "created_at": po.created_at,
            "items": items,
        })
    return results

def create_purchase_order(db: Session, payload: PurchaseOrderCreate, user_id: str) -> dict:
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise NotFoundError(f"Supplier '{payload.supplier_id}' not found.")
    if not supplier.active:
        raise BusinessRuleError(f"Supplier '{supplier.name}' is inactive.")

    if payload.request_id:
        pr = db.query(PurchaseRequest).filter(PurchaseRequest.id == payload.request_id).first()
        if not pr:
            raise NotFoundError(f"Purchase request '{payload.request_id}' not found.")
        if pr.status != "APPROVED":
            raise BusinessRuleError(f"Cannot generate PO from request with status '{pr.status}'. Must be APPROVED.")

    today = get_today()
    po_number = generate_doc_number(db, PurchaseOrder, PurchaseOrder.po_number, "PO", today)

    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=supplier.id,
        request_id=payload.request_id,
        status="OPEN",
        created_at=get_utcnow(),
        updated_at=get_utcnow(),
    )
    db.add(po)
    db.flush()

    for itm in payload.items:
        med = db.query(Medicine).filter(Medicine.id == itm.medicine_id).first()
        if not med:
            raise NotFoundError(f"Medicine '{itm.medicine_id}' not found.")

        poi = PurchaseOrderItem(
            po_id=po.id,
            medicine_id=med.id,
            quantity_ordered=itm.quantity_ordered,
            quantity_received=0,
            unit_price=itm.unit_price,
        )
        db.add(poi)

    audit = AuditLog(
        user_id=user_id,
        action="CREATE_PURCHASE_ORDER",
        entity_type="PurchaseOrder",
        entity_id=po.id,
        reference_id=po_number,
        reason=f"Created PO {po_number} with supplier {supplier.name}",
    )
    db.add(audit)
    db.commit()

    return list_purchase_orders(db)[0]

# --- Goods Receipts (GRN) ---
def record_goods_receipt(
    db: Session,
    payload: GoodsReceiptCreate,
    user_id: str,
    idempotency_key: str | None = None,
) -> dict:
    if idempotency_key:
        cached = db.query(IdempotencyKey).filter(IdempotencyKey.key == idempotency_key.strip()).first()
        if cached:
            return json.loads(cached.response_body)

    today = get_today()

    begin_immediate(db)
    try:
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == payload.po_id).first()
        if not po:
            raise NotFoundError(f"Purchase Order '{payload.po_id}' not found.")
        if po.status not in ("OPEN", "PARTIALLY_RECEIVED"):
            raise BusinessRuleError(f"Cannot receive goods against PO with status '{po.status}'.")

        receipt_number = generate_doc_number(db, GoodsReceipt, GoodsReceipt.receipt_number, "GRN", today)

        grn = GoodsReceipt(
            receipt_number=receipt_number,
            po_id=po.id,
            received_by_id=user_id,
            idempotency_key=idempotency_key,
            created_at=get_utcnow(),
        )
        db.add(grn)
        db.flush()

        receipt_items_data = []

        for line in payload.items:
            po_item = db.query(PurchaseOrderItem).filter(PurchaseOrderItem.id == line.po_item_id).first()
            if not po_item or po_item.po_id != po.id:
                raise NotFoundError(f"PO Item '{line.po_item_id}' not found in PO '{po.po_number}'.")

            outstanding = po_item.quantity_ordered - po_item.quantity_received
            if line.quantity_received > outstanding:
                raise BusinessRuleError(
                    f"Received quantity ({line.quantity_received}) exceeds outstanding quantity ({outstanding}) for medicine {po_item.medicine.name}."
                )

            # Expiry date validation: must be strictly in the future
            if line.expiry_date <= today:
                raise BusinessRuleError(
                    f"Cannot accept goods with expired or today's expiry date ({line.expiry_date}). Must be future dated."
                )

            if not line.batch_number or not line.batch_number.strip():
                raise ValidationError("Batch number is mandatory for goods receipt.")

            batch_num = line.batch_number.strip()

            # Locate or create batch
            batch = (
                db.query(Batch)
                .filter(Batch.medicine_id == po_item.medicine_id, Batch.batch_number == batch_num)
                .first()
            )

            if batch:
                batch.quantity_available += line.quantity_received
                batch.quantity_received += line.quantity_received
                batch.purchase_price = line.purchase_price
                batch.expiry_date = line.expiry_date
                batch.supplier_id = po.supplier_id
                batch.status = "ACTIVE"
            else:
                batch = Batch(
                    medicine_id=po_item.medicine_id,
                    supplier_id=po.supplier_id,
                    batch_number=batch_num,
                    expiry_date=line.expiry_date,
                    quantity_received=line.quantity_received,
                    quantity_available=line.quantity_received,
                    purchase_price=line.purchase_price,
                    status="ACTIVE",
                )
                db.add(batch)
                db.flush()

            # Create stock transaction
            st = StockTransaction(
                transaction_type="RECEIPT",
                medicine_id=po_item.medicine_id,
                batch_id=batch.id,
                signed_quantity=line.quantity_received,
                reference_type="GOODS_RECEIPT",
                reference_id=grn.id,
                user_id=user_id,
                reason=f"Receipt against {po.po_number}",
            )
            db.add(st)

            # Update PO item
            po_item.quantity_received += line.quantity_received

            gri = GoodsReceiptItem(
                receipt_id=grn.id,
                po_item_id=po_item.id,
                batch_id=batch.id,
                quantity_received=line.quantity_received,
                purchase_price=line.purchase_price,
            )
            db.add(gri)

            receipt_items_data.append({
                "id": "",
                "batch_id": batch.id,
                "batch_number": batch.batch_number,
                "medicine_name": po_item.medicine.name,
                "quantity_received": line.quantity_received,
                "purchase_price": line.purchase_price,
                "purchase_price_display": f"₹{line.purchase_price / 100:.2f}",
            })

        # Check if PO is now fully received
        all_fulfilled = all(itm.quantity_received >= itm.quantity_ordered for itm in po.items)
        po.status = "RECEIVED" if all_fulfilled else "PARTIALLY_RECEIVED"
        po.updated_at = get_utcnow()

        audit = AuditLog(
            user_id=user_id,
            action="GOODS_RECEIPT",
            entity_type="GoodsReceipt",
            entity_id=grn.id,
            reference_id=receipt_number,
            reason=f"Received goods against {po.po_number}. New PO status: {po.status}",
        )
        db.add(audit)
        db.commit()

        receiver = db.query(User).filter(User.id == user_id).first()
        res_payload = {
            "id": grn.id,
            "receipt_number": receipt_number,
            "po_id": po.id,
            "received_by_name": receiver.full_name if receiver else "Staff",
            "created_at": grn.created_at.isoformat(),
            "items": receipt_items_data,
        }

        if idempotency_key:
            try:
                idem = IdempotencyKey(
                    key=idempotency_key.strip(),
                    user_id=user_id,
                    endpoint="/api/goods-receipts",
                    response_code=200,
                    response_body=json.dumps(res_payload),
                )
                db.add(idem)
                db.commit()
            except Exception:
                db.rollback()

        return res_payload

    except Exception:
        db.rollback()
        raise
