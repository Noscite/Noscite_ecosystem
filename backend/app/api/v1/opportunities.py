from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID

from app.core.database import get_db
from app.models.opportunity import Opportunity
from app.schemas.opportunity import OpportunityCreate, OpportunityUpdate, OpportunityResponse

router = APIRouter(prefix="/opportunities", tags=["Opportunities"])


@router.get("", response_model=List[OpportunityResponse])
async def list_opportunities(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: Optional[str] = None,
    status: Optional[str] = None,
    company_id: Optional[UUID] = None,
    owner_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Opportunity)
    if status:
        query = query.where(Opportunity.status == status)
    if company_id:
        query = query.where(Opportunity.company_id == company_id)
    if owner_id:
        query = query.where(Opportunity.owner_id == owner_id)
    if search:
        query = query.where(Opportunity.title.ilike(f"%{search}%"))
    query = query.offset(skip).limit(limit).order_by(Opportunity.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{opportunity_id}", response_model=OpportunityResponse)
async def get_opportunity(opportunity_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Opportunity).where(Opportunity.id == opportunity_id))
    opportunity = result.scalar_one_or_none()
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return opportunity


@router.post("", response_model=OpportunityResponse, status_code=201)
async def create_opportunity(opportunity_in: OpportunityCreate, db: AsyncSession = Depends(get_db)):
    opportunity = Opportunity(**opportunity_in.model_dump())
    db.add(opportunity)
    await db.flush()
    await db.refresh(opportunity)
    return opportunity


@router.patch("/{opportunity_id}", response_model=OpportunityResponse)
async def update_opportunity(opportunity_id: UUID, opportunity_in: OpportunityUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Opportunity).where(Opportunity.id == opportunity_id))
    opportunity = result.scalar_one_or_none()
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    for field, value in opportunity_in.model_dump(exclude_unset=True).items():
        setattr(opportunity, field, value)
    await db.flush()
    await db.refresh(opportunity)
    return opportunity


@router.delete("/{opportunity_id}", status_code=204)
async def delete_opportunity(opportunity_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Opportunity).where(Opportunity.id == opportunity_id))
    opportunity = result.scalar_one_or_none()
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    await db.delete(opportunity)
    return None
