import logging

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import MongoClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from app.core.config import settings
from app.services.crypto import decrypt

logger = logging.getLogger(__name__)


class Connection:
    """A live, ready-to-use connection. Built from a Mongo connections doc."""
    def __init__(
        self,
        connection_id: str,
        db_type: str,
        *,
        engine: Engine | None = None,
        mongo_client: MongoClient | None = None,
        mongo_database: str | None = None,
    ):
        self.connection_id = connection_id
        self.db_type = db_type
        self.engine = engine
        self.mongo_client = mongo_client
        self.mongo_database = mongo_database


async def get_connection(
    mongodb,              # AsyncDatabase — the async client from app.state.mongodb
    connection_id: str,
    org_id: str,
) -> Connection:
    """
    Load the connection doc from Mongo, decrypt credentials, and return a live
    Connection object. Raises ValueError for invalid/missing/undecryptable.
    """
    # 1. Validate IDs
    try:
        oid = ObjectId(connection_id)
    except (InvalidId, TypeError):
        raise ValueError("Invalid connection id") from None
    try:
        org_oid = ObjectId(org_id)
    except (InvalidId, TypeError):
        raise ValueError("Invalid organization id") from None
    
    # 2. Load the doc (async)
    doc = await mongodb.dbconnections.find_one({"_id": oid, "orgId": org_oid})
    if not doc:
        raise ValueError("Connection not found")

    # 3. Decrypt password
    try:
        # password = decrypt(doc.get("credentialsEnc") or "")
        password=doc.get("credentialsEnc") or ""
    except Exception:
        logger.exception("decrypt failed conn=%s", connection_id)
        raise ValueError("Could not decrypt credentials") from None

    # 4. Build the live connection per db type
    db_type = doc["type"]

    if db_type == "mongodb":
        # Sync MongoClient for the graph (which currently runs sync)
        uri = (
            f"mongodb://{doc.get('username') or ''}:{password}@"
            f"{doc['host']}:{doc.get('port') or 27017}/"
            f"?authSource=admin"
        ) if doc.get("username") else f"mongodb://{doc['host']}:{doc.get('port') or 27017}/"

        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        return Connection(
            connection_id, "mongodb",
            mongo_client=client,
            mongo_database=doc["database"],
        )

    # SQL — build a SQLAlchemy URL
    driver = {
        "postgres": "postgresql+psycopg2",
        "mysql":    "mysql+pymysql",
        "mariadb":  "mysql+pymysql",
        "mssql":    "mssql+pyodbc",
    }.get(db_type)
    if not driver:
        raise ValueError(f"Unsupported db type: {db_type}")

    password_part = f":{password}" if password else ""
    url = (
        f"{driver}://{doc.get('username') or ''}{password_part}@"
        f"{doc['host']}:{doc.get('port') or ''}/{doc['database']}"
        f"?sslmode={'require' if doc.get('ssl') else 'prefer'}"
    )
    engine = create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2)
    return Connection(connection_id, db_type, engine=engine)


def close_connection(conn: Connection | None) -> None:
    if conn is None:
        return
    if conn.engine is not None:
        conn.engine.dispose()
    if conn.mongo_client is not None:
        conn.mongo_client.close()