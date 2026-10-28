"""Reports router supporting JSON and streaming CSV downloads."""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.security.dependencies import require_roles
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/inventory")
def get_inventory_report(
    format: str = Query("json", pattern=r"^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    data = report_service.get_inventory_report(db)
    if format == "csv":
        headers = [
            "Medicine ID", "Name", "Category", "Strength", "Unit", "Reorder Level",
            "Current Stock", "Active Batches", "Selling Price (INR)",
            "Cost Valuation (INR)", "Retail Valuation (INR)", "Status", "Active"
        ]
        rows = [
            [
                r["medicine_id"], r["name"], r["category"], r["strength"], r["unit"],
                r["reorder_level"], r["current_stock"], r["active_batches_count"],
                r["selling_price_inr"], r["cost_valuation_inr"], r["retail_valuation_inr"],
                r["status"], r["active"]
            ]
            for r in data["records"]
        ]
        csv_bytes = report_service.generate_csv_bytes(headers, rows)
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=inventory_report.csv"},
        )
    return data

@router.get("/expiry")
def get_expiry_report(
    max_days: Optional[int] = Query(None, ge=0),
    format: str = Query("json", pattern=r"^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    data = report_service.get_expiry_report(db, max_days=max_days)
    if format == "csv":
        headers = [
            "Batch ID", "Batch Number", "Medicine", "Category", "Supplier",
            "Expiry Date", "Days Remaining", "Qty Available", "Unit Purchase Price (INR)",
            "Cost at Risk (INR)", "Risk Band", "Status"
        ]
        rows = [
            [
                r["batch_id"], r["batch_number"], r["medicine_name"], r["category"],
                r["supplier_name"], r["expiry_date"], r["days_to_expiry"],
                r["quantity_available"], r["purchase_price_inr"], r["cost_at_risk_inr"],
                r["risk_band"], r["status"]
            ]
            for r in data["records"]
        ]
        csv_bytes = report_service.generate_csv_bytes(headers, rows)
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=expiry_risk_report.csv"},
        )
    return data

@router.get("/sales")
def get_sales_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    format: str = Query("json", pattern=r"^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "SALES_STAFF")),
):
    data = report_service.get_sales_report(db, start_date=start_date, end_date=end_date)
    if format == "csv":
        headers = ["Sale ID", "Reference Number", "Cashier", "Items Count", "Total (INR)", "Status", "Date"]
        rows = [
            [
                r["sale_id"], r["reference_number"], r["cashier"], r["items_count"],
                r["total_amount_inr"], r["status"], r["created_at"]
            ]
            for r in data["records"]
        ]
        csv_bytes = report_service.generate_csv_bytes(headers, rows)
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=sales_report.csv"},
        )
    return data

@router.get("/purchases")
def get_purchases_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    format: str = Query("json", pattern=r"^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    data = report_service.get_purchases_report(db, start_date=start_date, end_date=end_date)
    if format == "csv":
        headers = ["PO ID", "PO Number", "Supplier", "Status", "Ordered Units", "Received Units", "Total (INR)", "Created Date"]
        rows = [
            [
                r["po_id"], r["po_number"], r["supplier_name"], r["status"],
                r["units_ordered"], r["units_received"], r["total_amount_inr"], r["created_at"]
            ]
            for r in data["records"]
        ]
        csv_bytes = report_service.generate_csv_bytes(headers, rows)
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=purchases_report.csv"},
        )
    return data

@router.get("/stock-movements")
def get_stock_movements_report(
    limit: int = Query(200, ge=1, le=1000),
    format: str = Query("json", pattern=r"^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    data = report_service.get_stock_movements_report(db, limit=limit)
    if format == "csv":
        headers = ["Tx ID", "Timestamp", "Type", "Medicine", "Batch", "Delta", "Ref Type", "Ref ID", "User ID", "Reason"]
        rows = [
            [
                r["id"], r["timestamp"], r["transaction_type"], r["medicine_name"],
                r["batch_number"], r["quantity_delta"], r["reference_type"],
                r["reference_id"], r["user_id"], r["reason"]
            ]
            for r in data["records"]
        ]
        csv_bytes = report_service.generate_csv_bytes(headers, rows)
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=stock_movements.csv"},
        )
    return data
