/**
 * Faire glisser une tâche par sa poignée, pour la changer de place dans sa liste. Le geste est le même hors
 * édition (les tâches sont des nœuds React) et en édition (des nœuds Tiptap) : il ne lit que le DOM, et
 * rend des rangs dans l'ordre de lecture, que `deplacer` (JSON) et `deplacerDansEditeur` (Tiptap) comprennent.
 *
 * Hors édition, la tâche peut aussi sortir de sa liste : vers une autre liste de tâches du tableau, ou vers le vide
 * de la toile. Le geste ne fait que dire où elle est lâchée (`Depot`) ; c'est l'appelant qui change le tableau.
 */

import type { Id } from '../../coeur/tableau'
import { t } from '../../langue'

const TACHES = 'li[data-type="taskItem"]'
/** En deçà de ce déplacement (px), c'est un clic, pas un glisser. */
const SEUIL = 4

/** Le point d'insertion le plus proche du pointeur : au-dessus d'une tâche ou sous elle (sous ses sous-tâches). */
function viser(racine: HTMLElement, source: HTMLElement, x: number, y: number) {
  let meilleur: { tache: HTMLElement; avant: boolean; y: number; gauche: number } | null = null
  let score = Number.POSITIVE_INFINITY
  for (const tache of racine.querySelectorAll<HTMLElement>(TACHES)) {
    if (source.contains(tache)) continue
    const r = tache.getBoundingClientRect()
    for (const avant of [true, false]) {
      const ligne = avant ? r.top : r.bottom
      // Le pointeur à gauche penche pour le niveau du dessus : au bout d'une sous-liste, sous la parente.
      const s = Math.abs(ligne - y) + 0.01 * Math.abs(x - (r.left + 8))
      if (s < score) {
        score = s
        meilleur = { tache, avant, y: ligne, gauche: r.left }
      }
    }
  }
  return meilleur
}

/** Où la tâche est lâchée, quand elle quitte sa liste. `x`, `y` : le pointeur, dans le repère de la toile (son coin haut gauche). */
export type Sortie =
  | { genre: 'liste'; carte: Id; vers: number; avant: boolean }
  | { genre: 'toile'; x: number; y: number }

/** Ce qui est sous le pointeur, pour une tâche qui quitte sa liste. */
export type Vise = { genre: 'ici' } | { genre: 'liste'; carte: HTMLElement; racine: HTMLElement } | { genre: 'toile' } | { genre: 'rien' }

/**
 * Où tomberait la tâche : sa propre carte (`ici`), la liste d'une autre carte, le vide de la toile, ou rien
 * (une note, une colonne, une liste qu'on est en train d'écrire). `pile` : les éléments sous le pointeur, du
 * dessus au dessous (`document.elementsFromPoint`).
 */
export function viserAilleurs(pile: readonly Element[], propre: Element | null): Vise {
  const dessus = pile.find((n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('notak-carte'))
  if (dessus) {
    if (dessus === propre) return { genre: 'ici' }
    const racine = dessus.querySelector<HTMLElement>(':scope > .notak-taches')
    // Une liste qu'on est en train d'écrire n'accueille rien : son texte vit dans l'éditeur.
    if (dessus.dataset.type !== 'taches' || dessus.dataset.edition !== undefined || dessus.dataset.verrou !== undefined || !racine) return { genre: 'rien' }
    return { genre: 'liste', carte: dessus, racine }
  }
  return pile.some((n) => n.classList.contains('notak-toile')) ? { genre: 'toile' } : { genre: 'rien' }
}

/**
 * Commence un glisser à partir d'un appui sur la poignée de `source`. `fini(de, vers, avant)` est appelé au
 * relâchement si la tâche est venue se poser quelque part de sa liste ; Échap abandonne.
 * Avec `sortie`, la tâche peut aussi être lâchée ailleurs : `sortie(de, ou)` est alors appelé à la place.
 */
export function glisserTache(
  depart: PointerEvent,
  racine: HTMLElement,
  source: HTMLElement,
  fini: (de: number, vers: number, avant: boolean) => void,
  sortie?: (de: number, ou: Sortie) => void,
) {
  const rangs = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>(TACHES)]
  const de = rangs(racine).indexOf(source)
  if (de < 0) return
  const carteSource = racine.closest<HTMLElement>('.notak-carte')
  const repere = document.createElement('div')
  repere.className = 'notak-glisse-repere'
  repere.hidden = true
  racine.append(repere)
  // Ce qui suit le pointeur : la tâche, en miniature.
  const fantome = document.createElement('div')
  fantome.className = 'notak-glisse-fantome'
  fantome.textContent = source.querySelector('p')?.textContent?.trim() || t('taches.tache')
  fantome.hidden = true
  document.body.append(fantome)

  type But =
    | { dans: 'ici'; viseur: NonNullable<ReturnType<typeof viser>> }
    | { dans: 'liste'; carte: HTMLElement; racine: HTMLElement; viseur: NonNullable<ReturnType<typeof viser>> }
    | { dans: 'toile'; x: number; y: number }
  let but: But | null = null
  let parti = false
  let marquee: HTMLElement | null = null

  const marquer = (r: HTMLElement | null) => {
    if (marquee === r) return
    marquee?.removeAttribute('data-depot')
    marquee = r
    r?.setAttribute('data-depot', '')
  }
  const nettoyer = () => {
    document.removeEventListener('pointermove', bouge, true)
    document.removeEventListener('pointerup', lache, true)
    document.removeEventListener('keydown', touche, true)
    repere.remove()
    fantome.remove()
    marquer(null)
    delete source.dataset.glisse
    document.body.style.removeProperty('cursor')
  }
  const placer = (r: HTMLElement, v: NonNullable<ReturnType<typeof viser>>) => {
    if (repere.parentElement !== r) r.append(repere)
    repere.hidden = false
    // La toile peut être zoomée : on place le repère dans les unités de la liste, pas de l'écran.
    const rect = r.getBoundingClientRect()
    const echelle = r.offsetWidth > 0 ? rect.width / r.offsetWidth : 1
    repere.style.top = `${(v.y - rect.top) / echelle - 1}px`
    repere.style.left = `${(v.gauche - rect.left) / echelle}px`
    repere.style.right = '0px'
  }
  const bouge = (e: PointerEvent) => {
    if (!parti && Math.hypot(e.clientX - depart.clientX, e.clientY - depart.clientY) < SEUIL) return
    if (!parti) {
      parti = true
      source.dataset.glisse = ''
      document.body.style.cursor = 'grabbing'
    }
    const vise: Vise = sortie ? viserAilleurs(document.elementsFromPoint(e.clientX, e.clientY), carteSource) : { genre: 'ici' }
    fantome.hidden = vise.genre === 'ici'
    fantome.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 8}px)`
    if (vise.genre === 'toile') fantome.dataset.toile = ''
    else delete fantome.dataset.toile
    marquer(null)
    but = null
    repere.hidden = true
    if (vise.genre === 'toile') {
      but = { dans: 'toile', x: e.clientX, y: e.clientY }
    } else if (vise.genre === 'liste') {
      const v = viser(vise.racine, source, e.clientX, e.clientY)
      if (!v) return
      but = { dans: 'liste', carte: vise.carte, racine: vise.racine, viseur: v }
      marquer(vise.racine)
      placer(vise.racine, v)
    } else if (vise.genre === 'ici') {
      const v = viser(racine, source, e.clientX, e.clientY)
      if (!v) return
      but = { dans: 'ici', viseur: v }
      placer(racine, v)
    }
  }
  const lache = () => {
    const cible = but
    const aBouge = parti
    // Les rangs se lisent avant que le repère et le fantôme ne partent : eux n'ont pas de tâche.
    const rangCible = cible && cible.dans !== 'toile' ? rangs(cible.dans === 'ici' ? racine : cible.racine).indexOf(cible.viseur.tache) : -1
    nettoyer()
    if (!aBouge || !cible) return
    if (cible.dans === 'ici') fini(de, rangCible, cible.viseur.avant)
    else if (cible.dans === 'liste') sortie?.(de, { genre: 'liste', carte: cible.carte.dataset.id!, vers: rangCible, avant: cible.viseur.avant })
    else {
      const o = racine.closest('.notak-toile')?.getBoundingClientRect()
      sortie?.(de, { genre: 'toile', x: cible.x - (o?.left ?? 0), y: cible.y - (o?.top ?? 0) })
    }
  }
  const touche = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    nettoyer()
  }
  document.addEventListener('pointermove', bouge, true)
  document.addEventListener('pointerup', lache, true)
  document.addEventListener('keydown', touche, true)
}
