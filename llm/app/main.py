import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pymongo import AsyncMongoClient, MongoClient

from app.api.reports import router as reports_router
from app.api.routes import router
from app.core.config import settings
from app.jobs.report_cleanup import cleanup_expired_reports

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


async def _cleanup_loop(app: FastAPI) -> None:
    """Runs every hour. Failures are logged, never kill the loop."""
    while True:
        await asyncio.sleep(3600)
        try:
            await cleanup_expired_reports(app)
        except Exception:
            logger.exception("report cleanup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Async client — used everywhere in the app (reports, chat, cleanup)
    client = AsyncMongoClient(
        settings.MONGODB_URI,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
    )
    # Sync client — ONLY for the LangGraph checkpointer (it calls sync methods)
    sync_client: MongoClient | None = None
    cleanup_task: asyncio.Task | None = None

    try:
        # 1. Verify async Mongo is reachable
        await client.admin.command("ping")

        # 2. Set async state FIRST — everything below depends on it
        app.state.mongodb_client = client
        app.state.mongodb = client[settings.MONGODB_DATABASE]

        # 3. Set sync state for the checkpointer
        sync_client = MongoClient(settings.MONGODB_URI)
        app.state.checkpoint_client = sync_client
        app.state.checkpoint_db = sync_client[settings.CHECKPOINT_DATABASE]

        # 4. Storage dir
        Path(settings.REPORT_STORAGE_PATH).mkdir(parents=True, exist_ok=True)

        # 5. Indexes — now app.state.mongodb exists
        try:
            await app.state.mongodb.reports.create_index("orgId")
            await app.state.mongodb.reports.create_index("expiresAt")
            await app.state.mongodb.reports.create_index("status")
        except Exception:
            logger.exception("could not create report indexes")

        # 6. Background cleanup
        cleanup_task = asyncio.create_task(_cleanup_loop(app))

        logger.info(
            "MongoDB ready | db=%s | checkpoint=%s | reports=%s | cleanup=hourly",
            settings.MONGODB_DATABASE,
            settings.CHECKPOINT_DATABASE,
            settings.REPORT_STORAGE_PATH,
        )
        yield

    finally:
        if cleanup_task:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass
        await client.close()
        if sync_client is not None:
            sync_client.close()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-User-Id", "X-Organization-Id"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "mongodb": app.state.mongodb.name if hasattr(app.state, "mongodb") else None,
        "checkpoint": app.state.checkpoint_db.name if hasattr(app.state, "checkpoint_db") else None,
    }


@app.get("/health/ready")
async def readiness(response: Response):
    try:
        await app.state.mongodb_client.admin.command("ping")
        return {"status": "ready", "mongodb": "connected"}
    except Exception as e:
        response.status_code = 503
        return {"status": "not_ready", "error": str(e)[:200]}