import asyncio
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from app.core.config import settings
from app.services.db_executor import ExecutionError, execute_select
from app.services.report_summary import summarize_for_report
from app.services.reports import build_report
from app.services.sql_guard import assert_read_only
from app.core.config import settings as _s

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports")

class ReportFormat(str, Enum):
    csv = "csv"
    xlsx = "xlsx"


class CreateReportRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    connection_id: str = Field(min_length=1, max_length=80)
    query: str | dict
    format: ReportFormat = ReportFormat.csv
    title: str = Field(default="report", max_length=120)
    with_summary: bool = False


class PatchReportRequest(BaseModel):
    """Partial update — any field omitted keeps its current value."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    query: str | dict | None = None
    format: ReportFormat | None = None
    title: str | None = Field(default=None, max_length=120)
    with_summary: bool | None = None


class ReportStatus(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    report_id: str
    status: Literal["processing", "ready", "failed", "expired"]
    row_count: int | None = None
    size_bytes: int | None = None
    truncated: bool = False
    title: str | None = None
    format: ReportFormat | None = None
    version: int = 1
    error: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class ReportCreateResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    report_id: str
    status: Literal["processing"]
    version: int = 1


class ChatRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    thread_id: str = Field(min_length=1, max_length=128)
    connection_id: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=4000)
    report_id: str | None = None    # ← edit an existing report

# ── Internal auth (same pattern as /v1/connections/test) ──────────────────
APP_ENV = _s.APP_ENV
INTERNAL_KEY = _s.INTERNAL_API_KEY if hasattr(_s, "INTERNAL_API_KEY") else ""

if APP_ENV == "production" and not INTERNAL_KEY:
    raise RuntimeError("INTERNAL_API_KEY is required in production")


async def require_internal(authorization: str | None = Header(default=None)) -> None:
    if not INTERNAL_KEY:
        return                                    # dev: auth off
    if authorization != f"Bearer {INTERNAL_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Create ────────────────────────────────────────────────────────────────
@router.post(
    "",
    response_model=ReportCreateResponse,
    status_code=202,
    dependencies=[Depends(require_internal)],
)
async def create_report(req: CreateReportRequest, request: Request):
    # 1. Never trust client SQL
    assert_read_only(req.query, req.connection.type)

    # 2. Create pending doc
    report_id = f"rpt_{uuid.uuid4().hex[:16]}"
    db = request.app.state.mongodb
    await db.reports.insert_one({
        "_id": report_id,
        "orgId": req.org_id,
        "userId": req.user_id,
        "connectionId": req.connection_id,
        "title": req.title,
        "format": req.format.value,
        "query": req.query[:4000],
        "status": "processing",
        "createdAt": datetime.now(timezone.utc),
        "expiresAt": None,
    })

    # 3. Fire-and-forget background job
    asyncio.create_task(_run_job(report_id, req, request.app))

    return ReportCreateResponse(report_id=report_id, status="processing")


# ── Status ────────────────────────────────────────────────────────────────
@router.get(
    "/{report_id}",
    response_model=ReportStatus,
    dependencies=[Depends(require_internal)],
)
async def get_report_status(report_id: str, request: Request):
    doc = await request.app.state.mongodb.reports.find_one({"_id": report_id})
    if not doc:
        raise HTTPException(404, "Report not found")

    return ReportStatus(
        report_id=doc["_id"],
        status=doc["status"],
        row_count=doc.get("rowCount"),
        size_bytes=doc.get("sizeBytes"),
        truncated=bool(doc.get("truncated", False)),
        title=doc.get("title"),
        format=doc.get("format"),
        error=doc.get("error"),
        created_at=doc["createdAt"],
    )


# ── Download ──────────────────────────────────────────────────────────────
@router.get(
    "/{report_id}/download",
    dependencies=[Depends(require_internal)],
)
async def download_report(report_id: str, request: Request):
    doc = await request.app.state.mongodb.reports.find_one({"_id": report_id})
    if not doc:
        raise HTTPException(404, "Report not found")
    if doc["status"] != "ready":
        raise HTTPException(409, f"Report is {doc['status']}")

    from pathlib import Path
    path = Path(settings.REPORT_STORAGE_PATH) / doc["filename"]
    if not path.exists():
        raise HTTPException(410, "Report file has been cleaned up")

    return FileResponse(
        path,
        media_type=doc["mime"],
        filename=doc["originalName"],
    )


# ── Background job ────────────────────────────────────────────────────────
async def _run_job(report_id: str, req: CreateReportRequest, app) -> None:
    db = app.state.mongodb
    try:
        columns, rows, truncated = await execute_select(
            req.connection,
            req.query,
            max_rows=settings.MAX_REPORT_ROWS,
            timeout_s=settings.REPORT_QUERY_TIMEOUT_SECONDS,
        )

        summary = ""
        if req.with_summary and settings.REPORT_SUMMARY_ENABLED and rows:
            summary = await summarize_for_report(
                title=req.title,
                columns=columns,
                rows=rows,
                total_rows=len(rows),
            )

        await build_report(
            db,
            report_id=report_id,
            org_id=req.org_id,
            user_id=req.user_id,
            connection_id=req.connection_id,
            title=req.title,
            fmt=req.format.value,
            columns=columns,
            rows=rows,
            query=req.query,
            truncated=truncated,
            summary=summary,
        )
    except ExecutionError as e:
        logger.warning("report exec failed report=%s code=%s", report_id, e.code)
        await db.reports.update_one(
            {"_id": report_id},
            {"$set": {"status": "failed", "error": str(e)[:300]}},
        )
    except asyncio.TimeoutError:
        await db.reports.update_one(
            {"_id": report_id},
            {
                "$set": {
                    "status": "failed",
                    "error": (
                        f"Query timed out after "
                        f"{settings.REPORT_QUERY_TIMEOUT_SECONDS}s"
                    ),
                }
            },
        )
    except Exception as e:
        logger.exception("report job failed report=%s", report_id)
        await db.reports.update_one(
            {"_id": report_id},
            {"$set": {"status": "failed", "error": str(e)[:300]}},
        )