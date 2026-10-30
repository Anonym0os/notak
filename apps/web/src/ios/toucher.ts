/**
 * Dans la webview d'iOS, un toucher bref sur un bouton n'en tire pas toujours le clic : la première fois après le
 * lancement, ou quand la page a bougé sous le doigt (une infobulle, un survol, une barre qui se redessine), WebKit le
 * prend pour un survol et attend un second toucher. On le voit sur le simulateur : la maison, le « + », les tuiles de
 * la barre restaient sans effet au premier toucher.
 *
 * Ici, un doigt relevé sur place sur un bouton (ou ce qui en tient lieu) attend son clic un court instant ; s'il ne
 * vient pas, on le donne, une fois. Le clic que WebKit tirerait quand même ensuite est absorbé. Les champs, les textes
 * qu'on écrit et la toile elle-même (qui suit le doigt par ses propres évènements) ne sont pas touchés.
 */

const CLIQUABLE = 'button, [role="button"], [role="menuitem"], [role="tab"], [role="option"], a[href], summary, label'
/** Ce qui garde son comportement natif : la saisie, et le choix de fichier qui doit venir d'un vrai geste. */
const NATIF = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], label:has(input[type="file"])'
/** Au-delà, le doigt a glissé ou s'est attardé : ce n'est pas un toucher. */
const DEPLACEMENT_MAX = 10
const DUREE_MAX = 600
/** Le délai laissé à WebKit pour tirer son clic, et celui pendant lequel un clic en retard est absorbé. */
const ATTENTE = 80
const ABSORBE = 600

export function reparerToucher(fenetre: Window): () => void {
  const doc = fenetre.document
  let appui: { id: number; x: number; y: number; t: number; cible: Element } | null = null
  let attendu: { cible: Element; minuteur: ReturnType<typeof setTimeout> } | null = null
  let donne: { cible: Element; t: number } | null = null
  /** Vrai pendant le clic que nous donnons : il passe sans être compté. */
  let enCours = false

  const cliquable = (n: EventTarget | null): Element | null => {
    const el = n instanceof Element ? n.closest(CLIQUABLE) : null
    if (!el || el.closest(NATIF) || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return null
    return el
  }
  const bas = (e: PointerEvent) => {
    // Le Pencil touche les boutons comme le doigt : même clic perdu, même remède.
    if ((e.pointerType !== 'touch' && e.pointerType !== 'pen') || !e.isPrimary) return
    const cible = cliquable(e.target)
    appui = cible ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, cible } : null
  }
  const haut = (e: PointerEvent) => {
    const a = appui
    appui = null
    if (!a || e.pointerId !== a.id) return
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > DEPLACEMENT_MAX || e.timeStamp - a.t > DUREE_MAX) return
    // Le doigt doit se relever sur le bouton qu'il a pressé (ou dedans).
    const sous = doc.elementFromPoint(e.clientX, e.clientY)
    if (sous && !a.cible.contains(sous) && sous !== a.cible) return
    if (attendu) clearTimeout(attendu.minuteur)
    const cible = a.cible
    attendu = {
      cible,
      minuteur: setTimeout(() => {
        attendu = null
        if (!cible.isConnected) return
        donne = { cible, t: performance.now() }
        enCours = true
        try {
          ;(cible as HTMLElement).click()
        } finally {
          enCours = false
        }
      }, ATTENTE),
    }
  }
  const annuler = () => {
    appui = null
  }
  const clic = (e: MouseEvent) => {
    // Le clic que nous donnons nous-mêmes passe ; un clic de WebKit sur le même bouton juste après est absorbé.
    if (enCours) return
    const cible = e.target instanceof Element ? e.target : null
    if (donne && cible && (donne.cible === cible || donne.cible.contains(cible)) && performance.now() - donne.t < ABSORBE) {
      e.preventDefault()
      e.stopImmediatePropagation()
      donne = null
      return
    }
    // Le clic est venu de lui-même : rien à donner.
    if (attendu && cible && (attendu.cible === cible || attendu.cible.contains(cible))) {
      clearTimeout(attendu.minuteur)
      attendu = null
    }
  }
  fenetre.addEventListener('pointerdown', bas, true)
  fenetre.addEventListener('pointerup', haut, true)
  fenetre.addEventListener('pointercancel', annuler, true)
  fenetre.addEventListener('click', clic, true)
  return () => {
    if (attendu) clearTimeout(attendu.minuteur)
    fenetre.removeEventListener('pointerdown', bas, true)
    fenetre.removeEventListener('pointerup', haut, true)
    fenetre.removeEventListener('pointercancel', annuler, true)
    fenetre.removeEventListener('click', clic, true)
  }
}
