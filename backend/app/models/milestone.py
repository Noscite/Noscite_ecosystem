from sqlalchemy import Column, String, Text, Date, Boolean, Integer, Numeric, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.sql import func
import uuid
from app.core.database import Base

milestone_status_enum = ENUM('pending', 'in_progress', 'completed', 'missed', 'cancelled', name='milestone_status', create_type=False)
milestone_type_enum = ENUM('deliverable', 'payment', 'review', 'deadline', 'kickoff', 'go_live', name='milestone_type', create_type=False)

class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    milestone_type = Column(milestone_type_enum, default="deliverable")
    status = Column(milestone_status_enum, nullable=False, default="pending")
    due_date = Column(Date, nullable=False)
    completed_date = Column(Date)
    payment_amount = Column(Numeric(15, 2))
    is_paid = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
