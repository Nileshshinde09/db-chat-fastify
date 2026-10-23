import asyncio
import socket
import time

from app.models.connection import ConnectionConfig, ConnectionTestResult
from .base import Tester, fail, success,CleanError
from .postgres import PostgresTester
from .mysql import MysqlTester
from .mssql import MssqlTester
from .mongodb import MongoTester

TESTERS: dict[str, Tester] = {
    "postgres": PostgresTester(),
    "mysql": MysqlTester(),
    "mariadb": MysqlTester(),   
    "mssql": MssqlTester(),
    "mongodb": MongoTester(),
}


async def test_connection(cfg: ConnectionConfig, timeout_s: float = 4.0) -> ConnectionTestResult:
    tester = TESTERS.get(cfg.type)
    if tester is None:
        return fail("UNSUPPORTED_TYPE", f"Unsupported database type: {cfg.type}")

    ssrf = await _assert_host_allowed(cfg.host)
    if ssrf is not None:
        return ssrf

    t0 = time.monotonic()
    try:
        probe = await asyncio.wait_for(tester.probe(cfg, timeout_s), timeout=timeout_s + 1)
        return success(t0, probe.server_version)
    except asyncio.TimeoutError:
        return fail("ETIMEDOUT", f"Timed out after {timeout_s:.0f}s")
    except Exception as e:
        code, msg = _classify(cfg.type, e)
        return fail(code, msg)


# --- error classification ------------------------------------------------

def _classify(db_type: str, e: Exception) -> tuple[str, str]:
    # Our own clean errors — the adapter already classified this.
    if isinstance(e, CleanError):
        return e.code, str(e)

    # Postgres: asyncpg exposes sqlstate / pgcode
    sqlstate = getattr(e, "sqlstate", None) or getattr(e, "pgcode", None)
    if sqlstate:
        return str(sqlstate), str(e)

    # MySQL / MariaDB: aiomysql args[0] is errno
    if db_type in ("mysql", "mariadb"):
        args = getattr(e, "args", ())
        if args and isinstance(args[0], int):
            return str(args[0]), str(args[1]) if len(args) > 1 else str(e)

    # MSSQL: pyodbc args are (sqlstate, message)
    if db_type == "mssql":
        args = getattr(e, "args", ())
        if len(args) >= 2:
            return str(args[0]), str(args[1])

    # Transport-level fallbacks
    name = type(e).__name__
    if "ServerSelectionTimeout" in name or isinstance(e, asyncio.TimeoutError):
        return "ETIMEDOUT", "Could not reach the server"
    if isinstance(e, socket.gaierror):
        return "ENOTFOUND", "Host could not be resolved"
    if isinstance(e, (ConnectionRefusedError, OSError)) and "refused" in str(e).lower():
        return "ECONNREFUSED", "Nothing is listening on that host/port"

    return name, str(e)


# --- SSRF guard (defense in depth; Fastify also checks) -------------------

_PRIVATE_PREFIXES = ("10.", "127.", "169.254.", "172.16.", "172.17.", "172.18.",
                     "172.19.", "172.2", "172.30.", "172.31.", "192.168.", "0.", "::1", "fc", "fd")

import os
import socket
import asyncio

async def _assert_host_allowed(host: str) -> ConnectionTestResult | None:
    """Block SSRF targets in prod. In dev, allow everything."""
    # Hard dev bypass — no env var to forget.
    if os.getenv("APP_ENV", "development").lower() != "production":
        return None

    # Prod: private IPs blocked unless explicitly overridden.
    if os.getenv("ALLOW_PRIVATE_NETWORKS", "false").strip().lower() == "true":
        return None

    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            host, None, type=socket.SOCK_STREAM
        )
    except socket.gaierror:
        return fail("ENOTFOUND", "Host could not be resolved")

    blocked = ("10.", "127.", "169.254.", "172.16.", "172.17.", "172.18.",
               "172.19.", "172.2", "172.30.", "172.31.", "192.168.", "0.",
               "::1", "fc", "fd")
    for info in infos:
        ip = info[4][0]
        if ip.startswith(blocked) or ip in ("::1", "0.0.0.0"):
            return fail("SSRF_BLOCKED", "Host resolves to a private address")
    return None