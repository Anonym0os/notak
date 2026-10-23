import { type CSSProperties, useEffect, useLayoutEffect, useRef } from 'react'
import type { FormatCellule, Id, PassageCellule } from '../../coeur/tableau'
import { t } from '../../langue'
import type { Deplacement } from './Editeur'
import { lireEtat, majEdition } from './etat'
import { alignementDe } from './formats'
import { type MarqueBooleenne, basculer, poser } from './riche'
import { declarerPilote } from './richePilote'
import { insererTexte, lire, poserSelection, rendre, selectionDe } from './richeDom'

/** Combien de caractères tient une cellule. */
export const LONGUEUR_CELLULE = 2000

interface Props {
  id: Id
  edition: NonNullable<ReturnType<typeof lireEtat>['edition']>
  format: FormatCellule | null
  valider(deplacement: Deplacement): void
  abandonner(): void
}

const memePassages = (a: readonly PassageCellule[] | undefined, b: readonly PassageCellule[]) => JSON.stringify(a ?? []) === JSON.stringify(b)

/**
 * L'éditeur d'une cellule de texte : un élément éditable où gras, italique, barré, lien, couleur et surlignage
 * s'appliquent à une sélection de mots. Le texte et les passages vivent dans l'état de la table (`edition.texte`,
 * `edition.passages`, `edition.selection`) ; le DOM n'est réécrit que quand le programme change quelque chose
 * (`edition.maj`), jamais pendant la frappe. Un texte qui commence par « = » rend la main au champ des formules.
 */
export function EditeurRiche({ id, edition, format, valider, abandonner }: Props) {
  const zone = useRef<HTMLDivElement>(null)
  const dernier = useRef({ edition, valider, abandonner })
  dernier.current = { edition, valider, abandonner }

  // Le DOM s'écrit à l'ouverture et chaque fois que le programme y touche.
  useLayoutEffect(() => {
    const n = zone.current
    if (!n) return
    const e = dernier.current.edition
    rendre(n, e.texte, e.passages ?? [])
    n.focus({ preventScroll: true })
    const sel = e.selection ?? { de: e.curseur, a: e.curseur }
    poserSelection(n, Math.min(sel.de, e.texte.length), Math.min(sel.a, e.texte.length))
  }, [edition.maj])

  /** Reprend dans l'état ce que le DOM dit : texte, passages, sélection. */
  const synchroniser = () => {
    const n = zone.current
    if (!n) return
    const lu = lire(n)
    const sel = selectionDe(n)
    majEdition(id, (e) => {
      if (lu.texte.startsWith('=')) {
        // Une formule s'écrit dans le champ simple : les passages tombent, le curseur suit.
        return { ...e, texte: lu.texte, passages: undefined, selection: undefined, curseur: sel?.a ?? lu.texte.length, maj: e.maj + 1, suggestion: 0, citation: null, depuisCalendrier: false }
      }
      if (lu.texte.length > LONGUEUR_CELLULE) {
        const texte = lu.texte.slice(0, LONGUEUR_CELLULE)
        return { ...e, texte, passages: lu.passages.filter((p) => p.de < LONGUEUR_CELLULE), selection: { de: texte.length, a: texte.length }, curseur: texte.length, maj: e.maj + 1 }
      }
      const meme = e.texte === lu.texte && memePassages(e.passages, lu.passages) && (!sel || (e.selection?.de === sel.de && e.selection?.a === sel.a))
      if (meme) return undefined
      return { ...e, texte: lu.texte, passages: lu.passages, selection: sel ?? e.selection, curseur: sel?.a ?? e.curseur, suggestion: 0, citation: null, depuisCalendrier: false }
    })
  }
  const synchroRef = useRef(synchroniser)
  synchroRef.current = synchroniser

  // La sélection qui bouge (flèches, souris) se reporte dans l'état : la barre d'outils y lit ce qui est choisi.
  useEffect(() => {
    const surSelection = () => synchroRef.current()
    document.addEventListener('selectionchange', surSelection)
    return () => document.removeEventListener('selectionchange', surSelection)
  }, [])

  // Ce que la barre d'outils peut demander à l'éditeur.
  useEffect(() => {
    const sur = (f: (passages: PassageCellule[], longueur: number, de: number, a: number) => PassageCellule[]) => {
      const e = lireEtat(id).edition
      const sel = e?.selection
      if (!e || !sel || sel.de === sel.a) return
      majEdition(id, (x) => ({ ...x, passages: f(x.passages ?? [], x.texte.length, sel.de, sel.a), maj: x.maj + 1 }))
    }
    return declarerPilote(id, {
      basculer: (nom: MarqueBooleenne) => sur((p, n, de, a) => basculer(p, n, de, a, nom)),
      lien: (adresse) => sur((p, n, de, a) => poser(p, n, de, a, { lien: adresse ?? undefined })),
      couleur: (c) => sur((p, n, de, a) => poser(p, n, de, a, { couleur: c ?? undefined })),
      surlignage: (c) => sur((p, n, de, a) => poser(p, n, de, a, { surligne: c ?? undefined })),
      focaliser: () => majEdition(id, (x) => ({ ...x, maj: x.maj + 1 })),
      finir: () => dernier.current.valider('aucun'),
    })
  }, [id])

  /** Réécrit le DOM d'après l'état (après un texte inséré à la main : retour à la ligne, collage). */
  const rafraichir = () => {
    synchroniser()
    majEdition(id, (x) => ({ ...x, maj: x.maj + 1 }))
  }

  const touche = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (e.nativeEvent.isComposing) return
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey || e.altKey) {
        if (zone.current) insererTexte(zone.current, '\n')
        rafraichir()
      } else valider('bas')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      valider(e.shiftKey ? 'gauche' : 'droite')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      abandonner()
    } else if (cmd && !e.altKey && (k === 'b' || k === 'i' || (k === 'x' && e.shiftKey))) {
      e.preventDefault()
      const nom: MarqueBooleenne = k === 'b' ? 'gras' : k === 'i' ? 'italique' : 'barre'
      const sel = lireEtat(id).edition?.selection
      if (sel && sel.de !== sel.a)
        majEdition(id, (x) => ({ ...x, passages: basculer(x.passages ?? [], x.texte.length, sel.de, sel.a, nom), maj: x.maj + 1 }))
    }
  }

  const alignement = alignementDe(format, false)
  const style: CSSProperties = {
    textAlign: alignement === 'gauche' ? 'left' : alignement === 'droite' ? 'right' : 'center',
    fontWeight: format?.gras ? 700 : undefined,
    fontStyle: format?.italique ? 'italic' : undefined,
    textDecoration: format?.barre ? 'line-through' : undefined,
  }

  return (
    <div
      ref={zone}
      className="notak-table-riche"
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline
      aria-label={t('table.cellule', { ligne: edition.l + 1, colonne: edition.c + 1 })}
      onInput={synchroniser}
      onKeyDown={touche}
      onPaste={(e) => {
        // Seul le texte entre : une page copiée n'apporte pas ses styles dans la cellule.
        e.preventDefault()
        if (zone.current) insererTexte(zone.current, e.clipboardData.getData('text/plain'))
        rafraichir()
      }}
      onDrop={(e) => e.preventDefault()}
    />
  )
}
