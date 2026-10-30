import { defineConfig } from 'vitest/config';

// Unit tests for the pure rules (no browser, no database). Kept apart from vite.config.ts so the
// app's build plugins don't load for tests. Run with `npm test`; `npm run build` runs them too.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Some rule files import the API module; tests never reach the database.
    env: { VITE_DATA_PROVIDER: 'none' },
  },
});
