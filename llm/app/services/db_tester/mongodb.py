import logging

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import (
    OperationFailure,
    ServerSelectionTimeoutError,
    ConfigurationError,
    AutoReconnect,
    NetworkTimeout,
)

from .base import Tester, ProbeResult, clean_error

logger = logging.getLogger(__name__)


# Maps MongoDB error codes to user-facing messages.
# Code 18 (AuthenticationFailed) is the most common; 13 = unauthorized.
_MONGO_MESSAGES = {
    18: "Authentication failed — check username, password, and authSource",
    13: "Not authorized — this user lacks permission for admin commands",
    11: "User not found — check the username",
    1:  "MongoDB rejected the operation",
}


def _mongo_message(code: int | None, fallback: str) -> str:
    if code is None:
        return fallback
    return _MONGO_MESSAGES.get(code, fallback)


class MongoTester(Tester):
    async def probe(self, cfg, timeout_s):
        # authSource is configurable; "admin" is the sensible default.
        auth_source = cfg.options.get("authSource", "admin") if cfg.options else "admin"
        timeout_ms = int(timeout_s * 1000)

        client = None
        try:
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

            await client.admin.command("ping")
            info = await client.server_info()
            return ProbeResult(server_version=info.get("version"))

        except OperationFailure as e:
            # AuthenticationFailure, authorization errors, invalid commands.
            # e.code is the MongoDB error code (int) — 18 for auth failed.
            code = getattr(e, "code", None)
            logger.warning(
                "mongo test failed host=%s port=%s code=%s err=%s",
                cfg.host, cfg.port, code, e,
            )
            raise clean_error(
                f"MONGO_{code}" if code is not None else "MONGO_ERROR",
                _mongo_message(code, "MongoDB rejected the connection"),
            ) from None

        except ServerSelectionTimeoutError:
            # Covers: unreachable host, closed port, TLS handshake failure,
            # and (rarely) slow replica-set election.
            logger.warning(
                "mongo server selection timeout host=%s port=%s", cfg.host, cfg.port,
            )
            raise clean_error(
                "ETIMEDOUT",
                "Could not reach the MongoDB server — check host, port, and network access",
            ) from None

        except (AutoReconnect, NetworkTimeout) as e:
            logger.warning("mongo network error host=%s err=%s", cfg.host, e)
            raise clean_error(
                "ECONNRESET",
                "The connection to MongoDB was lost",
            ) from None

        except ConfigurationError as e:
            logger.warning("mongo config error host=%s err=%s", cfg.host, e)
            raise clean_error(
                "MONGO_BAD_CONFIG",
                "Invalid MongoDB configuration — check TLS/SSL options",
            ) from None

        finally:
            if client is not None:
                client.close()