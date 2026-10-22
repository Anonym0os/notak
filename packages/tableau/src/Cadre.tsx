import { memo } from 'react'
import { PX_PAR_UG } from './coeur/camera'
import type { Contenu, Element } from './coeur/tableau'
import { definition } from './elements/registre'
import type { ContexteToile } from './elements/types'

interface Props {
  element: Element
  choisie: boolean
  enEdition: boolean
  contexte: ContexteToile
  /** `toile` : posé à sa position. `liste` : dans le flux d'un conteneur (une colonne). */
  mode?: 'toile' | 'liste'
  brouillon(element: Element, apres: Contenu): void
  changer(element: Element, apres: Contenu): void
}

/** Le cadre commun d'un élément : position, largeur, fond, ombre, sélection. Le type dessine dedans. */
export const Cadre = memo(function Cadre({ element, choisie, enEdition, contexte, mode = 'toile', brouillon, changer }: Props) {
  const def = definition(element.contenu.type)
  if (!def) return null
  const sansFond = typeof def.sansFond === 'function' ? def.sansFond(element.contenu) : def.sansFond
  const { Rendu } = def
  return (
    <div
      className="notak-carte"
      data-id={element.id}
      data-type={element.contenu.type}
      data-choisie={choisie || undefined}
      data-edition={enEdition || undefined}
      data-sans-fond={sansFond || undefined}
      style={
        mode === 'toile'
          ? { left: element.x * PX_PAR_UG, top: element.y * PX_PAR_UG, width: element.largeur * PX_PAR_UG }
          : { position: 'relative' }
      }
    >
      <Rendu
        element={element}
        choisie={choisie}
        enEdition={enEdition}
        contexte={contexte}
        brouillon={(c) => brouillon(element, c)}
        changer={(c) => changer(element, c)}
      />
    </div>
  )
})
