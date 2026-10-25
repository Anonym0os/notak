import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements } from 'better-auth/plugins/organization/access'
import type { Base } from './base.ts'
import { type Role, meilleurRole, roleHerite } from './droits.ts'

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

/** Ce que donnent sur un tableau de l'espace les permissions d'un rôle, au mieux. */
export function roleTableauDe(permissions: PermissionsEspace): Role | null {
  const t = permissions.tableau ?? []
  if (t.includes('administrer')) return 'proprietaire'
  if (t.includes('modifier')) return 'edition'
  if (t.includes('lire') || t.includes('commenter')) return 'lecture'
  return null
}

/** Les permissions d'un rôle fixe, ou `null` si ce nom n'en est pas un. */
export function permissionsFixes(role: string): PermissionsEspace | null {
  return role in ROLES_ESPACE ? (ROLES_ESPACE[role as keyof typeof ROLES_ESPACE].statements as PermissionsEspace) : null
}

/** Ce que l'appartenance à l'espace du tableau donne sur lui : le meilleur des rôles du membre. */
export function roleParEspace(base: Base, utilisateur: string, tableau: string): Role | null {
  const espace = base.tableau(tableau)?.espace
  const roles = espace ? base.roleMembre(espace, utilisateur) : null
  if (!espace || !roles) return null
  let meilleur: Role | null = null
  for (const nom of roles.split(',').map((r) => r.trim())) {
    const permissions = permissionsFixes(nom) ?? base.permissionsRole(espace, nom)
    if (permissions) meilleur = meilleurRole(meilleur, roleTableauDe(permissions))
  }
  return meilleur
}

/** Le rôle d'un compte sur un tableau : ses partages, ceux des tableaux au-dessus, et son rôle dans l'espace. */
export function roleEffectif(base: Base, utilisateur: string, tableau: string): Role | null {
  const partages = roleHerite((t) => base.acces(t), (t) => base.tableau(t)?.parent ?? null, utilisateur, tableau)
  return partages === 'proprietaire' ? partages : meilleurRole(partages, roleParEspace(base, utilisateur, tableau))
}

/** Les gestes sur les tableaux que le rôle de ce compte dans l'espace permet (`creer`, `lire`…). */
export function gestesDansEspace(base: Base, espace: string, utilisateur: string): Set<string> {
  const gestes = new Set<string>()
  for (const nom of (base.roleMembre(espace, utilisateur) ?? '').split(',').map((r) => r.trim()).filter(Boolean)) {
    for (const g of (permissionsFixes(nom) ?? base.permissionsRole(espace, nom))?.tableau ?? []) gestes.add(g)
  }
  return gestes
}
