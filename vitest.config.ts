import { defineConfig } from 'vitest/config';

// Tests live in src/ and scripts/. The vendor/ clones carry their own test files and must never run here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    exclude: ['vendor/**', 'node_modules/**', 'out/**', 'data*/**'],
    environment: 'node',
  },
});
