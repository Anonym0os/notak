/** Les zones sûres de l'écran (encoche, barre d'état, barre d'accueil), en px ; nulles hors d'un téléphone. */
export interface Zones {
  haut: number
  droite: number
  bas: number
  gauche: number
}

export const SANS_ZONES: Zones = { haut: 0, droite: 0, bas: 0, gauche: 0 }

let sonde: HTMLDivElement | null = null

/**
 * Les zones sûres telles que le système les donne à la page (`env(safe-area-inset-*)`). Une variable CSS ne se relit
 * pas en px : une sonde invisible les prend en marge intérieure, et le navigateur les calcule.
 */
export function zonesSures(): Zones {
  if (typeof document === 'undefined' || !document.body) return SANS_ZONES
  if (!sonde?.isConnected) {
    sonde = document.createElement('div')
    sonde.setAttribute('aria-hidden', 'true')
    sonde.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
    document.body.appendChild(sonde)
  }
  const s = getComputedStyle(sonde)
  const px = (v: string) => Number.parseFloat(v) || 0
  return { haut: px(s.paddingTop), droite: px(s.paddingRight), bas: px(s.paddingBottom), gauche: px(s.paddingLeft) }
}
