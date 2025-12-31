from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID

from app.core.database import get_db
from app.models.timesheet import Timesheet
from app.schemas.timesheet import TimesheetCreate, TimesheetUpdate, TimesheetResponse

router = APIRouter(prefix="/timesheets", tags=["Timesheets"])


@router.get("", response_model=List[TimesheetResponse])
async def list_timesheets(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    project_id: Optional[UUID] = None,
    task_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Timesheet)
    if project_id:
        query = query.where(Timesheet.project_id == project_id)
    if task_id:
        query = query.where(Timesheet.task_id == task_id)
    if user_id:
        query = query.where(Timesheet.user_id == user_id)
    if status:
        query = query.where(Timesheet.status == status)
    query = query.offset(skip).limit(limit).order_by(Timesheet.work_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/by-project/{project_id}", response_model=List[TimesheetResponse])
async def get_timesheets_by_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    query = select(Timesheet).where(Timesheet.project_id == project_id).order_by(Timesheet.work_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{timesheet_id}", response_model=TimesheetResponse)
async def get_timesheet(timesheet_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Timesheet).where(Timesheet.id == timesheet_id))
    timesheet = result.scalar_one_or_none()
    if not timesheet:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    return timesheet


@router.post("", response_model=TimesheetResponse, status_code=201)
async def create_timesheet(timesheet_in: TimesheetCreate, db: AsyncSession = Depends(get_db)):
    timesheet = Timesheet(**timesheet_in.model_dump())
    db.add(timesheet)
    await db.flush()
    await db.refresh(timesheet)
    return timesheet


@router.put("/{timesheet_id}", response_model=TimesheetResponse)
async def update_timesheet(timesheet_id: UUID, timesheet_in: TimesheetUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Timesheet).where(Timesheet.id == timesheet_id))
    timesheet = result.scalar_one_or_none()
    if not timesheet:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    for field, value in timesheet_in.model_dump(exclude_unset=True).items():
        setattr(timesheet, field, value)
    await db.flush()
    await db.refresh(timesheet)
    return timesheet


@router.delete("/{timesheet_id}", status_code=204)
async def delete_timesheet(timesheet_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Timesheet).where(Timesheet.id == timesheet_id))
    timesheet = result.scalar_one_or_none()
    if not timesheet:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    await db.delete(timesheet)
    return None
