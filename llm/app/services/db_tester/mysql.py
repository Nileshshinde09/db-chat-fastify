import logging
import ssl as ssl_lib
import aiomysql

from .base import Tester, ProbeResult, clean_error

logger = logging.getLogger(__name__)


_MYSQL_MESSAGES = {
    1045: "Access denied — wrong username or password.",
    1044: "Access denied to that database for this user.",
    1049: "Database does not exist.",
    2003: "Could not reach the MySQL server — check host and port.",
    2005: "Host could not be resolved.",
    2006: "The server connection was lost.",
    2026: "SSL/TLS error — check SSL settings.",
    3159: "SSL is required by the server but not enabled.",
}


class MysqlTester(Tester):
    async def probe(self, cfg, timeout_s):
        conn = None
        try:
            ssl_ctx = ssl_lib.create_default_context() if cfg.ssl else None
            conn = await aiomysql.connect(
                host=cfg.host,
                port=cfg.port or 3306,
                user=cfg.username,
                password=cfg.password,
                db=cfg.database,
                connect_timeout=int(timeout_s),
                ssl=ssl_ctx,
                autocommit=True,
            )
            async with conn.cursor() as cur:
                await cur.execute("SELECT VERSION()")
                row = await cur.fetchone()
                version = row[0] if row else None
            return ProbeResult(server_version=version)

        except aiomysql.OperationalError as e:
            # args[0] is the MySQL errno (int), args[1] the message.
            errno = e.args[0] if e.args and isinstance(e.args[0], int) else None
            logger.warning(
                "mysql error host=%s port=%s errno=%s err=%s",
                cfg.host, cfg.port, errno, e,
            )
            msg = _MYSQL_MESSAGES.get(errno, "MySQL rejected the connection.")
            raise clean_error(str(errno) if errno else "MYSQL_ERROR", msg) from None

        except aiomysql.InterfaceError as e:
            logger.warning("mysql interface error host=%s err=%s", cfg.host, e)
            raise clean_error("ECONNRESET", "The connection to MySQL was lost.") from None

        except (ConnectionRefusedError, OSError) as e:
            logger.warning("mysql network error host=%s err=%s", cfg.host, e)
            raise clean_error(
                "ECONNREFUSED",
                f"Nothing is listening at {cfg.host}:{cfg.port or 3306}.",
            ) from None

        except TimeoutError:
            raise clean_error("ETIMEDOUT", "Timed out connecting to MySQL.") from None

        except Exception as e:
            logger.exception("mysql unexpected error host=%s err=%s", cfg.host, e)
            raise clean_error("MYSQL_ERROR", "Could not connect to MySQL.") from None

        finally:
            if conn is not None:
                conn.close()