/**
 * Ce qui se propose pendant qu'on écrit dans une note : `@` une personne, `[[` un tableau.
 * Le déclencheur se lit dans le texte juste avant le curseur ; rien ici ne touche à l'éditeur.
 */

export type GenreSuggestion = 'mention' | 'tableau'

export interface Declencheur {
  genre: GenreSuggestion
  /** Ce qui est tapé après le signe. */
  requete: string
  /** Combien de caractères, depuis la fin du texte lu, appartiennent au déclencheur (signe compris). */
  longueur: number
}

/** `@` en début de texte ou après une espace, puis des lettres : on ne propose pas dans une adresse de courriel. */
const MENTION = /(?:^|\s)@([^\s@]{0,30})$/u
/** `[[` suivi d'un début de titre (les espaces comptent : un titre en a). */
const TABLEAU = /\[\[([^\]\[]{0,40})$/u

/** Le déclencheur qui finit ce texte, s'il y en a un. `[[` l'emporte : un titre peut contenir « @ ». */
export function declencheurDans(avant: string): Declencheur | null {
  const t = TABLEAU.exec(avant)
  if (t) return { genre: 'tableau', requete: t[1] ?? '', longueur: t[0].length }
  const m = MENTION.exec(avant)
  if (m) return { genre: 'mention', requete: m[1] ?? '', longueur: (m[1] ?? '').length + 1 }
  return null
}

const sansAccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr')

export interface Proposition {
  id: string
  libelle: string
  /** Une teinte (couleur d'une personne, d'un tableau), si on la connaît. */
  teinte?: string
}

/**
 * Les propositions qui répondent à `requete`, celles qui commencent par elle d'abord, puis celles qui la contiennent,
 * sans accent ni majuscule. Au plus `max`.
 */
export function filtrer(propositions: readonly Proposition[], requete: string, max = 6): Proposition[] {
  const q = sansAccent(requete.trim())
  if (!q) return propositions.slice(0, max)
  const debut: Proposition[] = []
  const dedans: Proposition[] = []
  for (const p of propositions) {
    const l = sansAccent(p.libelle)
    if (l.startsWith(q)) debut.push(p)
    else if (l.includes(q)) dedans.push(p)
  }
  return [...debut, ...dedans].slice(0, max)
}

/** Les mêmes personnes, une fois chacune (une personne ouverte sur deux appareils compte pour une), par nom. */
export function sansDoublons(propositions: readonly Proposition[]): Proposition[] {
  const vus = new Set<string>()
  return propositions.filter((p) => !vus.has(p.id) && vus.add(p.id))
}
