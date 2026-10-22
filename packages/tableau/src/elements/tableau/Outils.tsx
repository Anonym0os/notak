import { useState, useSyncExternalStore } from 'react'
import { COULEURS_NOTE, type CouleurNote, type RenvoiTableau } from '../../coeur/tableau'
import { FOND_NOTE, LIBELLES_COULEUR } from '../note/couleurs'
import type { PropsOutils } from '../types'
import { demanderRenommage } from './renommage'

const sans = () => () => {}

export function OutilsRenvoi({ elements, contexte }: PropsOutils<RenvoiTableau>) {
  const [ouvert, setOuvert] = useState(false)
  const { tableau, ecouterEspace, colorerTableau } = contexte.services
  const cibles = elements.map((e) => e.contenu.cible)
  const actuelle = useSyncExternalStore(ecouterEspace ?? sans, () => {
    const couleurs = new Set(cibles.map((c) => tableau?.(c)?.couleur))
    return couleurs.size === 1 ? [...couleurs][0] : undefined
  })
  const choisir = (couleur: CouleurNote) => {
    for (const c of cibles) colorerTableau?.(c, couleur)
    setOuvert(false)
  }
  return (
    <>
      {colorerTableau && (
        <div className="notak-colonne-menu-ancre">
          <button type="button" title="Couleur du tableau" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
            Couleur
          </button>
          {ouvert && (
            <div className="notak-colonne-palette" role="menu">
              <div className="notak-colonne-pastilles">
                {COULEURS_NOTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitem"
                    title={LIBELLES_COULEUR[c]}
                    aria-label={LIBELLES_COULEUR[c]}
                    aria-pressed={actuelle === c}
                    style={{ background: FOND_NOTE[c] }}
                    onClick={() => choisir(c)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {elements.length === 1 && (
        <button type="button" title="Renommer le tableau" onClick={() => demanderRenommage(elements[0]!.id)}>
          Renommer
        </button>
      )}
    </>
  )
}
