from typing import Any, Dict, List, Optional
from pydantic import BaseModel

class RecommendationResponse(BaseModel):
    medicine_id: str
    medicine_name: str
    category: str
    risk_type: str  # SHORTAGE, EXPIRY, DUAL_RISK, MONITOR, NORMAL
    severity: str   # CRITICAL, HIGH, MEDIUM, LOW
    problem: str
    data_considered: Dict[str, Any]
    rule_applied: str
    suggested_action: str
    reason: str
    suggested_quantity: Optional[int] = None

class IntelligenceSummaryResponse(BaseModel):
    disclaimer: str = "Rule-based decision support — not machine learning"
    total_medicines_analyzed: int
    shortage_risks_count: int
    expiry_risks_count: int
    dual_risks_count: int
    recommendations: List[RecommendationResponse]
