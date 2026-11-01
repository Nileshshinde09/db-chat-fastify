import { z } from "zod"

// ─── Message Blocks ──────────────────────────────────────────────────────────

export const MessageBlockSchema = z.discriminatedUnion("type", [
  z.object({ 
    type: z.literal("sql"), 
    sql: z.string(), 
    dialect: z.string().optional() 
  }),
  z.object({ 
    type: z.literal("plan"), 
    plan: z.record(z.string(), z.unknown()) 
  }),
  z.object({ 
    type: z.literal("table"), 
    columns: z.array(z.string()), 
    rows: z.array(z.array(z.unknown())), 
    rowCount: z.number().optional() 
  }),
  z.object({ 
    type: z.literal("chart"), 
    spec: z.record(z.string(), z.unknown()) 
  }),
])

export type MessageBlock = z.infer<typeof MessageBlockSchema>

// ─── Core Models ─────────────────────────────────────────────────────────────

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  status: z.enum(["complete", "stopped", "error"]),
  error: z.object({ code: z.string(), message: z.string() }).nullable().optional(),
  attachments: z.array(z.any()).default([]), // Simplify if you have an AttachmentSchema
  blocks: z.array(MessageBlockSchema).default([]),
  connectionId: z.string().nullable().optional(),
  connectionName: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
})

export type ChatMessage = z.infer<typeof MessageSchema>

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleSource: z.enum(["default", "auto", "user"]).optional(),
  connectionId: z.string().nullable(),
  connectionName: z.string().nullable(),
  pinned: z.boolean(),
  archived: z.boolean(),
  messageCount: z.number(),
  lastMessageAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  busy: z.boolean().optional(),
})

export type Conversation = z.infer<typeof ConversationSchema>

// ─── API Response Shapes ─────────────────────────────────────────────────────

export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
  nextCursor: z.string().nullable(),
})

export const GetConversationResponseSchema = z.object({
  conversation: ConversationSchema,
})

export const ListMessagesResponseSchema = z.object({
  messages: z.array(MessageSchema),
  nextCursor: z.string().nullable(),
})

// ─── Request Inputs ──────────────────────────────────────────────────────────

export interface CreateConversationInput {
  connectionId?: string | null
  title?: string
}

export interface UpdateConversationInput {
  title?: string
  connectionId?: string | null
  pinned?: boolean
  archived?: boolean
}

export interface SendMessageInput {
  content: string
  attachmentIds?: string[]
  reportId?: string
}