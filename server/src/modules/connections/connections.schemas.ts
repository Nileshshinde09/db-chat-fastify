import { z } from 'zod';
import { DB_TYPES } from '../../models/db-connection.model';

const host = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[A-Za-z0-9._:\-[\]]+$/, 'Host must be a hostname or IP address (no scheme, path or spaces)');

const port = z.number().int().min(1).max(65535);

const options = z
  .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Option names may only contain letters, digits and underscores'), z.union([z.string().max(200), z.number(), z.boolean()]))
  .refine((o) => Object.keys(o).length <= 10, 'At most 10 options');

export const createConnectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(200).optional(),
    type: z.enum(DB_TYPES),
    host,
    port: port.optional(),
    database: z.string().trim().min(1).max(128),
    username: z.string().max(128).default(''),
    password: z.string().max(256).default(''),
    ssl: z.boolean().default(false),
    readOnly: z.boolean().default(true),
    options: options.default({}),
  })
  .strict();

/** Every field optional. Sending `password` replaces it; leaving it out keeps the saved one. */
export const updateConnectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(200),
    type: z.enum(DB_TYPES),
    host,
    port,
    database: z.string().trim().min(1).max(128),
    username: z.string().max(128),
    password: z.string().max(256),
    ssl: z.boolean(),
    readOnly: z.boolean(),
    options,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

/** Test an unsaved configuration before saving it. */
export const testConnectionSchema = z
  .object({
    type: z.enum(DB_TYPES),
    host,
    port: port.optional(),
    database: z.string().trim().min(1).max(128),
    username: z.string().max(128).default(''),
    password: z.string().max(256).default(''),
    ssl: z.boolean().default(false),
    options: options.default({}),
  })
  .strict();

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
