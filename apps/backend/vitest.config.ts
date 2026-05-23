import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    poolOptions: {
      threads: {
        singleThread: true, // tests share a real DB — must serialize
      },
    },
  },
});
