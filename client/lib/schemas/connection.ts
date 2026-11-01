import { z } from "zod"
import { DB_TYPES } from "@/lib/db"
import { host, port, options } from "@/lib/schemas/primitives"

export const createConnectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(200).optional(),
    type: z.enum(DB_TYPES),
    host,
    port: port.optional(),
    database: z.string().trim().min(1).max(128),
    username: z.string().max(128).default(""),
    password: z.string().max(256).default(""),
    ssl: z.boolean().default(false),
    readOnly: z.boolean().default(true),
    options: options.default({}),
  })
  .strict()

/** What the server hands back after defaults are applied */
export type CreateConnection = z.output<typeof createConnectionSchema>
