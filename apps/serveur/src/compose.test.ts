import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Ce que tirent les serveurs installés par `compose.yaml` doit être ce qu'éprouvent les essais : une pull request de
// Dependabot qui ne monterait que l'un ferait tourner chez tout le monde un OpenFGA que rien n'a essayé.

const racine = join(import.meta.dirname, '../../..')
const lire = (fichier: string) => readFileSync(join(racine, fichier), 'utf8')

describe('compose.yaml', () => {
  it.each(['compose.yaml', 'compose.coolify.yaml'])('%s tire la version d’OpenFGA que lancent les essais du serveur (vitest.openfga.ts)', (fichier) => {
    const essais = /IMAGE_OPENFGA = '([^']+)'/.exec(lire('vitest.openfga.ts'))?.[1]
    const images = [...lire(fichier).matchAll(/^\s*image:\s*(openfga\/openfga:\S+)\s*$/gm)].map((m) => m[1])
    expect(essais).toBeTruthy()
    expect(images).toHaveLength(2)
    for (const image of images) expect(image).toBe(essais)
  })

  it('passe le .env au serveur, et ne publie le port que sur la boucle locale par défaut', () => {
    const compose = lire('compose.yaml')
    expect(compose).toMatch(/env_file:\s*\n\s*- path: \.env\s*\n\s*required: false/)
    expect(compose).toContain("- '${NOTAK_ECOUTE:-127.0.0.1}:${NOTAK_PORT:-3005}:3005'")
    // Une valeur écrite en dur dans `environment` l'emporterait sur le .env, sans rien dire.
    expect(compose).not.toMatch(/^\s+NOTAK_(INSCRIPTIONS|NOM|ADMINS|CLE):/m)
  })
})
