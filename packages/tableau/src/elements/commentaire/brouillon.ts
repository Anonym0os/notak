import type { NoeudTexte } from '../../coeur/tableau'
import { CLASSE_MENU_MESSAGE } from './MenuMessage'

/**
 * La garde des commentaires qu'on n'a pas publiés. Tout champ de commentaire (`Compositeur`) qui reçoit une clé s'y
 * inscrit, et c'est ici, une seule fois pour toute l'application, qu'une sortie se décide :
 *
 * - un geste de sortie qu'on peut retenir (un appui hors de la fiche, Échap, la croix, la feuille qu'on ferme) ne
 *   ferme rien la première fois : la fiche reste, son champ secoue et dit « Commentaire non publié · Publier ·
 *   Abandonner » ; le même geste une seconde fois abandonne le brouillon, et la sortie se fait (Figma, Linear) ;
 * - une sortie qu'on ne retient pas (la fiche démontée : la note qui quitte l'édition, la visionneuse fermée, un autre
 *   tableau ouvert) garde le brouillon, par clé : le champ qui se remonte le rend (Slack, Notion) ;
 * - fermer l'onglet avec un brouillon demande confirmation au navigateur (`beforeunload`) ; les coques de bureau et
 *   d'iPhone, des WebKit, ne montrent pas cette question et ferment sans attendre.
 *
 * Un champ vide, ou d'espaces seulement, ne retient rien.
 */

/** Ce qu'un champ retient : son texte brut, et sa mise en forme quand elle dit plus que lui. */
export interface Brouillon {
  texte: string
  riche?: NoeudTexte
}

const gardes = new Map<string, Brouillon>()

/** Le brouillon gardé sous cette clé, à rendre au champ qui se remonte. */
export const brouillonGarde = (cle: string): Brouillon | undefined => gardes.get(cle)

/** Garde ce brouillon sous sa clé ; vide (ou `null`), la clé est oubliée. */
export function garderBrouillon(cle: string, b: Brouillon | null) {
  if (b && b.texte.trim()) gardes.set(cle, b)
  else gardes.delete(cle)
}

/** Un champ de commentaire monté, qui peut retenir une sortie. */
export interface Retenue {
  /** La fiche qui porte le champ : un appui dedans n'est pas une sortie. */
  zone(): Element | null
  /** Du texte non publié ? */
  sale(): boolean
  /** A-t-il déjà prévenu, depuis la dernière frappe ? */
  prevenu(): boolean
  /** Le premier geste de sortie : la fiche reste, le champ secoue et le dit. */
  signaler(): void
  /** Le second : le brouillon part. */
  abandonner(): void
}

const champs = new Set<Retenue>()

/**
 * Ce que ces champs font d'un geste de sortie : `true` s'il est retenu (un champ au moins n'avait pas prévenu : ils
 * préviennent tous) ; `false` s'il passe, les brouillons déjà signalés abandonnés.
 */
export function retenirParmi(liste: Iterable<Retenue>): boolean {
  const sales = [...liste].filter((r) => r.sale())
  if (sales.length === 0) return false
  if (sales.some((r) => !r.prevenu())) {
    for (const r of sales) r.signaler()
    return true
  }
  for (const r of sales) r.abandonner()
  return false
}

/**
 * La sortie d'une fiche, demandée par son code (sa croix, Échap sur la fiche, la feuille qu'on ferme) : retenue si un
 * champ de la fiche tient un brouillon. `true` : ne rien fermer.
 */
export function retenirSortie(fiche: Element | null | undefined): boolean {
  if (!fiche) return false
  return retenirParmi([...champs].filter((r) => fiche.contains(r.zone())))
}

/** Un brouillon quelque part (monté ou gardé) ? */
export const brouillonEnCours = (): boolean => gardes.size > 0 || [...champs].some((r) => r.sale())

/**
 * Ce que les fiches ouvrent hors d'elles, et les barres d'outils : un appui là n'est pas une sortie. La feuille du
 * téléphone ferme par son propre code, que sa fiche retient (`retenirSortie`).
 */
const PAS_DEHORS = `.notak-fenetre-emojis, .notak-propositions, .${CLASSE_MENU_MESSAGE}, .notak-dialogue-hote, .notak-tiroir-bas-calque, .notak-barre-outils, .notak-barre-selection`

/** Le geste retenu : ses événements suivants (le relâcher, le clic) ne doivent rien déclencher non plus. */
let gesteRetenu = false
let finGeste = 0

function surAppui(e: Event) {
  gesteRetenu = false
  const cible = e.target instanceof Element ? e.target : e.target instanceof Node ? e.target.parentElement : null
  if (!cible || cible.closest(PAS_DEHORS)) return
  const dehors = [...champs].filter((r) => !r.zone()?.contains(cible))
  if (!retenirParmi(dehors)) return
  gesteRetenu = true
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
}

function avalerSuite(e: Event) {
  if (!gesteRetenu) return
  // Dans une fiche (« Publier » de l'avertissement, sous un appui qu'on n'a pas vu) : rien à avaler.
  const cible = e.target instanceof Element ? e.target : null
  if (cible && (cible.closest(PAS_DEHORS) || [...champs].some((r) => r.zone()?.contains(cible)))) return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  if (e.type === 'click' || e.type === 'contextmenu') gesteRetenu = false
  // Un relâcher sans clic (un glisser) : le geste finit peu après.
  if (e.type === 'pointerup') {
    window.clearTimeout(finGeste)
    finGeste = window.setTimeout(() => (gesteRetenu = false), 400)
  }
}

const SUITE = ['mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const

function brancher() {
  // À la capture de la fenêtre : avant tout autre écouteur, ceux du document compris (la toile, les bulles).
  window.addEventListener('pointerdown', surAppui, true)
  for (const type of SUITE) window.addEventListener(type, avalerSuite, true)
}

function debrancher() {
  window.removeEventListener('pointerdown', surAppui, true)
  for (const type of SUITE) window.removeEventListener(type, avalerSuite, true)
  gesteRetenu = false
}

/** Inscrit un champ ; rend de quoi le désinscrire. */
export function inscrireChamp(r: Retenue): () => void {
  if (typeof window === 'undefined') return () => {}
  if (champs.size === 0) brancher()
  champs.add(r)
  return () => {
    champs.delete(r)
    if (champs.size === 0) debrancher()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!brouillonEnCours()) return
    e.preventDefault()
    // Les navigateurs d'avant `preventDefault` attendent une valeur de retour ; ils montrent leur propre phrase.
    e.returnValue = ''
  })
}

/** Pour les essais : plus aucun brouillon gardé. */
export function oublierBrouillons() {
  gardes.clear()
}
