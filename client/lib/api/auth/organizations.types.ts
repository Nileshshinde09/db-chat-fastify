import { Role, User } from '@/lib/types';
import { z } from 'zod';

export const OrganizationStatus = z.enum(['active', 'suspended', 'deleted']);
export type OrganizationStatus = z.infer<typeof OrganizationStatus>;

/** Matches the `organization` object returned by register-organization. */
export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: OrganizationStatus,
}).strict();

export type Organization = z.infer<typeof OrganizationSchema>;

export const UpdateOrganizationInput = z.object({
  name: z.string().min(2).max(80).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
}).strict();
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationInput>;


export interface UsersResponse {
  users: User[];
}