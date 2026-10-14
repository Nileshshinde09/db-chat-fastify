import { z } from 'zod';
import { passwordSchema } from '../auth/auth.schemas';

export const createInviteSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  role: z.enum(['admin', 'member']).default('member'),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});
