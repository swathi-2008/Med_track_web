"""Reporting service with data aggregation, date filtering, and CSV export with formula injection protection."""
import io
import csv
from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch
from app.models.sales import Sale, SaleItem
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem
from app.models.stock import StockTransaction
from app.clock import get_today, get_utcnow
from app.schemas.common import paise_to_inr, inr_format

def sanitize_csv_cell(value: Any) -> Any:
    """Neutralize formula injection by prefixing dangerous characters with single quote."""
    if value is None:
        return ""
    str_val = str(value)
    if str_val and str_val[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{str_val}"
    return str_val

def generate_csv_bytes(headers: List[str], rows: List[List[Any]]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow([sanitize_csv_cell(h) for h in headers])
    for row in rows:
        writer.writerow([sanitize_csv_cell(c) for c in row])
    return output.getvalue().encode("utf-8")

def get_inventory_report(db: Session) -> Dict[str, Any]:
    today = get_today()
    meds = db.query(Medicine).order_by(Medicine.name.asc()).all()
    records = []
    total_cost_paise = 0
    total_retail_paise = 0
    total_units = 0

    for m in meds:
        batches = db.query(Batch).filter(Batch.medicine_id == m.id, Batch.status == "ACTIVE").all()
        # Separate eligible vs expired
        eligible_batches = [b for b in batches if b.expiry_date >= today]
        total_eligible_stock = sum(b.quantity_available for b in eligible_batches)
        cost_val_paise = sum(b.quantity_available * b.purchase_price for b in eligible_batches)
        retail_val_paise = total_eligible_stock * m.selling_price

        total_cost_paise += cost_val_paise
        total_retail_paise += retail_val_paise
        total_units += total_eligible_stock

        if total_eligible_stock == 0:
            status = "OUT_OF_STOCK"
        elif total_eligible_stock <= m.reorder_level:
            status = "LOW_STOCK"
        else:
            status = "ADEQUATE"

        records.append({
            "medicine_id": m.id,
            "name": m.name,
            "category": m.category,
            "strength": m.strength,
            "unit": m.unit,
            "reorder_level": m.reorder_level,
            "current_stock": total_eligible_stock,
            "active_batches_count": len(eligible_batches),
            "selling_price_inr": paise_to_inr(m.selling_price),
            "selling_price_display": inr_format(m.selling_price),
            "cost_valuation_inr": paise_to_inr(cost_val_paise),
            "cost_valuation_display": inr_format(cost_val_paise),
            "retail_valuation_inr": paise_to_inr(retail_val_paise),
            "retail_valuation_display": inr_format(retail_val_paise),
            "status": status,
            "active": m.active,
        })

    return {
        "generated_at": get_utcnow().isoformat(),
        "summary": {
            "total_medicines": len(meds),
            "total_units": total_units,
            "total_cost_valuation_inr": paise_to_inr(total_cost_paise),
            "total_cost_valuation_display": inr_format(total_cost_paise),
            "total_retail_valuation_inr": paise_to_inr(total_retail_paise),
            "total_retail_valuation_display": inr_format(total_retail_paise),
            "potential_margin_inr": paise_to_inr(max(0, total_retail_paise - total_cost_paise)),
            "potential_margin_display": inr_format(max(0, total_retail_paise - total_cost_paise)),
        },
        "records": records,
    }

def get_expiry_report(db: Session, max_days: Optional[int] = None) -> Dict[str, Any]:
    today = get_today()
    query = (
        db.query(Batch, Medicine, Supplier)
        .join(Medicine, Batch.medicine_id == Medicine.id)
        .outerjoin(Supplier, Batch.supplier_id == Supplier.id)
        .filter(Batch.quantity_available > 0)
    )
    if max_days is not None:
        from datetime import timedelta
        cutoff = today + timedelta(days=max_days)
        query = query.filter(Batch.expiry_date <= cutoff)

    results = query.order_by(Batch.expiry_date.asc()).all()

    records = []
    total_at_risk_cost_paise = 0

    for b, m, s in results:
        days_left = (b.expiry_date - today).days
        if days_left < 0:
            band = "EXPIRED"
        elif days_left <= 7:
            band = "CRITICAL"
        elif days_left <= 30:
            band = "HIGH"
        elif days_left <= 60:
            band = "MEDIUM"
        else:
            band = "LOW"

        cost_paise = b.quantity_available * b.purchase_price
        total_at_risk_cost_paise += cost_paise

        records.append({
            "batch_id": b.id,
            "batch_number": b.batch_number,
            "medicine_id": m.id,
            "medicine_name": m.name,
            "category": m.category,
            "unit": m.unit,
            "supplier_name": s.name if s else "N/A",
            "expiry_date": b.expiry_date.isoformat(),
            "days_to_expiry": days_left,
            "quantity_available": b.quantity_available,
            "purchase_price_inr": paise_to_inr(b.purchase_price),
            "purchase_price_display": inr_format(b.purchase_price),
            "cost_at_risk_inr": paise_to_inr(cost_paise),
            "cost_at_risk_display": inr_format(cost_paise),
            "risk_band": band,
            "status": b.status,
        })

    return {
        "generated_at": get_utcnow().isoformat(),
        "summary": {
            "total_lots": len(records),
            "total_cost_at_risk_inr": paise_to_inr(total_at_risk_cost_paise),
            "total_cost_at_risk_display": inr_format(total_at_risk_cost_paise),
        },
        "records": records,
    }

def get_sales_report(db: Session, start_date: Optional[date] = None, end_date: Optional[date] = None) -> Dict[str, Any]:
    query = db.query(Sale).filter(Sale.status == "COMPLETED")
    if start_date:
        start_dt = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        query = query.filter(Sale.created_at >= start_dt)
    if end_date:
        end_dt = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        query = query.filter(Sale.created_at <= end_dt)

    sales = query.order_by(Sale.created_at.desc()).all()
    records = []
    total_sales_paise = 0
    total_items_sold = 0

    for s in sales:
        total_sales_paise += s.total_amount
        items_count = sum(item.quantity for item in s.items)
        total_items_sold += items_count

        records.append({
            "sale_id": s.id,
            "reference_number": s.reference_number,
            "cashier": s.user.full_name if s.user else "Unknown",
            "cashier_username": s.user.username if s.user else "Unknown",
            "items_count": items_count,
            "total_amount_inr": paise_to_inr(s.total_amount),
            "total_amount_display": inr_format(s.total_amount),
            "status": s.status,
            "created_at": s.created_at.isoformat(),
        })

    return {
        "generated_at": get_utcnow().isoformat(),
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "summary": {
            "total_sales_count": len(sales),
            "total_items_sold": total_items_sold,
            "total_revenue_inr": paise_to_inr(total_sales_paise),
            "total_revenue_display": inr_format(total_sales_paise),
            "average_ticket_inr": paise_to_inr(total_sales_paise // len(sales)) if sales else 0.0,
        },
        "records": records,
    }

def get_purchases_report(db: Session, start_date: Optional[date] = None, end_date: Optional[date] = None) -> Dict[str, Any]:
    query = db.query(PurchaseOrder)
    if start_date:
        start_dt = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        query = query.filter(PurchaseOrder.created_at >= start_dt)
    if end_date:
        end_dt = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        query = query.filter(PurchaseOrder.created_at <= end_dt)

    pos = query.order_by(PurchaseOrder.created_at.desc()).all()
    records = []
    total_spend_paise = 0

    for po in pos:
        order_sum_paise = sum(item.quantity_ordered * item.unit_price for item in po.items)
        total_spend_paise += order_sum_paise
        ordered_units = sum(item.quantity_ordered for item in po.items)
        received_units = sum(item.quantity_received for item in po.items)

        records.append({
            "po_id": po.id,
            "po_number": po.po_number,
            "supplier_name": po.supplier.name if po.supplier else "N/A",
            "status": po.status,
            "units_ordered": ordered_units,
            "units_received": received_units,
            "total_amount_inr": paise_to_inr(order_sum_paise),
            "total_amount_display": inr_format(order_sum_paise),
            "created_at": po.created_at.isoformat(),
        })

    return {
        "generated_at": get_utcnow().isoformat(),
        "summary": {
            "total_pos": len(pos),
            "total_spend_inr": paise_to_inr(total_spend_paise),
            "total_spend_display": inr_format(total_spend_paise),
        },
        "records": records,
    }

def get_stock_movements_report(db: Session, limit: int = 200) -> Dict[str, Any]:
    txs = (
        db.query(StockTransaction, Medicine, Batch)
        .join(Medicine, StockTransaction.medicine_id == Medicine.id)
        .outerjoin(Batch, StockTransaction.batch_id == Batch.id)
        .order_by(StockTransaction.created_at.desc())
        .limit(limit)
        .all()
    )
    records = []
    for tx, med, b in txs:
        records.append({
            "id": tx.id,
            "timestamp": tx.created_at.isoformat(),
            "transaction_type": tx.transaction_type,
            "medicine_name": med.name,
            "batch_number": b.batch_number if b else "N/A",
            "quantity_delta": tx.signed_quantity,
            "reference_type": tx.reference_type,
            "reference_id": tx.reference_id,
            "user_id": tx.user_id,
            "reason": tx.reason,
        })
    return {
        "generated_at": get_utcnow().isoformat(),
        "count": len(records),
        "records": records,
    }

