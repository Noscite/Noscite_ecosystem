from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal

class ProjectBase(BaseModel):
    name: str
    order_id: Optional[UUID] = None
    description: Optional[str] = None
    methodology: str = "waterfall"
    status: str = "planning"
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    budget: Optional[Decimal] = None
    project_manager_id: Optional[UUID] = None
    account_manager_id: Optional[UUID] = None
    color: str = "#3B82F6"
    notes: Optional[str] = None
    tags: Optional[List[str]] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    methodology: Optional[str] = None
    status: Optional[str] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    actual_start_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    budget: Optional[Decimal] = None
    actual_cost: Optional[Decimal] = None
    progress_percentage: Optional[int] = None
    project_manager_id: Optional[UUID] = None
    account_manager_id: Optional[UUID] = None
    color: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None

class ProjectResponse(ProjectBase):
    id: UUID
    code: Optional[str] = None
    actual_start_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    actual_cost: Optional[Decimal] = None
    progress_percentage: Optional[int] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
