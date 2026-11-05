// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Une fenêtre dont on suit les rechargements ; le reste est celui de jsdom. */
function fenetre(stockage: Storage | null = sessionStorage) {
  const reload = vi.fn()
  const f = Object.create(window) as Window
  Object.defineProperty(f, 'location', { value: { reload } })
  Object.defineProperty(f, 'sessionStorage', {
    get: () => {
      if (!stockage) throw new Error('refusé')
      return stockage
    },
  })
  Object.defineProperty(f, 'document', { value: document })
  Object.defineProperty(f, 'navigator', { value: navigator })
  Object.defineProperty(f, 'addEventListener', { value: window.addEventListener.bind(window) })
  return { f, reload }
}

beforeEach(() => {
  sessionStorage.clear()
  document.documentElement.lang = 'fr'
  document.body.innerHTML = '<div id="racine"><div class="ecran-attente" aria-busy="true"></div></div>'
})

afterEach(() => vi.resetModules())

describe('un morceau de l’app qui ne se charge pas', () => {
  it('recharge la page une fois, sans rien montrer', async () => {
    const { rattraperChargement } = await import('./rattrapage')
    const { f, reload } = fenetre()
    rattraperChargement(f, 1_000_000)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('un second échec juste après le rechargement ne boucle pas : l’écran le dit, et réessaie au toucher', async () => {
    sessionStorage.setItem('notak:rechargement-apres-echec', String(1_000_000))
    const { rattraperChargement } = await import('./rattrapage')
    const { f, reload } = fenetre()
    rattraperChargement(f, 1_000_000 + 5_000)
    expect(reload).not.toHaveBeenCalled()
    const alerte = document.querySelector('#racine [role="alert"]')
    expect(alerte?.textContent).toContain('Notak n’a pas pu se charger')
    expect(document.querySelector('.ecran-attente')).toBeNull()
    alerte!.querySelector('button')!.click()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('longtemps après un rechargement, un nouvel échec recharge de nouveau', async () => {
    const { rattraperChargement, DELAI_MS } = await import('./rattrapage')
    sessionStorage.setItem('notak:rechargement-apres-echec', String(1_000_000))
    const { f, reload } = fenetre()
    rattraperChargement(f, 1_000_000 + DELAI_MS + 1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('sans stockage, pas de garde contre une boucle : l’écran plutôt qu’un rechargement', async () => {
    const { rattraperChargement } = await import('./rattrapage')
    const { f, reload } = fenetre(null)
    rattraperChargement(f, 1_000_000)
    expect(reload).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('deux échecs de la même page ne rechargent qu’une fois', async () => {
    const { rattraperChargement } = await import('./rattrapage')
    const { f, reload } = fenetre()
    rattraperChargement(f, 1_000_000)
    rattraperChargement(f, 1_000_001)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('l’écran parle anglais à qui lit l’anglais', async () => {
    document.documentElement.lang = 'en'
    const { montrerEchec } = await import('./rattrapage')
    montrerEchec(window)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Notak couldn’t load')
  })

  it('un fichier préchargé manquant, signalé par Vite, recharge sans lever d’erreur', async () => {
    const { brancherRattrapage } = await import('./rattrapage')
    const { f, reload } = fenetre()
    brancherRattrapage(f)
    const e = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
