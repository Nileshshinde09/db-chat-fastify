# app/services/schema_extract.py
import logging
from app.models.connection import ConnectionConfig

logger = logging.getLogger(__name__)


async def extract_schema_from_config(cfg: ConnectionConfig) -> list[dict]:
    """Returns [{name, schema, columns: [{name, type, nullable}]}]."""
    if cfg.type == "postgres":
        return await _pg(cfg)
    if cfg.type in ("mysql", "mariadb"):
        return await _mysql(cfg)
    if cfg.type == "mssql":
        return await _mssql(cfg)
    if cfg.type == "mongodb":
        return await _mongo(cfg)
    raise ValueError(f"Unsupported type: {cfg.type}")


async def _pg(cfg):
    import asyncpg
    conn = await asyncpg.connect(
        host=cfg.host, port=cfg.port or 5432, database=cfg.database,
        user=cfg.username, password=cfg.password,
        ssl="require" if cfg.ssl else False, timeout=10,
    )
    try:
        rows = await conn.fetch("""
            SELECT table_schema, table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name, ordinal_position
        """)
    finally:
        await conn.close()

    tables: dict[tuple, dict] = {}
    for r in rows:
        key = (r["table_schema"], r["table_name"])
        tables.setdefault(key, {"name": r["table_name"], "schema": r["table_schema"], "columns": []})
        tables[key]["columns"].append({
            "name": r["column_name"],
            "type": r["data_type"],
            "nullable": r["is_nullable"] == "YES",
        })
    return list(tables.values())


async def _mysql(cfg):
    import aiomysql
    conn = await aiomysql.connect(
        host=cfg.host, port=cfg.port or 3306, user=cfg.username,
        password=cfg.password, db=cfg.database, connect_timeout=10,
    )
    try:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s
                ORDER BY TABLE_NAME, ORDINAL_POSITION
            """, (cfg.database,))
            rows = await cur.fetchall()
    finally:
        conn.close()

    tables: dict[str, dict] = {}
    for name, col, dtype, nullable in rows:
        tables.setdefault(name, {"name": name, "schema": cfg.database, "columns": []})
        tables[name]["columns"].append({"name": col, "type": dtype, "nullable": nullable == "YES"})
    return list(tables.values())


async def _mssql(cfg):
    import aioodbc
    dsn = (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={cfg.host},{cfg.port or 1433};DATABASE={cfg.database};"
        f"UID={cfg.username};PWD={cfg.password};"
        f"Encrypt={'yes' if cfg.ssl else 'no'};TrustServerCertificate=yes;"
    )
    conn = await aioodbc.connect(dsn=dsn, timeout=10)
    try:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
            """)
            rows = await cur.fetchall()
    finally:
        await conn.close()

    tables: dict[tuple, dict] = {}
    for schema, name, col, dtype, nullable in rows:
        key = (schema, name)
        tables.setdefault(key, {"name": name, "schema": schema, "columns": []})
        tables[key]["columns"].append({"name": col, "type": dtype, "nullable": nullable == "YES"})
    return list(tables.values())


async def _mongo(cfg: ConnectionConfig) -> list[dict]:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(
        host=cfg.host,
        port=cfg.port or 27017,
        username=cfg.username or None,
        password=cfg.password or None,
        authSource="admin",
        tls=cfg.ssl,
        serverSelectionTimeoutMS=5000,
    )
    try:
        db = client[cfg.database]
        names = await db.list_collection_names()

        out = []
        for name in names:
            if name.startswith("system."):
                continue

            sample = await db[name].find_one() or {}
            columns = [
                {
                    "name": k,
                    "type": type(v).__name__,
                    "nullable": True,
                }
                for k, v in sample.items()
                if k != "_id"            # optional: skip internal _id
            ]

            out.append({
                "name": name,                          # ← required by retriever
                "schema": cfg.database,
                "qualified_name": f"{cfg.database}.{name}",  # ← for RAG text
                "columns": columns,                    # ← may be empty, that's fine
            })
        return out
    finally:
        client.close()