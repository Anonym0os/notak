import { t } from './langue'
import { HocuspocusProvider, HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { DroitsTableau } from './coeur/droitsElements'
import type { Reseau } from './coeur/espaceDistant'
import type { Id } from './coeur/tableau'

/** Ce que l'hôte veut savoir de la synchronisation, au-delà de l'état de chaque tableau. */
export interface OptionsReseauNavigateur {
  /**
   * Le serveur refuse l'accès à ce tableau. Il le refuse aussi bien quand l'accès est retiré que quand la session a
   * pris fin : à l'hôte de le départager (l'édition serveur relit `/api/moi`).
   */
  surRefus?(tableau: Id): void
  /** Le lien avec le serveur vient de s'ouvrir : au chargement, et après chaque coupure. */
  surConnexion?(): void
}

/** Le vrai réseau : un seul WebSocket vers `/sync` pour tous les tableaux, IndexedDB pour le hors-ligne, `/api` pour déclarer. */
export function creerReseauNavigateur(utilisateurId: string, options: OptionsReseauNavigateur = {}): Reseau {
  let prise: HocuspocusProviderWebsocket | undefined
  const socket = () =>
    (prise ??= new HocuspocusProviderWebsocket({
      url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync`,
      onConnect: () => options.surConnexion?.(),
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
      let enAttente = false
      let droits: DroitsTableau | null = null
      // Les droits se relisent à chaque authentification : un partage, un rôle ou un élément figé a pu changer.
      const lireDroits = () => {
        fetch(`/api/tableaux/${encodeURIComponent(id)}/droits`, { credentials: 'same-origin' })
          .then((r) => (r.ok ? (r.json() as Promise<DroitsTableau | null>) : null))
          .then((d) => {
            droits = d
            surEtat()
          })
          .catch(() => {})
      }
      const provider: HocuspocusProvider = new HocuspocusProvider({
        websocketProvider: socket(),
        name: `tableau:${id}`,
        document: doc,
        onAuthenticated: ({ scope }) => {
          lecture = scope === 'readonly'
          refuse = false
          lireDroits()
          surEtat()
        },
        onAuthenticationFailed: () => {
          refuse = true
          lecture = true
          // On cesse de redemander : un accès retiré ne revient pas en insistant.
          queueMicrotask(() => provider.detach())
          surEtat()
          options.surRefus?.(id)
        },
        onSynced: ({ state }) => {
          synchro = state
          surEtat()
        },
        onUnsyncedChanges: () => {
          const avant = enAttente
          enAttente = provider.hasUnsyncedChanges
          if (enAttente !== avant) surEtat()
        },
        onStatus: () => surEtat(),
        onClose: () => {
          // Le serveur ferme ce seul document quand le rôle change ou que l'accès est retiré. La prise reste
          // ouverte et le provider ne redemande rien : on se rattache pour relire le rôle (ou le refus).
          if (refuse || socket().status !== WebSocketStatus.Connected) return
          queueMicrotask(() => {
            provider.detach()
            provider.attach()
          })
        },
      })
      // Le socket est partagé : le provider ne s'y accroche pas tout seul.
      provider.attach()
      return {
        awareness: provider.awareness,
        lectureSeule: () => lecture,
        droits: () => droits,
        refuse: () => refuse,
        synchronise: () => synchro,
        enLigne: () => socket().status === WebSocketStatus.Connected,
        enAttente: () => enAttente,
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
        throw new Error(t('reseau.absent'))
      }
      if (r.ok) return
      throw Object.assign(new Error(t('reseau.refuse', { statut: r.status })), { definitif: r.status >= 400 && r.status < 500 })
    },

    fermer() {
      prise?.destroy()
      prise = undefined
    },
  }
}
