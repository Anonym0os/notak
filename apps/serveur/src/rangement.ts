import type { Base } from './base.ts'
import { ROLES, type Role, roleDeRelation } from './droits.ts'

/**
 * Ce que change, pour les autres, le rangement d'une toile sous une autre : elle hérite des droits de ce qui est
 * au-dessus d'elle (`autorisation/modele.fga`), si bien que la ranger ailleurs ouvre ou ferme son contenu. On compare ce
 * que chacun reçoit d'elle avant et après, d'après les relations posées : les droits donnés sur elle et sur chaque toile
 * au-dessus, leurs échéances, et les blocages (un blocage plus haut vaut pour elle, sauf s'il est levé en dessous).
 */

/** Ce qu'un sujet reçoit sur la toile : son meilleur rôle, et s'il le garde sans échéance. */
interface Recu {
  role: Role
  permanent: boolean
}

export interface Bilan {
  /** Personnes et équipes qui la verraient sans la voir aujourd'hui. */
  nouveaux: number
  /** Celles qui la voient et ne la verraient plus. */
  perdus: number
  /** Celles dont l'accès, aujourd'hui limité dans le temps, deviendrait permanent. */
  permanents: number
  /** Liens de visiteurs, donnés plus haut, qui y mèneraient. */
  liensOuverts: number
  /** Liens de visiteurs qui y mènent et n'y mèneraient plus. */
  liensEteints: number
}

export const AUCUN_CHANGEMENT: Bilan = { nouveaux: 0, perdus: 0, permanents: 0, liensOuverts: 0, liensEteints: 0 }
export const rienNeChange = (b: Bilan) => Object.values(b).every((n) => n === 0)

/** Les toiles au-dessus de `depart`, lui compris, de proche en proche jusqu'en haut. */
export function chaine(base: Pick<Base, 'tableau'>, depart: string | null): string[] {
  const vues: string[] = []
  for (let t = depart; t !== null && !vues.includes(t) && vues.length < 1000; t = base.tableau(t)?.parent ?? null) vues.push(t)
  return vues
}

/** Un blocage posé pour `pose` atteint-il ce sujet ? « Tout le monde » s'écrit `user:*` pour les comptes, `lien:*` pour les liens. */
const atteint = (pose: string, sujet: string) =>
  pose === sujet || (pose === 'user:*' && (sujet.startsWith('user:') || sujet.startsWith('equipe:'))) || (pose === 'lien:*' && sujet.startsWith('lien:'))

/**
 * Ce que chaque sujet (personne, équipe, lien) reçoit sur la toile `id` posée sous `dessus` (de la plus proche à la
 * plus haute) : le meilleur des rôles donnés sur elle et au-dessus, s'il ne le perd pas à une échéance, moins ce qu'un
 * blocage lui retire. Le propriétaire ne se bloque pas.
 */
export function recus(base: Pick<Base, 'relationsSur' | 'echeance'>, id: string, dessus: readonly string[]): Map<string, Recu> {
  const niveaux = [id, ...dessus]
  const relations = niveaux.map((t) => base.relationsSur(`tableau:${t}`))
  const sortie = new Map<string, Recu>()
  niveaux.forEach((t, i) => {
    for (const r of relations[i]!) {
      const role = roleDeRelation(r.relation)
      if (!role) continue
      const permanent = base.echeance(t, r.sujet) === null
      const avant = sortie.get(r.sujet)
      if (!avant || ROLES.indexOf(role) > ROLES.indexOf(avant.role)) sortie.set(r.sujet, { role, permanent })
      else if (role === avant.role && permanent) avant.permanent = true
    }
  })
  const bloque = (sujet: string) => {
    // Du plus haut vers la toile : bloqué là où on le bloque, et en dessous tant qu'on ne le lève pas.
    let etat = false
    for (let i = niveaux.length - 1; i >= 0; i--) {
      const ici = relations[i]!
      if (ici.some((r) => r.relation === 'bloque' && atteint(r.sujet, sujet))) etat = true
      else if (ici.some((r) => r.relation === 'debloque' && atteint(r.sujet, sujet))) etat = false
    }
    return etat
  }
  for (const [sujet, recu] of sortie) if (recu.role !== 'proprietaire' && bloque(sujet)) sortie.delete(sujet)
  return sortie
}

/**
 * Ce que change le rangement de la toile `id`, aujourd'hui sous `ancien`, sous `nouveau`. `epargnes` : les sujets à
 * laisser de côté (celui qui range, et les membres de l'espace, dont l'accès vient de l'espace, qui ne change pas).
 */
export function bilanDuRangement(
  base: Pick<Base, 'tableau' | 'relationsSur' | 'echeance'>,
  id: string,
  ancien: string | null,
  nouveau: string,
  epargne: (sujet: string) => boolean,
): Bilan {
  const avant = recus(base, id, chaine(base, ancien))
  const apres = recus(base, id, chaine(base, nouveau))
  const b = { ...AUCUN_CHANGEMENT }
  for (const sujet of new Set([...avant.keys(), ...apres.keys()])) {
    if (epargne(sujet)) continue
    const [a, p] = [avant.get(sujet), apres.get(sujet)]
    if (sujet.startsWith('lien:')) {
      if (!a && p) b.liensOuverts++
      else if (a && !p) b.liensEteints++
    } else if (!a && p) b.nouveaux++
    else if (a && !p) b.perdus++
    else if (a && p && !a.permanent && p.permanent) b.permanents++
  }
  return b
}
