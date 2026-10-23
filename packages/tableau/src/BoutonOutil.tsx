import { type ReactNode, type RefObject, createContext, useContext, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { type NomIcone, Icone } from './icones'
import { Infobulle } from './Infobulle'
import { type EntreeRepli, ORDRE } from './repli'

/**
 * Où paraissent les outils d'une sélection. Dans la barre de gauche (`aGauche`), chaque outil est une tuile grise,
 * une icône et son nom dessous ; les outils secondaires partent dans le tiroir « ••• » (`plus`). Au-dessus de la
 * sélection (le défaut, aussi pour un outil monté seul), c'est l'ancien bouton de texte.
 */
export interface MiseEnPage {
  aGauche: boolean
  /** Le tiroir « ••• » où se rangent les outils secondaires ; absent, ils restent à leur place. */
  plus: HTMLElement | null
  /** Les outils que la barre, trop courte, a rangés dans le « ••• » (par identifiant). */
  ranges?: ReadonlySet<string>
  /** Un outil se déclare à la barre pour que son repli compte sa place ; rend de quoi se retirer. */
  inscrire?(e: EntreeRepli): () => void
}

export const ContexteOutils = createContext<MiseEnPage>({ aGauche: false, plus: null })

/**
 * Un outil de la barre de gauche s'inscrit pour le repli (ordre 100 par défaut) et dit s'il est rangé dans le « ••• ».
 * Sans barre de gauche, ou rangé d'office (`secondaire`), il ne s'inscrit pas.
 */
function useRepliOutil(libelle: string, secondaire: boolean | undefined, ordre: number, actif = true): boolean {
  const { aGauche, inscrire, ranges } = useContext(ContexteOutils)
  const id = `${libelle}:${useId()}`
  const compte = aGauche && !secondaire && actif && !!inscrire
  useEffect(() => (compte ? inscrire!({ id, genre: 'tuile', ordre }) : undefined), [compte, inscrire, id, ordre])
  return !!secondaire || (compte && !!ranges?.has(id))
}

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
  /** Son ordre de repli quand la barre est trop courte : le plus grand part le premier (100 par défaut). */
  repli?: number | undefined
  actif?: boolean | undefined
  ouvert?: boolean | undefined
  desactive?: boolean | undefined
  classe?: string | undefined
  onClick?(): void
  /** Pour un outil qui range déjà son bouton dans un emplacement (`OutilAvecMenu`). */
  sansEmplacement?: boolean | undefined
}

/** Le bouton d'un outil de la barre de sélection : une tuile dans la barre de gauche, un bouton de texte au-dessus. */
export function BoutonOutil({ icone, libelle, titre, flottant, pastille, secondaire, repli, actif, ouvert, desactive, classe, onClick, sansEmplacement }: PropsBoutonOutil) {
  const { aGauche } = useContext(ContexteOutils)
  const range = useRepliOutil(libelle, secondaire, repli ?? ORDRE.defaut, !sansEmplacement)
  const bouton = aGauche ? (
    <Infobulle libelle={titre ?? libelle} cote="droite" contenu>
    <button
      type="button"
      className={`notak-outil notak-outil-selection${classe ? ` ${classe}` : ''}`}
      data-genre="tuile"
      aria-label={libelle}
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
    </Infobulle>
  ) : (
    <Infobulle libelle={titre ?? libelle} contenu>
      <button type="button" className={classe} aria-label={titre ?? libelle} aria-pressed={actif} aria-expanded={ouvert} disabled={desactive} onClick={onClick}>
        {flottant ?? libelle}
      </button>
    </Infobulle>
  )
  return sansEmplacement ? bouton : <Emplacement secondaire={range}>{bouton}</Emplacement>
}

/** Un outil qui ouvre un menu : l'ancre (le bouton et le menu, ensemble), le bouton, et le menu quand il est ouvert. */
export function OutilAvecMenu({
  menu: [ouvert, setOuvert, ancre],
  classeAncre = 'notak-note-menu-ancre',
  secondaire,
  repli,
  children,
  ...bouton
}: Omit<PropsBoutonOutil, 'ouvert' | 'onClick' | 'sansEmplacement' | 'actif'> & {
  menu: [boolean, (ouvert: boolean) => void, RefObject<HTMLDivElement | null>]
  classeAncre?: string
  children: ReactNode
}) {
  const range = useRepliOutil(bouton.libelle, secondaire, repli ?? ORDRE.defaut)
  return (
    <Emplacement secondaire={range}>
      <div className={classeAncre} ref={ancre}>
        <BoutonOutil {...bouton} ouvert={ouvert} sansEmplacement onClick={() => setOuvert(!ouvert)} />
        {ouvert && children}
      </div>
    </Emplacement>
  )
}
