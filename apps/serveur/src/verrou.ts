import type { Base } from './base.ts'

/**
 * Le tableau dont le mot de passe barre l'accès à `tableau` pour ce compte, ou `null` s'il est libre.
 * Le mot de passe d'un tableau vaut pour tout ce qu'il contient, comme le partage : on remonte la chaîne des parents
 * jusqu'au premier tableau protégé que ce compte n'a pas ouvert. Une boucle dans les parents s'arrête au premier revu.
 */
export function verrouPar(base: Pick<Base, 'tableau' | 'motDePasse' | 'aOuvert'>, utilisateur: string, tableau: string): string | null {
  const vus = new Set<string>()
  for (let t: string | null = tableau; t !== null && !vus.has(t); t = base.tableau(t)?.parent ?? null) {
    vus.add(t)
    if (base.motDePasse(t, 'tableau') !== null && !base.aOuvert(utilisateur, t)) return t
  }
  return null
}
