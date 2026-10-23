from langchain_ollama import ChatOllama, OllamaEmbeddings
from app.core.config import settings

router_llm = ChatOllama(
    model=settings.ROUTER_MODEL, base_url=settings.OLLAMA_BASE_URL,
    temperature=0, num_ctx=4096,
)
sql_llm = ChatOllama(
    model=settings.SQL_MODEL, base_url=settings.OLLAMA_BASE_URL,
    temperature=0, num_ctx=4096,
)
nosql_llm = ChatOllama(
    model=settings.NOSQL_MODEL, base_url=settings.OLLAMA_BASE_URL,
    temperature=0, num_ctx=4096,
)
embeddings = OllamaEmbeddings(
    model=settings.EMBEDDING_MODEL, base_url=settings.OLLAMA_BASE_URL,
)
