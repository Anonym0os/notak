import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { t } from '../../../langue'
import { viderToile } from '../../image/lecture'
import { densiteDeDessin } from './mise'
import { type Bout, tranches } from './recherche'

export type MoteurPdf = typeof import('pdfjs-dist')

/** Après ce temps sans changement d'échelle, la page se redessine nette ; d'ici là, l'ancienne image s'étire. */
const APAISEMENT_MS = 140

/** Une valeur qui suit `v`, mais seulement quand `v` n'a plus bougé depuis `ms`. */
function useApaisee<T>(v: T, ms: number): T {
  const [stable, setStable] = useState(v)
  useEffect(() => {
    if (Object.is(v, stable)) return
    const minuterie = setTimeout(() => setStable(v), ms)
    return () => clearTimeout(minuterie)
  }, [v, stable, ms])
  return stable
}

/** Le texte de ce morceau, ses tranches trouvées dans des `span` à part (celles du résultat montré marquées). */
function surligner(div: HTMLElement, texte: string, bouts: readonly (Bout & { courant?: boolean })[]) {
  div.replaceChildren(
    ...tranches(texte.length, bouts).map((tr) => {
      const morceau = texte.slice(tr.debut, tr.fin)
      if (!tr.marque) return document.createTextNode(morceau)
      const s = document.createElement('span')
      s.className = tr.courant ? 'notak-pdf-trouve notak-pdf-trouve-courant' : 'notak-pdf-trouve'
      s.textContent = morceau
      return s
    }),
  )
}

/**
 * Une page de la visionneuse, posée à son haut dans la colonne : l'image de la page (une toile dessinée par pdf.js, à
 * la densité de l'écran), puis son calque de texte, transparent, qui rend le texte sélectionnable et copiable. Elle ne
 * vit que tant qu'elle est près de la vue : la colonne ne monte que les pages proches, et une page qui part rend sa
 * toile. Au zoom, l'image se redessine une fois l'échelle posée ; le calque de texte, lui, suit la variable
 * `--total-scale-factor` sans se refaire. `dessous` se pose entre l'image et le texte (les traits), `children` au-dessus.
 */
export function PagePdf({
  pdfjs,
  doc,
  index,
  echelle,
  haut,
  largeur,
  hauteur,
  bouts,
  dessous,
  children,
}: {
  pdfjs: MoteurPdf
  doc: PDFDocumentProxy
  index: number
  /** Pixels d'écran par point du PDF. */
  echelle: number
  haut: number
  largeur: number
  hauteur: number
  /** Ce que la recherche surligne sur cette page. */
  bouts?: readonly (Bout & { courant?: boolean })[] | undefined
  dessous?: ReactNode
  children?: ReactNode
}) {
  const image = useRef<HTMLDivElement>(null)
  const calque = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [texte, setTexte] = useState<{ divs: HTMLElement[]; chaines: string[] } | null>(null)
  const echelleDessin = useApaisee(echelle, APAISEMENT_MS)

  useEffect(() => {
    let vivant = true
    doc.getPage(index + 1).then(
      (p) => vivant && setPage(p),
      () => {},
    )
    return () => {
      vivant = false
    }
  }, [doc, index])

  // L'image : dessinée à part, puis posée à la place de l'ancienne, qui ne laisse donc jamais un blanc.
  useEffect(() => {
    const hote = image.current
    if (!page || !hote) return
    const base = page.getViewport({ scale: echelleDessin })
    const k = densiteDeDessin(base.width, base.height, window.devicePixelRatio || 1)
    const vue = page.getViewport({ scale: echelleDessin * k })
    const toile = document.createElement('canvas')
    toile.className = 'notak-pdf-toile'
    toile.width = Math.max(1, Math.floor(vue.width))
    toile.height = Math.max(1, Math.floor(vue.height))
    const ctx = toile.getContext('2d')
    if (!ctx) return
    const tache = page.render({ canvas: toile, canvasContext: ctx, viewport: vue })
    let posee = false
    tache.promise.then(
      () => {
        posee = true
        for (const ancienne of hote.querySelectorAll('canvas')) {
          viderToile(ancienne)
          ancienne.remove()
        }
        hote.append(toile)
      },
      () => viderToile(toile),
    )
    return () => {
      if (posee) return
      tache.cancel()
      viderToile(toile)
    }
  }, [page, echelleDessin])
  // Partie, la page rend la mémoire de sa toile tout de suite (WebKit la garde sinon jusqu'au ramasse-miettes).
  useEffect(() => {
    const hote = image.current
    return () => {
      for (const t of hote?.querySelectorAll('canvas') ?? []) viderToile(t)
    }
  }, [])

  useEffect(() => {
    const hote = calque.current
    if (!page || !hote) return
    const couche = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: hote, viewport: page.getViewport({ scale: 1 }) })
    let vivant = true
    couche.render().then(
      () => vivant && setTexte({ divs: couche.textDivs, chaines: couche.textContentItemsStr }),
      () => {},
    )
    return () => {
      vivant = false
      couche.cancel()
      hote.replaceChildren()
      setTexte(null)
    }
  }, [pdfjs, page])

  // Les résultats de la recherche, surlignés dans le calque de texte ; rendus à leur texte quand ils changent.
  useLayoutEffect(() => {
    if (!texte || !bouts || bouts.length === 0) return
    const parMorceau = new Map<number, (Bout & { courant?: boolean })[]>()
    for (const b of bouts) parMorceau.set(b.morceau, [...(parMorceau.get(b.morceau) ?? []), b])
    for (const [m, bs] of parMorceau) {
      const div = texte.divs[m]
      const s = texte.chaines[m]
      if (div && s !== undefined) surligner(div, s, bs)
    }
    return () => {
      for (const m of parMorceau.keys()) {
        const div = texte.divs[m]
        if (div) div.textContent = texte.chaines[m] ?? ''
      }
    }
  }, [texte, bouts])

  const style = { top: haut, width: largeur, height: hauteur, '--total-scale-factor': echelle } as CSSProperties
  return (
    <div className="notak-pdf-page" data-page={index + 1} role="group" aria-label={t('pdf.pageN', { n: index + 1 })} style={style}>
      <div ref={image} className="notak-pdf-image" />
      {dessous}
      <div ref={calque} className="notak-pdf-texte" />
      {children}
    </div>
  )
}
