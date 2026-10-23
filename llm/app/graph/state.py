from typing import Annotated, Any
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class ChatState(TypedDict, total=False):
    messages: Annotated[list, add_messages]

    organization_id: str
    user_id: str
    connection_id: str
    connection: dict
    database_type: str

    intent: str
    wants_report: bool

    schema_context: str
    generated_query: str
    mongo_plan: dict
    query_error: str
    repair_attempts: int
    query_result: dict
    final_answer: str

    # ── edit-mode fields ────────────────────────────────────────────────
    current_query: dict | str | None       # the query being edited
    is_edit: bool                          # true when editing an existing report