import { type ReactNode, type RefObject, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { type NomIcone, Icone } from './icones'

/**
 * Où paraissent les outils d'une sélection. Dans la barre de gauche (`aGauche`), chaque outil est une tuile grise,
 * une icône et son nom dessous ; les outils secondaires partent dans le tiroir « ••• » (`plus`). Au-dessus de la
 * sélection (le défaut, aussi pour un outil monté seul), c'est l'ancien bouton de texte.
 */
export interface MiseEnPage {
  aGauche: boolean
  /** Le tiroir « ••• » où se rangent les outils secondaires ; absent, ils restent à leur place. */
  plus: HTMLElement | null
}

export const ContexteOutils = createContext<MiseEnPage>({ aGauche: false, plus: null })

/** Range ce qui est secondaire dans le tiroir « ••• » de la barre de gauche ; ailleurs, laisse à sa place. */
export function Emplacement({ secondaire, children }: { secondaire?: boolean | undefined; children: ReactNode }) {
  const { aGauche, plus } = useContext(ContexteOutils)
  return secondaire && aGauche && plus ? createPortal(children, plus) : <>{children}</>
}

export interface PropsBoutonOutil {
  icone: NomIcone
  /** Le nom : sous l'icône dans la barre de gauche, le texte du bouton ailleurs. */
  libelle: string
  /** L'infobulle, plus longue que le nom. */
  titre?: string | undefined
  /** Ce que montre le bouton quand la barre est au-dessus de la sélection (par défaut, le nom). */
  flottant?: ReactNode
  /** Une couleur à montrer dans la tuile à la place de l'icône (« Couleur » montre celle d'à présent). */
  pastille?: string | undefined
  /** Va dans le « ••• » de la barre de gauche. */
  secondaire?: boolean | undefined
  actif?: boolean | undefined
  ouvert?: boolean | undefined
  desactive?: boolean | undefined
  classe?: string | undefined
  onClick?(): void
  /** Pour un outil qui range déjà son bouton dans un emplacement (`OutilAvecMenu`). */
  sansEmplacement?: boolean | undefined
}

/** Le bouton d'un outil de la barre de sélection : une tuile dans la barre de gauche, un bouton de texte au-dessus. */
export function BoutonOutil({ icone, libelle, titre, flottant, pastille, secondaire, actif, ouvert, desactive, classe, onClick, sansEmplacement }: PropsBoutonOutil) {
  const { aGauche } = useContext(ContexteOutils)
  const bouton = aGauche ? (
    <button
      type="button"
      className={`notak-outil notak-outil-selection${classe ? ` ${classe}` : ''}`}
      data-genre="tuile"
      title={titre ?? libelle}
      aria-pressed={actif}
      aria-expanded={ouvert}
      disabled={desactive}
      onClick={onClick}
    >
      <span className="notak-outil-icone">
        {pastille ? <span className="notak-outil-pastille" style={{ background: pastille }} /> : <Icone nom={icone} taille={24} />}
      </span>
      <span className="notak-outil-libelle">{libelle}</span>
    </button>
  ) : (
    <button type="button" className={classe} title={titre ?? libelle} aria-pressed={actif} aria-expanded={ouvert} disabled={desactive} onClick={onClick}>
      {flottant ?? libelle}
    </button>
  )
  return sansEmplacement ? bouton : <Emplacement secondaire={secondaire}>{bouton}</Emplacement>
}

/** Un outil qui ouvre un menu : l'ancre (le bouton et le menu, ensemble), le bouton, et le menu quand il est ouvert. */
export function OutilAvecMenu({
  menu: [ouvert, setOuvert, ancre],
  classeAncre = 'notak-note-menu-ancre',
  secondaire,
  children,
  ...bouton
}: Omit<PropsBoutonOutil, 'ouvert' | 'onClick' | 'sansEmplacement' | 'actif'> & {
  menu: [boolean, (ouvert: boolean) => void, RefObject<HTMLDivElement | null>]
  classeAncre?: string
  children: ReactNode
}) {
  return (
    <Emplacement secondaire={secondaire}>
      <div className={classeAncre} ref={ancre}>
        <BoutonOutil {...bouton} ouvert={ouvert} sansEmplacement onClick={() => setOuvert(!ouvert)} />
        {ouvert && children}
      </div>
    </Emplacement>
  )
}
