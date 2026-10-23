import logging
import asyncpg

from .base import Tester, ProbeResult, clean_error

logger = logging.getLogger(__name__)


_PG_MESSAGES = {
    "28P01": "Wrong username or password.",
    "28000": "Access denied — check pg_hba.conf or SSL requirements.",
    "3D000": "Database does not exist.",
    "42501": "Permission denied for this operation.",
    "53300": "Too many connections — the server is at its limit.",
    "57P03": "The server is starting up or shutting down — try again shortly.",
}


class PostgresTester(Tester):
    async def probe(self, cfg, timeout_s):
        conn = None
        try:
            conn = await asyncpg.connect(
                host=cfg.host,
                port=cfg.port or 5432,
                database=cfg.database,
                user=cfg.username,
                password=cfg.password,
                ssl="require" if cfg.ssl else False,
                timeout=timeout_s,
                command_timeout=timeout_s,
            )
            version = await conn.fetchval("SELECT version()")
            return ProbeResult(server_version=version)

        except asyncpg.InvalidPasswordError as e:
            logger.warning("pg auth failed host=%s user=%s", cfg.host, cfg.username)
            raise clean_error("28P01", "Wrong username or password.") from None

        except asyncpg.InvalidAuthorizationSpecificationError:
            raise clean_error("28000", _PG_MESSAGES["28000"]) from None

        except asyncpg.InvalidCatalogNameError:
            raise clean_error("3D000", f"Database {cfg.database!r} does not exist.") from None

        except asyncpg.InsufficientPrivilegeError:
            raise clean_error("42501", _PG_MESSAGES["42501"]) from None

        except asyncpg.TooManyConnectionsError:
            raise clean_error("53300", _PG_MESSAGES["53300"]) from None

        except asyncpg.CannotConnectNowError:
            raise clean_error("57P03", _PG_MESSAGES["57P03"]) from None

        except (ConnectionRefusedError, OSError) as e:
            logger.warning("pg network error host=%s port=%s err=%s", cfg.host, cfg.port, e)
            raise clean_error(
                "ECONNREFUSED",
                f"Nothing is listening at {cfg.host}:{cfg.port or 5432}.",
            ) from None

        except TimeoutError:
            raise clean_error("ETIMEDOUT", "Timed out connecting to PostgreSQL.") from None

        except Exception as e:
            # Fall back to sqlstate if present — asyncpg wraps many errors.
            sqlstate = getattr(e, "sqlstate", None)
            if sqlstate:
                code = str(sqlstate)
                raise clean_error(code, _PG_MESSAGES.get(code, "PostgreSQL rejected the connection.")) from None
            logger.exception("pg unexpected error host=%s err=%s", cfg.host, e)
            raise clean_error("PG_ERROR", "Could not connect to PostgreSQL.") from None

        finally:
            if conn is not None:
                await conn.close()