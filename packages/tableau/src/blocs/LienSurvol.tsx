import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../langue'

/**
 * Le survol d'un lien (docs/NOTION.md § 10) : après un court temps, un panneau sous le lien donne son adresse (qui
 * s'ouvre dans un nouvel onglet) et « Modifier », qui ouvre l'éditeur de lien de la bulle sur tout le lien.
 */

/** Le temps de survol avant que le panneau paraisse, et la grâce pour passer du lien au panneau. */
const ATTENTE = 350
const GRACE = 200

interface Ouvert {
  url: string
  /** Le bas et la gauche du lien, à l'écran. */
  x: number
  y: number
  lien: HTMLAnchorElement
}

export function LienSurvol({ editeur }: { editeur: Editor }) {
  const [ouvert, setOuvert] = useState<Ouvert | null>(null)
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panneau = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dom = editeur.view.dom
    const attendre = (f: () => void, ms: number) => {
      clearTimeout(minuteur.current)
      minuteur.current = setTimeout(f, ms)
    }
    const dessus = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || !dom.contains(a) || e.buttons) return
      attendre(() => {
        const r = a.getBoundingClientRect()
        setOuvert({ url: a.getAttribute('href') ?? '', x: r.left, y: r.bottom + 6, lien: a })
      }, ATTENTE)
    }
    const dehors = (e: MouseEvent) => {
      const vers = e.relatedTarget as Node | null
      if (vers && panneau.current?.contains(vers)) return
      attendre(() => setOuvert(null), GRACE)
    }
    const fermer = () => {
      clearTimeout(minuteur.current)
      setOuvert(null)
    }
    dom.addEventListener('mouseover', dessus)
    dom.addEventListener('mouseout', dehors)
    dom.addEventListener('keydown', fermer)
    document.addEventListener('scroll', fermer, true)
    return () => {
      clearTimeout(minuteur.current)
      dom.removeEventListener('mouseover', dessus)
      dom.removeEventListener('mouseout', dehors)
      dom.removeEventListener('keydown', fermer)
      document.removeEventListener('scroll', fermer, true)
    }
  }, [editeur])

  if (!ouvert) return null
  // « Modifier » : tout le lien est choisi, puis ⌘K ouvre l'éditeur de lien de la bulle.
  const modifier = () => {
    const pos = editeur.view.posAtDOM(ouvert.lien, 0)
    editeur.chain().focus().setTextSelection(pos).extendMarkRange('link').run()
    editeur.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }))
    setOuvert(null)
  }
  const hote = editeur.view.dom.closest<HTMLElement>('[aria-modal], .notak-espace') ?? document.body
  return createPortal(
    <div
      ref={panneau}
      className="notak-lien-survol"
      style={{ left: ouvert.x, top: ouvert.y }}
      onMouseEnter={() => clearTimeout(minuteur.current)}
      onMouseLeave={() => {
        clearTimeout(minuteur.current)
        minuteur.current = setTimeout(() => setOuvert(null), GRACE)
      }}
    >
      <a className="notak-lien-survol-adresse" href={ouvert.url} target="_blank" rel="noopener noreferrer">
        {ouvert.url.replace(/^https?:\/\/(www\.)?/, '')}
      </a>
      <button type="button" className="notak-lien-survol-modifier" onMouseDown={(e) => e.preventDefault()} onClick={modifier}>
        {t('blocs.lien.modifier')}
      </button>
    </div>,
    hote,
  )
}
