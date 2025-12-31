from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, ARRAY, Numeric, Integer, Date
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


task_status_enum = ENUM('todo', 'in_progress', 'review', 'completed', 'cancelled', name='task_status', create_type=False)
task_priority_enum = ENUM('low', 'medium', 'high', 'urgent', name='task_priority', create_type=False)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    parent_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"))
    wbs_code = Column(String(50))
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(task_status_enum, default='todo', nullable=False)
    priority = Column(task_priority_enum, default='medium')
    assigned_to_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    assigned_to_company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"))
    planned_start_date = Column(Date)
    planned_end_date = Column(Date)
    start_date = Column(Date)
    end_date = Column(Date)
    estimated_hours = Column(Numeric(10, 2), default=0)
    actual_hours = Column(Numeric(10, 2), default=0)
    progress_percentage = Column(Integer, default=0)
    is_milestone = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    notes = Column(Text)
    tags = Column(ARRAY(Text))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
