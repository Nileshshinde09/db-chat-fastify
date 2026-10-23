import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    connectionId: objectId.nullable().optional(),
  })
  .strict();

/** Send `connectionId: null` to detach the database; a new id to switch to another one. */
export const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    connectionId: objectId.nullable(),
    pinned: z.boolean(),
    archived: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
  q: z.string().trim().max(100).optional(),
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  pinned: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Message id: returns the page of messages older than this one. */
  before: objectId.optional(),
});

export const sendMessageSchema = z
  .object({
    content: z.string().trim().min(1, 'Message cannot be empty').max(8000),
    attachmentIds: z.array(objectId).max(5).default([]),
  })
  .strict();

export const sendMessageQuerySchema = z.object({
  /** stream=false returns one JSON response instead of a Server-Sent-Events stream. */
  stream: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
