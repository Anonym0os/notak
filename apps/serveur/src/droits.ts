export const ROLES = ['lecture', 'edition', 'proprietaire'] as const
export type Role = (typeof ROLES)[number]

export interface Acces {
  tableau: string
  utilisateur: string
  role: Role
}

export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur)
}

/** Le rôle d'un utilisateur sur un tableau, d'après la liste des accès de ce tableau. `null` : aucun droit. */
export function role(acces: readonly Acces[], utilisateur: string, tableau: string): Role | null {
  let meilleur: Role | null = null
  for (const a of acces) {
    if (a.tableau !== tableau || a.utilisateur !== utilisateur) continue
    if (meilleur === null || ROLES.indexOf(a.role) > ROLES.indexOf(meilleur)) meilleur = a.role
  }
  return meilleur
}

/** Vrai si `actuel` atteint au moins `minimum`. */
export function auMoins(actuel: Role | null, minimum: Role): boolean {
  return actuel !== null && ROLES.indexOf(actuel) >= ROLES.indexOf(minimum)
}

/** Les accès d'un tableau neuf placé sous un parent : ceux du parent, et le créateur en propriétaire. */
export function accesRecopies(accesParent: readonly Acces[], tableau: string, createur: string): Acces[] {
  const reste = accesParent.filter((a) => a.utilisateur !== createur).map((a) => ({ tableau, utilisateur: a.utilisateur, role: a.role }))
  return [{ tableau, utilisateur: createur, role: 'proprietaire' }, ...reste]
}
