from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.security.dependencies import require_roles
from app.schemas.intelligence import IntelligenceSummaryResponse
from app.services import decision_engine, expiry_service

router = APIRouter(prefix="/intelligence", tags=["Dual-Risk Intelligence Center"])

@router.get("/recommendations", response_model=IntelligenceSummaryResponse)
async def get_recommendations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    return decision_engine.analyze_inventory_intelligence(db)

@router.get("/expiry-summary")
async def get_expiry_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    return expiry_service.get_expiry_risk_report(db)

@router.get("/stock-risk")
async def get_stock_risk(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    intel = decision_engine.analyze_inventory_intelligence(db)
    shortage_recs = [r for r in intel["recommendations"] if r["risk_type"] in ("SHORTAGE", "DUAL_RISK")]
    return {
        "disclaimer": intel["disclaimer"],
        "shortage_count": len(shortage_recs),
        "items": shortage_recs,
    }
