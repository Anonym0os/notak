import type { Base } from './base.ts'
import { ROLES, type Role, roleDeRelation } from './droits.ts'
import { relationPrivee } from './prive.ts'

/**
 * Ce que change, pour les autres, le rangement d'une toile sous une autre : elle hérite des droits de ce qui est
 * au-dessus d'elle (`autorisation/modele.fga`), si bien que la ranger ailleurs ouvre ou ferme son contenu. On compare ce
 * que chacun reçoit d'elle avant et après, d'après les relations posées : les droits donnés sur elle et sur chaque toile
 * au-dessus, leurs échéances, et les blocages (un blocage plus haut vaut pour elle, sauf s'il est levé en dessous). Les
 * membres d'un espace d'équipe la lisent en plus par leur rôle, sauf sous une toile privée : la ranger sous une toile
 * privée la ferme à ceux qui n'y sont pas invités, l'en sortir la leur rouvre.
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
  /** Membres de l'espace qui la voient et ne la verraient plus : elle passe sous une toile privée où ils ne sont pas invités. */
  membresPerdus: number
  /** Membres de l'espace qui la verraient sans la voir aujourd'hui : elle sort d'une toile privée. */
  membresNouveaux: number
}

export const AUCUN_CHANGEMENT: Bilan = { nouveaux: 0, perdus: 0, permanents: 0, liensOuverts: 0, liensEteints: 0, membresPerdus: 0, membresNouveaux: 0 }
export const rienNeChange = (b: Bilan) => Object.values(b).every((n) => n === 0)

type BaseRangement = Pick<Base, 'tableau' | 'relationsSur' | 'relationExiste' | 'echeance'>

/** Les toiles au-dessus de `depart`, lui compris, de proche en proche jusqu'en haut. */
export function chaine(base: Pick<Base, 'tableau'>, depart: string | null): string[] {
  const vues: string[] = []
  for (let t = depart; t !== null && !vues.includes(t) && vues.length < 1000; t = base.tableau(t)?.parent ?? null) vues.push(t)
  return vues
}

/** L'équipe que désigne un sujet de partage (`equipe:<id>#membre`), ou `null`. */
const equipeDe = (sujet: string) => /^equipe:(.+)#membre$/.exec(sujet)?.[1] ?? null

/**
 * Un blocage posé pour `pose` atteint-il ce sujet ? « Tout le monde » s'écrit `user:*` pour les comptes, `lien:*` pour
 * les liens ; une équipe bloquée l'est pour chacun de ses membres.
 */
const atteint = (base: Pick<Base, 'relationExiste'>, pose: string, sujet: string) => {
  if (pose === sujet || (pose === 'user:*' && (sujet.startsWith('user:') || sujet.startsWith('equipe:'))) || (pose === 'lien:*' && sujet.startsWith('lien:'))) return true
  const equipe = equipeDe(pose)
  return equipe !== null && sujet.startsWith('user:') && base.relationExiste({ objet: `equipe:${equipe}`, relation: 'membre', sujet })
}

/** Ce que la toile `id`, posée sous `dessus`, donne à chacun, et ce qui la ferme : ses blocages, et si elle est privée. */
function lecture(base: BaseRangement, id: string, dessus: readonly string[]) {
  const niveaux = [id, ...dessus]
  const relations = niveaux.map((t) => base.relationsSur(`tableau:${t}`))
  const donnes = new Map<string, Recu>()
  niveaux.forEach((t, i) => {
    for (const r of relations[i]!) {
      const role = roleDeRelation(r.relation)
      if (!role) continue
      const permanent = base.echeance(t, r.sujet) === null
      const avant = donnes.get(r.sujet)
      if (!avant || ROLES.indexOf(role) > ROLES.indexOf(avant.role)) donnes.set(r.sujet, { role, permanent })
      else if (role === avant.role && permanent) avant.permanent = true
    }
  })
  const bloque = (sujet: string) => {
    // Du plus haut vers la toile : bloqué là où on le bloque, et en dessous tant qu'on ne le lève pas.
    let etat = false
    for (let i = niveaux.length - 1; i >= 0; i--) {
      const ici = relations[i]!
      if (ici.some((r) => r.relation === 'bloque' && atteint(base, r.sujet, sujet))) etat = true
      else if (ici.some((r) => r.relation === 'debloque' && atteint(base, r.sujet, sujet))) etat = false
    }
    return etat
  }
  // Le propriétaire ne se bloque pas.
  for (const [sujet, recu] of donnes) if (recu.role !== 'proprietaire' && bloque(sujet)) donnes.delete(sujet)
  return { donnes, bloque, privee: niveaux.some((t) => base.relationExiste(relationPrivee(t))) }
}

/**
 * Ce que chaque sujet (personne, équipe, lien) reçoit sur la toile `id` posée sous `dessus` (de la plus proche à la
 * plus haute) : le meilleur des rôles donnés sur elle et au-dessus, s'il ne le perd pas à une échéance, moins ce qu'un
 * blocage lui retire. Le propriétaire ne se bloque pas.
 */
export function recus(base: BaseRangement, id: string, dessus: readonly string[]): Map<string, Recu> {
  return lecture(base, id, dessus).donnes
}

/** Ce qu'un membre de l'espace tient de son rôle sur les toiles de l'espace : la lecture (ou plus), la possession, ou rien. */
type ParRole = 'lit' | 'possede' | null

/** Ce que donne chaque relation de l'espace à ses rôles (`espaces.ts`) : toutes font lire, l'administration fait posséder. */
const LIRE_PAR_ROLE = new Set(['lit_tableaux', 'commente_tableaux', 'modifie_tableaux', 'administre_tableaux'])

/** Les membres d'un espace (`user:<id>`), avec ce que leur rôle leur donne sur ses toiles. */
export function membresParRole(base: Pick<Base, 'relationsSur'>, espace: string): Map<string, ParRole> {
  const surEspace = base.relationsSur(`espace:${espace}`)
  const membres = new Map<string, ParRole>(surEspace.flatMap((r) => (r.relation === 'membre' ? [[r.sujet, null] as const] : [])))
  for (const r of surEspace) {
    if (!LIRE_PAR_ROLE.has(r.relation) || !r.sujet.endsWith('#assignee')) continue
    const parRole: ParRole = r.relation === 'administre_tableaux' ? 'possede' : 'lit'
    for (const a of base.relationsSur(r.sujet.slice(0, -'#assignee'.length))) {
      if (a.relation !== 'assignee' || !membres.has(a.sujet) || membres.get(a.sujet) === 'possede') continue
      membres.set(a.sujet, parRole)
    }
  }
  return membres
}

/**
 * Ce que change le rangement de la toile `id`, aujourd'hui sous `ancien`, sous `nouveau`, pour tous sauf `qui` (celui
 * qui range). `espace` : l'espace d'équipe de la toile, dont les membres la lisent aussi par leur rôle ; `null` pour un
 * espace personnel, où seul compte ce qu'on a partagé.
 */
export function bilanDuRangement(base: BaseRangement, id: string, ancien: string | null, nouveau: string, qui: string, espace: string | null): Bilan {
  const avant = lecture(base, id, chaine(base, ancien))
  const apres = lecture(base, id, chaine(base, nouveau))
  const membres = espace ? membresParRole(base, espace) : new Map<string, ParRole>()
  const b = { ...AUCUN_CHANGEMENT }
  // Ce qu'on a partagé, à qui n'est pas de l'espace : une personne, une équipe, un lien.
  for (const sujet of new Set([...avant.donnes.keys(), ...apres.donnes.keys()])) {
    if (sujet === qui || membres.has(sujet)) continue
    const [a, p] = [avant.donnes.get(sujet), apres.donnes.get(sujet)]
    if (sujet.startsWith('lien:')) {
      if (!a && p) b.liensOuverts++
      else if (a && !p) b.liensEteints++
    } else if (!a && p) b.nouveaux++
    else if (a && !p) b.perdus++
    else if (a && p && !a.permanent && p.permanent) b.permanents++
  }
  // Chaque membre de l'espace : ce que lui donne son rôle, hors d'une toile privée, et ce qu'on lui a partagé, à lui ou
  // à une de ses équipes ; un blocage le lui retire, sauf ce qui le fait posséder.
  const membreDe = (s: string, sujet: string) => {
    const equipe = equipeDe(s)
    return equipe !== null && base.relationExiste({ objet: `equipe:${equipe}`, relation: 'membre', sujet })
  }
  const recu = (l: ReturnType<typeof lecture>, sujet: string, parRole: ParRole): { permanent: boolean } | null => {
    const role = parRole !== null && !l.privee && (parRole === 'possede' || !l.bloque(sujet))
    const partages = [...l.donnes].filter(([s, r]) => (s === sujet || membreDe(s, sujet)) && (r.role === 'proprietaire' || !l.bloque(sujet)))
    if (!role && partages.length === 0) return null
    return { permanent: role || partages.some(([, r]) => r.permanent) }
  }
  // Sous une toile privée, ou sortie d'une, la ligne le dit à part ; un autre changement compte avec les personnes.
  const fermee = !avant.privee && apres.privee
  const rouverte = avant.privee && !apres.privee
  for (const [sujet, parRole] of membres) {
    if (sujet === qui) continue
    const [a, p] = [recu(avant, sujet, parRole), recu(apres, sujet, parRole)]
    if (a && !p) b[fermee ? 'membresPerdus' : 'perdus']++
    else if (!a && p) b[rouverte ? 'membresNouveaux' : 'nouveaux']++
    else if (a && p && !a.permanent && p.permanent) b.permanents++
  }
  return b
}
