# LLM server contract (Fastify -> FastAPI)

The Fastify service is **middleware**: it handles auth, tenants, saved database connections, chat history and file uploads.
The FastAPI service does the AI work: it turns questions into queries, runs them, and writes the answer.

Fastify calls FastAPI over HTTP. Set `LLM_SERVER_MODE=http`, `LLM_SERVER_URL` and `LLM_SERVER_API_KEY`.
Every request carries `Authorization: Bearer <LLM_SERVER_API_KEY>`. **Reject requests without it.**

> The request bodies contain **decrypted database passwords**. Run FastAPI on a private network, use TLS
> between the services, and never log request bodies.

---

## 1. `POST /v1/chat/stream`

Streams the answer as Server-Sent Events (`Content-Type: text/event-stream`).

### Request body

```json
{
  "conversationId": "665f...",
  "messageId": "665f...",
  "orgId": "665e...",
  "userId": "665e...",
  "messages": [
    { "role": "user", "content": "How many customers signed up last month?" },
    { "role": "assistant", "content": "There were 412." },
    { "role": "user", "content": "And the month before?" }
  ],
  "connection": {
    "id": "665d...", "name": "Warehouse", "type": "postgres",
    "host": "db.example.com", "port": 5432, "database": "analytics",
    "username": "readonly_user", "password": "••••••••", "ssl": true, "options": {}
  },
  "files": [
    {
      "id": "665c...", "name": "sales.csv", "kind": "csv", "size": 20480,
      "url": "https://api.example.com/api/v1/internal/files/665c...?exp=1760000000&sig=ab12...",
      "preview": { "sheets": [{ "name": "Sheet1", "columns": ["region", "revenue"], "rowCount": 3, "sampleRows": [["EU", "100"]] }] }
    }
  ],
  "options": { "readOnly": true, "rowLimit": 1000 }
}
```

* `messages` is the recent history; the newest user message is last.
* `connection` is `null` when the chat only uses attached files.
* `files` are **all files in this conversation** (newest 10), not just the latest message's.
  Download one with a plain `GET` on `url` (no auth header; the signature is the credential and expires in ~10 minutes).
  `kind` is `csv` or `xlsx`.
* `options.readOnly` **must be honored**: run the session read-only / reject non-SELECT statements.
  Apply `options.rowLimit` to results you return.

### Response events

Each event is one `data:` line holding JSON with a `type` field:

| `type` | Fields | Meaning |
|---|---|---|
| `delta` | `text` | A piece of the answer text. Send many. |
| `sql` | `sql`, `dialect?` | The query you ran (shown to the user). |
| `table` | `columns[]`, `rows[][]`, `rowCount?`, `truncated?`, `title?` | A result table. |
| `chart` | `spec` (object) | A chart spec (e.g. Vega-Lite). Any JSON object. |
| `title` | `title` | Optional short chat title, used once for a new chat. |
| `done` | `usage?` | **Last event on success.** |
| `error` | `code`, `message` | **Last event on failure.** Shown to the user, keep it safe. |

```
data: {"type":"delta","text":"There were "}

data: {"type":"delta","text":"389 sign-ups."}

data: {"type":"sql","sql":"SELECT count(*) FROM customers WHERE ...","dialect":"postgres"}

data: {"type":"table","columns":["count"],"rows":[[389]],"rowCount":1}

data: {"type":"done","usage":{"inputTokens":812,"outputTokens":64}}
```

Rules:

1. Always finish with `done` or `error`. A stream that just ends is treated as an interrupted answer.
2. **Stop work when the client disconnects.** Fastify closes the connection when the user presses "stop".
3. Unknown event types are ignored, so you can add new ones safely.
4. Send a `: ping` comment line every ~15 s on long-running queries to keep proxies from closing the stream.
5. Non-2xx responses are shown to the user as a generic "AI service error" (details go to Fastify's log only).

---

## 2. `POST /v1/connections/test`

```json
{ "connection": { "type": "postgres", "host": "...", "port": 5432, "database": "...",
                  "username": "...", "password": "...", "ssl": false, "options": {} } }
```
Respond `200`:
```json
{ "ok": true, "latencyMs": 38, "serverVersion": "PostgreSQL 16.3", "message": "Connected" }
```
On failure respond `200` with `{ "ok": false, "message": "password authentication failed" }`
(use non-2xx only when the *service itself* is broken). Apply a short timeout (5-10 s).

## 3. `POST /v1/connections/schema`

Same request body. Respond:
```json
{ "tables": [
  { "name": "customers", "schema": "public",
    "columns": [ { "name": "id", "type": "integer", "nullable": false } ] }
] }
```

---

## Minimal FastAPI skeleton (illustrative, not executed)

```python
import json, os, asyncio
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

app = FastAPI()
API_KEY = os.environ["LLM_SERVER_API_KEY"]

def check(auth: str | None):
    if auth != f"Bearer {API_KEY}":
        raise HTTPException(401, "unauthorized")

def sse(obj) -> str:
    return f"data: {json.dumps(obj)}\n\n"

@app.post("/v1/chat/stream")
async def chat_stream(req: Request, authorization: str | None = Header(None)):
    check(authorization)
    body = await req.json()

    async def gen():
        try:
            question = body["messages"][-1]["content"]
            for word in f"You asked: {question}".split(" "):
                if await req.is_disconnected():   # user pressed "stop"
                    return
                yield sse({"type": "delta", "text": word + " "})
                await asyncio.sleep(0.02)
            yield sse({"type": "done"})
        except Exception:
            yield sse({"type": "error", "code": "CHAT_FAILED", "message": "Could not answer that."})

    return StreamingResponse(gen(), media_type="text/event-stream")

@app.post("/v1/connections/test")
async def test_conn(req: Request, authorization: str | None = Header(None)):
    check(authorization)
    return {"ok": True, "message": "Connected"}
```
