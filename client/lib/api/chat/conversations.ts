// src/lib/api/conversations.ts
import { apiClient } from "../client"
import { useAuthStore } from "@/stores/useAuthStore"
import { useSearchParams } from 'next/navigation'
import {
  CreateConversationInput,
  GetConversationResponseSchema,
  ListConversationsResponseSchema,
  ListMessagesResponseSchema,
  SendMessageInput,
  UpdateConversationInput,
  type Conversation,
  type ChatMessage,
} from "./conversations.types"

const BASE = "/api/v1/conversations"

const getToken = () => useAuthStore.getState().accessToken
const enc = (v: string) => encodeURIComponent(v)

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listConversations(
  connectionId?: string | null,
  cursor?: string | null
): Promise<{ conversations: Conversation[]; nextCursor: string | null }> {
  const params = new URLSearchParams()
  if (cursor) params.append("cursor", cursor)
  if (connectionId) params.append("connectionId", connectionId)
  
  const query = params.toString() ? `?${params.toString()}` : ""
  
  const raw = await apiClient<unknown>(`${BASE}${query}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  return ListConversationsResponseSchema.parse(raw)
}

export async function getConversation(id: string): Promise<Conversation> {
  const raw = await apiClient<unknown>(`${BASE}/${enc(id)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  return GetConversationResponseSchema.parse(raw).conversation
}

export async function listMessages(conversationId: string, before?: string | null): Promise<{ messages: ChatMessage[]; nextCursor: string | null }> {
  const query = before ? `?before=${enc(before)}` : ""
  const raw = await apiClient<unknown>(`${BASE}/${enc(conversationId)}/messages${query}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  return ListMessagesResponseSchema.parse(raw)
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function createConversation(input: CreateConversationInput): Promise<Conversation> {
  const raw = await apiClient<unknown>(BASE, {
    method: "POST",
    body: JSON.stringify(input),
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  })
  return GetConversationResponseSchema.parse(raw).conversation
}

export async function updateConversation(id: string, patch: UpdateConversationInput): Promise<Conversation> {
  const raw = await apiClient<unknown>(`${BASE}/${enc(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  })
  return GetConversationResponseSchema.parse(raw).conversation
}

export async function deleteConversation(id: string): Promise<void> {
  await apiClient<void>(`${BASE}/${enc(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  })
}

// ─── Send Message (SSE Streaming) ────────────────────────────────────────────

export async function* streamMessage(
  conversationId: string,
  input: SendMessageInput,
  signal?: AbortSignal
): AsyncGenerator<{ event: string; data: any }> {
  // Note: we use raw fetch here because apiClient usually buffers the response,
  // and SSE requires streaming the body chunk-by-chunk.
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${BASE}/${enc(conversationId)}/messages?stream=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal,
  })

  if (!res.ok) {
    throw new Error(`Failed to start chat: ${await res.text()}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || "" // Keep the last incomplete line in the buffer

    let currentEvent = ""
    let currentData = ""

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6).trim()
      } else if (line.trim() === "" && currentEvent && currentData) {
        // Empty line means end of event
        yield { event: currentEvent, data: JSON.parse(currentData) }
        currentEvent = ""
        currentData = ""
      }
    }
  }
}