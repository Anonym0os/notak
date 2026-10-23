import { useState } from 'react'
import { COULEURS_NOTE, type CouleurNote } from '../../coeur/tableau'
import { LIBELLES_COULEUR } from './couleurs'

/**
 * « Couleur » : la palette des notes, en menu. Partagée par tout ce qui se colore comme une note.
 * `transparent` ajoute le choix sans fond, qui n'a de sens que pour une note.
 */
export function MenuCouleur({ actuelle, choisir, transparent = false }: { actuelle: CouleurNote | undefined; choisir(c: CouleurNote | undefined): void; transparent?: boolean }) {
  const [ouvert, setOuvert] = useState(false)
  const poser = (c: CouleurNote | undefined) => {
    choisir(c)
    setOuvert(false)
  }
  return (
    <div className="notak-note-menu-ancre">
      <button type="button" title="Couleur" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        Couleur
      </button>
      {ouvert && (
        <div className="notak-note-palette" role="menu">
          <button type="button" role="menuitem" aria-pressed={actuelle === undefined} onClick={() => poser(undefined)}>
            Aucune
          </button>
          <div className="notak-note-pastilles">
            {COULEURS_NOTE.map((c) => (
              <button key={c} type="button" role="menuitem" title={LIBELLES_COULEUR[c]} aria-label={LIBELLES_COULEUR[c]} aria-pressed={actuelle === c} data-fond={c} onClick={() => poser(c)} />
            ))}
          </div>
          {transparent && (
            <button type="button" role="menuitem" aria-pressed={actuelle === 'transparent'} onClick={() => poser('transparent')}>
              Transparent
            </button>
          )}
        </div>
      )}
    </div>
  )
}
