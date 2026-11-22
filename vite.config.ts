import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the built site works on GitHub Pages (https://<user>.github.io/pitwall/).
  base: './',
  test: { include: ['tests/**/*.test.ts'] },
});
