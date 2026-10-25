// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

/** Un conteneur de service workers qu'on fait parler. */
function conteneur(tenu: boolean) {
  const cible = new EventTarget()
  return Object.assign(cible, { controller: tenu ? {} : null }) as unknown as ServiceWorkerContainer
}

describe('les versions de la version web', () => {
  it('une nouvelle version qui prend la main sous une page ouverte se dit', async () => {
    const { suivreLesVersions, nouvelleVersion } = await import('./pwa')
    const c = conteneur(true)
    suivreLesVersions({ update: async () => undefined as never }, c)
    expect(nouvelleVersion()).toBe(false)
    c.dispatchEvent(new Event('controllerchange'))
    expect(nouvelleVersion()).toBe(true)
  })

  it('la toute première installation n’est pas une mise à jour', async () => {
    const { suivreLesVersions, nouvelleVersion } = await import('./pwa')
    const c = conteneur(false)
    suivreLesVersions({ update: async () => undefined as never }, c)
    c.dispatchEvent(new Event('controllerchange'))
    expect(nouvelleVersion()).toBe(false)
    // La suivante, si.
    c.dispatchEvent(new Event('controllerchange'))
    expect(nouvelleVersion()).toBe(true)
  })

  it('un morceau d’une version remplacée qui ne se charge plus se dit aussi', async () => {
    const { suivreLesVersions, nouvelleVersion } = await import('./pwa')
    suivreLesVersions({ update: async () => undefined as never }, conteneur(true))
    window.dispatchEvent(new Event('vite:preloadError'))
    expect(nouvelleVersion()).toBe(true)
  })

  it('redemande la version toutes les heures', async () => {
    vi.useFakeTimers()
    const { suivreLesVersions } = await import('./pwa')
    const update = vi.fn(async () => undefined as never)
    suivreLesVersions({ update }, conteneur(true))
    await vi.advanceTimersByTimeAsync(3600_000)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
