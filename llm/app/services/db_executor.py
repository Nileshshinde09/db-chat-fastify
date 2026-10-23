import asyncio
import logging
from typing import Any

from app.models.connection import ConnectionConfig

logger = logging.getLogger(__name__)


class ExecutionError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


async def execute_select(
    cfg: ConnectionConfig,
    sql: str,
    max_rows: int,
    timeout_s: int,
) -> tuple[list[str], list[list], bool]:
    """
    Returns (columns, rows, truncated).
    - Postgres / MySQL / MariaDB / MSSQL: uses read-only transaction.
    - MongoDB: raises ExecutionError (no SQL).
    """
    if cfg.type == "postgres":
        return await asyncio.wait_for(
            _pg(cfg, sql, max_rows), timeout=timeout_s
        )
    if cfg.type in ("mysql", "mariadb"):
        return await asyncio.wait_for(
            _mysql(cfg, sql, max_rows), timeout=timeout_s
        )
    if cfg.type == "mssql":
        return await asyncio.wait_for(
            _mssql(cfg, sql, max_rows), timeout=timeout_s
        )
    raise ExecutionError(
        "UNSUPPORTED_TYPE",
        f"SQL reports are not supported for {cfg.type}",
    )


# ── Postgres ──────────────────────────────────────────────────────────────
async def _pg(cfg: ConnectionConfig, sql: str, max_rows: int):
    import asyncpg
    conn = None
    try:
        conn = await asyncpg.connect(
            host=cfg.host,
            port=cfg.port or 5432,
            database=cfg.database,
            user=cfg.username,
            password=cfg.password,
            ssl="require" if cfg.ssl else False,
            timeout=30,
        )
        async with conn.transaction(readonly=True):
            # Limit server-side to max_rows+1 so we can detect truncation
            stmt = await conn.prepare(sql)
            records = await stmt.fetch(max_rows + 1)

        truncated = len(records) > max_rows
        rows = [list(r.values()) for r in records[:max_rows]]
        columns = list(records[0].keys()) if records else [
            a.name for a in stmt.get_attributes() or []
        ]
        return columns, rows, truncated
    except asyncpg.PostgresError as e:
        raise ExecutionError(
            str(getattr(e, "sqlstate", "PG_ERROR")),
            str(e)[:300],
        ) from None
    finally:
        if conn:
            await conn.close()


# ── MySQL / MariaDB ───────────────────────────────────────────────────────
async def _mysql(cfg: ConnectionConfig, sql: str, max_rows: int):
    import aiomysql
    conn = None
    try:
        conn = await aiomysql.connect(
            host=cfg.host,
            port=cfg.port or 3306,
            user=cfg.username,
            password=cfg.password,
            db=cfg.database,
            connect_timeout=30,
            autocommit=False,
        )
        async with conn.cursor() as cur:
            await cur.execute("SET TRANSACTION READ ONLY")
            await cur.execute(sql)
            rows = await cur.fetchmany(max_rows + 1)
            truncated = len(rows) > max_rows
            rows = rows[:max_rows]
            columns = [d[0] for d in cur.description] if cur.description else []
        await conn.rollback()
        return columns, [list(r) for r in rows], truncated
    except aiomysql.Error as e:
        errno = e.args[0] if e.args and isinstance(e.args[0], int) else "MYSQL_ERROR"
        raise ExecutionError(str(errno), str(e)[:300]) from None
    finally:
        if conn:
            conn.close()


# ── MSSQL ─────────────────────────────────────────────────────────────────
async def _mssql(cfg: ConnectionConfig, sql: str, max_rows: int):
    import aioodbc
    port = cfg.port or 1433
    dsn = (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={cfg.host},{port};"
        f"DATABASE={cfg.database};"
        f"UID={cfg.username};"
        f"PWD={cfg.password};"
        f"Encrypt={'yes' if cfg.ssl else 'no'};"
        "TrustServerCertificate=yes;"
        "Connection Timeout=30;"
    )
    conn = None
    try:
        conn = await aioodbc.connect(dsn=dsn, timeout=30)
        async with conn.cursor() as cur:
            await cur.execute(sql)
            rows = await cur.fetchmany(max_rows + 1)
            truncated = len(rows) > max_rows
            rows = rows[:max_rows]
            columns = [d[0] for d in cur.description] if cur.description else []
        return columns, [list(r) for r in rows], truncated
    except aioodbc.Error as e:
        args = e.args or ()
        code = str(args[0]) if args else "MSSQL_ERROR"
        raise ExecutionError(code, str(e)[:300]) from None
    finally:
        if conn:
            await conn.close()