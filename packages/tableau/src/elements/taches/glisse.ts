/**
 * Faire glisser une tâche par sa poignée, pour la changer de place dans sa liste. Le geste est le même hors
 * édition (les tâches sont des nœuds React) et en édition (des nœuds Tiptap) : il ne lit que le DOM, et
 * rend des rangs dans l'ordre de lecture, que `deplacer` (JSON) et `deplacerDansEditeur` (Tiptap) comprennent.
 *
 * Ce qui suit le pointeur est une carte de liste (la tâche et ses sous-tâches, en blanc, avec son ombre), qui se
 * fait transparente au-dessus d'une autre liste ; la tâche reste à sa place, en gris à 40 %. Un trait de 2 px montre
 * où elle se posera, entre deux tâches ; c'est la case de la carte, et non le pointeur, qui choisit le niveau : on la
 * glisse vers la droite pour la ranger sous la tâche d'au-dessus, vers la gauche pour la sortir. Alt (Option) copie
 * la tâche au lieu de la déplacer.
 *
 * Hors édition, la tâche peut aussi sortir de sa liste : vers une autre liste de tâches du tableau, vers une colonne,
 * ou vers le vide de la toile. Le geste ne fait que dire où elle est lâchée (`Sortie`) ; c'est l'appelant qui change
 * le tableau.
 */

import { indexInsertion } from '../../coeur/ordre'
import type { Id } from '../../coeur/tableau'
import { type Place, PROFONDEUR_MAX } from './liste'

const TACHES = 'li[data-type="taskItem"]'
/** En deçà de ce déplacement (px), c'est un clic, pas un glisser. */
const SEUIL = 4
/** D'une colonne de cases à la suivante, en px de la liste (la sous-liste s'ouvre dans la colonne du texte). */
const PAS_NIVEAU = 26
/** Le remplissage de la carte autour de la liste, en px de la liste. */
const MARGE_HAUT = 19
const MARGE_COTE = 24

/** Où la tâche est lâchée, quand elle quitte sa liste. `x`, `y` : le pointeur, dans le repère de la toile (son coin haut gauche). */
export type Sortie =
  | { genre: 'liste'; carte: Id; vers: number; place: Place }
  | { genre: 'toile'; x: number; y: number }
  | { genre: 'colonne'; colonne: Id; index: number }

/** Ce qui est sous le pointeur, pour une tâche qui quitte sa liste. */
export type Vise =
  | { genre: 'ici' }
  | { genre: 'liste'; carte: HTMLElement; racine: HTMLElement }
  | { genre: 'colonne'; colonne: HTMLElement }
  | { genre: 'toile' }
  | { genre: 'rien' }

/**
 * Où tomberait la tâche : sa propre carte (`ici`), la liste d'une autre carte, une colonne, le vide de la toile, ou
 * rien (une note, une liste qu'on est en train d'écrire). `pile` : les éléments sous le pointeur, du dessus au
 * dessous (`document.elementsFromPoint`).
 */
export function viserAilleurs(pile: readonly Element[], propre: Element | null): Vise {
  const cartes = pile.filter((n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('notak-carte'))
  const dessus = cartes[0]
  if (dessus) {
    if (dessus === propre) return { genre: 'ici' }
    const racine = dessus.querySelector<HTMLElement>(':scope > .notak-taches')
    if (dessus.dataset.type === 'taches') {
      // Une liste qu'on est en train d'écrire n'accueille rien : son texte vit dans l'éditeur.
      if (dessus.dataset.edition !== undefined || dessus.dataset.verrou !== undefined || !racine) return { genre: 'rien' }
      return { genre: 'liste', carte: dessus, racine }
    }
    // Sur une colonne, ou sur l'un de ses éléments : la tâche y entre, à sa place parmi eux.
    const colonne = cartes.find((c) => c.dataset.type === 'colonne')
    if (colonne && colonne.dataset.verrou === undefined && colonne !== propre) return { genre: 'colonne', colonne }
    return { genre: 'rien' }
  }
  return pile.some((n) => n.classList.contains('notak-toile')) ? { genre: 'toile' } : { genre: 'rien' }
}

/** Un endroit entre deux tâches où la tâche peut se poser, et à quel niveau. */
export interface Option {
  niveau: number
  /** La tâche visée, et la place par rapport à elle. */
  vers: HTMLElement
  place: Place
}

/** Le niveau d'une tâche dans sa liste : 1 en haut. */
const niveauDe = (li: HTMLElement) => {
  let n = 1
  for (let p = li.parentElement?.closest<HTMLElement>(TACHES); p; p = p.parentElement?.closest<HTMLElement>(TACHES)) n++
  return n
}

/**
 * Les façons de poser une tâche dans l'espace entre `a` (au-dessus, ou `null` en tête de liste) et `b` (en dessous,
 * ou `null` en queue) : au niveau de `b` (devant lui), plus haut (derrière un ancêtre de `a`), ou plus bas (dans `a`,
 * qui n'a alors pas de sous-tâche). Une tâche de `hauteur` niveaux ne passe pas le sixième.
 */
export function options(a: HTMLElement | null, b: HTMLElement | null, hauteur: number): Option[] {
  if (!a) return b ? [{ niveau: 1, vers: b, place: 'avant' }] : []
  const nA = niveauDe(a)
  const nB = b ? niveauDe(b) : 1
  const res: Option[] = []
  for (let niveau = nB; niveau <= nA + 1; niveau++) {
    if (niveau + hauteur - 1 > PROFONDEUR_MAX) continue
    if (b && niveau === nB) res.push({ niveau, vers: b, place: 'avant' })
    else if (niveau === nA + 1) res.push({ niveau, vers: a, place: 'dans' })
    else {
      // L'ancêtre de `a` (ou `a`) à ce niveau : on se pose derrière lui et ses sous-tâches.
      let x = a
      while (niveauDe(x) > niveau) x = x.parentElement!.closest<HTMLElement>(TACHES)!
      res.push({ niveau, vers: x, place: 'apres' })
    }
  }
  return res
}

/** L'option dont la colonne de cases est la plus proche de la case de la carte. `colonnes[i]` : l'abscisse de la case du niveau i + 1. */
export function plusProche(opts: readonly Option[], colonneDe: (niveau: number) => number, caseX: number): Option | null {
  let meilleure: Option | null = null
  let ecart = Number.POSITIVE_INFINITY
  for (const o of opts) {
    const e = Math.abs(colonneDe(o.niveau) - caseX)
    if (e < ecart) {
      ecart = e
      meilleure = o
    }
  }
  return meilleure
}

/** Le nombre de niveaux d'une tâche et de ses sous-tâches dans le DOM : 1 sans sous-tâche. */
const hauteurDe = (li: HTMLElement) => {
  const base = niveauDe(li)
  let h = 1
  for (const sous of li.querySelectorAll<HTMLElement>(TACHES)) h = Math.max(h, niveauDe(sous) - base + 1)
  return h
}

/** Le bas du texte et des puces d'une tâche, sans ses sous-tâches. */
const basDe = (li: HTMLElement) => {
  const sous = li.querySelector(':scope > div > ul')
  return sous && sous.children.length > 0 ? sous.getBoundingClientRect().top : li.getBoundingClientRect().bottom
}

/**
 * Où se pose la tâche dans cette liste : l'espace entre deux tâches le plus proche du pointeur (`y`), puis le niveau
 * que dit la case de la carte (`caseX`). `exclu` : la tâche qu'on porte (et ses sous-tâches), qui n'est pas un voisin.
 * Rend aussi le trait à dessiner (en px d'écran) et si c'est l'endroit même d'où la tâche vient.
 */
export function viser(racine: HTMLElement, exclu: HTMLElement | null, y: number, caseX: number) {
  const toutes = [...racine.querySelectorAll<HTMLElement>(TACHES)]
  const voisines = toutes.filter((li) => !exclu || !exclu.contains(li))
  const liste = racine.querySelector('ul')
  if (!liste || voisines.length === 0) return null
  const r = racine.getBoundingClientRect()
  const k = racine.offsetWidth > 0 ? r.width / racine.offsetWidth : 1
  const gauche = liste.getBoundingClientRect().left
  // Le trait se tient au milieu du vide entre le bas du texte de la tâche d'au-dessus et le haut de celle d'en dessous.
  const ligne = (g: number) => {
    const a = voisines[g - 1]
    const b = voisines[g]
    if (!a) return b!.getBoundingClientRect().top
    if (!b) return voisines.at(-1)!.getBoundingClientRect().bottom
    return (basDe(a) + b.getBoundingClientRect().top) / 2
  }
  let g = 0
  for (let i = 1; i <= voisines.length; i++) if (Math.abs(ligne(i) - y) < Math.abs(ligne(g) - y)) g = i
  const a = voisines[g - 1] ?? null
  const b = voisines[g] ?? null
  // D'où vient la tâche : l'espace où elle est déjà, à son niveau, n'est pas une destination.
  const origine = exclu ? voisines.filter((li) => !!(li.compareDocumentPosition(exclu) & Node.DOCUMENT_POSITION_FOLLOWING)).length : -1
  const choix = plusProche(options(a, b, exclu ? hauteurDe(exclu) : 1), (niveau) => gauche + (niveau - 1) * PAS_NIVEAU * k, caseX)
  // Poser la tâche là où elle est déjà ne change rien : pas de trait.
  if (!choix || (g === origine && exclu && choix.niveau === niveauDe(exclu))) return null
  const x = gauche + (choix.niveau - 1) * PAS_NIVEAU * k
  return {
    ...choix,
    rang: toutes.indexOf(choix.vers),
    /** Le trait, en px de la liste (zoom défait) : sa hauteur et son bord gauche, et en px d'écran pour une colonne. */
    trait: { top: (ligne(g) - r.top) / k - 1, left: (x - r.left) / k },
  }
}

/** Le trait entre deux éléments d'une colonne, en px d'écran, et l'index où la tâche y entrera. */
function viserColonne(colonne: HTMLElement, y: number) {
  const enfants = [...colonne.querySelectorAll<HTMLElement>('.notak-carte[data-id]')].filter((c) => c.parentElement?.closest('.notak-carte') === colonne)
  const rects = enfants.map((c) => c.getBoundingClientRect())
  const index = indexInsertion(rects.map((r) => (r.top + r.bottom) / 2), y)
  const c = colonne.getBoundingClientRect()
  const trait = index < rects.length ? rects[index]!.top - 4 : rects.length > 0 ? rects.at(-1)!.bottom + 4 : (colonne.querySelector('[data-depot]')?.getBoundingClientRect() ?? c).top
  return { index, trait, gauche: c.left + 8, droite: c.right - 8 }
}

/**
 * Commence un glisser à partir d'un appui sur la poignée de `source`. `fini(de, vers, place, copie)` est appelé au
 * relâchement si la tâche est venue se poser quelque part de sa liste ; Échap abandonne. Avec `sortie`, la tâche peut
 * aussi être lâchée ailleurs : `sortie(de, ou, copie)` est alors appelé à la place.
 */
export function glisserTache(
  depart: PointerEvent,
  racine: HTMLElement,
  source: HTMLElement,
  fini: (de: number, vers: number, place: Place, copie: boolean) => void,
  sortie?: (de: number, ou: Sortie, copie: boolean) => void,
) {
  const rangs = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>(TACHES)]
  const de = rangs(racine).indexOf(source)
  if (de < 0) return
  const carteSource = racine.closest<HTMLElement>('.notak-carte')
  const toile = racine.closest<HTMLElement>('.notak-toile')
  const repere = document.createElement('div')
  repere.className = 'notak-glisse-repere'
  repere.hidden = true
  racine.append(repere)
  // Ce qui suit le pointeur : la tâche et ses sous-tâches, dans une carte de liste.
  const rs = source.getBoundingClientRect()
  const echelle = racine.offsetWidth > 0 ? racine.getBoundingClientRect().width / racine.offsetWidth : 1
  const apercu = document.createElement('div')
  apercu.className = 'notak-glisse-apercu'
  apercu.hidden = true
  apercu.style.width = `${carteSource?.offsetWidth ?? racine.offsetWidth + 2 * MARGE_COTE}px`
  const miroir = document.createElement('div')
  miroir.className = 'notak-taches'
  const ul = document.createElement('ul')
  ul.dataset.type = 'taskList'
  const copieDuLi = source.cloneNode(true) as HTMLElement
  copieDuLi.removeAttribute('data-glisse')
  copieDuLi.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'))
  copieDuLi.querySelectorAll('.notak-tache-poignee, .notak-tache-suppr, .ProseMirror-widget').forEach((n) => n.remove())
  ul.append(copieDuLi)
  miroir.append(ul)
  apercu.append(miroir)
  ;(toile ?? document.body).append(apercu)

  type But =
    | { dans: 'ici'; v: NonNullable<ReturnType<typeof viser>> }
    | { dans: 'liste'; carte: HTMLElement; racine: HTMLElement; v: NonNullable<ReturnType<typeof viser>> }
    | { dans: 'colonne'; colonne: HTMLElement; index: number }
    | { dans: 'toile'; x: number; y: number }
  let but: But | null = null
  let parti = false
  let copie = false
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
    apercu.remove()
    marquer(null)
    delete source.dataset.glisse
    delete source.dataset.copie
    document.body.style.removeProperty('cursor')
  }
  /** Le trait dans une liste : dans les unités de la liste, pas de l'écran (la toile peut être zoomée). */
  const placer = (r: HTMLElement, v: NonNullable<ReturnType<typeof viser>>) => {
    if (repere.parentElement !== r) r.append(repere)
    delete repere.dataset.fixe
    repere.hidden = false
    repere.style.top = `${v.trait.top}px`
    repere.style.left = `${v.trait.left}px`
    repere.style.right = '0px'
    repere.style.width = ''
  }
  const placerColonne = (c: ReturnType<typeof viserColonne>) => {
    if (repere.parentElement !== document.body) document.body.append(repere)
    repere.dataset.fixe = ''
    repere.hidden = false
    repere.style.top = `${c.trait - 1}px`
    repere.style.left = `${c.gauche}px`
    repere.style.right = 'auto'
    repere.style.width = `${c.droite - c.gauche}px`
  }
  const bouge = (e: PointerEvent) => {
    if (!parti && Math.hypot(e.clientX - depart.clientX, e.clientY - depart.clientY) < SEUIL) return
    if (!parti) {
      parti = true
      source.dataset.glisse = ''
      document.body.style.cursor = 'grabbing'
    }
    copie = e.altKey
    if (copie) source.dataset.copie = ''
    else delete source.dataset.copie
    document.body.style.cursor = copie ? 'copy' : 'grabbing'
    // La carte garde la place de la tâche relativement au pointeur : sa case dit le niveau.
    const dx = e.clientX - depart.clientX
    const dy = e.clientY - depart.clientY
    const caseX = rs.left + dx
    apercu.hidden = false
    apercu.style.transform = `translate(${caseX - MARGE_COTE * echelle}px, ${rs.top + dy - MARGE_HAUT * echelle}px) scale(${echelle})`
    const vise: Vise = sortie ? viserAilleurs(document.elementsFromPoint(e.clientX, e.clientY).filter((n) => !apercu.contains(n)), carteSource) : { genre: 'ici' }
    // Au-dessus d'une autre liste, la carte devient transparente : on voit où la tâche ira.
    apercu.dataset.dessus = vise.genre === 'liste' || vise.genre === 'colonne' ? vise.genre : ''
    marquer(null)
    but = null
    repere.hidden = true
    if (vise.genre === 'toile') {
      but = { dans: 'toile', x: e.clientX, y: e.clientY }
    } else if (vise.genre === 'colonne') {
      const c = viserColonne(vise.colonne, e.clientY)
      but = { dans: 'colonne', colonne: vise.colonne, index: c.index }
      placerColonne(c)
    } else if (vise.genre === 'liste') {
      const v = viser(vise.racine, null, e.clientY, caseX)
      if (!v) return
      but = { dans: 'liste', carte: vise.carte, racine: vise.racine, v }
      marquer(vise.racine)
      placer(vise.racine, v)
    } else if (vise.genre === 'ici') {
      const v = viser(racine, copie ? null : source, e.clientY, caseX)
      if (!v) return
      but = { dans: 'ici', v }
      placer(racine, v)
    }
  }
  const lache = (e: PointerEvent) => {
    const cible = but
    const aBouge = parti
    const avecCopie = e.altKey
    // Les rangs se lisent avant que le trait et la carte ne partent : eux n'ont pas de tâche.
    const rangCible = cible && (cible.dans === 'ici' || cible.dans === 'liste') ? cible.v.rang : -1
    nettoyer()
    if (!aBouge || !cible) return
    if (cible.dans === 'ici') fini(de, rangCible, cible.v.place, avecCopie)
    else if (cible.dans === 'liste') sortie?.(de, { genre: 'liste', carte: cible.carte.dataset.id!, vers: rangCible, place: cible.v.place }, avecCopie)
    else if (cible.dans === 'colonne') sortie?.(de, { genre: 'colonne', colonne: cible.colonne.dataset.id!, index: cible.index }, avecCopie)
    else {
      const o = toile?.getBoundingClientRect()
      sortie?.(de, { genre: 'toile', x: cible.x - (o?.left ?? 0), y: cible.y - (o?.top ?? 0) }, avecCopie)
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
