import json
import re
from typing import Any
import pandas as pd
import sqlglot
from sqlglot import exp
from sqlalchemy import text
from app.core.config import settings
from app.database.registry import Connection


def validate_sql(query: str, dialect: str) -> str:
    """Allow one SELECT statement only; apply a hard row cap."""
    query = query.strip().rstrip(";")
    if not query:
        raise ValueError("Empty SQL query")
    parsed = sqlglot.parse(query, read=dialect if dialect != "sqlite" else "sqlite")
    if len(parsed) != 1 or parsed[0] is None:
        raise ValueError("Only one SQL statement is allowed")
    tree = parsed[0]
    if not isinstance(tree, exp.Select):
        raise ValueError("Only SELECT queries are allowed")
    forbidden = (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Alter, exp.Command)
    if any(tree.find(kind) is not None for kind in forbidden):
        raise ValueError("Query contains a forbidden operation")
    # A conservative LIMIT cap. For complex dialect-specific syntax, fail closed.
    limit = tree.args.get("limit")
    if limit is None:
        tree = tree.limit(settings.MAX_QUERY_ROWS)
    else:
        try:
            value = int(limit.expression.this)
        except Exception:
            value = settings.MAX_QUERY_ROWS
        if value > settings.MAX_QUERY_ROWS:
            tree = tree.limit(settings.MAX_QUERY_ROWS)
    return tree.sql(dialect=dialect if dialect != "sqlite" else "sqlite")


def execute_sql(conn: Connection, query: str) -> dict[str, Any]:
    if conn.engine is None:
        raise ValueError("Not a SQL connection")
    safe_query = validate_sql(query, conn.db_type)
    with conn.engine.connect() as db:
        result = db.execute(text(safe_query))
        rows = result.fetchmany(settings.MAX_QUERY_ROWS)
        data = [dict(row._mapping) for row in rows]
    return {"columns": list(data[0].keys()) if data else [], "rows": data, "row_count": len(data)}


def validate_mongo_plan(plan: dict[str, Any]) -> dict[str, Any]:
    allowed = {"collection", "operation", "filter", "projection", "sort", "limit", "pipeline"}
    if set(plan) - allowed:
        raise ValueError("Unexpected MongoDB query-plan fields")
    collection = plan.get("collection")
    if not isinstance(collection, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", collection):
        raise ValueError("Invalid collection name")
    operation = plan.get("operation", "find")
    if operation not in {"find", "aggregate"}:
        raise ValueError("Only find and aggregate are allowed")
    limit = plan.get("limit", settings.MAX_QUERY_ROWS)
    if not isinstance(limit, int) or limit < 1:
        raise ValueError("Invalid limit")
    plan["limit"] = min(limit, settings.MAX_QUERY_ROWS)
    if operation == "aggregate":
        pipeline = plan.get("pipeline")
        if not isinstance(pipeline, list):
            raise ValueError("Aggregation pipeline must be a list")
        forbidden_stages = {
            "$out", "$merge", "$where", "$function", "$accumulator",
            "$unionWith", "$lookup"
        }
        def walk(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in forbidden_stages:
                        raise ValueError(f"Forbidden MongoDB operator: {key}")
                    walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)
        walk(pipeline)
        if not pipeline or pipeline[0].get("$limit") is None:
            pipeline.insert(0, {"$limit": plan["limit"]})
        else:
            pipeline[0]["$limit"] = min(
                int(pipeline[0]["$limit"]), plan["limit"]
            )
    return plan


def execute_mongo(conn: Connection, plan: dict[str, Any]) -> dict[str, Any]:
    if conn.mongo_client is None:
        raise ValueError("Not a MongoDB connection")
    plan = validate_mongo_plan(plan)
    db = conn.mongo_client[conn.mongo_database]
    collection = db[plan["collection"]]
    if plan.get("operation", "find") == "aggregate":
        rows = list(collection.aggregate(plan["pipeline"], maxTimeMS=settings.QUERY_TIMEOUT_SECONDS * 1000))
    else:
        cursor = collection.find(
            plan.get("filter") or {},
            plan.get("projection"),
            max_time_ms=settings.QUERY_TIMEOUT_SECONDS * 1000,
        ).limit(plan["limit"])
        if plan.get("sort"):
            cursor = cursor.sort(plan["sort"])
        rows = list(cursor)
    normalized = json.loads(json.dumps(rows, default=str))
    columns = sorted({key for row in normalized for key in row}) if normalized else []
    return {"columns": columns, "rows": normalized, "row_count": len(normalized)}


def rows_to_csv_bytes(result: dict[str, Any]) -> bytes:
    import io
    frame = pd.DataFrame(result.get("rows", []))
    buffer = io.StringIO()
    frame.to_csv(buffer, index=False)
    return buffer.getvalue().encode("utf-8-sig")
