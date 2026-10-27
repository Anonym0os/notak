import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import type { Connexion, Reseau } from './coeur/espaceDistant'
import { ORIGINE_DOSSIER } from './dossier/coffre'
import { idReserve } from './coeur/idsReserves'
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
/** L'identifiant réservé à l'index de l'espace, là où il voyage comme un tableau (un dossier synchronisé). */
export const ID_INDEX = 'espace'
/** Le canal où chaque onglet annonce les tableaux qu'il vient de changer (pour qui les recopie ailleurs). */
const CANAL_CHANGEMENTS = (prefixe: string) => `${prefixe}changements`

export interface ReseauLocal extends Reseau {
  /**
   * Ouvre un tableau hors de la toile, le temps de `f` (la recherche, l'export, un fichier qu'on rouvre). Ce que
   * `f` y écrit est gardé, et atteint les onglets où il est ouvert.
   */
  avec<T>(id: Id, f: (doc: Y.Doc) => T): Promise<T>
  /**
   * Les tableaux que quelqu'un vient de changer, dans cet onglet ou un autre (pas ce que le dossier synchronisé vient
   * d'apporter). Rend de quoi cesser d'écouter.
   */
  ecouterChangements(f: (id: Id) => void): () => void
}

export interface OptionsReseauLocal {
  index: IndexEspace
  /** Le début du nom des bases IndexedDB (`notak:local:` par défaut). */
  prefixe?: string
}

/** Garde un document dans IndexedDB et le relie aux autres onglets. Rend la persistance et de quoi tout arrêter. */
function garder(prefixe: string, id: Id, doc: Y.Doc, index: IndexEspace) {
  // Un nom réservé (`/t/fichiers`, une copie trafiquée) n'ouvre jamais une base de l'espace : le document reste en
  // mémoire, vide, et rien ne s'écrit.
  if (idReserve(id)) return { persistance: { whenSynced: Promise.resolve() }, arreter: () => {} }
  const persistance = new IndexeddbPersistence(NOM_BASE(prefixe, id), doc)
  // y-indexeddb n'écrit qu'une fois sa base ouverte (il y range alors tout l'état du document) : fermé avant, il
  // perdrait ce qu'on vient d'écrire. On ne le ferme donc qu'une fois chargé, même si le document part avant.
  doc.off('destroy', persistance.destroy)
  const avecCanaux = typeof BroadcastChannel === 'function'
  const canal = avecCanaux ? new BroadcastChannel(NOM_BASE(prefixe, id)) : null
  const changements = avecCanaux ? new BroadcastChannel(CANAL_CHANGEMENTS(prefixe)) : null
  const envoyer = (maj: Uint8Array, origine: unknown) => {
    if (origine === ORIGINE_ONGLET) return
    canal?.postMessage(maj)
    if (origine !== ORIGINE_DOSSIER) changements?.postMessage(id)
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
      changements?.close()
      void persistance.whenSynced.then(() => persistance.destroy())
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

    ecouterChangements(f) {
      if (typeof BroadcastChannel !== 'function') return () => {}
      const c = new BroadcastChannel(CANAL_CHANGEMENTS(prefixe))
      c.onmessage = (e: MessageEvent) => typeof e.data === 'string' && f(e.data)
      return () => c.close()
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
  const persistance = new IndexeddbPersistence(NOM_BASE(prefixe, ID_INDEX), doc)
  const avecCanaux = typeof BroadcastChannel === 'function'
  const canal = avecCanaux ? new BroadcastChannel(NOM_BASE(prefixe, ID_INDEX)) : null
  const changements = avecCanaux ? new BroadcastChannel(CANAL_CHANGEMENTS(prefixe)) : null
  const envoyer = (maj: Uint8Array, origine: unknown) => {
    if (origine === ORIGINE_ONGLET) return
    canal?.postMessage(maj)
    if (origine !== ORIGINE_DOSSIER) changements?.postMessage(ID_INDEX)
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
      changements?.close()
      void persistance.destroy()
      doc.destroy()
    },
  }
}
