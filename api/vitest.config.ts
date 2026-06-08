import { defineConfig } from 'vitest/config';
import path from 'path';

const testDbPath = path.resolve(__dirname, 'prisma', 'test.db');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    env: {
      DATABASE_URL: `file:${testDbPath}`,
    },
    testTimeout: 15000,
    globalSetup: ['./src/__tests__/global-setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    fileParallelism: false,
  },
});
