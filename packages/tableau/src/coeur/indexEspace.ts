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
  /**
   * L'accueil de cet appareil est vide : il s'efface devant celui d'un autre (un dossier qu'on rejoint). Tant que
   * rien ne l'a remplacé, `racine()` rend toujours l'ancien ; `garderAccueil` le remet s'il n'en est venu aucun.
   */
  cederAccueil(): void
  garderAccueil(): void
  /** Ce tableau n'est plus listé (un accueil vide qu'une copie rouverte a remplacé). */
  retirer(id: Id): void
  ecouter(f: () => void): () => void
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * L'index posé sur `doc`, chargé au préalable (un index vide reçoit un accueil neuf).
 *
 * L'accueil se choisit parmi des candidats (`meta.accueils` : un par appareil qui en a créé un) par une règle que
 * tous les appareils appliquent pareil : le plus ancien de ceux qui ne se sont pas retirés. Un accueil vide se
 * retire quand son appareil rejoint un dossier qui en a déjà un : l'accueil qui contient quelque chose l'emporte
 * toujours, quel que soit l'ordre dans lequel les appareils s'entendent.
 */
export function creerIndexEspace(doc: Y.Doc, maintenant: () => number = Date.now): IndexEspace {
  const tableaux = doc.getMap<unknown>('tableaux')
  const meta = doc.getMap<unknown>('meta')
  const accueils = doc.getMap<unknown>('accueils')

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
  const candidats = () =>
    [...accueils.entries()].flatMap(([id, v]) =>
      estObjet(v) ? [{ id, cree: typeof v.cree === 'number' ? v.cree : 0, retire: v.retire === true }] : [],
    )
  const avant = (a: { id: string; cree: number }, b: { id: string; cree: number }) => a.cree - b.cree || (a.id < b.id ? -1 : 1)

  if (candidats().length === 0) {
    const id = nouvelId()
    const t = maintenant()
    doc.transact(() => {
      accueils.set(id, { cree: t })
      ecrire({ id, titre: '', cree: t })
    })
  }
  /** Mon accueil : celui que cet appareil a créé ou adopté (le dernier retenu ici). */
  let mien = [...candidats()].sort(avant)[0]!.id
  const racine = () => {
    const tous = candidats().sort(avant)
    return (tous.find((c) => !c.retire) ?? tous[0])?.id ?? mien
  }

  return {
    doc,
    racine,
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
      const ancien = racine()
      doc.transact(() => {
        for (const c of candidats()) accueils.set(c.id, { cree: c.cree, retire: true })
        accueils.set(id, { cree: maintenant() })
        if (id !== ancien) mien = id
        const e = lire(id)
        if (e?.parent) {
          const { parent: _p, ...sans } = e
          ecrire(sans)
        }
      })
    },
    retirer: (id) => tableaux.delete(id),
    cederAccueil() {
      const c = candidats().find((x) => x.id === mien)
      accueils.set(mien, { cree: c?.cree ?? 0, retire: true })
    },
    garderAccueil() {
      if (candidats().some((c) => !c.retire)) return
      const c = candidats().find((x) => x.id === mien)
      accueils.set(mien, { cree: c?.cree ?? 0 })
    },
    ecouter(f) {
      const g = () => f()
      doc.on('update', g)
      return () => doc.off('update', g)
    },
  }
}
