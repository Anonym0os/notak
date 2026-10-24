import type { Boite, Cote } from '../disposition'

/** Les styles de branche de docs/XMIND.md § 5. */
export type StyleBranche = 'courbe' | 'droite' | 'coudee' | 'coudee-arrondie' | 'aucune'

/** Quels sujets sont soulignés (un sous-sujet) : leurs branches partent et arrivent au bout du trait, pas au milieu. */
export interface Soulignes {
  parent?: boolean
  enfant?: boolean
}

/** Le point d'où part une branche (le bord du parent tourné vers l'enfant), et celui où elle arrive. */
export function extremites(p: Boite, e: Boite, cote: Cote, s: Soulignes = {}): [[number, number], [number, number]] {
  const yp = s.parent ? p.y + p.h : p.y + p.h / 2
  const ye = s.enfant ? e.y + e.h : e.y + e.h / 2
  switch (cote) {
    case 'droite':
      return [[p.x + p.l, yp], [e.x, ye]]
    case 'gauche':
      return [[p.x, yp], [e.x + e.l, ye]]
    case 'bas':
      return [[p.x + p.l / 2, p.y + p.h], [e.x + e.l / 2, e.y]]
    case 'haut':
      return [[p.x + p.l / 2, p.y], [e.x + e.l / 2, e.y + e.h]]
  }
}

const n = (v: number) => Math.round(v * 10) / 10

/** Le chemin SVG d'une branche du parent `p` à l'enfant `e`. */
export function cheminBranche(p: Boite, e: Boite, cote: Cote, style: StyleBranche = 'courbe', s: Soulignes = {}): string {
  const [[x0, y0], [x1, y1]] = extremites(p, e, cote, s)
  const horizontal = cote === 'droite' || cote === 'gauche'
  switch (style) {
    case 'aucune':
      return ''
    case 'droite':
      return `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`
    case 'coudee': {
      if (horizontal) {
        const xm = (x0 + x1) / 2
        return `M${n(x0)} ${n(y0)}H${n(xm)}V${n(y1)}H${n(x1)}`
      }
      const ym = (y0 + y1) / 2
      return `M${n(x0)} ${n(y0)}V${n(ym)}H${n(x1)}V${n(y1)}`
    }
    case 'coudee-arrondie': {
      if (horizontal) {
        const xm = (x0 + x1) / 2
        const r = Math.min(8, Math.abs(y1 - y0) / 2, Math.abs(xm - x0))
        const sx = Math.sign(x1 - x0) || 1
        const sy = Math.sign(y1 - y0)
        if (sy === 0) return `M${n(x0)} ${n(y0)}H${n(x1)}`
        return `M${n(x0)} ${n(y0)}H${n(xm - sx * r)}Q${n(xm)} ${n(y0)} ${n(xm)} ${n(y0 + sy * r)}V${n(y1 - sy * r)}Q${n(xm)} ${n(y1)} ${n(xm + sx * r)} ${n(y1)}H${n(x1)}`
      }
      const ym = (y0 + y1) / 2
      return `M${n(x0)} ${n(y0)}V${n(ym)}H${n(x1)}V${n(y1)}`
    }
    case 'courbe': {
      // Une courbe en S : elle quitte le parent à l'horizontale (ou à la verticale) et arrive de même sur l'enfant.
      if (horizontal) {
        const xm = (x0 + x1) / 2
        return `M${n(x0)} ${n(y0)}C${n(xm)} ${n(y0)} ${n(xm)} ${n(y1)} ${n(x1)} ${n(y1)}`
      }
      const ym = (y0 + y1) / 2
      return `M${n(x0)} ${n(y0)}C${n(x0)} ${n(ym)} ${n(x1)} ${n(ym)} ${n(x1)} ${n(y1)}`
    }
  }
}
