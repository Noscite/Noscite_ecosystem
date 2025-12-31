from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.core.database import get_db

router = APIRouter(prefix="/tasks/{task_id}/assignments", tags=["Task Assignments"])

NOSCITE_COMPANY_ID = "f5369762-aeae-4a81-a021-e3377bf8285e"


class AssignmentCreate(BaseModel):
    company_id: UUID
    role: Optional[str] = None
    estimated_hours: Optional[float] = None
    notes: Optional[str] = None


class AssignmentUpdate(BaseModel):
    role: Optional[str] = None
    estimated_hours: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
async def list_task_assignments(
    task_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """List all assignments for a task."""
    result = await db.execute(
        text("""
            SELECT ta.id, ta.company_id, ta.role, ta.estimated_hours, ta.notes, ta.created_at,
                   c.name as company_name, c.company_type
            FROM task_assignments ta
            JOIN companies c ON ta.company_id = c.id
            WHERE ta.task_id = :task_id
            ORDER BY ta.created_at
        """),
        {"task_id": str(task_id)}
    )
    
    assignments = []
    for row in result:
        assignments.append({
            "id": str(row.id),
            "company_id": str(row.company_id),
            "company_name": row.company_name,
            "company_type": row.company_type,
            "role": row.role,
            "estimated_hours": float(row.estimated_hours) if row.estimated_hours else None,
            "notes": row.notes,
            "created_at": row.created_at.isoformat()
        })
    
    return {"assignments": assignments}


@router.post("")
async def add_task_assignment(
    task_id: UUID,
    assignment: AssignmentCreate,
    db: AsyncSession = Depends(get_db)
):
    """Add a company assignment to a task."""
    # Check if already assigned
    existing = await db.execute(
        text("SELECT id FROM task_assignments WHERE task_id = :tid AND company_id = :cid"),
        {"tid": str(task_id), "cid": str(assignment.company_id)}
    )
    if existing.fetchone():
        raise HTTPException(400, "Questa azienda è già assegnata al task")
    
    result = await db.execute(
        text("""
            INSERT INTO task_assignments (task_id, company_id, role, estimated_hours, notes)
            VALUES (:task_id, :company_id, :role, :hours, :notes)
            RETURNING id
        """),
        {
            "task_id": str(task_id),
            "company_id": str(assignment.company_id),
            "role": assignment.role,
            "hours": assignment.estimated_hours,
            "notes": assignment.notes
        }
    )
    assignment_id = result.scalar()
    await db.commit()
    
    return {"id": str(assignment_id), "message": "Assegnazione aggiunta"}


@router.put("/{assignment_id}")
async def update_task_assignment(
    task_id: UUID,
    assignment_id: UUID,
    assignment: AssignmentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a task assignment."""
    updates = []
    params = {"id": str(assignment_id)}
    
    if assignment.role is not None:
        updates.append("role = :role")
        params["role"] = assignment.role
    if assignment.estimated_hours is not None:
        updates.append("estimated_hours = :hours")
        params["hours"] = assignment.estimated_hours
    if assignment.notes is not None:
        updates.append("notes = :notes")
        params["notes"] = assignment.notes
    
    if updates:
        await db.execute(
            text(f"UPDATE task_assignments SET {', '.join(updates)} WHERE id = :id"),
            params
        )
        await db.commit()
    
    return {"message": "Assegnazione aggiornata"}


@router.delete("/{assignment_id}")
async def remove_task_assignment(
    task_id: UUID,
    assignment_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Remove a task assignment."""
    await db.execute(
        text("DELETE FROM task_assignments WHERE id = :id"),
        {"id": str(assignment_id)}
    )
    await db.commit()
    
    return {"message": "Assegnazione rimossa"}


@router.post("/bulk")
async def bulk_assign_task(
    task_id: UUID,
    company_ids: List[UUID],
    propagate_to_children: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Bulk assign multiple companies to a task."""
    # Get existing assignments
    existing = await db.execute(
        text("SELECT company_id FROM task_assignments WHERE task_id = :tid"),
        {"tid": str(task_id)}
    )
    existing_ids = {str(row.company_id) for row in existing}
    
    # Add new assignments
    added = 0
    for cid in company_ids:
        if str(cid) not in existing_ids:
            await db.execute(
                text("INSERT INTO task_assignments (task_id, company_id) VALUES (:tid, :cid)"),
                {"tid": str(task_id), "cid": str(cid)}
            )
            added += 1
    
    # Remove assignments not in the list
    removed = 0
    for existing_id in existing_ids:
        if existing_id not in [str(c) for c in company_ids]:
            await db.execute(
                text("DELETE FROM task_assignments WHERE task_id = :tid AND company_id = :cid"),
                {"tid": str(task_id), "cid": existing_id}
            )
            removed += 1
    
    # Propagate to children if requested
    if propagate_to_children:
        # Get all child tasks recursively
        children = await db.execute(
            text("""
                WITH RECURSIVE child_tasks AS (
                    SELECT id FROM tasks WHERE parent_task_id = :tid
                    UNION ALL
                    SELECT t.id FROM tasks t
                    JOIN child_tasks ct ON t.parent_task_id = ct.id
                )
                SELECT id FROM child_tasks
            """),
            {"tid": str(task_id)}
        )
        
        for child_row in children:
            child_id = str(child_row.id)
            # Clear existing assignments
            await db.execute(
                text("DELETE FROM task_assignments WHERE task_id = :tid"),
                {"tid": child_id}
            )
            # Add same assignments as parent
            for cid in company_ids:
                await db.execute(
                    text("INSERT INTO task_assignments (task_id, company_id) VALUES (:tid, :cid) ON CONFLICT DO NOTHING"),
                    {"tid": child_id, "cid": str(cid)}
                )
    
    await db.commit()
    
    return {"added": added, "removed": removed, "message": "Assegnazioni aggiornate"}
