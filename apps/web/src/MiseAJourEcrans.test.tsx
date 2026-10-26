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
  // « Plus tard » se retient d'une page à l'autre : chaque essai part d'une page neuve.
  localStorage.clear()
  vi.restoreAllMocks()
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
    expect(alerte.textContent).toContain('Notak 0.2.0 n’a pas pu s’installer. Réessayez ; sinon, elle se posera quand vous quitterez Notak.')
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
    // La version qui tourne, lue dans les réglages de la coque avant toute recherche.
    expect(statut.textContent).toBe('Notak 0.1.0')

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

describe('les nouveautés d’une version prête', () => {
  const avecNotes = (notes: string | null) => ({ etat: 'prete', version: '0.1.0', nouvelle: '0.2.0', notes, date: null })

  it('se lisent dans l’app, en texte et en puces ; la page de la version reste à côté, dans le navigateur', async () => {
    const { m } = await avecCoque(async (c) => (c === 'preparer_mise_a_jour' ? avecNotes('## 0.2.0\n- Une **chose**\n- Deux <img src=x onerror=alert(1)>') : null))
    await act(async () => racine.render(<m.BandeauMiseAJour />))
    await act(async () => m.chercherMiseAJour())
    const notes = hote.querySelector('details')!
    expect(notes.querySelector('summary')?.textContent).toBe('Nouveautés')
    expect([...notes.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Une chose', 'Deux <img src=x onerror=alert(1)>'])
    expect(notes.querySelector('img')).toBeNull()
    const lien = notes.querySelector('a')!
    expect(lien.href).toBe('https://github.com/Anonym0os/notak/releases/tag/v0.2.0')
    expect(lien.textContent).toContain('navigateur')
    expect(lien.target).toBe('_blank')
    // Les boutons du bandeau restent ceux d'avant.
    expect(bouton(/Plus tard/)).toBeTruthy()
    expect(bouton(/Redémarrer maintenant/)).toBeTruthy()
  })

  it('sans notes, « Nouveautés » ouvre la page de la version', async () => {
    const { m } = await avecCoque(async (c) => (c === 'preparer_mise_a_jour' ? avecNotes(null) : null))
    await act(async () => racine.render(<m.BandeauMiseAJour />))
    await act(async () => m.chercherMiseAJour())
    expect(hote.querySelector('details')).toBeNull()
    const lien = [...hote.querySelectorAll('a')].find((a) => a.textContent === 'Nouveautés')!
    expect(lien.href).toBe('https://github.com/Anonym0os/notak/releases/tag/v0.2.0')
  })

  it('se lisent aussi dans la section « Mises à jour »', async () => {
    const { m } = await avecCoque(async (c) => (c === 'preparer_mise_a_jour' ? avecNotes('Corrige la synchro.') : null))
    await act(async () => racine.render(<m.SectionMiseAJour />))
    await act(async () => m.chercherMiseAJour())
    expect(hote.querySelector('details p')?.textContent).toBe('Corrige la synchro.')
  })
})

describe('un échec se dit en mots, d’après son code', () => {
  it('une signature refusée se dit comme telle, jamais « hors ligne », avec la page des versions', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { m } = await avecCoque(async (c) => {
      if (c === 'preparer_mise_a_jour') throw { code: 'signature' }
      return null
    })
    await act(async () => racine.render(<m.SectionMiseAJour />))
    await act(async () => m.chercherMiseAJour(true))
    const statut = hote.querySelector('[role=status]')!
    expect(statut.textContent).toContain('la recherche n’a pas abouti')
    expect(statut.textContent).toContain('sa signature ne correspond pas')
    expect(hote.textContent).not.toMatch(/hors ligne \?|offline/)
    expect(statut.querySelector('a')?.href).toBe('https://github.com/Anonym0os/notak/releases/latest')
  })

  it('le détail anglais d’une coque d’avant les codes ne s’affiche pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { m } = await avecCoque(async (c) => {
      if (c === 'preparer_mise_a_jour') throw 'error decoding response body'
      return null
    })
    await act(async () => racine.render(<m.SectionMiseAJour />))
    await act(async () => m.chercherMiseAJour(true))
    expect(hote.textContent).toContain('La mise à jour n’a pas abouti.')
    expect(hote.textContent).not.toContain('decoding')
  })

  it('une installation qui ne peut pas se poser là où est l’app le dit, sans promettre qu’elle se posera en quittant', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { m } = await avecCoque(async (c) => {
      if (c === 'preparer_mise_a_jour') return { etat: 'prete', version: '0.1.0', nouvelle: '0.2.0', notes: null, date: null }
      throw { code: 'emplacement' }
    })
    await act(async () => racine.render(<m.BandeauMiseAJour />))
    await act(async () => m.chercherMiseAJour())
    await act(async () => bouton(/Redémarrer maintenant/)!.click())
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)))
    const alerte = hote.querySelector('[role=alert]')!
    expect(alerte.textContent).toContain('Notak 0.2.0 n’a pas pu s’installer.')
    expect(alerte.textContent).toContain('dossier Applications')
    expect(alerte.textContent).not.toContain('quand vous quitterez')
  })
})
