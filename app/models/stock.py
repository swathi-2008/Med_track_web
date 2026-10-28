import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    transaction_type = Column(String(32), nullable=False, index=True)  # RECEIPT, SALE, ADJUSTMENT, QUARANTINE
    medicine_id = Column(String(36), ForeignKey("medicines.id"), nullable=False, index=True)
    batch_id = Column(String(36), ForeignKey("batches.id"), nullable=False, index=True)
    signed_quantity = Column(Integer, nullable=False)
    reference_type = Column(String(64), nullable=False)
    reference_id = Column(String(64), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    reason = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    __table_args__ = (
        CheckConstraint(
            "transaction_type IN ('RECEIPT', 'SALE', 'ADJUSTMENT', 'QUARANTINE')",
            name="chk_st_type_valid"
        ),
    )

    medicine = relationship("Medicine")
    batch = relationship("Batch")
    user = relationship("User")


class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    medicine_id = Column(String(36), ForeignKey("medicines.id"), nullable=False, index=True)
    batch_id = Column(String(36), ForeignKey("batches.id"), nullable=False, index=True)
    adjusted_quantity = Column(Integer, nullable=False)  # delta (e.g. -5 damaged, +2 recount)
    reason = Column(String(256), nullable=False)
    status = Column(String(32), default="PENDING", nullable=False)  # PENDING, APPROVED, REJECTED
    requested_by_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    reviewed_by_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    review_reason = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED')", name="chk_sa_status_valid"),
    )

    medicine = relationship("Medicine")
    batch = relationship("Batch")
    requested_by = relationship("User", foreign_keys=[requested_by_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
