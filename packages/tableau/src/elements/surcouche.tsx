import { type ReactNode, type SyntheticEvent, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Les variables de thème de la toile. Une surcouche vit sous `document.body`, hors de `.notak-toile` qui les
 * définit : on les lui recopie telles que la toile les voit.
 */
const VARIABLES = [
  '--notak-fond',
  '--notak-point',
  '--notak-carte',
  '--notak-texte',
  '--notak-accent',
  '--notak-ombre',
  '--notak-note-gris',
  '--notak-note-cyan',
  '--notak-note-vert',
  '--notak-note-brun',
  '--notak-note-jaune',
  '--notak-note-orange',
  '--notak-note-rouge',
  '--notak-note-rose',
  '--notak-note-violet',
  '--notak-note-bleu',
  '--notak-note-bleu_nuit',
  '--notak-texte-bleu',
  '--notak-texte-vert',
  '--notak-texte-orange',
  '--notak-texte-rouge',
  '--notak-texte-gris',
  '--notak-surligne-gris-fonce',
  '--notak-surligne-bleu',
  '--notak-surligne-vert',
  '--notak-surligne-orange',
  '--notak-surligne-rose',
  '--notak-surligne-gris',
  '--notak-trait-defaut',
  '--notak-page-fond',
  '--notak-page-texte',
  '--notak-page-pale',
  '--notak-page-discret',
  '--notak-page-trait',
  '--notak-page-encadre',
  '--notak-page-code',
  '--notak-page-code-ligne',
  '--notak-page-case',
  '--notak-page-coche',
  '--notak-page-lien',
  '--notak-page-selection',
  '--notak-page-halo',
  '--notak-page-survol',
  '--notak-bloc-gris',
  '--notak-bloc-gris-fond',
  '--notak-bloc-brun',
  '--notak-bloc-brun-fond',
  '--notak-bloc-orange',
  '--notak-bloc-orange-fond',
  '--notak-bloc-jaune',
  '--notak-bloc-jaune-fond',
  '--notak-bloc-vert',
  '--notak-bloc-vert-fond',
  '--notak-bloc-bleu',
  '--notak-bloc-bleu-fond',
  '--notak-bloc-violet',
  '--notak-bloc-violet-fond',
  '--notak-bloc-rose',
  '--notak-bloc-rose-fond',
  '--notak-bloc-rouge',
  '--notak-bloc-rouge-fond',
  '--notak-arbre-fond',
  '--notak-arbre-encre',
  '--notak-arbre-texte',
  '--notak-arbre-central',
  '--notak-arbre-sur-plein',
  '--notak-arbre-flottant',
  '--notak-arbre-choix',
  '--notak-arbre-etiquette',
]

export function variablesDe(noeud: Element): Record<string, string> {
  const style = getComputedStyle(noeud)
  const vues: Record<string, string> = {}
  for (const nom of VARIABLES) {
    const v = style.getPropertyValue(nom).trim()
    if (v) vues[nom] = v
  }
  return vues
}

/** Un événement de la surcouche ne remonte pas à la toile : un portail renvoie les siens à ses parents React. */
const clos = (e: SyntheticEvent) => e.stopPropagation()

interface Props {
  /** Ce qu'elle est, pour qui la lit à haute voix (« Dessiner »). */
  etiquette: string
  className: string
  /** Échap, ou un appui sur le fond. */
  fermer(): void
  /** Les touches propres au contenu, avant Échap. Rend vrai si elle a pris la touche. */
  surTouche?(e: React.KeyboardEvent): boolean
  children: ReactNode
}

/**
 * Un plein écran posé au-dessus de la toile (le croquis, le document ouverts en grand). Il reprend le thème
 * de la toile, garde le focus, et ne laisse rien de ce qu'on y fait atteindre la toile.
 */
export function Surcouche({ etiquette, className, fermer, surTouche, children }: Props) {
  const ancre = useRef<HTMLSpanElement>(null)
  const racine = useRef<HTMLDivElement>(null)
  const [variables, setVariables] = useState<Record<string, string> | null>(null)
  // Le thème de l'espace suit aussi : ce qui se règle dessus (les menus du document) le retrouve dans la surcouche.
  const [theme, setTheme] = useState<string | undefined>(undefined)
  useLayoutEffect(() => {
    const toile = ancre.current?.closest('.notak-toile')
    setTheme(ancre.current?.closest<HTMLElement>('.notak-espace')?.dataset.theme)
    setVariables(toile ? variablesDe(toile) : {})
  }, [])
  useLayoutEffect(() => {
    if (variables) racine.current?.focus({ preventScroll: true })
  }, [variables])
  return (
    <>
      <span ref={ancre} hidden />
      {variables &&
        createPortal(
          <div
            ref={racine}
            className={className}
            style={variables}
            data-theme={theme}
            role="dialog"
            aria-modal
            aria-label={etiquette}
            tabIndex={-1}
            onPointerDown={(e) => {
              clos(e)
              if (e.target === e.currentTarget) fermer()
            }}
            onPointerMove={clos}
            onPointerUp={clos}
            onClick={clos}
            onDoubleClick={clos}
            onContextMenu={clos}
            onWheel={clos}
            onKeyDown={(e) => {
              clos(e)
              if (surTouche?.(e)) return
              if (e.key === 'Escape') fermer()
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}
