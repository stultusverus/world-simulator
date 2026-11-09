import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify('test'),
    __BUILD_DATE__: JSON.stringify('test-build'),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
