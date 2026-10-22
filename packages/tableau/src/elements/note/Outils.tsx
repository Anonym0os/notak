import { useState } from 'react'
import { COULEURS_NOTE, type CouleurNote, type Note } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { LIBELLES_COULEUR } from './couleurs'

/** « Couleur » : la palette des notes choisies. Un seul pas d'historique, quel que soit le nombre de notes. */
export function OutilsNote({ elements, contexte }: PropsOutils<Note>) {
  const [ouvert, setOuvert] = useState(false)
  const choisir = (couleur: CouleurNote | undefined) => {
    contexte.magasin.faire(
      elements.map((e) => {
        const { couleur: _, ...reste } = e.contenu
        return { type: 'contenu', id: e.id, avant: e.contenu, apres: couleur ? { ...reste, couleur } : reste }
      }),
    )
    setOuvert(false)
  }
  const actuelle = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : undefined
  return (
    <div className="notak-note-menu-ancre">
      <button type="button" title="Couleur" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        Couleur
      </button>
      {ouvert && (
        <div className="notak-note-palette" role="menu">
          <button type="button" role="menuitem" aria-pressed={actuelle === undefined} onClick={() => choisir(undefined)}>
            Aucune
          </button>
          <div className="notak-note-pastilles">
            {COULEURS_NOTE.map((c) => (
              <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} data-fond={c} onClick={() => choisir(c)} />
            ))}
          </div>
          <button type="button" role="menuitem" aria-pressed={actuelle === 'transparent'} onClick={() => choisir('transparent')}>
            Transparent
          </button>
        </div>
      )}
    </div>
  )
}
