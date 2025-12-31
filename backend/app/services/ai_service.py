import os
import json
import logging
from typing import List, Dict, Any, Optional
from uuid import UUID
import anthropic
import openai
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize clients
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)


async def extract_text_from_document(file_path: str, mime_type: str) -> str:
    """Extract text content from uploaded document."""
    logger.info(f"Extracting text from {file_path} (type: {mime_type})")
    
    if mime_type == "application/pdf":
        import subprocess
        result = subprocess.run(
            ["pdftotext", "-layout", file_path, "-"],
            capture_output=True, text=True
        )
        return result.stdout
    elif mime_type in ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
        from docx import Document
        doc = Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])
    elif mime_type == "text/plain":
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    else:
        raise ValueError(f"Unsupported mime type: {mime_type}")


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[Dict[str, Any]]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    chunk_index = 0
    
    while start < len(text):
        end = start + chunk_size
        chunk_content = text[start:end]
        
        if end < len(text):
            last_period = chunk_content.rfind('. ')
            if last_period > chunk_size // 2:
                end = start + last_period + 1
                chunk_content = text[start:end]
        
        chunks.append({
            "chunk_index": chunk_index,
            "content": chunk_content.strip(),
            "start_char": start,
            "end_char": end
        })
        
        chunk_index += 1
        start = end - overlap
    
    return chunks


async def create_embedding(text: str) -> List[float]:
    """Create embedding using OpenAI."""
    response = openai_client.embeddings.create(
        model="text-embedding-ada-002",
        input=text
    )
    return response.data[0].embedding


async def generate_project_from_text(text_content: str, suggested_name: str = None) -> Dict[str, Any]:
    """Use Claude to analyze document and generate complete project structure."""
    logger.info(f"Generating project from text ({len(text_content)} chars), suggested_name: {suggested_name}")
    
    # Truncate if too long
    if len(text_content) > 80000:
        text_content = text_content[:80000] + "\n\n[... documento troncato ...]"
    
    prompt = f"""Sei un esperto Project Manager. Analizza il seguente documento di progetto e genera una struttura completa per la gestione del progetto.

DOCUMENTO:
---
{text_content}
---

Genera una struttura progetto COMPLETA in formato JSON con questa ESATTA struttura:

{{
    "project_name": "Nome del progetto",
    "project_summary": "Descrizione sintetica del progetto",
    "estimated_duration_days": 90,
    "estimated_budget": 25000,
    "methodology_suggested": "waterfall",
    "wbs": [
        {{
            "wbs_code": "1",
            "name": "Nome fase principale",
            "description": "Descrizione",
            "estimated_hours": 40,
            "priority": "high",
            "is_milestone": false,
            "children": [
                {{
                    "wbs_code": "1.1",
                    "name": "Nome attività",
                    "description": "Descrizione",
                    "estimated_hours": 20,
                    "priority": "medium",
                    "is_milestone": false,
                    "children": []
                }}
            ]
        }}
    ],
    "milestones": [
        {{
            "name": "Nome milestone",
            "description": "Descrizione",
            "milestone_type": "deliverable",
            "suggested_day": 30,
            "payment_amount": null
        }}
    ],
    "risks": [
        {{
            "description": "Descrizione rischio",
            "probability": "medium",
            "impact": "high",
            "mitigation": "Strategia"
        }}
    ]
}}

IMPORTANTE: Rispondi SOLO con il JSON, senza markdown, senza ```json, solo il JSON puro."""

    try:
        logger.info("Calling Claude API...")
        response = anthropic_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}]
        )
        
        response_text = response.content[0].text
        logger.info(f"Claude response received ({len(response_text)} chars)")
        logger.info(f"Response preview: {response_text[:200]}...")
        
        # Parse JSON
        try:
            # Clean up response
            clean_text = response_text.strip()
            
            # Remove markdown code blocks if present
            if "```json" in clean_text:
                clean_text = clean_text.split("```json")[1].split("```")[0]
            elif "```" in clean_text:
                clean_text = clean_text.split("```")[1].split("```")[0]
            
            clean_text = clean_text.strip()
            logger.info(f"Parsing JSON: {clean_text[:100]}...")
            
            project_data = json.loads(clean_text)
            logger.info(f"JSON parsed successfully! WBS items: {len(project_data.get('wbs', []))}, Milestones: {len(project_data.get('milestones', []))}")
            
            # Use suggested name if project_name not extracted
            if suggested_name and not project_data.get("project_name"):
                project_data["project_name"] = suggested_name
                
            return project_data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}")
            logger.error(f"Raw response was: {response_text[:500]}")
            return {
                "project_name": suggested_name or "Nuovo Progetto",
                "project_summary": "Progetto creato da documento",
                "estimated_duration_days": 90,
                "methodology_suggested": "waterfall",
                "wbs": [],
                "milestones": [],
                "risks": [],
                "parse_error": str(e)
            }
            
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        return {
            "project_name": suggested_name or "Nuovo Progetto",
            "project_summary": "Progetto creato da documento (errore AI)",
            "estimated_duration_days": 90,
            "methodology_suggested": "waterfall",
            "wbs": [],
            "milestones": [],
            "risks": [],
            "api_error": str(e)
        }


async def search_similar_chunks(
    db: AsyncSession,
    project_id: UUID,
    query: str,
    limit: int = 5
) -> List[Dict[str, Any]]:
    """Search for similar chunks using vector similarity."""
    
    query_embedding = await create_embedding(query)
    
    result = await db.execute(
        text("""
            SELECT dc.id, dc.content, dc.chunk_index, pd.name as document_name,
                   1 - (dc.embedding <=> :embedding::vector) as similarity
            FROM document_chunks dc
            JOIN project_documents pd ON dc.document_id = pd.id
            WHERE pd.project_id = :project_id
            ORDER BY dc.embedding <=> :embedding::vector
            LIMIT :limit
        """),
        {
            "embedding": str(query_embedding),
            "project_id": str(project_id),
            "limit": limit
        }
    )
    
    chunks = []
    for row in result:
        chunks.append({
            "id": str(row.id),
            "content": row.content,
            "chunk_index": row.chunk_index,
            "document_name": row.document_name,
            "similarity": float(row.similarity)
        })
    
    return chunks


async def chat_with_project_documents(
    db: AsyncSession,
    project_id: UUID,
    user_id: UUID,
    user_message: str
) -> Dict[str, Any]:
    """RAG-based chat: search relevant chunks and generate response."""
    
    relevant_chunks = await search_similar_chunks(db, project_id, user_message, limit=5)
    
    context = "\n\n---\n\n".join([
        f"[Da: {chunk['document_name']}]\n{chunk['content']}"
        for chunk in relevant_chunks
    ])
    
    prompt = f"""Sei un assistente AI per la gestione progetti. Rispondi alla domanda dell'utente basandoti SOLO sulle informazioni contenute nei documenti di progetto forniti.

CONTESTO DAI DOCUMENTI:
{context}

DOMANDA UTENTE: {user_message}

Se le informazioni non sono sufficienti per rispondere, dillo chiaramente."""

    response = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    
    assistant_response = response.content[0].text
    
    await db.execute(
        text("""
            INSERT INTO ai_chat_messages (project_id, user_id, role, content)
            VALUES (:project_id, :user_id, 'user', :content)
        """),
        {"project_id": str(project_id), "user_id": str(user_id), "content": user_message}
    )
    
    await db.execute(
        text("""
            INSERT INTO ai_chat_messages (project_id, user_id, role, content, sources, ai_model, tokens_used)
            VALUES (:project_id, :user_id, 'assistant', :content, :sources, :model, :tokens)
        """),
        {
            "project_id": str(project_id),
            "user_id": str(user_id),
            "content": assistant_response,
            "sources": json.dumps([{"document": c["document_name"], "similarity": c["similarity"]} for c in relevant_chunks]),
            "model": "claude-sonnet-4-20250514",
            "tokens": response.usage.output_tokens
        }
    )
    
    await db.commit()
    
    return {
        "response": assistant_response,
        "sources": relevant_chunks
    }


async def process_document_for_rag(
    db: AsyncSession,
    document_id: UUID,
    file_path: str,
    mime_type: str
) -> Dict[str, Any]:
    """Process document: extract text, chunk, embed, and store."""
    logger.info(f"Processing document {document_id} for RAG")
    
    # Extract text
    text_content = await extract_text_from_document(file_path, mime_type)
    
    # Update document with extracted content
    await db.execute(
        text("UPDATE project_documents SET content = :content WHERE id = :id"),
        {"content": text_content, "id": str(document_id)}
    )
    
    # Chunk the text
    chunks = chunk_text(text_content)
    
    total_tokens = 0
    
    # Create embeddings and store chunks
    for chunk in chunks:
        embedding = await create_embedding(chunk["content"])
        tokens = len(chunk["content"]) // 4  # Rough estimate
        total_tokens += tokens
        
        await db.execute(
            text("""
                INSERT INTO document_chunks (document_id, chunk_index, content, embedding, tokens, metadata)
                VALUES (:doc_id, :idx, :content, :embedding, :tokens, :metadata)
            """),
            {
                "doc_id": str(document_id),
                "idx": chunk["chunk_index"],
                "content": chunk["content"],
                "embedding": str(embedding),
                "tokens": tokens,
                "metadata": json.dumps({"start_char": chunk["start_char"], "end_char": chunk["end_char"]})
            }
        )
    
    # Update document status
    await db.execute(
        text("""
            UPDATE project_documents 
            SET is_processed = TRUE, processed_at = NOW(), chunk_count = :chunks, total_tokens = :tokens
            WHERE id = :id
        """),
        {"chunks": len(chunks), "tokens": total_tokens, "id": str(document_id)}
    )
    
    await db.commit()
    
    return {
        "chunks_created": len(chunks),
        "total_tokens": total_tokens,
        "text_length": len(text_content)
    }


async def generate_wbs_from_document(
    db: AsyncSession,
    project_id: UUID,
    document_id: UUID
) -> Dict[str, Any]:
    """Use Claude to analyze document and generate WBS structure."""
    logger.info(f"Generating WBS for project {project_id} from document {document_id}")
    
    # Get document content
    result = await db.execute(
        text("SELECT content, name FROM project_documents WHERE id = :id"),
        {"id": str(document_id)}
    )
    row = result.fetchone()
    
    if not row or not row.content:
        raise ValueError("Document not found or not processed")
    
    document_content = row.content
    document_name = row.name
    
    # Use the same function
    wbs_data = await generate_project_from_text(document_content, document_name)
    
    # Save analysis
    await db.execute(
        text("""
            INSERT INTO ai_project_analyses 
            (project_id, document_id, analysis_type, ai_model, parsed_result, status, completed_at)
            VALUES (:project_id, :document_id, 'wbs_generation', :model, :parsed_result, 'completed', NOW())
        """),
        {
            "project_id": str(project_id),
            "document_id": str(document_id),
            "model": "claude-sonnet-4-20250514",
            "parsed_result": json.dumps(wbs_data)
        }
    )
    
    await db.commit()
    
    return wbs_data


async def classify_and_summarize_document(text_content: str, file_name: str) -> Dict[str, Any]:
    """Use Claude to classify document, extract tags, and generate summary."""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Classifying document: {file_name} ({len(text_content)} chars)")
    
    # Truncate if too long
    if len(text_content) > 50000:
        text_content = text_content[:50000] + "\n\n[... documento troncato ...]"
    
    prompt = f"""Analizza questo documento e fornisci una classificazione strutturata in formato JSON.

NOME FILE: {file_name}

CONTENUTO:
---
{text_content}
---

Rispondi con un JSON con questa struttura ESATTA:

{{
    "category": "una categoria tra: contract, proposal, specification, meeting_notes, report, invoice, correspondence, technical_doc, legal, financial, hr, marketing, other",
    "category_it": "la categoria in italiano",
    "confidence": 0.95,
    "summary": "Un sommario conciso del documento in 2-3 frasi",
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
    "metadata": {{
        "language": "it o en",
        "dates_mentioned": ["2024-01-15", "2024-02-20"],
        "amounts_mentioned": ["€10.000", "$5.000"],
        "people_mentioned": ["Mario Rossi", "Anna Bianchi"],
        "companies_mentioned": ["Noscite Srl", "Cliente SpA"],
        "key_topics": ["sviluppo software", "project management"],
        "document_date": "2024-01-15 o null se non presente",
        "urgency": "high, medium, low o null",
        "action_required": true o false
    }}
}}

I TAG devono essere:
- In italiano
- Specifici e utili per la ricerca (come in Obsidian)
- Da 3 a 8 tag
- Lowercase con trattini invece di spazi (es: "project-management", "sviluppo-web")

Rispondi SOLO con il JSON valido, senza markdown o testo aggiuntivo."""

    try:
        response = anthropic_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )
        
        response_text = response.content[0].text
        logger.info(f"Classification response received ({len(response_text)} chars)")
        
        # Parse JSON
        clean_text = response_text.strip()
        if "```json" in clean_text:
            clean_text = clean_text.split("```json")[1].split("```")[0]
        elif "```" in clean_text:
            clean_text = clean_text.split("```")[1].split("```")[0]
        
        result = json.loads(clean_text.strip())
        logger.info(f"Classification successful: {result.get('category')}, tags: {result.get('tags')}")
        
        return result
        
    except Exception as e:
        logger.error(f"Classification error: {e}")
        return {
            "category": "other",
            "category_it": "Altro",
            "confidence": 0.0,
            "summary": "Impossibile classificare il documento automaticamente.",
            "tags": [],
            "metadata": {},
            "error": str(e)
        }
