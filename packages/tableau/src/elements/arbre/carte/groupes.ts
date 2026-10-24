import type { Arbre, StructureArbre } from '../../../coeur/tableau'
import { t } from '../../../langue'
import type { ChoixTheme } from '../modele/reglages'
import { GROUPES_DE_SQUELETTES, SQUELETTES, type SqueletteDef, squeletteDe, squelettesDuGroupe } from './squelettes'
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

/** Les groupes de squelettes, dans l'ordre de la fenêtre de choix ; chacun nomme ses squelettes (`arbre.carte.g.*`). */
export const GROUPES_SQUELETTES: readonly { id: string; squelettes: readonly SqueletteDef[] }[] = GROUPES_DE_SQUELETTES.map((id) => ({ id, squelettes: squelettesDuGroupe(id) }))

/** Le groupe d'une structure : celui du premier squelette qui la porte ; c'est lui que la carte du squelette nomme. */
export const groupeDeStructure = (s: StructureArbre): string => SQUELETTES.find((x) => x.structure === s)?.groupe ?? FAMILLE_DE_STRUCTURE.find(([, ss]) => ss.includes(s))?.[0] ?? 'carte'

/** Les structures de chaque groupe, pour une carte dont le central n'est celui d'aucun squelette (une variante de sens). */
const FAMILLE_DE_STRUCTURE: readonly (readonly [string, readonly StructureArbre[]])[] = [
  ['carte', ['carte', 'carte-horaire', 'carte-antihoraire', 'carte-libre']],
  ['logique', ['logique-droite', 'logique-gauche']],
  ['accolade', ['accolade-droite', 'accolade-gauche']],
  ['organigramme', ['organigramme-bas', 'organigramme-haut']],
  ['arbre', ['arbre-droite', 'arbre-gauche']],
  ['chronologie', ['chronologie-horizontale', 'chronologie-verticale']],
  ['arete', ['arete-gauche', 'arete-droite']],
  ['matrice', ['matrice-lignes', 'matrice-colonnes']],
]

/** Le squelette d'une carte, s'il en a un. */
export const squeletteDeCarte = (a: Pick<Arbre, 'squelette'>): SqueletteDef | undefined => squeletteDe(a.squelette)

/** Le nom d'un squelette dans la fenêtre : celui de son groupe et son rang (« Carte mentale 3 ») ; Xmind n'en donne pas d'autre. */
export const nomDeSquelette = (s: SqueletteDef): string => t('arbre.carte.sq', { groupe: t(`arbre.carte.g.${s.groupe}`), n: squelettesDuGroupe(s.groupe).indexOf(s) + 1 })
