import logging
from langchain_ollama import ChatOllama

from app.core.config import settings

logger = logging.getLogger(__name__)

_llm: ChatOllama | None = None


def _get_llm() -> ChatOllama:
    global _llm
    if _llm is None:
        _llm = ChatOllama(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.SQL_MODEL,        # qwen2.5-coder:3b — already pulled
            temperature=0.2,
            num_predict=250,
        )
    return _llm


async def summarize_for_report(
    *,
    title: str,
    columns: list[str],
    rows: list[list],
    total_rows: int,
) -> str:
    """
    Executive summary using the SAME Ollama model as SQL generation.
    Never raises — returns "" on any failure so reports still ship.
    """
    if not rows:
        return ""

    sample = rows[:30]
    prompt = (
        "You are writing an executive summary for a business report.\n\n"
        f"Title: {title}\n"
        f"Columns: {', '.join(columns)}\n"
        f"Total rows: {total_rows}\n"
        f"Sample of first {len(sample)} rows:\n{sample}\n\n"
        "Write exactly 2-3 sentences highlighting totals, outliers, or trends. "
        "Be factual and concise. Do not invent data that is not visible above. "
        "Do not add a heading or bullet points."
    )
    try:
        resp = await _get_llm().ainvoke(prompt)
        return (resp.content or "").strip()[:1200]
    except Exception as e:
        logger.warning("report summary failed: %s", e)
        return ""