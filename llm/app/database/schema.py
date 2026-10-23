from typing import Any
from sqlalchemy import inspect
from app.database.registry import Connection


def extract_schema(conn: Connection) -> list[dict[str, Any]]:
    """Extract schema metadata without reading table/document contents."""
    docs: list[dict[str, Any]] = []

    if conn.db_type in {"sqlite", "postgresql", "mysql"}:
        assert conn.engine is not None
        inspector = inspect(conn.engine)
        for table in inspector.get_table_names():
            columns = []
            for col in inspector.get_columns(table):
                columns.append({
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "primary_key": False,
                })
            pk = set(inspector.get_pk_constraint(table).get("constrained_columns") or [])
            for col in columns:
                col["primary_key"] = col["name"] in pk
            fks = inspector.get_foreign_keys(table)
            docs.append({
                "connection_id": conn.connection_id,
                "database_type": conn.db_type,
                "object_name": table,
                "columns": columns,
                "foreign_keys": fks,
            })

    elif conn.db_type == "mongodb":
        assert conn.mongo_client is not None
        db = conn.mongo_client[conn.mongo_database]
        for collection_name in db.list_collection_names():
            # Infer field names/types from a small sample, not the entire collection.
            sample = list(db[collection_name].find({}, limit=20))
            fields: dict[str, set[str]] = {}
            for document in sample:
                for key, value in document.items():
                    fields.setdefault(key, set()).add(type(value).__name__)
            docs.append({
                "connection_id": conn.connection_id,
                "database_type": "mongodb",
                "object_name": collection_name,
                "fields": [
                    {"name": name, "types": sorted(types)}
                    for name, types in sorted(fields.items())
                ],
                "sample_size": len(sample),
            })
    return docs
