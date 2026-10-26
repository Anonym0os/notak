// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement

beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** Le module neuf, dans une app de bureau dont la coque répond par `reponse` (la page des toiles d'ici). */
async function avecCoque(reponse: (commande: string) => Promise<unknown>) {
  vi.stubEnv('VITE_EDITION', 'locale')
  const invoke = vi.fn(async (commande: string) => {
    if (commande === 'acces') return { ouvrir: 'local', serveur: null, majAuto: true, version: '0.1.0' }
    return reponse(commande)
  })
  ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = { invoke }
  return { m: await import('./MiseAJour'), invoke }
}
const bouton = (texte: RegExp) => [...hote.querySelectorAll('button')].find((b) => texte.test(b.textContent ?? ''))

describe('le bandeau d’une mise à jour qui n’a pas pu s’installer', () => {
  const prete = { etat: 'prete', version: '0.1.0', nouvelle: '0.2.0', notes: null, date: null }

  /** La mise à jour prête, « Redémarrer » pressé, et la coque qui refuse d'installer. */
  async function installationRatee(apres: (commande: string) => Promise<unknown> = async () => null) {
    vi.useFakeTimers()
    let echoue = true
    const { m, invoke } = await avecCoque(async (c) => {
      if (c === 'preparer_mise_a_jour') return prete
      if (c === 'installer_mise_a_jour' && echoue) throw 'permission denied'
      return apres(c)
    })
    await act(async () => racine.render(<m.BandeauMiseAJour />))
    await act(async () => m.chercherMiseAJour())
    await act(async () => bouton(/Redémarrer maintenant/)!.click())
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)))
    return { m, invoke, reparer: () => (echoue = false) }
  }

  it('le dit, au lieu de disparaître sans un mot : une alerte, avec « Réessayer »', async () => {
    await installationRatee()
    const alerte = hote.querySelector('.bandeau')!
    expect(alerte.getAttribute('role')).toBe('alert')
    expect(alerte.textContent).toContain('Notak 0.2.0 n’a pas pu s’installer. Réessayez : elle sera téléchargée de nouveau.')
    expect([...alerte.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Fermer', 'Réessayer'])
  })

  it('même pour qui avait dit « plus tard » : l’échec d’une installation qu’on a lancée se dit', async () => {
    const { m } = await installationRatee()
    // Le bandeau d'avant s'écartait ; l'échec, lui, ne se tait pas.
    act(() => m.ecarter())
    expect(hote.querySelector('.bandeau')?.getAttribute('role')).toBe('alert')
  })

  it('« Réessayer » cherche de nouveau la mise à jour, que la coque a perdue : le bandeau « prête » revient', async () => {
    const { reparer, invoke } = await installationRatee()
    reparer()
    const avant = invoke.mock.calls.filter((c) => c[0] === 'preparer_mise_a_jour').length
    await act(async () => bouton(/Réessayer/)!.click())
    expect(invoke.mock.calls.filter((c) => c[0] === 'preparer_mise_a_jour')).toHaveLength(avant + 1)
    expect(hote.querySelector('.bandeau')?.getAttribute('role')).toBe('status')
    expect(hote.textContent).toContain('Notak 0.2.0 est prête')
  })

  it('« Fermer » le tait', async () => {
    await installationRatee()
    await act(async () => bouton(/^Fermer$/)!.click())
    expect(hote.querySelector('.bandeau')).toBeNull()
  })
})

describe('la section « Mises à jour » : le résultat d’une recherche s’annonce', () => {
  it('la ligne d’état est une région status toujours là, dont seul le texte change', async () => {
    let finir: (r: unknown) => void = () => {}
    const { m } = await avecCoque(async (c) => (c === 'preparer_mise_a_jour' ? new Promise((r) => (finir = r)) : null))
    await act(async () => racine.render(<m.SectionMiseAJour />))
    const statut = hote.querySelector('[role=status]')!
    expect(statut.textContent).toBe('Notak')

    await act(async () => void m.chercherMiseAJour(true))
    // La même région, un autre texte : c'est ce qu'un lecteur d'écran annonce.
    expect(hote.querySelector('[role=status]')).toBe(statut)
    expect(statut.textContent).toContain('recherche d’une nouvelle version…')

    await act(async () => finir({ etat: 'a-jour', version: '0.1.0' }))
    expect(hote.querySelector('[role=status]')).toBe(statut)
    expect(statut.textContent).toContain('à jour')
  })

  it('le bouton qui a le curseur n’est pas désactivé pendant la recherche : il est grisé (aria-disabled), et ne relance rien', async () => {
    let finir: (r: unknown) => void = () => {}
    const { m, invoke } = await avecCoque(async (c) => (c === 'preparer_mise_a_jour' ? new Promise((r) => (finir = r)) : null))
    await act(async () => racine.render(<m.SectionMiseAJour />))
    const chercher = bouton(/Rechercher maintenant/)!
    chercher.focus()
    await act(async () => chercher.click())
    expect(bouton(/Rechercher maintenant/)).toBe(chercher)
    expect(chercher.disabled).toBe(false)
    expect(chercher.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(chercher)
    // Un second clic sur un bouton grisé n'envoie pas une seconde recherche.
    await act(async () => chercher.click())
    expect(invoke.mock.calls.filter((c) => c[0] === 'preparer_mise_a_jour')).toHaveLength(1)
    await act(async () => finir({ etat: 'a-jour', version: '0.1.0' }))
    expect(chercher.hasAttribute('aria-disabled')).toBe(false)
  })
})
