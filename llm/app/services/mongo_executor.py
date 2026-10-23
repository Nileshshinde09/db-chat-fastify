import asyncio
import json
import logging
from datetime import datetime

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.models.connection import ConnectionConfig
from app.services.db_executor import ExecutionError

logger = logging.getLogger(__name__)


async def execute_mongo(
    cfg: ConnectionConfig,
    plan: dict,
    *,
    max_rows: int = 1000,
    timeout_s: int = 30,
) -> tuple[list[str], list[list], bool]:
    """
    Execute a Mongo plan. Returns (columns, rows, truncated).

    Handles:
      - "collection": "users"                    → users
      - "collection": "database-chat.users"      → users (prefix stripped)
      - operation "find" with filter / projection / sort / limit
      - operation "aggregate" with pipeline
      - hard cap on rows, hard timeout on execution
    """
    timeout_ms = timeout_s * 1000
    auth_source = (cfg.options or {}).get("authSource", "admin")

    client = AsyncIOMotorClient(
        host=cfg.host,
        port=cfg.port or 27017,
        username=cfg.username or None,
        password=cfg.password or None,
        authSource=auth_source,
        tls=cfg.ssl,
        serverSelectionTimeoutMS=timeout_ms,
        connectTimeoutMS=timeout_ms,
        socketTimeoutMS=timeout_ms,
    )

    try:
        db = client[cfg.database]

        # ── Validate operation ──────────────────────────────────────────
        op = plan.get("operation")
        if op not in ("find", "aggregate"):
            raise ExecutionError(
                "BAD_PLAN",
                f"Unknown operation: {op!r} (expected 'find' or 'aggregate')",
            )

        # ── Validate + normalise collection name ────────────────────────
        collection_name = (plan.get("collection") or "").strip()
        if not collection_name:
            raise ExecutionError("BAD_PLAN", "Missing 'collection' in plan.")

        # Strip "<database>." prefix the LLM sometimes adds
        if "." in collection_name:
            prefix, _, suffix = collection_name.partition(".")
            if prefix == cfg.database and suffix:
                logger.info(
                    "stripping database prefix from collection: %r → %r",
                    collection_name, suffix,
                )
                collection_name = suffix

        if collection_name.startswith("system."):
            raise ExecutionError(
                "BAD_PLAN",
                f"System collections are not allowed: {collection_name!r}",
            )

        coll = db[collection_name]

        # ── Build cursor ────────────────────────────────────────────────
        if op == "find":
            filter_ = plan.get("filter") or {}
            projection = plan.get("projection")

            cursor = coll.find(filter_, projection)

            if plan.get("sort"):
                cursor = cursor.sort(list(plan["sort"].items()))

            # Respect plan's limit if smaller; always cap at max_rows
            plan_limit = plan.get("limit")
            limit = min(int(plan_limit), max_rows) if plan_limit else max_rows
            cursor = cursor.limit(limit + 1)   # +1 to detect truncation

        else:   # aggregate
            pipeline = list(plan.get("pipeline") or [])
            if not pipeline:
                raise ExecutionError("BAD_PLAN", "Aggregate pipeline is empty.")

            # Only append a $limit if the plan doesn't already bound the output
            if not any("$limit" in stage for stage in pipeline if isinstance(stage, dict)):
                pipeline.append({"$limit": max_rows + 1})

            cursor = coll.aggregate(pipeline)

        # ── Execute with timeout ────────────────────────────────────────
        try:
            docs = await asyncio.wait_for(
                cursor.to_list(length=max_rows + 1),
                timeout=timeout_s,
            )
        except asyncio.TimeoutError:
            raise ExecutionError(
                "ETIMEDOUT",
                f"Mongo query exceeded {timeout_s}s",
            ) from None
        except Exception as e:
            # Motor raises on connection / query errors
            logger.warning("mongo execute failed: %s", e)
            raise ExecutionError(
                "MONGO_ERROR",
                str(e)[:300],
            ) from None

        # ── Truncate + extract columns ──────────────────────────────────
        truncated = len(docs) > max_rows
        docs = docs[:max_rows]

        # Preserve insertion order of first-seen key across all docs
        seen: dict[str, None] = {}
        for d in docs:
            for k in d.keys():
                seen.setdefault(k, None)
        columns = list(seen.keys()) or ["_id"]

        rows = [[_cell(d.get(c)) for c in columns] for d in docs]

        logger.info(
            "mongo execute ok: collection=%s op=%s rows=%d truncated=%s",
            collection_name, op, len(rows), truncated,
        )
        return columns, rows, truncated

    finally:
        client.close()


def _cell(v):
    """Convert Mongo values to CSV/XLSX-safe scalars."""
    if v is None:
        return ""
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, (dict, list)):
        try:
            return json.dumps(v, default=str, ensure_ascii=False)
        except Exception:
            return str(v)
    if isinstance(v, bytes):
        return v.hex()[:64]
    return v