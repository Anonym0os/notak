/**
 * Faire glisser une tâche par sa poignée, pour la changer de place dans sa liste. Le geste est le même hors
 * édition (les tâches sont des nœuds React) et en édition (des nœuds Tiptap) : il ne lit que le DOM, et
 * rend des rangs dans l'ordre de lecture, que `deplacer` (JSON) et `deplacerDansEditeur` (Tiptap) comprennent.
 */

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

/**
 * Commence un glisser à partir d'un appui sur la poignée de `source`. `fini(de, vers, avant)` est appelé au
 * relâchement si la tâche est venue se poser quelque part ; Échap abandonne.
 */
export function glisserTache(depart: PointerEvent, racine: HTMLElement, source: HTMLElement, fini: (de: number, vers: number, avant: boolean) => void) {
  const rangs = () => [...racine.querySelectorAll<HTMLElement>(TACHES)]
  const de = rangs().indexOf(source)
  if (de < 0) return
  const repere = document.createElement('div')
  repere.className = 'notak-glisse-repere'
  repere.hidden = true
  racine.append(repere)
  let but: ReturnType<typeof viser> = null
  let parti = false

  const nettoyer = () => {
    document.removeEventListener('pointermove', bouge, true)
    document.removeEventListener('pointerup', lache, true)
    document.removeEventListener('keydown', touche, true)
    repere.remove()
    delete source.dataset.glisse
    document.body.style.removeProperty('cursor')
  }
  const bouge = (e: PointerEvent) => {
    if (!parti && Math.hypot(e.clientX - depart.clientX, e.clientY - depart.clientY) < SEUIL) return
    if (!parti) {
      parti = true
      source.dataset.glisse = ''
      document.body.style.cursor = 'grabbing'
    }
    but = viser(racine, source, e.clientX, e.clientY)
    repere.hidden = !but
    if (!but) return
    // La toile peut être zoomée : on place le repère dans les unités de la liste, pas de l'écran.
    const r = racine.getBoundingClientRect()
    const echelle = racine.offsetWidth > 0 ? r.width / racine.offsetWidth : 1
    repere.style.top = `${(but.y - r.top) / echelle - 1}px`
    repere.style.left = `${(but.gauche - r.left) / echelle}px`
    repere.style.right = '0px'
  }
  const lache = () => {
    const cible = but
    const aBouge = parti
    nettoyer()
    if (aBouge && cible) fini(de, rangs().indexOf(cible.tache), cible.avant)
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
