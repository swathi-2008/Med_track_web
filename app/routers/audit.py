"""Audit logs router (ADMIN only)."""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models.user import User
from app.models.audit import AuditLog
from app.security.dependencies import require_roles

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    action: str
    entity_type: str
    entity_id: Optional[str]
    reference_id: Optional[str]
    reason: Optional[str]
    details: Optional[str]
    created_at: datetime
    username: Optional[str]
    user_full_name: Optional[str]


@router.get("", response_model=List[AuditLogResponse])
def get_audit_logs(
    action: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    query = db.query(AuditLog, User).outerjoin(User, AuditLog.user_id == User.id)
    if action:
        query = query.filter(AuditLog.action == action)
    results = query.order_by(AuditLog.created_at.desc()).limit(limit).all()

    response = []
    for log, usr in results:
        response.append(AuditLogResponse(
            id=log.id,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            reference_id=log.reference_id,
            reason=log.reason,
            details=log.details,
            created_at=log.created_at,
            username=usr.username if usr else None,
            user_full_name=usr.full_name if usr else None,
        ))
    return response
