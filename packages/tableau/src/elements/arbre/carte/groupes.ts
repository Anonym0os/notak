import type { Arbre, StructureArbre } from '../../../coeur/tableau'
import { t } from '../../../langue'
import type { ChoixTheme } from '../modele/reglages'
import { PREFIXE_PERSO, THEMES, type Theme, cleNomTheme, jeuDeSix, themeBase, themeDe, variantesDe } from '../themes'
import type { ThemeCouleurPerso } from './preferences'

/**
 * Les thèmes de couleur d'une carte, rangés comme dans la liste de Xmind : des groupes (un thème et sa palette), dont
 * chacun a des variantes (celle à branches de couleur, puis une par couleur d'accent).
 */

export type Categorie = 'colore' | 'classique' | 'perso'

export interface GroupeTheme {
  id: string
  nom: string
  /** Ses six couleurs de base. */
  palette: string[]
  categorie: Categorie
  /** Un thème de couleur à soi : ses données, que la carte garde quand on l'applique. */
  perso?: ThemeCouleurPerso
}

/** Tous les groupes : les thèmes de Notak, puis ceux qu'on s'est faits. */
export function groupesThemes(perso: readonly ThemeCouleurPerso[]): GroupeTheme[] {
  return [
    ...THEMES.map((th): GroupeTheme => ({ id: th.id, nom: t(cleNomTheme(th.id)), palette: [...th.palette], categorie: th.categorie ?? 'colore' })),
    ...perso.map((p): GroupeTheme => ({ id: p.id, nom: p.nom, palette: jeuDeSix(p.palette), categorie: 'perso', perso: p })),
  ]
}

/** Le groupe de la carte ; un thème à soi qui n'est pas dans nos préférences (une carte venue d'ailleurs) se lit dans la carte. */
export function groupeCourant(a: Pick<Arbre, 'theme' | 'themePerso'>, groupes: readonly GroupeTheme[]): GroupeTheme {
  const id = a.theme ?? 'classique'
  const connu = groupes.find((g) => g.id === id)
  if (connu) return connu
  if (id.startsWith(PREFIXE_PERSO) && a.themePerso) return { id, nom: a.themePerso.nom, palette: jeuDeSix(a.themePerso.palette), categorie: 'perso', perso: { id, ...a.themePerso } }
  return groupes[0]!
}

/** Le thème (son habillage) d'un groupe. */
export const themeDuGroupe = (g: GroupeTheme): Theme => (g.perso ? themeBase({ theme: g.id, themePerso: { nom: g.nom, palette: g.palette } }) : themeDe(g.id))

/** L'accent de la variante en cours : la couleur unique des branches, ou rien quand elles sont de couleur. */
export const accentCourant = (a: Pick<Arbre, 'options' | 'couleurLigne'>): string | undefined => (a.options?.uneCouleur ? a.couleurLigne : undefined)

const memeCouleur = (x: string | undefined, y: string | undefined) => (x ?? '').toLowerCase() === (y ?? '').toLowerCase()

/** Cette variante est-elle celle de la carte ? Le groupe doit être le sien, et l'accent aussi (ou, sans accent, des branches de couleur). */
export function varianteActive(a: Pick<Arbre, 'theme' | 'options' | 'couleurLigne'>, groupe: GroupeTheme, accent: string | undefined): boolean {
  if ((a.theme ?? 'classique') !== groupe.id) return false
  return accent === undefined ? !a.options?.uneCouleur : !!a.options?.uneCouleur && memeCouleur(a.couleurLigne, accent)
}

/** Ce qu'on envoie au geste pour prendre cette variante. */
export const choixDe = (g: GroupeTheme, accent: string | undefined): ChoixTheme => ({
  theme: g.id,
  accent,
  ...(g.perso ? { perso: { nom: g.perso.nom, palette: g.palette } } : {}),
})

/** La variante d'après : on boucle sur celles du groupe, de la première à la dernière et de nouveau à la première. */
export function varianteSuivante(g: GroupeTheme, a: Pick<Arbre, 'options' | 'couleurLigne'>): string | undefined {
  const vs = variantesDe(themeDuGroupe(g))
  const i = vs.findIndex((v) => (v === undefined ? !a.options?.uneCouleur : !!a.options?.uneCouleur && memeCouleur(a.couleurLigne, v)))
  return vs[(i + 1) % vs.length]
}

/* ------------------------------------------------------------------ squelettes */

/** Les groupes de squelettes, dans l'ordre de la fenêtre de choix ; chacun nomme ses structures (`arbre.s.*`). */
export const GROUPES_SQUELETTES: readonly { id: string; structures: readonly StructureArbre[] }[] = [
  { id: 'carte', structures: ['carte', 'carte-horaire', 'carte-antihoraire', 'carte-libre'] },
  { id: 'logique', structures: ['logique-droite', 'logique-gauche'] },
  { id: 'accolade', structures: ['accolade-droite', 'accolade-gauche'] },
  { id: 'organigramme', structures: ['organigramme-bas', 'organigramme-haut'] },
  { id: 'arbre', structures: ['arbre-droite', 'arbre-gauche'] },
  { id: 'chronologie', structures: ['chronologie-horizontale', 'chronologie-verticale'] },
  { id: 'arete', structures: ['arete-gauche', 'arete-droite'] },
  { id: 'matrice', structures: ['matrice-lignes', 'matrice-colonnes'] },
]

/** Le groupe d'une structure : c'est lui que la carte du squelette nomme, jamais la structure elle-même. */
export const groupeDeStructure = (s: StructureArbre): string => GROUPES_SQUELETTES.find((g) => g.structures.includes(s))?.id ?? 'carte'
