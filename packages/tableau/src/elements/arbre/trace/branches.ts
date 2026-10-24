import type { Boite, Cote } from '../disposition'

/** Les styles de branche de docs/XMIND.md § 5. */
export type StyleBranche = 'courbe' | 'droite' | 'coudee' | 'coudee-arrondie' | 'anse' | 'pli' | 'pli-arrondi' | 'aucune'

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
export function cheminBranche(p: Boite, e: Boite, cote: Cote, style: StyleBranche | 'arbre' | 'arbre-g' = 'courbe', s: Soulignes = {}): string {
  if (style === 'arbre' || style === 'arbre-g') {
    // Un arbre : un tronc qui descend (ou monte) du parent, puis un coude vers chaque enfant.
    const aDroite = style === 'arbre'
    const xt = aDroite ? p.x + 12 : p.x + p.l - 12
    const yt = cote === 'haut' ? p.y : p.y + p.h
    const ye = s.enfant ? e.y + e.h : e.y + e.h / 2
    return `M${n(xt)} ${n(yt)}V${n(ye)}H${n(aDroite ? e.x : e.x + e.l)}`
  }
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
    case 'anse': {
      // Une anse : la branche part du parent à la verticale et arrive à l'horizontale (ou l'inverse) sur l'enfant, d'un seul arc.
      if (horizontal) return `M${n(x0)} ${n(y0)}Q${n(x0)} ${n(y1)} ${n(x1)} ${n(y1)}`
      return `M${n(x0)} ${n(y0)}Q${n(x1)} ${n(y0)} ${n(x1)} ${n(y1)}`
    }
    case 'pli':
    case 'pli-arrondi': {
      // Un pli : un court trait en biais depuis le parent, puis l'enfant à l'horizontale (ou à la verticale).
      const arrondi = style === 'pli-arrondi'
      if (horizontal) {
        const k = Math.min(18, Math.abs(x1 - x0) / 2) * Math.sign(x1 - x0 || 1)
        if (arrondi) return `M${n(x0)} ${n(y0)}Q${n(x0 + k)} ${n(y0)} ${n(x0 + k)} ${n(y1)}H${n(x1)}`
        return `M${n(x0)} ${n(y0)}L${n(x0 + k)} ${n(y1)}H${n(x1)}`
      }
      const k = Math.min(18, Math.abs(y1 - y0) / 2) * Math.sign(y1 - y0 || 1)
      if (arrondi) return `M${n(x0)} ${n(y0)}Q${n(x0)} ${n(y0 + k)} ${n(x1)} ${n(y0 + k)}V${n(y1)}`
      return `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y0 + k)}V${n(y1)}`
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

/**
 * Une branche effilée (docs/XMIND.md § 5) : un trait plein qui s'amincit du parent (`l0` px) vers l'enfant (`l1`).
 * Tracée comme une surface, pour la courbe et la droite ; `null` pour les autres formes, qui gardent un trait.
 */
export function cheminEffile(p: Boite, e: Boite, cote: Cote, style: StyleBranche | 'arbre' | 'arbre-g', s: Soulignes, l0: number, l1: number): string | null {
  if (style !== 'courbe' && style !== 'droite') return null
  const [[x0, y0], [x1, y1]] = extremites(p, e, cote, s)
  const horizontal = cote === 'droite' || cote === 'gauche'
  const point = (t: number): [number, number] => {
    if (style === 'droite') return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]
    const [c1, c2] = horizontal ? [[(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1]] : [[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]]
    const u = 1 - t
    return [u ** 3 * x0 + 3 * u * u * t * c1[0]! + 3 * u * t * t * c2[0]! + t ** 3 * x1, u ** 3 * y0 + 3 * u * u * t * c1[1]! + 3 * u * t * t * c2[1]! + t ** 3 * y1]
  }
  const N = 16
  const pts = Array.from({ length: N + 1 }, (_, i) => point(i / N))
  const gauche: string[] = []
  const droite: string[] = []
  pts.forEach(([x, y], i) => {
    const [ax, ay] = pts[Math.max(0, i - 1)]!
    const [bx, by] = pts[Math.min(N, i + 1)]!
    const [dx, dy] = [bx - ax, by - ay]
    const k = Math.hypot(dx, dy) || 1
    const w = (l0 + (l1 - l0) * (i / N)) / 2
    gauche.push(`${n(x - (dy / k) * w)} ${n(y + (dx / k) * w)}`)
    droite.push(`${n(x + (dy / k) * w)} ${n(y - (dx / k) * w)}`)
  })
  return `M${gauche.join('L')}L${droite.reverse().join('L')}Z`
}
