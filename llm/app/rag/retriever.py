import logging
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Chroma client + naming
# ═══════════════════════════════════════════════════════════════════════════
def _client() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(
        path=settings.VECTOR_STORE_PATH,
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def _collection_name(org_id: str, connection_id: str) -> str:
    # Chroma collection names: alnum + _ - ., <=63 chars
    name = f"schema_{org_id}_{connection_id}"
    return name[:63]


# ═══════════════════════════════════════════════════════════════════════════
# Indexing
# ═══════════════════════════════════════════════════════════════════════════
def _doc_id(connection_id: str, kind: str, table: str, column: str | None = None) -> str:
    if column:
        return f"{connection_id}:column:{table}.{column}"
    return f"{connection_id}:table:{table}"


def _iter_docs(connection_id: str, items: list[dict]) -> list[dict]:
    docs: list[dict] = []
    seen_ids: set[str] = set()

    for item in items:
        table = (item.get("name") or "").strip()
        schema = item.get("schema") or ""
        if not table:
            logger.warning("skipping schema item with empty name: %r", item)
            continue

        table_id = _doc_id(connection_id, "table", table)
        if table_id not in seen_ids:
            seen_ids.add(table_id)
            cols = item.get("columns") or []
            col_list = ", ".join(
                f"{c.get('name', '?')}({c.get('type', '?')})"
                for c in cols if c.get("name")
            )
            docs.append({
                "id": table_id,
                "text": f"Collection {schema + '.' if schema else ''}{table}. "
                        f"Fields: {col_list or '(none)'}.",
                "metadata": {
                    "kind": "table",
                    "connection_id": connection_id,
                    "table": table,
                    "schema": schema,
                    "column_count": len(cols),
                },
            })

        for col in item.get("columns") or []:
            col_name = (col.get("name") or "").strip()
            if not col_name:
                continue
            col_id = _doc_id(connection_id, "column", table, col_name)
            if col_id in seen_ids:
                continue
            seen_ids.add(col_id)
            docs.append({
                "id": col_id,
                "text": f"Column {schema + '.' if schema else ''}{table}.{col_name} "
                        f"of type {col.get('type', 'unknown')} "
                        f"({'nullable' if col.get('nullable') else 'not null'}).",
                "metadata": {
                    "kind": "column",
                    "connection_id": connection_id,
                    "table": table,
                    "schema": schema,
                    "column": col_name,
                    "type": col.get("type") or "",
                    "nullable": bool(col.get("nullable")),
                },
            })

    return docs


def index_schema(org_id: str, connection_id: str, items: list[dict]) -> int:
    docs = _iter_docs(connection_id, items)
    if not docs:
        logger.warning("index_schema: nothing to index for conn=%s", connection_id)
        return 0

    ids = [d["id"] for d in docs]
    if len(ids) != len(set(ids)):
        from collections import Counter
        dupes = [k for k, v in Counter(ids).items() if v > 1]
        logger.error("index_schema: duplicate IDs generated: %s", dupes)
        raise RuntimeError(f"Duplicate IDs generated: {dupes[:5]}")

    client = _client()
    collection = client.get_or_create_collection(
        name=_collection_name(org_id, connection_id),
        metadata={"hnsw:space": "cosine"},
    )

    BATCH = 100
    written = 0
    for i in range(0, len(docs), BATCH):
        batch = docs[i:i + BATCH]
        collection.upsert(
            ids=[d["id"] for d in batch],
            documents=[d["text"] for d in batch],
            metadatas=[d["metadata"] for d in batch],
        )
        written += len(batch)

    logger.info(
        "index_schema: upserted %d docs for org=%s conn=%s",
        written, org_id, connection_id,
    )
    return written


# ═══════════════════════════════════════════════════════════════════════════
# Retrieval — what workflow.py imports
# ═══════════════════════════════════════════════════════════════════════════
def retrieve_schema(
    org_id: str,
    connection_id: str,
    query: str,
    top_k: int | None = None,
) -> str:
    """
    Returns a formatted schema context string for the given query.
    Empty string if the collection doesn't exist or is empty (graph handles it).
    """
    k = top_k or settings.RETRIEVER_TOP_K

    client = _client()
    try:
        collection = client.get_collection(name=_collection_name(org_id, connection_id))
    except Exception:
        # Collection doesn't exist yet → caller (graph) will emit "No schema indexed"
        logger.info(
            "retrieve_schema: no collection for org=%s conn=%s",
            org_id, connection_id,
        )
        return ""

    try:
        count = collection.count()
        if count == 0:
            return ""

        result = collection.query(
            query_texts=[query],
            n_results=min(k, count),
        )
    except Exception:
        logger.exception(
            "retrieve_schema: query failed org=%s conn=%s", org_id, connection_id,
        )
        return ""

    docs = (result.get("documents") or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]

    if not docs:
        return ""

    # Format as a readable context block for the LLM
    lines = ["Relevant schema:"]
    for doc, meta in zip(docs, metas):
        # Prefer structured metadata, fall back to document text
        if meta and meta.get("kind") == "column":
            lines.append(
                f"  - {meta.get('schema') or ''}."
                f"{meta.get('table')}.{meta.get('column')}  "
                f"({meta.get('type') or 'unknown'})"
            )
        elif meta and meta.get("kind") == "table":
            lines.append(
                f"  - collection {meta.get('schema') or ''}.{meta.get('table')}"
            )
        else:
            lines.append(f"  - {doc}")

    return "\n".join(lines)