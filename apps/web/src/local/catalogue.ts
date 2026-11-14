import { type Id, type ResumeContenu, type SuiviTableaux, lireTableau, resumesDuTableau, texteCherchableLu } from '@notak/tableau'
import type * as Y from 'yjs'

/**
 * Le catalogue de l'app : ce que la bibliothèque montre de chaque toile (ses résumés, `resumesDuTableau`) et le texte
 * qu'on y cherche, gardés dans IndexedDB à mesure que les toiles changent. La bibliothèque s'ouvre ainsi sans rouvrir
 * chaque toile, et la recherche lit des textes déjà prêts. Le réseau local le prévient de chaque changement (un geste
 * ici, un autre onglet, le dossier synchronisé : `SuiviTableaux`) ; une toile qu'il ne connaît pas encore (d'avant
 * lui, ou changée quand l'app s'est arrêtée avant de la relire) se lit une fois, à la demande (`completer`).
 */

/** Ce que la bibliothèque sait d'une toile. Une fiche d'une autre version de ce format se relit. */
export interface FicheToile {
  id: Id
  version: number
  resumes: ResumeContenu[]
  /** Quand elle a été lue (ms). */
  lue: number
}

/** Le texte qu'on peut chercher dans chaque élément d'une toile (hors corbeille), et son titre. */
export interface TextesToile {
  id: Id
  titre: string
  elements: [element: Id, texte: string][]
}

/** Le format des fiches : à changer quand `resumesDuTableau` rend autre chose, pour que tout se relise. */
export const VERSION_FICHE = 3
const BASE = 'notak:local:catalogue'
/** Les toiles changées et pas encore relues : retenues tout de suite, pour qu'un arrêt brutal ne les perde pas. */
const CLE_A_RELIRE = 'notak:local:catalogue:a-relire'

export interface CatalogueLocal extends SuiviTableaux {
  /** Les fiches gardées, par toile. */
  fiches(): Promise<Map<Id, FicheToile>>
  /** Les textes gardés, par toile. */
  textes(): Promise<Map<Id, TextesToile>>
  /** Les toiles de cette liste qui n'ont pas de fiche à jour : à lire avant de les montrer. */
  manquantes(ids: readonly Id[]): Promise<Id[]>
  /** Lit ces toiles, une à une, par `lire` (qui ouvre le document le temps de `f`), puis prévient. */
  completer(ids: readonly Id[], lire: <T>(id: Id, f: (doc: Y.Doc) => T) => Promise<T>): Promise<void>
  /** Prévenu quand une fiche change, ici ou dans un autre onglet. */
  ecouter(f: (id: Id) => void): () => void
}

function ouvrirBase(nom: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(nom, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('fiches', { keyPath: 'id' })
      r.result.createObjectStore('textes', { keyPath: 'id' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

const lireARelire = (): Set<Id> => {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_A_RELIRE) ?? '[]') as unknown
    return new Set(Array.isArray(brut) ? brut.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}
const ecrireARelire = (ids: Set<Id>) => {
  try {
    if (ids.size === 0) localStorage.removeItem(CLE_A_RELIRE)
    else localStorage.setItem(CLE_A_RELIRE, JSON.stringify([...ids]))
  } catch {
    // Sans stockage, la prochaine ouverture relira ce qui manque, faute de mieux.
  }
}

/** Ce que dit une toile, lue dans son document : sa fiche et ses textes. */
export function lireFiche(id: Id, doc: Y.Doc, titreDe: (id: Id) => string | undefined, maintenant = Date.now()): { fiche: FicheToile; textes: TextesToile } {
  const lu = lireTableau(doc)
  const elements: [Id, string][] = []
  for (const e of lu.elements) {
    if (e.corbeille !== undefined) continue
    const texte = texteCherchableLu(e, titreDe).trim()
    if (texte) elements.push([e.id, texte])
  }
  return { fiche: { id, version: VERSION_FICHE, resumes: resumesDuTableau(lu), lue: maintenant }, textes: { id, titre: lu.titre, elements } }
}

/**
 * Le catalogue d'un espace local. `titreDe` donne le titre d'une toile (le texte de sa carte, pour la recherche) ;
 * `base` change le nom de la base (les essais en ont une chacun).
 */
export function creerCatalogue({ titreDe, base = BASE }: { titreDe: (id: Id) => string | undefined; base?: string }): CatalogueLocal {
  const db = typeof indexedDB === 'undefined' ? Promise.reject(new Error('IndexedDB')) : ouvrirBase(base)
  // Sans IndexedDB (une navigation privée qui le refuse), le catalogue reste vide : la bibliothèque lit les toiles.
  db.catch(() => {})
  const ecouteurs = new Set<(id: Id) => void>()
  const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`${base}:changements`) : null
  if (canal) canal.onmessage = (e: MessageEvent) => typeof e.data === 'string' && ecouteurs.forEach((f) => f(e.data as string))
  const prevenir = (id: Id) => {
    for (const f of [...ecouteurs]) f(id)
    canal?.postMessage(id)
  }

  const transaction = async <T>(magasins: string[], mode: IDBTransactionMode, f: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> => {
    const base = await db
    return new Promise((resolve, reject) => {
      const t = base.transaction(magasins, mode)
      const r = f(t)
      t.oncomplete = () => resolve(r ? r.result : undefined)
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  }
  const tout = async <T extends { id: Id }>(magasin: string): Promise<Map<Id, T>> => {
    const lus = await transaction<T[]>([magasin], 'readonly', (t) => t.objectStore(magasin).getAll()).catch(() => [] as T[])
    return new Map((lus ?? []).map((x) => [x.id, x]))
  }

  const garder = async (id: Id, doc: Y.Doc) => {
    const { fiche, textes } = lireFiche(id, doc, titreDe)
    await transaction(['fiches', 'textes'], 'readwrite', (t) => {
      t.objectStore('fiches').put(fiche)
      t.objectStore('textes').put(textes)
    })
    const aRelire = lireARelire()
    if (aRelire.delete(id)) ecrireARelire(aRelire)
    prevenir(id)
  }

  return {
    change(id) {
      const aRelire = lireARelire()
      if (aRelire.has(id)) return
      aRelire.add(id)
      ecrireARelire(aRelire)
    },
    relire(id, doc) {
      // Relue maintenant, pendant que le document est encore là (à la fermeture, il part juste après).
      try {
        void garder(id, doc).catch(() => {})
      } catch {
        // Un document illisible garde sa marque « à relire » : on réessaiera.
      }
    },
    fiches: () => tout<FicheToile>('fiches'),
    textes: () => tout<TextesToile>('textes'),
    async manquantes(ids) {
      const connues = await tout<FicheToile>('fiches')
      const aRelire = lireARelire()
      return ids.filter((id) => aRelire.has(id) || connues.get(id)?.version !== VERSION_FICHE)
    },
    async completer(ids, lire) {
      for (const id of ids) await lire(id, (doc) => garder(id, doc)).catch(() => {})
    },
    ecouter(f) {
      ecouteurs.add(f)
      return () => void ecouteurs.delete(f)
    },
  }
}
