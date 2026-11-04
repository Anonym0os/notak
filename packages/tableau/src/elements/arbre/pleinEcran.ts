/**
 * Le plein écran d'un élément, tel que les navigateurs le donnent vraiment. WebKit (Safari, l'app de bureau) n'émet que
 * l'événement préfixé, et sa promesse peut échouer alors que la fenêtre passe quand même en plein écran ; l'iPhone n'a
 * pas de plein écran d'élément. On croit donc l'événement, pas la promesse.
 *
 * La demande doit partir du geste (le clic, la touche) : `lancerPresentation` la fait, et la présentation qui s'ouvre
 * reprend la même au lieu d'en lancer une seconde. La promesse dit quand l'écran est installé : vrai, le plein écran
 * est là ; faux, il ne viendra pas (refusé, absent, ou trop lent : `ATTENTE_MAX`).
 */

type Doc = Document & { webkitFullscreenElement?: Element | null }
type Demandable = Element & { webkitRequestFullscreen?: () => void }

/** Au-delà, on n'attend plus le plein écran (macOS l'anime en un peu plus d'une demi-seconde). */
export const ATTENTE_MAX = 900

export const enPleinEcran = (): boolean => typeof document !== 'undefined' && !!(document.fullscreenElement ?? (document as Doc).webkitFullscreenElement)

let enCours: { el: Element; issue: Promise<boolean> } | null = null

export function demanderPleinEcran(el: Element | null | undefined, attente = ATTENTE_MAX): Promise<boolean> {
  if (!el || typeof document === 'undefined') return Promise.resolve(false)
  if (enPleinEcran()) return Promise.resolve(true)
  if (enCours?.el === el) return enCours.issue
  let fini = false
  const issue = new Promise<boolean>((resoudre) => {
    let minuteur: ReturnType<typeof setTimeout> | undefined
    const change = () => enPleinEcran() && finir(true)
    function finir(v: boolean) {
      if (fini) return
      fini = true
      clearTimeout(minuteur)
      document.removeEventListener('fullscreenchange', change)
      document.removeEventListener('webkitfullscreenchange', change)
      if (enCours?.el === el) enCours = null
      resoudre(v)
    }
    const e = el as Demandable
    if (typeof e.requestFullscreen !== 'function' && typeof e.webkitRequestFullscreen !== 'function') return finir(false)
    document.addEventListener('fullscreenchange', change)
    document.addEventListener('webkitfullscreenchange', change)
    minuteur = setTimeout(() => finir(enPleinEcran()), attente)
    try {
      if (typeof e.requestFullscreen === 'function') {
        // Refusée, la promesse ne dit pas tout (WebKit) : on laisse encore un instant à l'événement.
        void e.requestFullscreen().catch(() => setTimeout(() => finir(enPleinEcran()), 150))
      } else e.webkitRequestFullscreen?.()
    } catch {
      finir(false)
    }
  })
  if (!fini) enCours = { el, issue }
  return issue
}

/** Sort du plein écran, quel que soit le préfixe. */
export function sortirDuPleinEcran(): void {
  const doc = document as Doc & { webkitExitFullscreen?: () => void }
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.()
}
