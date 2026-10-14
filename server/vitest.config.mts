import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 120_000, // first run downloads a MongoDB binary
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://placeholder/overridden-in-tests',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123',
      TWO_FACTOR_ENABLED: 'false',
    },
  },
});
