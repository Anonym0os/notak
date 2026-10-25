import type { EntreeBibliotheque } from '../api'
import { cleDe } from './selection'

/**
 * Ce qu'on vient de faire, montré tout de suite. La bibliothèque vient du serveur, qui ne relit une toile que quelques
 * secondes après qu'elle a changé : jusque-là, chaque geste pose un correctif sur ce qu'il a rendu. Un correctif ne
 * fait que dire où l'on veut arriver, si bien qu'il ne change rien à une liste qui y est déjà ; il s'efface quand le
 * serveur a eu le temps de suivre.
 */
export type Correctif =
  | { type: 'retirer'; cles: string[] }
  | { type: 'ajouter'; entrees: EntreeBibliotheque[] }
  /** Une entrée passée ailleurs : sous une autre clé (un élément recréé), ou dans un autre dossier. */
  | { type: 'remplacer'; de: string; par: EntreeBibliotheque }
  | { type: 'changer'; cle: string; champs: Partial<Pick<EntreeBibliotheque, 'titre' | 'favori' | 'dans' | 'ou'>> }

/** Le temps laissé au serveur pour suivre : son enregistrement attend au plus dix secondes après le dernier geste. */
export const DUREE_CORRECTIF = 14_000

export function corriger(entrees: readonly EntreeBibliotheque[], c: Correctif): EntreeBibliotheque[] {
  switch (c.type) {
    case 'retirer': {
      const cles = new Set(c.cles)
      return entrees.filter((e) => !cles.has(cleDe(e)))
    }
    case 'ajouter': {
      const la = new Set(entrees.map(cleDe))
      return [...entrees, ...c.entrees.filter((e) => !la.has(cleDe(e)))]
    }
    case 'remplacer': {
      const nouvelle = cleDe(c.par)
      const deja = entrees.some((e) => cleDe(e) === nouvelle)
      return entrees.flatMap((e) => {
        const cle = cleDe(e)
        if (cle === c.de && cle !== nouvelle) return deja ? [] : [c.par]
        if (cle === nouvelle) return [{ ...e, dans: c.par.dans, ou: c.par.ou }]
        return [e]
      })
    }
    case 'changer':
      return entrees.map((e) => (cleDe(e) === c.cle ? { ...e, ...c.champs } : e))
  }
}

/** La liste du serveur, avec les correctifs encore en cours, dans l'ordre où on les a posés. */
export const avecCorrectifs = (entrees: readonly EntreeBibliotheque[], correctifs: readonly { correctif: Correctif }[]) =>
  correctifs.reduce<EntreeBibliotheque[]>((l, x) => corriger(l, x.correctif), [...entrees])
