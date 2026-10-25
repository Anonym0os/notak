import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements } from 'better-auth/plugins/organization/access'
import type { Base, Relation } from './base.ts'

// Un espace d'équipe est une organisation de Better Auth : ses membres, ses équipes, ses invitations et ses rôles
// sont à lui. Chaque compte a aussi son espace personnel, dont il est seul membre. Un tableau appartient à un espace
// (`tableaux.espace`), et ses sous-tableaux au même. Les membres d'un espace voient ses tableaux selon leur rôle ; un
// tableau partagé à quelqu'un hors de l'espace reste dans l'espace de son propriétaire.

/**
 * Ce qu'un rôle d'espace peut permettre. Les ressources de Better Auth (l'espace, ses membres, ses invitations,
 * ses équipes, ses rôles) et celles de Notak : les tableaux de l'espace, et le SSO.
 */
export const ENONCE = {
  ...defaultStatements,
  tableau: ['lire', 'commenter', 'modifier', 'administrer', 'creer'],
  sso: ['gerer'],
} as const

export const ac = createAccessControl(ENONCE)

const tout = Object.fromEntries(Object.entries(ENONCE).map(([k, v]) => [k, [...v]])) as {
  -readonly [K in keyof typeof ENONCE]: (typeof ENONCE)[K][number][]
}

/**
 * Les rôles fixes. Leurs noms sont ceux de Better Auth (`owner`, `admin`, `member`) parce que ses plugins s'y
 * réfèrent, le SSO entre autres ; l'interface les traduit. Un admin d'espace peut en composer d'autres.
 */
export const ROLES_ESPACE = {
  owner: ac.newRole(tout),
  admin: ac.newRole({ ...tout, organization: ['update'] }),
  member: ac.newRole({ tableau: ['lire', 'commenter', 'modifier', 'creer'] }),
  /** Un invité est dans l'espace sans en voir les tableaux : il ne voit que ceux qu'on lui partage. */
  guest: ac.newRole({}),
}

export type PermissionsEspace = Partial<Record<keyof typeof ENONCE, readonly string[]>>

/** La relation de l'espace que donne chaque geste sur ses tableaux (`autorisation/modele.fga`). */
const RELATION_DU_GESTE: Record<string, string> = {
  lire: 'lit_tableaux',
  commenter: 'commente_tableaux',
  modifier: 'modifie_tableaux',
  administrer: 'administre_tableaux',
  creer: 'cree_tableaux',
}

/**
 * Les relations qu'un espace doit avoir, d'après ce que Better Auth en garde : chaque membre est `assignee` de ses
 * rôles et membre de l'espace, chaque rôle (fixe ou composé) donne sur l'espace ce que ses gestes permettent, chaque
 * équipe a ses membres.
 */
export function relationsVouluesDe(base: Base, espace: string): Relation[] {
  const rel: Relation[] = []
  const role = (nom: string) => `role:${espace}/${nom}`
  for (const m of base.membresEspace(espace)) {
    rel.push({ objet: `espace:${espace}`, relation: 'membre', sujet: `user:${m.utilisateur}` })
    for (const r of m.role.split(',').map((x) => x.trim()).filter(Boolean)) rel.push({ objet: role(r), relation: 'assignee', sujet: `user:${m.utilisateur}` })
  }
  const roles: [string, PermissionsEspace][] = Object.entries(ROLES_ESPACE).map(([nom, r]) => [nom, r.statements as PermissionsEspace])
  for (const c of base.rolesComposes(espace)) {
    try {
      roles.push([c.role, JSON.parse(c.permission) as PermissionsEspace])
    } catch {}
  }
  for (const [nom, permissions] of roles) {
    for (const geste of permissions.tableau ?? []) {
      const relation = RELATION_DU_GESTE[geste]
      if (relation) rel.push({ objet: `espace:${espace}`, relation, sujet: `${role(nom)}#assignee` })
    }
  }
  for (const e of base.equipesEspace(espace)) {
    for (const u of e.membres) rel.push({ objet: `equipe:${e.id}`, relation: 'membre', sujet: `user:${u}` })
  }
  return rel
}

const cle = (r: Relation) => `${r.objet}|${r.relation}|${r.sujet}`

/**
 * Met les relations des espaces signalés (par les déclencheurs de la migration 4) au niveau de ce que Better Auth en
 * garde, et retire celles qui désignent une équipe, un rôle ou un espace disparus. Rend les espaces qui ont changé.
 */
export function synchroniserEspaces(base: Base): string[] {
  const changes: string[] = []
  base.transaction(() => {
    for (const espace of base.espacesASynchroniser()) {
      const voulues = new Map(relationsVouluesDe(base, espace).map((r) => [cle(r), r]))
      const presentes = new Map(base.relationsDeLEspace(espace).map((r) => [cle(r), r]))
      let change = false
      for (const [k, r] of voulues) {
        if (presentes.has(k)) continue
        base.ajouterRelation(r)
        change = true
      }
      for (const [k, r] of presentes) {
        if (voulues.has(k)) continue
        base.retirerRelation(r)
        change = true
      }
      base.espaceSynchronise(espace)
      if (change) changes.push(espace)
    }
    for (const r of base.relationsOrphelines()) base.retirerRelation(r)
  })
  return changes
}
