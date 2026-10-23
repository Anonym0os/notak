import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx', 'apps/serveur/src/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'apps/web/src/**/*.test.tsx', 'apps/web/pwa/**/*.test.ts'],
  },
})
