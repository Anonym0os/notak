import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { Reseau } from './coeur/espaceDistant'

/** Le vrai réseau : un seul WebSocket vers `/sync` pour tous les tableaux, IndexedDB pour le hors-ligne, `/api` pour déclarer. */
export function creerReseauNavigateur(utilisateurId: string): Reseau {
  let prise: HocuspocusProviderWebsocket | undefined
  const socket = () =>
    (prise ??= new HocuspocusProviderWebsocket({
      url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync`,
    }))

  return {
    persister(id, doc) {
      const p = new IndexeddbPersistence(`notak:${utilisateurId}:${id}`, doc)
      return () => void p.destroy()
    },

    connecter(id, doc, surEtat) {
      let lecture = false
      let refuse = false
      let synchro = false
      const provider: HocuspocusProvider = new HocuspocusProvider({
        websocketProvider: socket(),
        name: `tableau:${id}`,
        document: doc,
        onAuthenticated: ({ scope }) => {
          lecture = scope === 'readonly'
          refuse = false
          surEtat()
        },
        onAuthenticationFailed: () => {
          refuse = true
          lecture = true
          // On cesse de redemander : un accès retiré ne revient pas en insistant.
          queueMicrotask(() => provider.detach())
          surEtat()
        },
        onSynced: ({ state }) => {
          synchro = state
          surEtat()
        },
      })
      // Le socket est partagé : le provider ne s'y accroche pas tout seul.
      provider.attach()
      return {
        awareness: provider.awareness,
        lectureSeule: () => lecture,
        refuse: () => refuse,
        synchronise: () => synchro,
        detruire: () => provider.destroy(),
      }
    },

    async declarer(id, titre, parent) {
      let r: Response
      try {
        r = await fetch('/api/tableaux', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, titre, ...(parent ? { parent } : {}) }),
        })
      } catch {
        throw new Error('Réseau absent')
      }
      if (r.ok) return
      throw Object.assign(new Error(`Déclaration refusée (${r.status})`), { definitif: r.status >= 400 && r.status < 500 })
    },

    fermer() {
      prise?.destroy()
      prise = undefined
    },
  }
}
