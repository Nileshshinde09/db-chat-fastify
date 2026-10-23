import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.config import settings
from app.services.report_writer import write_csv, write_xlsx

logger = logging.getLogger(__name__)


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:60] or "report"


async def build_report(
    db,
    *,
    report_id: str,
    org_id: str,
    user_id: str,
    connection_id: str,
    title: str,
    fmt: str,
    columns: list[str],
    rows: list[list],
    query: str | dict,
    truncated: bool = False,
    summary: str = "",
    with_summary: bool = False,
) -> None:
    """Write the file and flip the Mongo doc from 'processing' → 'ready'."""
    filename = f"{report_id}.{fmt}"
    path = Path(settings.REPORT_STORAGE_PATH) / filename
    path.parent.mkdir(parents=True, exist_ok=True)

    # Delete old file if format changed (CSV → XLSX or vice versa)
    old_doc = await db.reports.find_one({"_id": report_id}, {"filename": 1})
    if old_doc and old_doc.get("filename") and old_doc["filename"] != filename:
        old_path = Path(settings.REPORT_STORAGE_PATH) / old_doc["filename"]
        try:
            old_path.unlink(missing_ok=True)
        except OSError as e:
            logger.warning("could not delete old report file %s: %s", old_path, e)

    # Write new file
    try:
        if fmt == "csv":
            row_count, size = await write_csv(columns, rows, path, summary)
            mime = "text/csv; charset=utf-8"
        elif fmt == "xlsx":
            row_count, size = write_xlsx(columns, rows, path, summary)
            mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            raise ValueError(f"Unsupported format: {fmt}")
    except Exception as e:
        logger.exception("file write failed id=%s", report_id)
        await db.reports.update_one(
            {"_id": report_id},
            {"$set": {"status": "failed", "error": f"file write: {e}"[:300]}},
        )
        return

    now = datetime.now(timezone.utc)
    query_for_store = query[:4000] if isinstance(query, str) else query

    await db.reports.update_one(
        {"_id": report_id},
        {"$set": {
            "filename": filename,
            "originalName": f"{_slug(title)}-{now:%Y-%m-%d}.{fmt}",
            "mime": mime,
            "sizeBytes": size,
            "rowCount": row_count,
            "truncated": truncated,
            "query": query_for_store,
            "title": title,
            "format": fmt,
            "summary": summary[:1200],
            "withSummary": with_summary,
            "status": "ready",
            "error": None,
            "readyAt": now,
            "updatedAt": now,
            "expiresAt": now + timedelta(days=settings.REPORT_TTL_DAYS),
        }},
    )