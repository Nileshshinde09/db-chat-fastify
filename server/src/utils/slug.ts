import { randomBytes } from 'node:crypto';
import { Organization } from '../models/organization.model';

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'org';
}

export async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugify(name);
  if (!(await Organization.exists({ slug: base }))) return base;
  return `${base}-${randomBytes(3).toString('hex')}`;
}
