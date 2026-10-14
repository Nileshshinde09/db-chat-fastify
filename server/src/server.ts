import { buildApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';

async function main() {
  await connectDb();
  const app = await buildApp();

  if (!env.TWO_FACTOR_ENABLED) {
    app.log.warn('Two-factor authentication is DISABLED (TWO_FACTOR_ENABLED=false)');
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
