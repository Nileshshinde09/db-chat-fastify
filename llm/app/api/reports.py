import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.security import UserContext, get_current_user
from app.models.connection import ConnectionConfig
from app.models.report import (
    CreateReportRequest,
    PatchReportRequest,
    ReportCreateResponse,
    ReportFormat,
    ReportStatus,
)
from app.services.connection_loader import load_connection
from app.services.db_executor import ExecutionError, execute_select
from app.services.mongo_executor import execute_mongo
from app.services.mongo_guard import assert_mongo_read_only
from app.services.report_summary import summarize_for_report
from app.services.reports import build_report
from app.services.sql_guard import assert_read_only

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports")


# ═══════════════════════════════════════════════════════════════════════════
# POST /reports — create
# ═══════════════════════════════════════════════════════════════════════════
@router.post("", response_model=ReportCreateResponse, status_code=202)
async def create_report(
    body: CreateReportRequest,
    request: Request,
    user: UserContext = Depends(get_current_user),
):
    try:
        cfg = await load_connection(
            request.app.state.mongodb, body.connection_id, user.organization_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from None

    _validate_query(cfg, body.query)

    report_id = f"rpt_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    await request.app.state.mongodb.reports.insert_one({
        "_id": report_id,
        "orgId": user.organization_id,
        "userId": user.user_id,
        "connectionId": body.connection_id,
        "title": body.title,
        "format": body.format.value,
        "query": body.query[:4000] if isinstance(body.query, str) else body.query,
        "withSummary": body.with_summary,
        "version": 1,
        "status": "processing",
        "createdAt": now,
        "expiresAt": None,
    })

    asyncio.create_task(_run_job(report_id, body, cfg, user, request.app))
    return ReportCreateResponse(report_id=report_id, status="processing", version=1)


# ═══════════════════════════════════════════════════════════════════════════
# PATCH /reports/:id — edit query / format / title
# ═══════════════════════════════════════════════════════════════════════════
@router.patch("/{report_id}", response_model=ReportCreateResponse, status_code=202)
async def patch_report(
    report_id: str,
    body: PatchReportRequest,
    request: Request,
    user: UserContext = Depends(get_current_user),
):
    doc = await request.app.state.mongodb.reports.find_one({"_id": report_id})
    if not doc or doc["orgId"] != user.organization_id:
        raise HTTPException(404, "Report not found")

    try:
        cfg = await load_connection(
            request.app.state.mongodb, doc["connectionId"], user.organization_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from None

    # Merge — omitted fields keep current values
    new_query = body.query if body.query is not None else doc["query"]
    new_format = body.format.value if body.format else doc.get("format", "csv")
    new_title = body.title if body.title is not None else doc.get("title", "report")
    new_summary = body.with_summary if body.with_summary is not None else doc.get("withSummary", False)

    _validate_query(cfg, new_query)

    new_version = int(doc.get("version", 1)) + 1
    now = datetime.now(timezone.utc)
    await request.app.state.mongodb.reports.update_one(
        {"_id": report_id},
        {"$set": {
            "query": new_query[:4000] if isinstance(new_query, str) else new_query,
            "format": new_format,
            "title": new_title,
            "withSummary": new_summary,
            "status": "processing",
            "version": new_version,
            "updatedAt": now,
            "error": None,
        }},
    )

    patch_body = CreateReportRequest(
        connection_id=doc["connectionId"],
        query=new_query,
        format=ReportFormat(new_format),
        title=new_title,
        with_summary=new_summary,
    )
    asyncio.create_task(_run_job(report_id, patch_body, cfg, user, request.app))
    return ReportCreateResponse(report_id=report_id, status="processing", version=new_version)


# ═══════════════════════════════════════════════════════════════════════════
# GET /reports/:id — status
# ═══════════════════════════════════════════════════════════════════════════
@router.get("/{report_id}", response_model=ReportStatus)
async def get_report_status(
    report_id: str,
    request: Request,
    user: UserContext = Depends(get_current_user),
):
    doc = await request.app.state.mongodb.reports.find_one({"_id": report_id})
    if not doc or doc["orgId"] != user.organization_id:
        raise HTTPException(404, "Report not found")

    return ReportStatus(
        report_id=doc["_id"],
        status=doc["status"],
        row_count=doc.get("rowCount"),
        size_bytes=doc.get("sizeBytes"),
        truncated=bool(doc.get("truncated", False)),
        title=doc.get("title"),
        format=doc.get("format"),
        version=int(doc.get("version", 1)),
        error=doc.get("error"),
        created_at=doc["createdAt"],
        updated_at=doc.get("updatedAt"),
    )


# ═══════════════════════════════════════════════════════════════════════════
# GET /reports/:id/download
# ═══════════════════════════════════════════════════════════════════════════
@router.get("/{report_id}/download")
async def download_report(
    report_id: str,
    request: Request,
    user: UserContext = Depends(get_current_user),
):
    doc = await request.app.state.mongodb.reports.find_one({"_id": report_id})
    if not doc or doc["orgId"] != user.organization_id:
        raise HTTPException(404, "Report not found")
    if doc["status"] != "ready":
        raise HTTPException(409, f"Report is {doc['status']}")

    path = Path(settings.REPORT_STORAGE_PATH) / doc["filename"]
    if not path.exists():
        raise HTTPException(410, "Report file has been cleaned up")

    return FileResponse(
        path,
        media_type=doc["mime"],
        filename=doc["originalName"],
    )


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════
def _validate_query(cfg: ConnectionConfig, query: str | dict) -> None:
    if cfg.type == "mongodb":
        if not isinstance(query, dict):
            raise HTTPException(400, "MongoDB reports require a plan object, not a string.")
        assert_mongo_read_only(query)
    else:
        if not isinstance(query, str):
            raise HTTPException(400, f"{cfg.type} reports require a SQL string.")
        assert_read_only(query, cfg.type)


# ═══════════════════════════════════════════════════════════════════════════
# Background job (shared by create + patch)
# ═══════════════════════════════════════════════════════════════════════════
async def _run_job(
    report_id: str,
    body: CreateReportRequest,
    cfg: ConnectionConfig,
    user: UserContext,
    app,
):
    db = app.state.mongodb
    try:
        if cfg.type == "mongodb":
            columns, rows, truncated = await execute_mongo(
                cfg, body.query,
                max_rows=settings.MAX_REPORT_ROWS,
                timeout_s=settings.REPORT_QUERY_TIMEOUT_SECONDS,
            )
        else:
            columns, rows, truncated = await execute_select(
                cfg, body.query,
                max_rows=settings.MAX_REPORT_ROWS,
                timeout_s=settings.REPORT_QUERY_TIMEOUT_SECONDS,
            )

        summary = ""
        if body.with_summary and settings.REPORT_SUMMARY_ENABLED and rows:
            summary = await summarize_for_report(
                title=body.title, columns=columns, rows=rows, total_rows=len(rows),
            )

        await build_report(
            db,
            report_id=report_id,
            org_id=user.organization_id,
            user_id=user.user_id,
            connection_id=body.connection_id,
            title=body.title,
            fmt=body.format.value,
            columns=columns,
            rows=rows,
            query=body.query,
            truncated=truncated,
            summary=summary,
            with_summary=body.with_summary,
        )

    except ExecutionError as e:
        logger.warning("report exec failed id=%s code=%s", report_id, e.code)
        await db.reports.update_one(
            {"_id": report_id},
            {"$set": {"status": "failed", "error": f"{e.code}: {e}"[:300]}},
        )
    except asyncio.TimeoutError:
        await db.reports.update_one(
            {"_id": report_id},
            {"$set": {
                "status": "failed",
                "error": f"Query timed out after {settings.REPORT_QUERY_TIMEOUT_SECONDS}s",
            }},
        )
    except Exception as e:
        logger.exception("report job failed id=%s", report_id)
        await db.reports.update_one(
            {"_id": report_id},
            {"$set": {"status": "failed", "error": str(e)[:300]}},
        )