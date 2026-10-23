import logging
import aioodbc

from .base import Tester, ProbeResult, clean_error

logger = logging.getLogger(__name__)


_MSSQL_MESSAGES = {
    "28000": "Login failed — wrong username or password.",
    "18456": "Login failed for that user.",
    "4060":  "Cannot open the requested database.",
    "18452": "Login failed — the account is not trusted.",
    "08001": "Could not reach the SQL Server — check host and port.",
    "08004": "The server rejected the connection.",
    "08S01": "The connection to the SQL Server was lost.",
    "HYT00": "Timed out connecting to SQL Server.",
}


class MssqlTester(Tester):
    async def probe(self, cfg, timeout_s):
        port = cfg.port or 1433
        dsn = (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            f"SERVER={cfg.host},{port};"
            f"DATABASE={cfg.database};"
            f"UID={cfg.username};"
            f"PWD={cfg.password};"
            f"Encrypt={'yes' if cfg.ssl else 'no'};"
            "TrustServerCertificate=yes;"
            f"Connection Timeout={int(timeout_s)};"
        )
        conn = None
        try:
            conn = await aioodbc.connect(dsn=dsn, timeout=timeout_s)
            async with conn.cursor() as cur:
                await cur.execute("SELECT @@VERSION")
                row = await cur.fetchone()
                version = row[0] if row else None
            return ProbeResult(server_version=version)

        except aioodbc.Error as e:
            # pyodbc args are (sqlstate, message).
            args = e.args or ()
            sqlstate = str(args[0]) if args else None
            # The native error number is often embedded in the message.
            raw = str(e)
            logger.warning(
                "mssql error host=%s port=%s sqlstate=%s err=%s",
                cfg.host, port, sqlstate, raw,
            )
            # Check for specific native codes in the message.
            for code in ("18456", "4060", "18452"):
                if code in raw:
                    raise clean_error(code, _MSSQL_MESSAGES[code]) from None
            if sqlstate and sqlstate in _MSSQL_MESSAGES:
                raise clean_error(sqlstate, _MSSQL_MESSAGES[sqlstate]) from None
            raise clean_error(
                sqlstate or "MSSQL_ERROR",
                "SQL Server rejected the connection.",
            ) from None

        except (ConnectionRefusedError, OSError) as e:
            logger.warning("mssql network error host=%s err=%s", cfg.host, e)
            raise clean_error(
                "ECONNREFUSED",
                f"Nothing is listening at {cfg.host}:{port}.",
            ) from None

        except TimeoutError:
            raise clean_error("ETIMEDOUT", "Timed out connecting to SQL Server.") from None

        except Exception as e:
            logger.exception("mssql unexpected error host=%s err=%s", cfg.host, e)
            raise clean_error("MSSQL_ERROR", "Could not connect to SQL Server.") from None

        finally:
            if conn is not None:
                await conn.close()