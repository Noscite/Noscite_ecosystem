from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from uuid import UUID
from pydantic import BaseModel

from app.core.database import get_db

router = APIRouter(prefix="/projects/{project_id}/team", tags=["Project Team"])


class TeamMemberCreate(BaseModel):
    company_id: UUID
    role: Optional[str] = None
    hourly_rate: Optional[float] = None
    estimated_hours: Optional[float] = None
    notes: Optional[str] = None


class TeamMemberUpdate(BaseModel):
    role: Optional[str] = None
    hourly_rate: Optional[float] = None
    estimated_hours: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
async def list_project_team(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """List all team members for a project with stats."""
    result = await db.execute(
        text("""
            SELECT pt.*, c.name as company_name, c.company_type, c.email, c.phone,
                   (SELECT COUNT(*) FROM task_assignments ta 
                    JOIN tasks t ON ta.task_id = t.id 
                    WHERE ta.company_id = pt.company_id AND t.project_id = pt.project_id) as tasks_assigned,
                   (SELECT COALESCE(SUM(t.actual_hours), 0) FROM task_assignments ta 
                    JOIN tasks t ON ta.task_id = t.id 
                    WHERE ta.company_id = pt.company_id AND t.project_id = pt.project_id) as total_hours
            FROM project_team pt
            JOIN companies c ON pt.company_id = c.id
            WHERE pt.project_id = :project_id AND pt.is_active = TRUE
            ORDER BY c.name
        """),
        {"project_id": str(project_id)}
    )
    
    team = []
    for row in result:
        team.append({
            "id": str(row.id),
            "company_id": str(row.company_id),
            "company_name": row.company_name,
            "company_type": row.company_type,
            "email": row.email,
            "phone": row.phone,
            "role": row.role,
            "hourly_rate": float(row.hourly_rate) if row.hourly_rate else None,
            "estimated_hours": float(row.estimated_hours) if row.estimated_hours else None,
            "notes": row.notes,
            "tasks_assigned": row.tasks_assigned,
            "total_hours": float(row.total_hours) if row.total_hours else 0,
        })
    
    return {"team": team}


@router.get("/available-companies")
async def get_available_companies(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get companies that can be added to the team (suppliers, partners, freelancers, AND clients)."""
    result = await db.execute(
        text("""
            SELECT c.id, c.name, c.company_type, c.email, c.phone
            FROM companies c
            WHERE c.company_type IN ('supplier', 'partner', 'freelance', 'client')
            AND c.id NOT IN (
                SELECT company_id FROM project_team 
                WHERE project_id = :project_id AND is_active = TRUE
            )
            ORDER BY 
                CASE c.company_type 
                    WHEN 'partner' THEN 1 
                    WHEN 'supplier' THEN 2 
                    WHEN 'freelance' THEN 3 
                    WHEN 'client' THEN 4 
                END,
                c.name
        """),
        {"project_id": str(project_id)}
    )
    
    companies = []
    for row in result:
        companies.append({
            "id": str(row.id),
            "name": row.name,
            "company_type": row.company_type,
            "email": row.email,
            "phone": row.phone,
        })
    
    return {"companies": companies}


@router.post("")
async def add_team_member(
    project_id: UUID,
    member: TeamMemberCreate,
    db: AsyncSession = Depends(get_db)
):
    """Add a company to the project team."""
    # Verify company exists and is valid type (now including client)
    company = await db.execute(
        text("SELECT id, company_type FROM companies WHERE id = :id"),
        {"id": str(member.company_id)}
    )
    company_row = company.fetchone()
    
    if not company_row:
        raise HTTPException(404, "Azienda non trovata")
    
    if company_row.company_type not in ('supplier', 'partner', 'freelance', 'client'):
        raise HTTPException(400, "Solo fornitori, partner, freelancer e clienti possono essere aggiunti al team")
    
    # Check if already in team
    existing = await db.execute(
        text("SELECT id, is_active FROM project_team WHERE project_id = :pid AND company_id = :cid"),
        {"pid": str(project_id), "cid": str(member.company_id)}
    )
    existing_row = existing.fetchone()
    
    if existing_row:
        if existing_row.is_active:
            raise HTTPException(400, "Questa azienda è già nel team")
        else:
            # Reactivate
            await db.execute(
                text("""
                    UPDATE project_team 
                    SET is_active = TRUE, role = :role, hourly_rate = :rate, 
                        estimated_hours = :hours, notes = :notes
                    WHERE id = :id
                """),
                {
                    "id": str(existing_row.id),
                    "role": member.role,
                    "rate": member.hourly_rate,
                    "hours": member.estimated_hours,
                    "notes": member.notes
                }
            )
            await db.commit()
            return {"id": str(existing_row.id), "message": "Membro riattivato nel team"}
    
    result = await db.execute(
        text("""
            INSERT INTO project_team (project_id, company_id, role, hourly_rate, estimated_hours, notes)
            VALUES (:project_id, :company_id, :role, :hourly_rate, :estimated_hours, :notes)
            RETURNING id
        """),
        {
            "project_id": str(project_id),
            "company_id": str(member.company_id),
            "role": member.role,
            "hourly_rate": member.hourly_rate,
            "estimated_hours": member.estimated_hours,
            "notes": member.notes
        }
    )
    team_id = result.scalar()
    await db.commit()
    
    return {"id": str(team_id), "message": "Membro aggiunto al team"}


@router.put("/{team_id}")
async def update_team_member(
    project_id: UUID,
    team_id: UUID,
    member: TeamMemberUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a team member."""
    updates = []
    params = {"id": str(team_id)}
    
    if member.role is not None:
        updates.append("role = :role")
        params["role"] = member.role
    if member.hourly_rate is not None:
        updates.append("hourly_rate = :hourly_rate")
        params["hourly_rate"] = member.hourly_rate
    if member.estimated_hours is not None:
        updates.append("estimated_hours = :estimated_hours")
        params["estimated_hours"] = member.estimated_hours
    if member.notes is not None:
        updates.append("notes = :notes")
        params["notes"] = member.notes
    
    if updates:
        await db.execute(
            text(f"UPDATE project_team SET {', '.join(updates)} WHERE id = :id"),
            params
        )
        await db.commit()
    
    return {"message": "Membro aggiornato"}


@router.delete("/{team_id}")
async def remove_team_member(
    project_id: UUID,
    team_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Remove a team member (soft delete if has assigned tasks)."""
    # Check if has assigned tasks
    result = await db.execute(
        text("""
            SELECT COUNT(*) FROM task_assignments ta
            JOIN tasks t ON ta.task_id = t.id
            JOIN project_team pt ON ta.company_id = pt.company_id AND t.project_id = pt.project_id
            WHERE pt.id = :team_id
        """),
        {"team_id": str(team_id)}
    )
    task_count = result.scalar()
    
    if task_count > 0:
        # Soft delete
        await db.execute(
            text("UPDATE project_team SET is_active = FALSE WHERE id = :id"),
            {"id": str(team_id)}
        )
        await db.commit()
        return {"message": "Membro disattivato (ha task assegnati)"}
    else:
        # Hard delete
        await db.execute(
            text("DELETE FROM project_team WHERE id = :id"),
            {"id": str(team_id)}
        )
        await db.commit()
        return {"message": "Membro rimosso dal team"}
