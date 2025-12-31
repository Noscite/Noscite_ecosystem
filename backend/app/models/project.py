from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, ARRAY, Numeric, Integer, Date
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


project_status_enum = ENUM('planning', 'in_progress', 'on_hold', 'completed', 'cancelled', name='project_status', create_type=False)
project_methodology_enum = ENUM('waterfall', 'agile', 'hybrid', name='project_methodology', create_type=False)


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"))
    name = Column(String(255), nullable=False)
    description = Column(Text)
    methodology = Column(project_methodology_enum, default='waterfall')
    status = Column(project_status_enum, default='planning', nullable=False)
    planned_start_date = Column(Date)
    planned_end_date = Column(Date)
    actual_start_date = Column(Date)
    actual_end_date = Column(Date)
    budget = Column(Numeric(15, 2), default=0)
    actual_cost = Column(Numeric(15, 2), default=0)
    progress_percentage = Column(Integer, default=0)
    project_manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    account_manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    color = Column(String(20), default='#3B82F6')
    notes = Column(Text)
    tags = Column(ARRAY(Text))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
