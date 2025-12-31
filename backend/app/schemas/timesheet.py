from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


class TimesheetBase(BaseModel):
    project_id: UUID
    task_id: Optional[UUID] = None
    user_id: UUID
    work_date: date
    hours: Decimal
    activity_type: str = "development"
    is_billable: bool = True
    hourly_rate: Decimal = Decimal("0")
    description: Optional[str] = None
    notes: Optional[str] = None


class TimesheetCreate(TimesheetBase):
    pass


class TimesheetUpdate(BaseModel):
    task_id: Optional[UUID] = None
    work_date: Optional[date] = None
    hours: Optional[Decimal] = None
    activity_type: Optional[str] = None
    is_billable: Optional[bool] = None
    hourly_rate: Optional[Decimal] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class TimesheetResponse(TimesheetBase):
    id: UUID
    status: str
    approved_by: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
