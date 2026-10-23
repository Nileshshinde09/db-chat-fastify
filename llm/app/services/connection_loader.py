import logging
from bson import ObjectId
from bson.errors import InvalidId

from app.core.config import settings
from app.models.connection import ConnectionConfig
from app.services.crypto import decrypt

logger = logging.getLogger(__name__)


async def load_connection(mongodb, connection_id: str, org_id: str) -> ConnectionConfig:
    """
    Load a connection doc from `{MONGODB_DATABASE}.connections` by _id + orgId.
    Decrypts credentialsEnc, returns a ConnectionConfig for execution.
    """
    # 1. Validate IDs — Mongo _id is an ObjectId, not a string
    try:
        oid = ObjectId(connection_id)
    except (InvalidId, TypeError):
        raise ValueError("Invalid connection id") from None

    try:
        org_oid = ObjectId(org_id)
    except (InvalidId, TypeError):
        raise ValueError("Invalid organization id") from None

    # 2. Load doc — scoped to the user's org
    doc = await mongodb.dbconnections.find_one({"_id": oid, "orgId": org_oid})
    if not doc:
        raise ValueError("Connection not found")

    # 3. Decrypt password
    try:
        # password = decrypt(doc.get("credentialsEnc") or "") #Temperorily disabled
        password=doc.get("credentialsEnc")
    except Exception as e:
        logger.exception("decrypt failed conn=%s", connection_id)
        raise ValueError("Could not decrypt credentials") from None

    # 4. Build the config
    return ConnectionConfig(
        type=doc["type"],
        host=doc["host"],
        port=doc.get("port"),
        database=doc["database"],
        username=doc.get("username") or "",
        password=password,
        ssl=bool(doc.get("ssl", False)),
        options=doc.get("options") or {},
    )