import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { BoutonIlot, FiletIlot, FilEcran, Ilot } from '../../Ilots'
import { Flottant } from './Flottant'
import type { AlignementFlottant } from './geometrieMenus'

/**
 * L'habillage de la carte ouverte, disposé comme la fenêtre de Xmind (docs/XMIND.md § 8) : l'en-tête en haut à
 * gauche, la barre d'outils flottante au centre, les bascules des panneaux en haut à droite, le panneau à onglets
 * sur le côté, la feuille en bas à gauche et l'état de la vue en bas à droite. Ici, la disposition seule : chaque
 * morceau reçoit ce qu'il montre et ce qu'il fait.
 */

/** Un bouton rond à icône, avec son infobulle. */
export function BoutonIcone({
  icone,
  libelle,
  touche,
  actif,
  inactif,
  onClick,
  children,
}: {
  icone: NomIcone
  libelle: string
  touche?: string | undefined
  actif?: boolean | undefined
  inactif?: boolean | undefined
  onClick?: (() => void) | undefined
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      className="notak-arbre-bouton"
      aria-label={libelle}
      title={touche ? `${libelle} (${touche})` : libelle}
      aria-pressed={actif}
      disabled={inactif}
      onClick={onClick}
    >
      <Icone nom={icone} taille={20} trait={1.5} />
      {children}
    </button>
  )
}

/**
 * En haut à gauche, comme sur le tableau et le document (Ilots.tsx) : l'îlot du retour au tableau et du panneau de
 * gauche, puis le fil (le tableau qui porte la carte, puis son nom) et son état.
 */
export function EnTete({ titre, etat, fermer, navigation }: { titre: string; etat: string; fermer(): void; navigation?: { actif: boolean; basculer(): void } }) {
  return (
    <div className="notak-arbre-entete">
      <Ilot>
        <BoutonIlot icone="gauche" libelle={t('arbre.fermer')} onClick={fermer} />
        {navigation && (
          <>
            <FiletIlot />
            <BoutonIlot
              icone="panneauGauche"
              libelle={navigation.actif ? t('arbre.gauche.masquer') : t('arbre.gauche.afficher')}
              raccourci="⌘["
              actif={navigation.actif}
              onClick={navigation.basculer}
            />
          </>
        )}
      </Ilot>
      <div className="notak-arbre-nom">
        <FilEcran titre={<span>{titre || t('type.arbre')}</span>} fermer={fermer} />
        {etat && <span className="notak-arbre-etat">{etat}</span>}
      </div>
    </div>
  )
}

/**
 * Un menu déroulant, posé sous son bouton (ou au-dessus avec `vers="haut"`) : il s'ouvre depuis le conteneur où on le
 * range, qui porte le bouton. Il reste dans la fenêtre (Flottant) et se ferme au clic dehors et à Échap.
 */
export function Deroulant({
  ouvert,
  fermer,
  children,
  vers = 'bas',
  alignement = 'debut',
  className,
}: {
  ouvert: boolean
  fermer(): void
  children: ReactNode
  vers?: 'bas' | 'haut'
  /** Le bord du bouton sur lequel le menu s'aligne : son début (gauche), son milieu ou sa fin (droite). */
  alignement?: AlignementFlottant
  className?: string
}) {
  const racine = useRef<HTMLDivElement>(null)
  // Le conteneur du bouton : c'est l'ancre, et un clic dedans (sur le bouton) ne ferme pas le menu, le bouton le bascule.
  const [porteur, setPorteur] = useState<HTMLElement | null>(null)
  const marque = useCallback((n: HTMLElement | null) => setPorteur(n?.parentElement ?? null), [])
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node) && !porteur?.contains(e.target as Node)) fermer()
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', echap, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', echap, true)
    }
  }, [ouvert, fermer, porteur])
  return (
    <>
      <span ref={marque} hidden />
      {ouvert && porteur && (
        <Flottant racine={racine} ancre={porteur} cote={vers} alignement={alignement} className={`notak-arbre-deroulant${className ? ` ${className}` : ''}`} role="menu">
          {children}
        </Flottant>
      )}
    </>
  )
}

/**
 * Une entrée de menu : icône (16 px, trait 1,6, discrète), libellé, raccourci à droite ; ou, pour une entrée qui ouvre un
 * sous-menu (`sous`), un chevron à la place du raccourci.
 */
export function Entree({
  icone,
  libelle,
  touche,
  coche,
  sous,
  inactif,
  onClick,
  onSurvol,
}: {
  icone?: NomIcone | undefined
  libelle: string
  touche?: string | undefined
  coche?: boolean | undefined
  sous?: boolean | undefined
  inactif?: boolean | undefined
  onClick?: (() => void) | undefined
  /** Le pointeur entre dans l'entrée : un menu y ferme le sous-menu resté ouvert à côté. */
  onSurvol?: (() => void) | undefined
}) {
  return (
    <button
      type="button"
      role={coche === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={coche}
      aria-haspopup={sous ? 'menu' : undefined}
      disabled={inactif}
      onClick={onClick}
      onPointerEnter={onSurvol}
    >
      <span className="notak-arbre-entree-icone">{icone ? <Icone nom={icone} taille={16} trait={1.6} /> : coche ? <Icone nom="coche" taille={14} /> : null}</span>
      <span className="notak-arbre-entree-libelle">{libelle}</span>
      {sous ? (
        <span className="notak-arbre-entree-sous">
          <Icone nom="chevronDroite" taille={14} trait={1.8} />
        </span>
      ) : (
        touche && <kbd>{touche}</kbd>
      )}
    </button>
  )
}

export type Onglet = 'style' | 'presenter' | 'carte'

/** Le panneau de côté et ses trois onglets, comme le panneau de format de Xmind. */
export function PanneauCote({
  onglets,
  actif,
  choisir,
  children,
}: {
  onglets: readonly { id: string; libelle: string }[]
  actif: string
  choisir(id: string): void
  children: ReactNode
}) {
  return (
    <aside className="notak-arbre-cote notak-arbre-panneau" onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}>
      <div className="notak-arbre-onglets" role="tablist">
        {onglets.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={actif === o.id} onClick={() => choisir(o.id)}>
            {o.libelle}
          </button>
        ))}
      </div>
      <div className="notak-arbre-cote-corps" role="tabpanel">
        {children}
      </div>
    </aside>
  )
}
