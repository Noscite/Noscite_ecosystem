from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from uuid import UUID
from datetime import date, timedelta
import os
import shutil
import math
import logging

from app.core.database import get_db
from app.services.ai_service import (
    process_document_for_rag,
    generate_wbs_from_document,
    chat_with_project_documents,
    search_similar_chunks,
    extract_text_from_document,
    generate_project_from_text,
    classify_and_summarize_document
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI"])

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

VALID_MILESTONE_TYPES = {"deliverable", "payment", "review", "deadline", "kickoff", "go_live"}

def sanitize_milestone_type(ms_type: str) -> str:
    if ms_type in VALID_MILESTONE_TYPES:
        return ms_type
    ms_lower = ms_type.lower()
    if "approv" in ms_lower or "review" in ms_lower:
        return "review"
    if "pay" in ms_lower or "invoice" in ms_lower:
        return "payment"
    if "kick" in ms_lower or "start" in ms_lower:
        return "kickoff"
    if "go" in ms_lower and "live" in ms_lower:
        return "go_live"
    if "dead" in ms_lower or "due" in ms_lower:
        return "deadline"
    return "deliverable"


@router.post("/documents/{project_id}/upload")
async def upload_and_process_document(
    project_id: UUID,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """Upload a document, classify it with AI, and process for RAG."""
    allowed_types = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain"
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"File type {file.content_type} not supported.")
    
    file_path = os.path.join(UPLOAD_DIR, f"{project_id}_{file.filename}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    try:
        # Extract text
        text_content = await extract_text_from_document(file_path, file.content_type)
        
        # Classify with AI
        classification = await classify_and_summarize_document(text_content, file.filename)
        
        # Insert document with AI classification
        result = await db.execute(
            text("""
                INSERT INTO project_documents 
                (project_id, name, description, file_name, file_path, mime_type, file_size, 
                 content, ai_summary, ai_tags, ai_metadata, ai_category, ai_confidence, is_processed)
                VALUES (:project_id, :name, :description, :file_name, :file_path, :mime_type, :file_size,
                        :content, :ai_summary, :ai_tags, :ai_metadata, :ai_category, :ai_confidence, TRUE)
                RETURNING id
            """),
            {
                "project_id": str(project_id),
                "name": name or file.filename,
                "description": description or classification.get("summary", ""),
                "file_name": file.filename,
                "file_path": file_path,
                "mime_type": file.content_type,
                "file_size": os.path.getsize(file_path),
                "content": text_content[:50000],
                "ai_summary": classification.get("summary"),
                "ai_tags": classification.get("tags", []),
                "ai_metadata": json.dumps(classification.get("metadata", {})),
                "ai_category": classification.get("category", "other"),
                "ai_confidence": classification.get("confidence", 0)
            }
        )
        document_id = result.scalar()
        await db.commit()
        
        return {
            "document_id": str(document_id),
            "status": "processed",
            "classification": classification
        }
        
    except Exception as e:
        logger.error(f"Error processing document: {e}")
        raise HTTPException(500, f"Error processing document: {str(e)}")


@router.post("/create-project-from-document")
async def create_project_from_document(
    file: UploadFile = File(...),
    project_name: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """Upload a document, analyze it with AI, and create a complete project with WBS."""
    allowed_types = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain"
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"File type {file.content_type} not supported")
    
    file_path = os.path.join(UPLOAD_DIR, f"temp_{file.filename}")
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    try:
        text_content = await extract_text_from_document(file_path, file.content_type)
        
        if len(text_content) < 100:
            raise HTTPException(400, "Document content too short to analyze")
        
        # Generate project structure
        project_data = await generate_project_from_text(text_content, project_name)
        
        # Classify document
        classification = await classify_and_summarize_document(text_content, file.filename)
        
        duration_days = project_data.get("estimated_duration_days", 90)
        project_start = date.today()
        project_end = project_start + timedelta(days=duration_days)
        
        result = await db.execute(
            text("""
                INSERT INTO projects (name, description, methodology, status, 
                                     planned_start_date, planned_end_date, budget, color)
                VALUES (:name, :description, :methodology, 'planning',
                        :start_date, :end_date, :budget, :color)
                RETURNING id, code
            """),
            {
                "name": project_data.get("project_name", project_name or file.filename),
                "description": project_data.get("project_summary", ""),
                "methodology": project_data.get("methodology_suggested", "waterfall"),
                "start_date": project_start,
                "end_date": project_end,
                "budget": project_data.get("estimated_budget"),
                "color": "#3B82F6"
            }
        )
        row = result.fetchone()
        project_id = row.id
        project_code = row.code
        
        final_path = os.path.join(UPLOAD_DIR, f"{project_id}_{file.filename}")
        shutil.move(file_path, final_path)
        
        # Save document with classification and mark as source document
        await db.execute(
            text("""
                INSERT INTO project_documents 
                (project_id, name, description, file_name, file_path, mime_type, file_size, 
                 content, ai_summary, ai_tags, ai_metadata, ai_category, ai_confidence, is_processed)
                VALUES (:project_id, :name, :description, :file_name, :file_path, :mime_type, :file_size,
                        :content, :ai_summary, :ai_tags, :ai_metadata, :ai_category, :ai_confidence, TRUE)
            """),
            {
                "project_id": str(project_id),
                "name": f"📋 {file.filename} (Documento Sorgente)",
                "description": "Documento utilizzato per la generazione automatica del progetto",
                "file_name": file.filename,
                "file_path": final_path,
                "mime_type": file.content_type,
                "file_size": os.path.getsize(final_path),
                "content": text_content[:50000],
                "ai_summary": classification.get("summary"),
                "ai_tags": classification.get("tags", []) + ["documento-sorgente", "generazione-progetto"],
                "ai_metadata": json.dumps({**classification.get("metadata", {}), "is_source_document": True}),
                "ai_category": "specification",
                "ai_confidence": classification.get("confidence", 0)
            }
        )
        
        hours_per_day = 8
        tasks_created = 0
        current_date = project_start
        
        async def create_tasks_recursive(tasks: list, parent_id=None, level_start_date=None):
            nonlocal tasks_created, current_date
            
            for task_data in tasks:
                task_hours = task_data.get("estimated_hours", 8)
                task_days = max(1, math.ceil(task_hours / hours_per_day))
                
                task_start = level_start_date or current_date
                task_end = task_start + timedelta(days=task_days)
                
                result = await db.execute(
                    text("""
                        INSERT INTO tasks (project_id, parent_task_id, wbs_code, name, description, 
                                          estimated_hours, priority, is_milestone, status,
                                          planned_start_date, planned_end_date, sort_order)
                        VALUES (:project_id, :parent_id, :wbs_code, :name, :description,
                                :hours, :priority, :is_milestone, 'todo',
                                :start_date, :end_date, :sort_order)
                        RETURNING id
                    """),
                    {
                        "project_id": str(project_id),
                        "parent_id": str(parent_id) if parent_id else None,
                        "wbs_code": task_data.get("wbs_code"),
                        "name": task_data.get("name"),
                        "description": task_data.get("description"),
                        "hours": task_hours,
                        "priority": task_data.get("priority", "medium"),
                        "is_milestone": task_data.get("is_milestone", False),
                        "start_date": task_start,
                        "end_date": task_end,
                        "sort_order": tasks_created
                    }
                )
                task_id = result.scalar()
                tasks_created += 1
                
                if task_data.get("children"):
                    await create_tasks_recursive(task_data["children"], task_id, task_start)
                
                if not parent_id:
                    current_date = task_end
        
        if project_data.get("wbs"):
            await create_tasks_recursive(project_data["wbs"])
        
        milestones_created = 0
        if project_data.get("milestones"):
            for ms in project_data["milestones"]:
                milestone_day = ms.get("suggested_day", 30)
                milestone_date = project_start + timedelta(days=milestone_day)
                ms_type = sanitize_milestone_type(ms.get("milestone_type", "deliverable"))
                
                await db.execute(
                    text("""
                        INSERT INTO milestones (project_id, name, description, milestone_type, 
                                               due_date, payment_amount)
                        VALUES (:project_id, :name, :description, :type, :due_date, :amount)
                    """),
                    {
                        "project_id": str(project_id),
                        "name": ms.get("name"),
                        "description": ms.get("description"),
                        "type": ms_type,
                        "due_date": milestone_date,
                        "amount": ms.get("payment_amount")
                    }
                )
                milestones_created += 1
        
        await db.commit()
        
        return {
            "project_id": str(project_id),
            "project_code": project_code,
            "project_name": project_data.get("project_name"),
            "tasks_created": tasks_created,
            "milestones_created": milestones_created,
            "methodology": project_data.get("methodology_suggested"),
            "estimated_duration_days": project_data.get("estimated_duration_days"),
            "risks_identified": len(project_data.get("risks", []))
        }
        
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(500, f"Error creating project: {str(e)}")


@router.post("/projects/{project_id}/generate-wbs")
async def generate_wbs(
    project_id: UUID,
    document_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    try:
        wbs_data = await generate_wbs_from_document(db, project_id, document_id)
        return wbs_data
    except Exception as e:
        raise HTTPException(500, f"Error generating WBS: {str(e)}")


@router.post("/projects/{project_id}/import-wbs")
async def import_generated_wbs(
    project_id: UUID,
    wbs_data: dict,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("SELECT planned_start_date FROM projects WHERE id = :id"),
        {"id": str(project_id)}
    )
    project = result.fetchone()
    project_start = project.planned_start_date or date.today()
    
    hours_per_day = 8
    current_date = project_start
    
    async def create_tasks_recursive(tasks: list, parent_id=None, level_start_date=None):
        nonlocal current_date
        created_count = 0
        
        for task_data in tasks:
            task_hours = task_data.get("estimated_hours", 8)
            task_days = max(1, math.ceil(task_hours / hours_per_day))
            
            task_start = level_start_date or current_date
            task_end = task_start + timedelta(days=task_days)
            
            result = await db.execute(
                text("""
                    INSERT INTO tasks (project_id, parent_task_id, wbs_code, name, description, 
                                      estimated_hours, priority, is_milestone, status,
                                      planned_start_date, planned_end_date)
                    VALUES (:project_id, :parent_id, :wbs_code, :name, :description,
                            :hours, :priority, :is_milestone, 'todo', :start_date, :end_date)
                    RETURNING id
                """),
                {
                    "project_id": str(project_id),
                    "parent_id": str(parent_id) if parent_id else None,
                    "wbs_code": task_data.get("wbs_code"),
                    "name": task_data.get("name"),
                    "description": task_data.get("description"),
                    "hours": task_hours,
                    "priority": task_data.get("priority", "medium"),
                    "is_milestone": task_data.get("is_milestone", False),
                    "start_date": task_start,
                    "end_date": task_end
                }
            )
            task_id = result.scalar()
            created_count += 1
            
            if task_data.get("children"):
                created_count += await create_tasks_recursive(task_data["children"], task_id, task_start)
            
            if not parent_id:
                current_date = task_end
        
        return created_count
    
    tasks_created = 0
    if "wbs" in wbs_data:
        tasks_created = await create_tasks_recursive(wbs_data["wbs"])
    
    milestones_created = 0
    if "milestones" in wbs_data:
        for ms in wbs_data["milestones"]:
            milestone_date = project_start + timedelta(days=ms.get("suggested_day", 30))
            ms_type = sanitize_milestone_type(ms.get("milestone_type", "deliverable"))
            await db.execute(
                text("""
                    INSERT INTO milestones (project_id, name, description, milestone_type, 
                                           due_date, payment_amount)
                    VALUES (:project_id, :name, :description, :type, :due_date, :amount)
                """),
                {
                    "project_id": str(project_id),
                    "name": ms.get("name"),
                    "description": ms.get("description"),
                    "type": ms_type,
                    "due_date": milestone_date,
                    "amount": ms.get("payment_amount")
                }
            )
            milestones_created += 1
    
    await db.commit()
    
    return {"tasks_created": tasks_created, "milestones_created": milestones_created}


@router.post("/projects/{project_id}/chat")
async def chat_with_documents(
    project_id: UUID,
    message: str,
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    try:
        response = await chat_with_project_documents(db, project_id, user_id, message)
        return response
    except Exception as e:
        raise HTTPException(500, f"Error in chat: {str(e)}")


@router.get("/projects/{project_id}/chat-history")
async def get_chat_history(
    project_id: UUID,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("""
            SELECT id, role, content, sources, created_at
            FROM ai_chat_messages WHERE project_id = :project_id
            ORDER BY created_at DESC LIMIT :limit
        """),
        {"project_id": str(project_id), "limit": limit}
    )
    
    messages = [{"id": str(r.id), "role": r.role, "content": r.content, 
                 "sources": r.sources, "created_at": r.created_at.isoformat()} for r in result]
    return {"messages": list(reversed(messages))}


@router.get("/projects/{project_id}/documents")
async def list_project_documents(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("""
            SELECT id, name, description, file_name, mime_type, file_size,
                   is_processed, processed_at, chunk_count, total_tokens, created_at,
                   ai_summary, ai_tags, ai_metadata, ai_category, ai_confidence
            FROM project_documents
            WHERE project_id = :project_id
            ORDER BY created_at DESC
        """),
        {"project_id": str(project_id)}
    )
    
    documents = []
    for row in result:
        is_source = row.ai_metadata.get("is_source_document", False) if row.ai_metadata else False
        documents.append({
            "id": str(row.id),
            "name": row.name,
            "description": row.description,
            "file_name": row.file_name,
            "mime_type": row.mime_type,
            "file_size": row.file_size,
            "is_processed": row.is_processed,
            "processed_at": row.processed_at.isoformat() if row.processed_at else None,
            "chunk_count": row.chunk_count,
            "total_tokens": row.total_tokens,
            "created_at": row.created_at.isoformat(),
            "ai_summary": row.ai_summary,
            "ai_tags": row.ai_tags or [],
            "ai_metadata": row.ai_metadata or {},
            "ai_category": row.ai_category,
            "ai_confidence": float(row.ai_confidence) if row.ai_confidence else None,
            "is_source_document": is_source
        })
    
    return {"documents": documents}


@router.get("/projects/{project_id}/analyses")
async def list_project_analyses(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("""
            SELECT id, document_id, analysis_type, ai_model, status, 
                   parsed_result, created_at, completed_at
            FROM ai_project_analyses WHERE project_id = :project_id
            ORDER BY created_at DESC
        """),
        {"project_id": str(project_id)}
    )
    
    analyses = [{"id": str(r.id), "document_id": str(r.document_id) if r.document_id else None,
                 "analysis_type": r.analysis_type, "ai_model": r.ai_model, "status": r.status,
                 "parsed_result": r.parsed_result, "created_at": r.created_at.isoformat(),
                 "completed_at": r.completed_at.isoformat() if r.completed_at else None} for r in result]
    return {"analyses": analyses}
