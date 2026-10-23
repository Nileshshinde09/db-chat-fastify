# app/graph/nodes/execute_query.py
from app.models.connection import ConnectionConfig
from app.services.db_executor import execute_select, ExecutionError
from app.services.mongo_executor import execute_mongo


async def execute_query_node(state):
    cfg = ConnectionConfig.model_validate(state["connection"])

    if cfg.type == "mongodb":
        columns, rows, truncated = await execute_mongo(
            cfg, state["mongo_plan"],
            max_rows=settings.MAX_QUERY_ROWS,
            timeout_s=settings.QUERY_TIMEOUT_SECONDS,
        )
    else:
        columns, rows, truncated = await execute_select(
            cfg, state["generated_query"],
            max_rows=settings.MAX_QUERY_ROWS,
            timeout_s=settings.QUERY_TIMEOUT_SECONDS,
        )

    return {
        "query_result": {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "truncated": truncated,
        }
    }