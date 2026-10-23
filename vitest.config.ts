import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx', 'apps/serveur/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
  },
})
