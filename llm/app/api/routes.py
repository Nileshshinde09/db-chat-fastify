import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.mongodb import MongoDBSaver
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.config import settings
from app.core.security import UserContext, get_current_user
from app.graph.workflow import build_graph
from app.models.connection import ConnectionTestResult, TestRequest
from app.models.report import ChatRequest
from app.rag.retriever import index_schema
from app.services.connection_loader import load_connection
from app.services.db_tester import test_connection
from app.services.schema_extract import extract_schema_from_config

logger = logging.getLogger(__name__)
router = APIRouter()


class IndexRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    connection_id: str = Field(min_length=1, max_length=80)


INTERNAL_KEY = getattr(settings, "INTERNAL_API_KEY", "") or ""
TEST_TIMEOUT_S = 4.0


async def require_internal(authorization: str | None = Header(default=None)) -> None:
    if not INTERNAL_KEY:
        return
    if authorization != f"Bearer {INTERNAL_KEY}":
        raise HTTPException(401, "Unauthorized")


def safe_thread_id(user: UserContext, thread_id: str) -> str:
    return f"{user.organization_id}:{user.user_id}:{thread_id}"


# ═══════════════════════════════════════════════════════════════════════════
@router.post("/schema/index")
async def index_connection_schema(
    body: IndexRequest,
    request: Request,
    user: Annotated[UserContext, Depends(get_current_user)],
):
    try:
        cfg = await load_connection(
            request.app.state.mongodb, body.connection_id, user.organization_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from None

    try:
        items = await extract_schema_from_config(cfg)
    except Exception as exc:
        raise HTTPException(400, f"Could not read schema: {str(exc)[:400]}") from None

    count = index_schema(user.organization_id, body.connection_id, items)
    return {"indexed_objects": count, "connection_id": body.connection_id}


# ═══════════════════════════════════════════════════════════════════════════
@router.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    user: Annotated[UserContext, Depends(get_current_user)],
):
    try:
        cfg = await load_connection(
            request.app.state.mongodb, body.connection_id, user.organization_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from None

    db_type = cfg.type

    # ── If editing, load the current plan for context ───────────────────
    current_query: dict | str | None = None
    is_edit = False
    if body.report_id:
        doc = await request.app.state.mongodb.reports.find_one({"_id": body.report_id})
        if not doc or doc["orgId"] != user.organization_id:
            raise HTTPException(404, "Report not found")
        current_query = doc.get("query")
        is_edit = True

    # ── Plain instantiation — MongoDBSaver is NOT a context manager ─────
    checkpointer = MongoDBSaver(
        request.app.state.checkpoint_client,
        db_name=request.app.state.checkpoint_db.name,
    )
    graph = build_graph(checkpointer)

    config = {
        "configurable": {
            "thread_id": safe_thread_id(user, body.thread_id),
            "mongodb": request.app.state.mongodb,
        }
    }

    initial_state = {
        "messages": [HumanMessage(content=body.message)],
        "organization_id": user.organization_id,
        "user_id": user.user_id,
        "connection_id": body.connection_id,
        "connection": cfg.model_dump(),
        "database_type": db_type,
        "intent": "database_query",
        "wants_report": False,
        "schema_context": "",
        "generated_query": "",
        "mongo_plan": {},
        "query_error": "",
        "repair_attempts": 0,
        "query_result": {},
        "final_answer": "",
        "current_query": current_query,
        "is_edit": is_edit,
    }

    try:
        result = await graph.ainvoke(initial_state, config=config)
    except Exception:
        logger.exception("chat graph failed thread=%s", body.thread_id)
        raise HTTPException(500, "Chat request failed. Check server logs.") from None

    if db_type == "mongodb":
        query = result.get("mongo_plan") or None
        query_kind = "plan"
    else:
        query = result.get("generated_query") or None
        query_kind = "sql"

    return {
        "thread_id": body.thread_id,
        "answer": result.get("final_answer", ""),
        "row_count": result.get("query_result", {}).get("row_count"),
        "query": query,
        "query_kind": query_kind,
        "connection_id": body.connection_id,
        "report_id": body.report_id,
        "is_edit": is_edit,
    }

# ═══════════════════════════════════════════════════════════════════════════
@router.post(
    "/connections/test",
    response_model=ConnectionTestResult,
    dependencies=[Depends(require_internal)],
)
async def test_connection_endpoint(req: TestRequest) -> ConnectionTestResult:
    return await test_connection(req.connection, timeout_s=TEST_TIMEOUT_S)