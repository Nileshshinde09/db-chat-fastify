import json
from bson import ObjectId
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from app.core.config import settings

async def get_chat_history(mongodb, conversation_id: str, limit: int = 10) -> list:
    """
    Fetch the last N messages from Fastify's MongoDB and convert them 
    into LangChain messages.
    """
    if not conversation_id:
        return []

    try:
        conv_oid = ObjectId(conversation_id)
    except Exception:
        return []

    # Fetch the most recent messages (newest first)
    cursor = mongodb.messages.find({"conversationId": conv_oid}).sort("_id", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    
    # Reverse so they are in chronological order (oldest to newest)
    docs.reverse()

    messages = []
    for doc in docs:
        role = doc.get("role")
        content = doc.get("content") or ""
        
        # Extract the SQL block if it exists
        sql_text = ""
        try:
            blocks = json.loads(doc.get("blocksJson") or "[]")
            for b in blocks:
                if b.get("type") == "sql":
                    sql_text += f"\n[System Note: I generated this query: {b['sql']}]"
                    break
        except Exception:
            pass

        full_content = f"{content}{sql_text}".strip()
        if not full_content:
            continue

        if role == "user":
            messages.append(HumanMessage(content=full_content))
        elif role == "assistant":
            messages.append(AIMessage(content=full_content))

    return messages