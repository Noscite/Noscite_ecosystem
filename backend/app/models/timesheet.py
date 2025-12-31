from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


timesheet_status_enum = ENUM('draft', 'submitted', 'approved', 'rejected', name='timesheet_status', create_type=False)
activity_type_enum = ENUM('development', 'design', 'analysis', 'testing', 'meeting', 'documentation', 'support', 'management', 'training', 'travel', 'other', name='activity_type', create_type=False)


class Timesheet(Base):
    __tablename__ = "timesheets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    work_date = Column(Date, nullable=False)
    hours = Column(Numeric(5, 2), nullable=False)
    activity_type = Column(activity_type_enum, default='development', nullable=False)
    is_billable = Column(Boolean, default=True)
    hourly_rate = Column(Numeric(10, 2), default=0)
    description = Column(Text)
    notes = Column(Text)
    status = Column(timesheet_status_enum, default='draft', nullable=False)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    approved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
