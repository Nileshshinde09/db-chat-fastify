import logging
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


async def cleanup_expired_reports(app) -> int:
    db = app.state.mongodb
    now = datetime.now(timezone.utc)
    deleted = 0

    async for doc in db.reports.find({
        "expiresAt": {"$lt": now},
        "status": "ready",
    }):
        path = Path(settings.REPORT_STORAGE_PATH) / doc.get("filename", "")
        try:
            path.unlink(missing_ok=True)
        except OSError as e:
            logger.warning("failed to delete %s: %s", path, e)
        await db.reports.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "expired"}},
        )
        deleted += 1

    if deleted:
        logger.info("cleaned up %d expired reports", deleted)
    return deleted