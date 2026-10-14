import os
import json
from datetime import datetime, timezone
from typing import Optional, List, AsyncGenerator
from contextlib import asynccontextmanager

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from pydantic import BaseModel, Field

load_dotenv()

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
MONGODB_URL     = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME         = os.getenv("DB_NAME", "chat_app")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL   = os.getenv("DEFAULT_MODEL", "llama3.2")
SYSTEM_PROMPT   = os.getenv("SYSTEM_PROMPT", "You are a helpful assistant.")

# ------------------------------------------------------------------
# Clients
# ------------------------------------------------------------------
mongo_client: Optional[AsyncIOMotorClient] = None
db = None

# LangChain's ChatOllama client manages the Ollama connection natively
llm = ChatOllama(
    model=DEFAULT_MODEL,
    base_url=OLLAMA_BASE_URL,
    temperature=0.7,
    num_predict=1024,  # max output tokens; adjust for your hardware
    streaming=True,    # enables token-by-token streaming by default
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo_client, db
    mongo_client = AsyncIOMotorClient(MONGODB_URL, tz_aware=True)
    db = mongo_client[DB_NAME]

    # Indexes for query performance
    await db.conversations.create_index([("user_id", 1), ("updated_at", -1)])
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])

    yield
    mongo_client.close()

app = FastAPI(title="LLM Chat Server (Ollama + LangChain)", version="1.0.0", lifespan=lifespan)

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def now() -> datetime:
    return datetime.now(timezone.utc)

def oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid ID format")

def serialize_conv(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "user_id": doc.get("user_id"),
        "title": doc.get("title", "New Chat"),
        "model": doc.get("model", DEFAULT_MODEL),
        "created_at": doc["created_at"].isoformat(),
        "updated_at": doc["updated_at"].isoformat(),
    }

def serialize_msg(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "conversation_id": str(doc["conversation_id"]),
        "role": doc["role"],
        "content": doc["content"],
        "created_at": doc["created_at"].isoformat(),
    }

# ------------------------------------------------------------------
# Request Schemas
# ------------------------------------------------------------------
class CreateConvRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None

class UpdateConvRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None

class SendMessageRequest(BaseModel):
    message: str = Field(..., min_length=1)
    stream: bool = False
    model: Optional[str] = None

# ------------------------------------------------------------------
# Health
# ------------------------------------------------------------------
@app.get("/health")
async def health():
    try:
        await db.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False
    return {"status": "ok", "mongo": mongo_ok}

# ------------------------------------------------------------------
# Conversations
# ------------------------------------------------------------------
@app.post("/conversations", status_code=201)
async def create_conversation(
    req: CreateConvRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    doc = {
        "user_id": x_user_id,
        "title": req.title or "New Chat",
        "model": req.model or DEFAULT_MODEL,
        "created_at": now(),
        "updated_at": now(),
    }
    result = await db.conversations.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_conv(doc)

@app.get("/conversations")
async def list_conversations(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    query = {"user_id": x_user_id} if x_user_id else {}
    cursor = db.conversations.find(query).sort("updated_at", -1).skip(skip).limit(limit)
    items = [serialize_conv(doc) async for doc in cursor]
    total = await db.conversations.count_documents(query)
    return {"items": items, "count": len(items), "total": total}

@app.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    doc = await db.conversations.find_one({"_id": oid(conv_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return serialize_conv(doc)

@app.patch("/conversations/{conv_id}")
async def update_conversation(conv_id: str, req: UpdateConvRequest):
    cid = oid(conv_id)
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = now()

    result = await db.conversations.find_one_and_update(
        {"_id": cid},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return serialize_conv(result)

@app.delete("/conversations/{conv_id}", status_code=204)
async def delete_conversation(conv_id: str):
    cid = oid(conv_id)
    conv = await db.conversations.find_one({"_id": cid})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.messages.delete_many({"conversation_id": cid})
    await db.conversations.delete_one({"_id": cid})
    return None

# ------------------------------------------------------------------
# Messages
# ------------------------------------------------------------------
@app.get("/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: str,
    limit: int = Query(200, ge=1, le=1000),
):
    cid = oid(conv_id)
    conv = await db.conversations.find_one({"_id": cid})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cursor = db.messages.find({"conversation_id": cid}).sort("created_at", 1).limit(limit)
    items = [serialize_msg(doc) async for doc in cursor]
    return {"items": items, "count": len(items)}

async def _build_llm_messages(conv_id: ObjectId) -> list:
    """Fetch full history from Mongo and build LangChain message objects."""
    cursor = db.messages.find({"conversation_id": conv_id}).sort("created_at", 1)
    history = [
        {"role": doc["role"], "content": doc["content"]}
        async for doc in cursor
    ]
    # Convert to LangChain message objects
    langchain_messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in history:
        if msg["role"] == "user":
            langchain_messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            langchain_messages.append(AIMessage(content=msg["content"]))
    return langchain_messages

@app.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, req: SendMessageRequest):
    cid = oid(conv_id)
    conv = await db.conversations.find_one({"_id": cid})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = req.model or conv.get("model") or DEFAULT_MODEL

    # 1. Persist the user's message
    user_doc = {
        "conversation_id": cid,
        "role": "user",
        "content": req.message,
        "created_at": now(),
    }
    user_res = await db.messages.insert_one(user_doc)
    user_doc["_id"] = user_res.inserted_id

    # 2. Auto-title from first user message
    if conv.get("title") in (None, "", "New Chat"):
        title = req.message.strip().split("\n")[0][:60] or "New Chat"
        await db.conversations.update_one(
            {"_id": cid},
            {"$set": {"title": title, "updated_at": now()}},
        )

    # 3. Build LangChain message history (includes just-saved user message)
    lc_messages = await _build_llm_messages(cid)

    # ------------------------------------------------------------------
    # Non-streaming
    # ------------------------------------------------------------------
    if not req.stream:
        try:
            # Use ainvoke for async, non-streaming call
            response = await llm.ainvoke(lc_messages)
            content = response.content
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LLM error: {e}")

        ai_doc = {
            "conversation_id": cid,
            "role": "assistant",
            "content": content,
            "created_at": now(),
        }
        ai_res = await db.messages.insert_one(ai_doc)
        ai_doc["_id"] = ai_res.inserted_id

        await db.conversations.update_one({"_id": cid}, {"$set": {"updated_at": now()}})

        return {
            "user_message": serialize_msg(user_doc),
            "assistant_message": serialize_msg(ai_doc),
        }

    # ------------------------------------------------------------------
    # Streaming (SSE)
    # ------------------------------------------------------------------
    async def event_stream() -> AsyncGenerator[str, None]:
        chunks: List[str] = []
        try:
            # Use astream for async, token-by-token streaming
            async for chunk in llm.astream(lc_messages):
                token = chunk.content
                if token:
                    chunks.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            return

        content = "".join(chunks)

        ai_doc = {
            "conversation_id": cid,
            "role": "assistant",
            "content": content,
            "created_at": now(),
        }
        ai_res = await db.messages.insert_one(ai_doc)

        await db.conversations.update_one({"_id": cid}, {"$set": {"updated_at": now()}})

        yield f"data: {json.dumps({'type': 'done', 'message_id': str(ai_res.inserted_id)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )