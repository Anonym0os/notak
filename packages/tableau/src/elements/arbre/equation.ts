import temml from 'temml'

/**
 * Les équations d'une carte : du LaTeX que Temml (MIT, 168 Ko minifié, sans police à charger) écrit en MathML, que le
 * navigateur dessine lui-même. La taille se mesure dans le DOM quand il a une mise en page ; sans elle (les tests), elle
 * s'estime d'après le texte.
 */

export interface EquationRendue {
  /** Le MathML, ou `null` si le LaTeX ne se lit pas. */
  html: string | null
  l: number
  h: number
}

const memo = new Map<string, EquationRendue>()

/** Le MathML d'un LaTeX, ou `null` s'il est invalide. */
export function enMathml(latex: string): string | null {
  try {
    return temml.renderToString(latex, { throwOnError: true, displayMode: false })
  } catch {
    return null
  }
}

/** À peu près la taille d'une formule, d'après ce qu'elle contient : sans mise en page, faute de mieux. */
function estimer(latex: string): { l: number; h: number } {
  const lignes = latex.split('\n').filter(Boolean).length || 1
  const nu = latex.replace(/\\[a-zA-Z]+|[{}^_\\]/g, '')
  const haute = /\\(frac|dfrac|sum|int|prod|sqrt|binom|lim)/.test(latex)
  return { l: Math.min(420, Math.max(28, Math.round(nu.length * 9 + 12))), h: lignes * (haute ? 44 : 30) }
}

let hote: HTMLDivElement | null = null

/** Mesure une formule en la posant, un instant, hors de l'écran. */
function mesurer(html: string): { l: number; h: number } | null {
  if (typeof document === 'undefined' || !document.body) return null
  if (!hote || !hote.isConnected) {
    hote = document.createElement('div')
    hote.setAttribute('aria-hidden', 'true')
    hote.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;font:16px Inter,system-ui,sans-serif;white-space:nowrap'
    document.body.appendChild(hote)
  }
  hote.innerHTML = html
  const r = hote.getBoundingClientRect()
  hote.innerHTML = ''
  return r.width > 0 && r.height > 0 ? { l: Math.ceil(r.width) + 2, h: Math.ceil(r.height) + 2 } : null
}

export function equation(latex: string): EquationRendue {
  const deja = memo.get(latex)
  if (deja) return deja
  const html = enMathml(latex)
  const taille = (html ? mesurer(html) : null) ?? estimer(latex)
  const r: EquationRendue = { html, ...taille }
  if (memo.size > 500) memo.clear()
  memo.set(latex, r)
  return r
}
