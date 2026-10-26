// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ENTRE_DEUX_DEMANDES_MS, INTERVALLE_MS, lireVersionDuServeur, surveillerVersionDuServeur } from './versionServeur'

let version: string | null
let appels: number
let panne: boolean

beforeEach(() => {
  vi.useFakeTimers()
  version = '1.0.0'
  appels = 0
  panne = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (chemin: string) => {
      expect(chemin).toBe('/api/sante')
      appels++
      if (panne) throw new TypeError('hors ligne')
      return Response.json({ produit: 'notak', version, origine: null, ok: true })
    }),
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const regler = () => vi.advanceTimersByTimeAsync(0)
const focus = () => window.dispatchEvent(new Event('focus'))

describe('la version que dit le serveur', () => {
  it('se lit dans /api/sante, sans cache', async () => {
    expect(await lireVersionDuServeur()).toBe('1.0.0')
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({ cache: 'no-store' })
  })

  it('un serveur qui ne répond pas, qui n’est pas Notak, ou dont la version est absurde ne dit rien', async () => {
    panne = true
    expect(await lireVersionDuServeur()).toBeNull()
    panne = false
    vi.stubGlobal('fetch', async () => Response.json({ produit: 'autre', version: '9' }))
    expect(await lireVersionDuServeur()).toBeNull()
    vi.stubGlobal('fetch', async () => Response.json({ produit: 'notak', version: 'x'.repeat(65) }))
    expect(await lireVersionDuServeur()).toBeNull()
    vi.stubGlobal('fetch', async () => new Response('', { status: 502 }))
    expect(await lireVersionDuServeur()).toBeNull()
    vi.stubGlobal('fetch', async () => new Response('pas du JSON'))
    expect(await lireVersionDuServeur()).toBeNull()
  })
})

describe('un serveur mis à jour sous la fenêtre ouverte', () => {
  it('au retour sur la fenêtre : la même version ne dit rien, une autre se signale, une fois', async () => {
    const signaler = vi.fn()
    const s = surveillerVersionDuServeur({ depart: '1.0.0', signaler })
    focus()
    await regler()
    expect(appels).toBe(1)
    expect(signaler).not.toHaveBeenCalled()

    version = '1.1.0'
    await vi.advanceTimersByTimeAsync(ENTRE_DEUX_DEMANDES_MS)
    focus()
    await regler()
    expect(signaler).toHaveBeenCalledTimes(1)

    // Signalée : on ne redemande plus.
    await vi.advanceTimersByTimeAsync(ENTRE_DEUX_DEMANDES_MS)
    focus()
    await regler()
    expect(appels).toBe(2)
    expect(signaler).toHaveBeenCalledTimes(1)
    s.arreter()
  })

  it('quand la synchronisation se rétablit (verifier), au plus une demande par minute', async () => {
    const signaler = vi.fn()
    const s = surveillerVersionDuServeur({ depart: '1.0.0', signaler })
    s.verifier()
    s.verifier()
    focus()
    await regler()
    expect(appels).toBe(1)
    await vi.advanceTimersByTimeAsync(ENTRE_DEUX_DEMANDES_MS - 1)
    s.verifier()
    expect(appels).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    s.verifier()
    await regler()
    expect(appels).toBe(2)
    s.arreter()
  })

  it('une demande en cours n’en lance pas une autre', async () => {
    let finir: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => (finir = () => r(Response.json({ produit: 'notak', version: '2.0.0' }))))),
    )
    const signaler = vi.fn()
    const s = surveillerVersionDuServeur({ depart: '1.0.0', signaler })
    s.verifier()
    await vi.advanceTimersByTimeAsync(ENTRE_DEUX_DEMANDES_MS * 2)
    s.verifier()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    finir()
    await regler()
    expect(signaler).toHaveBeenCalledTimes(1)
    s.arreter()
  })

  it('une fenêtre qui ne perd jamais la main se renseigne quand même, toutes les trente minutes', async () => {
    const signaler = vi.fn()
    const s = surveillerVersionDuServeur({ depart: '1.0.0', signaler })
    await vi.advanceTimersByTimeAsync(INTERVALLE_MS - 1)
    expect(appels).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(appels).toBe(1)
    version = '1.0.1'
    await vi.advanceTimersByTimeAsync(INTERVALLE_MS)
    expect(appels).toBe(2)
    expect(signaler).toHaveBeenCalledTimes(1)
    s.arreter()
  })

  it('sans version de départ, la première réponse fait référence', async () => {
    const signaler = vi.fn()
    const s = surveillerVersionDuServeur({ depart: null, signaler })
    s.verifier()
    await regler()
    expect(signaler).not.toHaveBeenCalled()
    version = '1.2.0'
    await vi.advanceTimersByTimeAsync(ENTRE_DEUX_DEMANDES_MS)
    s.verifier()
    await regler()
    expect(signaler).toHaveBeenCalledTimes(1)
    s.arreter()
  })

  it('un serveur injoignable ne signale rien, et la version qui revient la même non plus', async () => {
    const signaler = vi.fn()
    const s = surveillerVersionDuServeur({ depart: '1.0.0', signaler })
    panne = true
    s.verifier()
    await regler()
    panne = false
    await vi.advanceTimersByTimeAsync(ENTRE_DEUX_DEMANDES_MS)
    s.verifier()
    await regler()
    expect(appels).toBe(2)
    expect(signaler).not.toHaveBeenCalled()
    s.arreter()
  })

  it('arrêter la surveillance libère la fenêtre et le minuteur', async () => {
    const signaler = vi.fn()
    const s = surveillerVersionDuServeur({ depart: '1.0.0', signaler })
    s.arreter()
    version = '2.0.0'
    focus()
    s.verifier()
    await vi.advanceTimersByTimeAsync(INTERVALLE_MS * 2)
    expect(appels).toBe(0)
    expect(signaler).not.toHaveBeenCalled()
  })
})
