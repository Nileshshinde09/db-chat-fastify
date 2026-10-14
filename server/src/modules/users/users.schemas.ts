import { z } from 'zod';

export const updateRoleSchema = z.object({ role: z.enum(['admin', 'member']) });
export const updateStatusSchema = z.object({ status: z.enum(['active', 'disabled']) });
