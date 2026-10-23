import * as Y from 'yjs'
import { type Id, nouvelId } from './tableau'

/**
 * L'index d'un espace local : la liste de ses tableaux, leur parent, leur titre (une copie, pour les lister sans
 * ouvrir chacun), et quel tableau est l'accueil. Sur un serveur, c'est la base de données qui le tient ; sans
 * serveur, c'est un document Yjs de plus, gardé comme les tableaux et qui se fusionne de la même façon (deux
 * onglets, ou un fichier `.notak` qu'on rouvre).
 */
export interface EntreeIndex {
  id: Id
  titre: string
  parent?: Id
  couleur?: string
  /** Quand il a été créé (ms). */
  cree: number
}

export interface IndexEspace {
  readonly doc: Y.Doc
  /** Le tableau d'accueil. */
  racine(): Id
  /** Les tableaux connus, du plus ancien au plus récent. */
  lister(): EntreeIndex[]
  entree(id: Id): EntreeIndex | undefined
  /** Un tableau de plus (ou un tableau déjà connu, dont on complète l'entrée). */
  declarer(id: Id, titre: string, parent?: Id): void
  /** Le titre et la couleur ont changé dans le tableau lui-même. */
  noterTitre(id: Id, titre: string, couleur?: string): void
  /** Quand la dernière copie de l'espace (fichier `.notak`) a été faite (ms). */
  derniereCopie(): number | undefined
  noterCopie(quand: number): void
  /** Un autre tableau devient l'accueil (une copie rouverte dans un navigateur encore vide). */
  changerRacine(id: Id): void
  /** Ce tableau n'est plus listé (un accueil vide qu'une copie rouverte a remplacé). */
  retirer(id: Id): void
  ecouter(f: () => void): () => void
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * L'index posé sur `doc`, chargé au préalable (sa racine en dépend : un index vide en reçoit une neuve). Deux
 * onglets qui créent chacun une racine en même temps finissent d'accord sur l'une des deux (la dernière écriture de
 * `meta.racine` l'emporte) ; l'autre reste un tableau ordinaire.
 */
export function creerIndexEspace(doc: Y.Doc, maintenant: () => number = Date.now): IndexEspace {
  const tableaux = doc.getMap<unknown>('tableaux')
  const meta = doc.getMap<unknown>('meta')

  const lire = (id: Id): EntreeIndex | undefined => {
    const v = tableaux.get(id)
    if (!estObjet(v)) return undefined
    return {
      id,
      titre: typeof v.titre === 'string' ? v.titre : '',
      ...(typeof v.parent === 'string' ? { parent: v.parent } : {}),
      ...(typeof v.couleur === 'string' ? { couleur: v.couleur } : {}),
      cree: typeof v.cree === 'number' ? v.cree : 0,
    }
  }
  const ecrire = (e: EntreeIndex) => {
    const { id, ...reste } = e
    tableaux.set(id, reste)
  }

  if (typeof meta.get('racine') !== 'string') {
    const id = nouvelId()
    doc.transact(() => {
      meta.set('racine', id)
      ecrire({ id, titre: '', cree: maintenant() })
    })
  }

  return {
    doc,
    racine: () => meta.get('racine') as Id,
    lister: () =>
      [...tableaux.keys()]
        .map(lire)
        .filter((e): e is EntreeIndex => !!e)
        .sort((a, b) => a.cree - b.cree || (a.id < b.id ? -1 : 1)),
    entree: lire,
    declarer(id, titre, parent) {
      const avant = lire(id)
      ecrire({ ...avant, id, titre: avant?.titre || titre, ...(parent ? { parent } : {}), cree: avant?.cree ?? maintenant() })
    },
    noterTitre(id, titre, couleur) {
      const avant = lire(id) ?? { id, titre: '', cree: maintenant() }
      if (avant.titre === titre && avant.couleur === couleur) return
      const { couleur: _c, ...sans } = avant
      ecrire({ ...sans, titre, ...(couleur ? { couleur } : {}) })
    },
    derniereCopie: () => {
      const v = meta.get('derniereCopie')
      return typeof v === 'number' ? v : undefined
    },
    noterCopie: (quand) => meta.set('derniereCopie', quand),
    changerRacine(id) {
      doc.transact(() => {
        meta.set('racine', id)
        const e = lire(id)
        if (e?.parent) {
          const { parent: _p, ...sans } = e
          ecrire(sans)
        }
      })
    },
    retirer: (id) => tableaux.delete(id),
    ecouter(f) {
      const g = () => f()
      doc.on('update', g)
      return () => doc.off('update', g)
    },
  }
}
