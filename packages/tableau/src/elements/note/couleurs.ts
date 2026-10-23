import { COULEURS_NOTE, type CouleurNote, type Element, type Note } from '../../coeur/tableau'
import { t } from '../../langue'

/**
 * Les fonds de note. Les mêmes valeurs sont déclinées en variables CSS (`--notak-note-<nom>`
 * dans `note.css`) : un test vérifie qu'elles ne divergent pas. Ici, elles servent à choisir
 * la couleur du texte.
 */
export const FOND_NOTE: Record<(typeof COULEURS_NOTE)[number], string> = {
  gris: '#bbbec3',
  cyan: '#62dbc8',
  vert: '#7cd651',
  brun: '#d58558',
  jaune: '#ffd14d',
  orange: '#ff8d48',
  rouge: '#ff5757',
  rose: '#ff6ed4',
  violet: '#ad6fff',
  bleu: '#4ebafd',
  bleu_nuit: '#5882f8',
}

export const TEXTE_CLAIR = '#ffffff'
export const TEXTE_SOMBRE = '#323b4a'
/** Le gris-bleu contre lequel on mesure le contraste : au-dessus de lui, blanc ; en dessous, `TEXTE_SOMBRE` (le seuil de Milanote). */
export const SEUIL_SOMBRE = '#3d4554'

const canal = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** La luminance relative d'une couleur `#rrggbb` (WCAG), de 0 (noir) à 1 (blanc). */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
}

/** Le rapport de contraste entre deux couleurs `#rrggbb`, de 1 à 21. */
export function contraste(a: string, b: string): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (haut + 0.05) / (bas + 0.05)
}

/** Blanc ou presque-noir, selon ce qui se lit le mieux sur ce fond. */
export function couleurTexteSur(fond: string): string {
  return contraste(fond, TEXTE_CLAIR) >= contraste(fond, SEUIL_SOMBRE) ? TEXTE_CLAIR : TEXTE_SOMBRE
}

/** La couleur du texte d'une note : celle que son fond impose, `undefined` pour le style par défaut. */
export function texteDeNote(couleur: CouleurNote | undefined): string | undefined {
  return couleur && couleur !== 'transparent' ? couleurTexteSur(FOND_NOTE[couleur]) : undefined
}

/** Une couleur saisie (`#abc`, `AABBCC`, `#aabbcc`) ramenée à `#rrggbb` en minuscules ; `null` si ce n'en est pas une. */
export function lireHex(saisie: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(saisie.trim())
  if (!m) return null
  const h = m[1]!.toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
}

/** Le fond d'une note en `#rrggbb` : le fond libre, sinon sa couleur nommée ; `undefined` sans fond ou transparente. */
export function fondDeNote(c: Pick<Note, 'couleur' | 'fond'>): string | undefined {
  if (c.fond) return c.fond
  return c.couleur && c.couleur !== 'transparent' ? FOND_NOTE[c.couleur] : undefined
}

/** Le texte d'une note : le sien s'il en a un, sinon blanc ou presque-noir selon le fond ; `undefined` pour le défaut. */
export function texteDuContenu(c: Pick<Note, 'couleur' | 'fond' | 'couleurTexte'>): string | undefined {
  if (c.couleurTexte) return c.couleurTexte
  const fond = fondDeNote(c)
  return fond ? couleurTexteSur(fond) : undefined
}

/** Le nombre de couleurs suggérées au plus. */
export const SUGGEREES_MAX = 8

/**
 * Les couleurs déjà employées sur le tableau (fonds, barres, textes libres, fonds nommés), les plus fréquentes
 * d'abord, au plus `SUGGEREES_MAX` : de quoi retrouver une teinte sans la retaper.
 */
export function couleursSuggerees(elements: readonly Element[]): string[] {
  const compte = new Map<string, number>()
  const noter = (c: string | undefined) => c && compte.set(c, (compte.get(c) ?? 0) + 1)
  for (const e of elements) {
    if (e.contenu.type !== 'note') continue
    noter(fondDeNote(e.contenu))
    noter(e.contenu.barre)
    noter(e.contenu.couleurTexte)
  }
  // Tri stable : à égalité, la première rencontrée reste devant.
  return [...compte].sort((a, b) => b[1] - a[1]).slice(0, SUGGEREES_MAX).map(([c]) => c)
}

/** Un fond et le texte qui s'y lit : ce que Milanote appelle une paire. */
export interface PaireCouleur {
  fond: string
  texte: string
}

/** Le nombre de paires proposées au plus. */
export const PAIRES_MAX = 10

/**
 * Les paires fond + texte déjà employées sur le tableau (une note qui a un fond), les plus fréquentes d'abord :
 * de quoi reprendre un habillage entier d'un geste. Le texte est celui que la note affiche, imposé ou choisi.
 */
export function pairesUtilisees(elements: readonly Element[]): PaireCouleur[] {
  const compte = new Map<string, { paire: PaireCouleur; n: number }>()
  for (const e of elements) {
    if (e.contenu.type !== 'note') continue
    const fond = fondDeNote(e.contenu)
    const texte = texteDuContenu(e.contenu)
    if (!fond || !texte) continue
    const cle = `${fond}|${texte}`
    const vu = compte.get(cle)
    if (vu) vu.n += 1
    else compte.set(cle, { paire: { fond, texte }, n: 1 })
  }
  return [...compte.values()].sort((a, b) => b.n - a.n).slice(0, PAIRES_MAX).map((x) => x.paire)
}

/** Ce qu'une paire pose sur une note : la couleur nommée si le fond en est une, sinon le fond libre ; le texte seulement s'il n'est pas celui que le fond impose. */
export function contenuAvecPaire(c: Note, { fond, texte }: PaireCouleur): Note {
  const { couleur: _c, fond: _f, couleurTexte: _t, ...reste } = c
  const nom = (Object.keys(FOND_NOTE) as (keyof typeof FOND_NOTE)[]).find((k) => FOND_NOTE[k] === fond)
  return {
    ...reste,
    ...(nom ? { couleur: nom } : { fond }),
    ...(texte.toLowerCase() === couleurTexteSur(fond).toLowerCase() ? {} : { couleurTexte: texte }),
  }
}

export const LIBELLES_COULEUR: Record<CouleurNote, string> = {
  get gris() { return t('couleur.gris') },
  get cyan() { return t('couleur.cyan') },
  get vert() { return t('couleur.vert') },
  get brun() { return t('couleur.brun') },
  get jaune() { return t('couleur.jaune') },
  get orange() { return t('couleur.orange') },
  get rouge() { return t('couleur.rouge') },
  get rose() { return t('couleur.rose') },
  get violet() { return t('couleur.violet') },
  get bleu() { return t('couleur.bleu') },
  get bleu_nuit() { return t('couleur.bleuNuit') },
  get transparent() { return t('couleur.transparent') },
}

/** Couleurs du texte et surlignages : des noms, les valeurs sont des variables CSS de `note.css`. */
export const COULEURS_TEXTE = [
  { nom: 'bleu', get libelle() { return t('couleur.bleu') } },
  { nom: 'vert', get libelle() { return t('couleur.vert') } },
  { nom: 'orange', get libelle() { return t('couleur.orange') } },
  { nom: 'rouge', get libelle() { return t('couleur.rouge') } },
  { nom: 'gris', get libelle() { return t('couleur.gris') } },
] as const

export const SURLIGNAGES = [
  { nom: 'gris-fonce', get libelle() { return t('couleur.grisFonce') } },
  { nom: 'bleu', get libelle() { return t('couleur.bleu') } },
  { nom: 'vert', get libelle() { return t('couleur.vert') } },
  { nom: 'orange', get libelle() { return t('couleur.orange') } },
  { nom: 'rose', get libelle() { return t('couleur.rose') } },
  { nom: 'gris', get libelle() { return t('couleur.gris') } },
] as const

export const valeurCouleurTexte = (nom: string) => `var(--notak-texte-${nom})`

/** La teinte à montrer pour une couleur de note : nommée (la palette), libre (#hex), ou rien pour « aucune » et « transparent ». */
export function teinteDe(couleur: string | undefined): string | undefined {
  if (!couleur || couleur === 'transparent') return undefined
  return couleur in FOND_NOTE ? FOND_NOTE[couleur as keyof typeof FOND_NOTE] : couleur
}
