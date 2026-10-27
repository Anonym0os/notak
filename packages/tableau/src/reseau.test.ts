// @vitest-environment jsdom
import * as Y from 'yjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creerReseauNavigateur } from './reseau'

// Le vrai WebSocket n'est pas de la partie : on garde ce que `reseau.ts` donne à Hocuspocus, et on le fait parler.
const m = vi.hoisted(() => ({
  prises: [] as Record<string, (...a: unknown[]) => unknown>[],
  providers: [] as Record<string, (...a: unknown[]) => unknown>[],
}))
vi.mock('@hocuspocus/provider', () => ({
  WebSocketStatus: { Connected: 'connected', Connecting: 'connecting', Disconnected: 'disconnected' },
  HocuspocusProviderWebsocket: class {
    status = 'connected'
    constructor(config: Record<string, (...a: unknown[]) => unknown>) {
      m.prises.push(config)
    }
    destroy() {}
  },
  HocuspocusProvider: class {
    awareness = null
    hasUnsyncedChanges = false
    constructor(config: Record<string, (...a: unknown[]) => unknown>) {
      m.providers.push(config)
    }
    attach() {}
    detach() {}
    destroy() {}
  },
}))
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    destroy() {}
  },
}))

beforeEach(() => {
  m.prises.length = 0
  m.providers.length = 0
  vi.stubGlobal('fetch', async () => Response.json(null))
})

describe('le réseau du navigateur : ce que l’hôte apprend de la synchronisation', () => {
  it('un tableau refusé par le serveur est dit à l’hôte, avec son identifiant', () => {
    const surRefus = vi.fn()
    const surEtat = vi.fn()
    const connexion = creerReseauNavigateur('u1', { surRefus }).connecter('t1', new Y.Doc(), surEtat)
    expect(connexion.refuse()).toBe(false)
    m.providers[0]!.onAuthenticationFailed!({ reason: 'permission-denied' })
    expect(connexion.refuse()).toBe(true)
    expect(surEtat).toHaveBeenCalled()
    expect(surRefus).toHaveBeenCalledExactlyOnceWith('t1')
  })

  it('un tableau accepté ne dit rien', () => {
    const surRefus = vi.fn()
    creerReseauNavigateur('u1', { surRefus }).connecter('t1', new Y.Doc(), vi.fn())
    m.providers[0]!.onAuthenticated!({ scope: 'read-write' })
    expect(surRefus).not.toHaveBeenCalled()
  })

  it('le lien avec le serveur qui s’ouvre, au chargement comme après une coupure, est dit à l’hôte', () => {
    const surConnexion = vi.fn()
    const reseau = creerReseauNavigateur('u1', { surConnexion })
    reseau.connecter('t1', new Y.Doc(), vi.fn())
    // Un seul WebSocket pour tous les tableaux.
    reseau.connecter('t2', new Y.Doc(), vi.fn())
    expect(m.prises).toHaveLength(1)
    m.prises[0]!.onConnect!()
    m.prises[0]!.onConnect!()
    expect(surConnexion).toHaveBeenCalledTimes(2)
  })

  it('sans rien demander, rien ne casse', () => {
    const connexion = creerReseauNavigateur('u1').connecter('t1', new Y.Doc(), vi.fn())
    m.providers[0]!.onAuthenticationFailed!({ reason: 'x' })
    m.prises[0]!.onConnect!()
    expect(connexion.refuse()).toBe(true)
  })
})
