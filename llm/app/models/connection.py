from typing import Literal, Any
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DbType = Literal["postgres", "mysql", "mariadb", "mssql", "mongodb"]


class ConnectionConfig(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    type: DbType
    host: str
    port: int | None = None
    database: str
    username: str = ""
    password: str = ""
    ssl: bool = False
    options: dict[str, Any] = Field(default_factory=dict)


class TestRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    connection: ConnectionConfig


class ConnectionTestResult(BaseModel):
    """camelCase on the wire — matches the TS `ConnectionTestResult`."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    ok: bool
    message: str | None = None
    latency_ms: int | None = None
    server_version: str | None = None
    code: str | None = None          # ← add this to the TS type too