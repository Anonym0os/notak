import { EMOJIS_UNICODE } from './emojisUnicode'

/** Un émoji du catalogue Unicode : ses noms, ses mots-clés, et ses cinq variantes de teinte quand il en a. */
export interface EmojiU {
  e: string
  en: string
  fr: string
  /** Mots-clés anglais et français, sans accents ni casse, pour la recherche. */
  mots: string
  teintes?: readonly string[]
}

export interface GroupeEmojis {
  /** `0` à `8` : visages, personnes, nature, nourriture, voyages, activités, objets, symboles, drapeaux. */
  cle: number
  emojis: EmojiU[]
}

export const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

let groupes: GroupeEmojis[] | null = null

/** Le catalogue complet, lu une fois : neuf groupes dans l'ordre d'Unicode. */
export function groupesEmojis(): GroupeEmojis[] {
  groupes ??= EMOJIS_UNICODE.map((lignes, cle) => ({
    cle,
    emojis: lignes.split('\n').map((l) => {
      const [e, en, fr, mots, teintes] = l.split('\t') as [string, string, string, string, string?]
      return { e, en, fr, mots: normaliser(`${en} ${fr} ${mots}`), ...(teintes ? { teintes: teintes.split(' ') } : {}) }
    }),
  }))
  return groupes
}

/** Tous les émojis, à plat. */
export const tousLesEmojis = (): EmojiU[] => groupesEmojis().flatMap((g) => g.emojis)

/** L'émoji dans la teinte de peau voulue (`0` : la teinte neutre, `1` à `5` : de la plus claire à la plus foncée). */
export const avecTeinte = (m: EmojiU, teinte: number): string => (teinte > 0 && m.teintes?.[teinte - 1]) || m.e

/** Les émojis dont un nom ou un mot-clé contient la requête (chaque mot de la requête doit s'y trouver). */
export function chercherEmojis(requete: string): EmojiU[] {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return []
  return tousLesEmojis().filter((m) => mots.every((mot) => m.mots.includes(mot)))
}

// ---- Fréquents et teinte de peau, retenus sur cet appareil ----

const CLE_FREQUENTS = 'notak:emojis-frequents'
const CLE_TEINTE = 'notak:emojis-teinte'
export const FREQUENTS_MAX = 24

/** Ce qu'on a de départ avant d'avoir choisi quoi que ce soit : les émojis les plus posés, avec leur poids. */
export const FREQUENTS_DEPART: Record<string, number> = { '👍': 4, '👎': 3, '😊': 2, '😀': 2, '🙂': 1, '🤔': 1, '😍': 1, '😞': 1 }

const lireJson = (cle: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(cle) ?? 'null')
  } catch {
    return null
  }
}

const ecrire = (cle: string, valeur: unknown) => {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    // Le navigateur refuse de garder quoi que ce soit : on repart des valeurs d'origine.
  }
}

/** Les compteurs d'emploi : ceux qu'on a retenus, sinon ceux de départ. */
export function compteursFrequents(): Record<string, number> {
  const v = lireJson(CLE_FREQUENTS)
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...FREQUENTS_DEPART }
  const propres = Object.entries(v).filter((x): x is [string, number] => typeof x[1] === 'number' && x[1] > 0)
  return propres.length > 0 ? Object.fromEntries(propres) : { ...FREQUENTS_DEPART }
}

/** Les vingt-quatre émojis les plus employés, du plus employé au moins employé (à égalité, le plus ancien d'abord). */
export const frequents = (): string[] =>
  Object.entries(compteursFrequents())
    .sort((a, b) => b[1] - a[1])
    .slice(0, FREQUENTS_MAX)
    .map(([e]) => e)

/** Chaque choix compte un de plus. */
export function retenirEmoji(emoji: string) {
  const c = compteursFrequents()
  ecrire(CLE_FREQUENTS, { ...c, [emoji]: (c[emoji] ?? 0) + 1 })
}

export function teinteRetenue(): number {
  const v = lireJson(CLE_TEINTE)
  return typeof v === 'number' && v >= 0 && v <= 5 ? v : 0
}

export const retenirTeinte = (teinte: number) => ecrire(CLE_TEINTE, teinte)
