import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./vitest.openfga.ts'],
    // Les essais du serveur parlent à OpenFGA par le réseau : sur une machine chargée, 5 s par essai ne suffisent pas.
    testTimeout: 15_000,
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx', 'apps/serveur/src/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'apps/web/src/**/*.test.tsx', 'apps/web/pwa/**/*.test.ts'],
  },
})
