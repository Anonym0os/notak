import { describe, expect, it } from 'vitest'
import { configServeur } from './bureau'

describe('une coque pour un serveur Notak', () => {
  it('ne donne les droits de la coque qu’aux pages de ce serveur', () => {
    const c = configServeur('https://notak.exemple.fr/chemin') as {
      build: { frontendDist: string; beforeBuildCommand: null }
      app: { security: { capabilities: { remote: { urls: string[] }; permissions: string[] }[] } }
    }
    expect(c.build).toEqual({ frontendDist: 'https://notak.exemple.fr', beforeBuildCommand: null })
    const [capacite] = c.app.security.capabilities
    expect(capacite!.remote.urls).toEqual(['https://notak.exemple.fr/*'])
    // Pas de mise à jour : celles du projet remplaceraient la coque par l'app sans serveur.
    expect(capacite!.permissions.some((p) => p.includes('mise-a-jour'))).toBe(false)
  })

  it('refuse le HTTP simple hors de la machine, et les adresses à identifiants', () => {
    expect(() => configServeur('http://notak.exemple.fr')).toThrow(/https/)
    expect(() => configServeur('https://moi:secret@notak.exemple.fr')).toThrow()
    expect(() => configServeur('pas une adresse')).toThrow()
    expect(() => configServeur('http://localhost:3005')).not.toThrow()
  })
})
