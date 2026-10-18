// src/utils/cleanDb.ts
import mongoose from 'mongoose';

const DEFAULT_PRESERVE = ['migrations', 'system.indexes'];

export async function cleanDb(opts: {
  preserve?: string[];
  hard?: boolean; // true = dropDatabase()
} = {}): Promise<{ cleared: string[]; hard: boolean }> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB not connected');

  if (opts.hard) {
    await db.dropDatabase();
    return { cleared: ['<database>'], hard: true };
  }

  const preserve = new Set(opts.preserve ?? DEFAULT_PRESERVE);
  const { collections } = await db.listCollections().toArray()
    .then((list) => ({ collections: list }));

  const cleared: string[] = [];
  for (const c of collections) {
    if (preserve.has(c.name)) continue;
    await db.collection(c.name).deleteMany({});
    cleared.push(c.name);
  }
  return { cleared, hard: false };
}