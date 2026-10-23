import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import type { Connexion, Reseau } from './coeur/espaceDistant'
import { type IndexEspace, creerIndexEspace } from './coeur/indexEspace'
import type { Id } from './coeur/tableau'

/**
 * Le réseau de l'édition locale : il n'y en a pas. Chaque tableau est un document Yjs gardé dans IndexedDB, et les
 * onglets ouverts sur le même tableau s'échangent leurs changements par un `BroadcastChannel`. « Déclarer » un
 * tableau, c'est l'inscrire dans l'index de l'espace.
 */

/** L'origine des changements reçus d'un autre onglet : ils n'y repartent pas. */
const ORIGINE_ONGLET = 'notak:onglet'
const NOM_BASE = (prefixe: string, id: Id) => `${prefixe}${id}`

export interface ReseauLocal extends Reseau {
  /**
   * Ouvre un tableau hors de la toile, le temps de `f` (la recherche, l'export, un fichier qu'on rouvre). Ce que
   * `f` y écrit est gardé, et atteint les onglets où il est ouvert.
   */
  avec<T>(id: Id, f: (doc: Y.Doc) => T): Promise<T>
}

export interface OptionsReseauLocal {
  index: IndexEspace
  /** Le début du nom des bases IndexedDB (`notak:local:` par défaut). */
  prefixe?: string
}

/** Garde un document dans IndexedDB et le relie aux autres onglets. Rend la persistance et de quoi tout arrêter. */
function garder(prefixe: string, id: Id, doc: Y.Doc, index: IndexEspace) {
  const persistance = new IndexeddbPersistence(NOM_BASE(prefixe, id), doc)
  const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NOM_BASE(prefixe, id)) : null
  const envoyer = (maj: Uint8Array, origine: unknown) => {
    if (origine !== ORIGINE_ONGLET) canal?.postMessage(maj)
  }
  doc.on('update', envoyer)
  if (canal) canal.onmessage = (e: MessageEvent) => Y.applyUpdate(doc, new Uint8Array(e.data as ArrayBuffer), ORIGINE_ONGLET)
  // Le titre et la couleur vivent dans le tableau ; l'index en garde une copie, pour lister sans tout ouvrir.
  const meta = doc.getMap<unknown>('meta')
  const noter = () => {
    const titre = meta.get('titre')
    const couleur = meta.get('couleur')
    if (typeof titre === 'string') index.noterTitre(id, titre, typeof couleur === 'string' ? couleur : undefined)
  }
  meta.observe(noter)
  void persistance.whenSynced.then(noter)
  return {
    persistance,
    arreter() {
      meta.unobserve(noter)
      doc.off('update', envoyer)
      canal?.close()
      void persistance.destroy()
    },
  }
}

export function creerReseauLocal({ index, prefixe = 'notak:local:' }: OptionsReseauLocal): ReseauLocal {
  const charges = new Map<Id, Promise<unknown>>()
  return {
    persister(id, doc) {
      const g = garder(prefixe, id, doc, index)
      charges.set(id, g.persistance.whenSynced)
      return () => {
        charges.delete(id)
        g.arreter()
      }
    },

    connecter(id, _doc, surEtat): Connexion {
      let pret = false
      void (charges.get(id) ?? Promise.resolve()).then(() => {
        pret = true
        surEtat()
      })
      return {
        awareness: null,
        lectureSeule: () => false,
        refuse: () => false,
        synchronise: () => pret,
        detruire: () => {},
      }
    },

    async declarer(id, titre, parent) {
      index.declarer(id, titre, parent)
    },

    async avec(id, f) {
      const doc = new Y.Doc()
      const g = garder(prefixe, id, doc, index)
      try {
        await g.persistance.whenSynced
        return f(doc)
      } finally {
        g.arreter()
        doc.destroy()
      }
    },
  }
}

/**
 * Ouvre l'index de l'espace local (gardé et relié aux autres onglets comme un tableau), une fois chargé : un index
 * vide reçoit alors un tableau d'accueil.
 */
export async function ouvrirIndexLocal(prefixe = 'notak:local:', maintenant: () => number = Date.now) {
  const doc = new Y.Doc()
  const persistance = new IndexeddbPersistence(NOM_BASE(prefixe, 'espace'), doc)
  const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NOM_BASE(prefixe, 'espace')) : null
  const envoyer = (maj: Uint8Array, origine: unknown) => {
    if (origine !== ORIGINE_ONGLET) canal?.postMessage(maj)
  }
  doc.on('update', envoyer)
  if (canal) canal.onmessage = (e: MessageEvent) => Y.applyUpdate(doc, new Uint8Array(e.data as ArrayBuffer), ORIGINE_ONGLET)
  await persistance.whenSynced
  const index = creerIndexEspace(doc, maintenant)
  return {
    index,
    fermer() {
      doc.off('update', envoyer)
      canal?.close()
      void persistance.destroy()
      doc.destroy()
    },
  }
}
