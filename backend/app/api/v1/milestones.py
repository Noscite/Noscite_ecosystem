from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID

from app.core.database import get_db
from app.models.milestone import Milestone
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate, MilestoneResponse

router = APIRouter(prefix="/milestones", tags=["Milestones"])


@router.get("", response_model=List[MilestoneResponse])
async def list_milestones(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    project_id: Optional[UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Milestone)
    if project_id:
        query = query.where(Milestone.project_id == project_id)
    if status:
        query = query.where(Milestone.status == status)
    query = query.offset(skip).limit(limit).order_by(Milestone.due_date)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/by-project/{project_id}", response_model=List[MilestoneResponse])
async def get_milestones_by_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    query = select(Milestone).where(Milestone.project_id == project_id).order_by(Milestone.due_date)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{milestone_id}", response_model=MilestoneResponse)
async def get_milestone(milestone_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return milestone


@router.post("", response_model=MilestoneResponse, status_code=201)
async def create_milestone(milestone_in: MilestoneCreate, db: AsyncSession = Depends(get_db)):
    milestone = Milestone(**milestone_in.model_dump())
    db.add(milestone)
    await db.flush()
    await db.refresh(milestone)
    return milestone


@router.put("/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(milestone_id: UUID, milestone_in: MilestoneUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    for field, value in milestone_in.model_dump(exclude_unset=True).items():
        setattr(milestone, field, value)
    await db.flush()
    await db.refresh(milestone)
    return milestone


@router.delete("/{milestone_id}", status_code=204)
async def delete_milestone(milestone_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    await db.delete(milestone)
    return None
