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

/** Le plus fort des deux rôles. */
export function meilleurRole(a: Role | null, b: Role | null): Role | null {
  if (a === null) return b
  if (b === null) return a
  return ROLES.indexOf(a) >= ROLES.indexOf(b) ? a : b
}

/** Vrai si `actuel` atteint au moins `minimum`. */
export function auMoins(actuel: Role | null, minimum: Role): boolean {
  return actuel !== null && ROLES.indexOf(actuel) >= ROLES.indexOf(minimum)
}

/**
 * Le rôle d'un utilisateur sur un tableau, hérité de ses ancêtres : partager un tableau partage tout ce qu'il contient.
 * Le meilleur rôle de la chaîne l'emporte ; une boucle dans les parents s'arrête au premier tableau revu.
 */
export function roleHerite(
  accesDe: (tableau: string) => readonly Acces[],
  parentDe: (tableau: string) => string | null,
  utilisateur: string,
  tableau: string,
): Role | null {
  let meilleur: Role | null = null
  const vus = new Set<string>()
  for (let t: string | null = tableau; t !== null && !vus.has(t); t = parentDe(t)) {
    vus.add(t)
    const r = role(accesDe(t), utilisateur, t)
    if (r !== null && (meilleur === null || ROLES.indexOf(r) > ROLES.indexOf(meilleur))) meilleur = r
    if (meilleur === 'proprietaire') break
  }
  return meilleur
}

/** Le titre de l'accueil d'une personne, tel que les autres le voient. */
export function titreAccueil(nom: string, langue: 'fr' | 'en' = 'fr'): string {
  const n = nom.trim()
  if (langue === 'en') return n ? `${n}’s home` : 'Home'
  if (!n) return 'Accueil'
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(n) ? `Accueil d’${n}` : `Accueil de ${n}`
}
