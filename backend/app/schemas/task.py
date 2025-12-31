from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


class TaskBase(BaseModel):
    name: str
    project_id: UUID
    parent_task_id: Optional[UUID] = None
    wbs_code: Optional[str] = None
    description: Optional[str] = None
    status: str = "todo"
    priority: str = "medium"
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_company_id: Optional[UUID] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    estimated_hours: Decimal = Decimal("0")
    is_milestone: bool = False
    sort_order: int = 0
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    parent_task_id: Optional[UUID] = None
    wbs_code: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_company_id: Optional[UUID] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    estimated_hours: Optional[Decimal] = None
    actual_hours: Optional[Decimal] = None
    progress_percentage: Optional[int] = None
    is_milestone: Optional[bool] = None
    sort_order: Optional[int] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class TaskResponse(TaskBase):
    id: UUID
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    actual_hours: Decimal
    progress_percentage: int
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
