"""Dashboard analytics and role-tailored summary metrics."""
from datetime import date, datetime, timedelta, timezone, time
from typing import Any, Dict, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.sales import Sale
from app.models.purchasing import PurchaseRequest, PurchaseOrder
from app.models.stock import StockAdjustment, StockTransaction
from app.clock import get_today, get_utcnow
from app.security.dependencies import get_current_user
from app.schemas.common import paise_to_inr, inr_format

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    today = get_today()
    start_of_today = datetime.combine(today, time.min, tzinfo=timezone.utc)
    end_of_today = datetime.combine(today, time.max, tzinfo=timezone.utc)

    # 1. Total medicines
    active_meds_count = db.query(func.count(Medicine.id)).filter(Medicine.active == True).scalar() or 0

    # 2. Batches & Expiry calculations
    all_batches = db.query(Batch).filter(Batch.status.in_(("ACTIVE", "QUARANTINED"))).all()
    expired_count = sum(1 for b in all_batches if b.expiry_date < today and b.quantity_available > 0)
    critical_count = sum(1 for b in all_batches if 0 <= (b.expiry_date - today).days <= 7 and b.quantity_available > 0 and b.status == "ACTIVE")
    high_count = sum(1 for b in all_batches if 8 <= (b.expiry_date - today).days <= 30 and b.quantity_available > 0 and b.status == "ACTIVE")

    # 3. Low stock count
    meds = db.query(Medicine).filter(Medicine.active == True).all()
    low_stock_count = 0
    total_cost_val_paise = 0
    total_retail_val_paise = 0

    for m in meds:
        active_b = [b for b in all_batches if b.medicine_id == m.id and b.status == "ACTIVE" and b.expiry_date >= today]
        stock_sum = sum(b.quantity_available for b in active_b)
        cost_sum = sum(b.quantity_available * b.purchase_price for b in active_b)

        total_cost_val_paise += cost_sum
        total_retail_val_paise += stock_sum * m.selling_price

        if stock_sum <= m.reorder_level:
            low_stock_count += 1

    # 4. Today's sales
    today_sales = (
        db.query(Sale)
        .filter(Sale.status == "COMPLETED", Sale.created_at >= start_of_today, Sale.created_at <= end_of_today)
        .all()
    )
    today_revenue_paise = sum(s.total_amount for s in today_sales)
    today_sales_count = len(today_sales)

    # User's personal sales today (especially for cashier / SALES_STAFF)
    my_today_sales = [s for s in today_sales if s.user_id == current_user.id]
    my_today_revenue_paise = sum(s.total_amount for s in my_today_sales)

    # 5. Pending approvals
    pending_pr_count = db.query(func.count(PurchaseRequest.id)).filter(PurchaseRequest.status == "PENDING").scalar() or 0
    pending_adj_count = db.query(func.count(StockAdjustment.id)).filter(StockAdjustment.status == "PENDING").scalar() or 0
    open_po_count = db.query(func.count(PurchaseOrder.id)).filter(PurchaseOrder.status.in_(("OPEN", "PARTIALLY_RECEIVED"))).scalar() or 0

    return {
        "role": current_user.role,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "metrics": {
            "active_medicines": active_meds_count,
            "low_stock_count": low_stock_count,
            "expired_lots_count": expired_count,
            "near_expiry_count": critical_count + high_count,
            "critical_lots_count": critical_count,
            "today_revenue_inr": paise_to_inr(today_revenue_paise),
            "today_revenue_display": inr_format(today_revenue_paise),
            "today_sales_count": today_sales_count,
            "my_today_revenue_inr": paise_to_inr(my_today_revenue_paise),
            "my_today_revenue_display": inr_format(my_today_revenue_paise),
            "my_today_sales_count": len(my_today_sales),
            "pending_purchase_requests": pending_pr_count,
            "pending_stock_adjustments": pending_adj_count,
            "open_purchase_orders": open_po_count,
            "total_inventory_cost_inr": paise_to_inr(total_cost_val_paise),
            "total_inventory_cost_display": inr_format(total_cost_val_paise),
            "total_inventory_retail_inr": paise_to_inr(total_retail_val_paise),
            "total_inventory_retail_display": inr_format(total_retail_val_paise),
        }
    }

@router.get("/sales-trend")
def get_sales_trend(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    today = get_today()
    days_data = []

    for i in range(6, -1, -1):
        target_day = today - timedelta(days=i)
        start_dt = datetime.combine(target_day, time.min, tzinfo=timezone.utc)
        end_dt = datetime.combine(target_day, time.max, tzinfo=timezone.utc)

        sales = (
            db.query(Sale)
            .filter(Sale.status == "COMPLETED", Sale.created_at >= start_dt, Sale.created_at <= end_dt)
            .all()
        )
        total_paise = sum(s.total_amount for s in sales)
        days_data.append({
            "date": target_day.strftime("%b %d"),
            "full_date": target_day.isoformat(),
            "count": len(sales),
            "revenue_inr": paise_to_inr(total_paise),
        })

    return days_data

@router.get("/expiry-breakdown")
def get_expiry_breakdown(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    today = get_today()
    batches = db.query(Batch).filter(Batch.quantity_available > 0).all()

    breakdown = {
        "expired": {"count": 0, "cost_inr": 0.0},
        "critical_7d": {"count": 0, "cost_inr": 0.0},
        "high_30d": {"count": 0, "cost_inr": 0.0},
        "medium_60d": {"count": 0, "cost_inr": 0.0},
        "healthy": {"count": 0, "cost_inr": 0.0},
    }

    for b in batches:
        days = (b.expiry_date - today).days
        cost = paise_to_inr(b.quantity_available * b.purchase_price)

        if days < 0:
            breakdown["expired"]["count"] += 1
            breakdown["expired"]["cost_inr"] += cost
        elif days <= 7:
            breakdown["critical_7d"]["count"] += 1
            breakdown["critical_7d"]["cost_inr"] += cost
        elif days <= 30:
            breakdown["high_30d"]["count"] += 1
            breakdown["high_30d"]["cost_inr"] += cost
        elif days <= 60:
            breakdown["medium_60d"]["count"] += 1
            breakdown["medium_60d"]["cost_inr"] += cost
        else:
            breakdown["healthy"]["count"] += 1
            breakdown["healthy"]["cost_inr"] += cost

    return breakdown

@router.get("/recent-activity")
def get_recent_activity(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    txs = (
        db.query(StockTransaction, Medicine)
        .join(Medicine, StockTransaction.medicine_id == Medicine.id)
        .order_by(StockTransaction.created_at.desc())
        .limit(limit)
        .all()
    )
    results = []
    for tx, med in txs:
        results.append({
            "id": tx.id,
            "type": tx.transaction_type,
            "medicine_name": med.name,
            "quantity_delta": tx.signed_quantity,
            "reason": tx.reason,
            "timestamp": tx.created_at.isoformat(),
        })
    return results

