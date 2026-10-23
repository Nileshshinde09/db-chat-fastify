import asyncio
import time
from dataclasses import dataclass
from app.models.connection import ConnectionConfig, ConnectionTestResult


@dataclass
class ProbeResult:
    server_version: str | None = None


class Tester:
    async def probe(self, cfg: ConnectionConfig, timeout_s: float) -> ProbeResult:
        raise NotImplementedError


def fail(code: str, message: str) -> ConnectionTestResult:
    return ConnectionTestResult(ok=False, code=code, message=scrub(message))


def success(t0: float, version: str | None) -> ConnectionTestResult:
    return ConnectionTestResult(
        ok=True,
        latency_ms=int((time.monotonic() - t0) * 1000),
        server_version=(version or "")[:120] or None,
        message="Connected",
    )


def scrub(msg: str) -> str:
    """Never leak passwords; cap length; strip newlines (driver dumps are multi-line)."""
    msg = " ".join((msg or "").split())
    return msg[:300] or "Connection failed"

class CleanError(Exception):
    """An error an adapter has already classified into (code, friendly message).

    Raise this from a driver adapter so the dispatcher doesn't re-classify
    raw driver exceptions (which often contain dict reprs and internal detail).
    """
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def clean_error(code: str, message: str) -> CleanError:
    return CleanError(code, message)