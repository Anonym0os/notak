import { type ReactNode, useEffect, useRef } from 'react'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'

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

/** En haut à gauche : la maison (retour au tableau), le nom de la carte et son état. */
export function EnTete({ titre, etat, fermer, navigation }: { titre: string; etat: string; fermer(): void; navigation?: { actif: boolean; basculer(): void } }) {
  return (
    <div className="notak-arbre-entete">
      <button type="button" className="notak-arbre-pastille notak-arbre-maison" aria-label={t('arbre.fermer')} title={t('arbre.fermer')} onClick={fermer}>
        <Icone nom="maison" taille={20} trait={1.5} />
      </button>
      {navigation && (
        <button
          type="button"
          className="notak-arbre-pastille"
          aria-label={navigation.actif ? t('arbre.gauche.masquer') : t('arbre.gauche.afficher')}
          title={`${navigation.actif ? t('arbre.gauche.masquer') : t('arbre.gauche.afficher')} (⌘[)`}
          aria-pressed={navigation.actif}
          onClick={navigation.basculer}
        >
          <Icone nom="panneauGauche" taille={20} trait={1.5} />
        </button>
      )}
      <div className="notak-arbre-nom">
        <strong>{titre || t('type.arbre')}</strong>
        {etat && <span>{etat}</span>}
      </div>
    </div>
  )
}

/** Un menu déroulant, posé sous son bouton ; il se ferme au clic dehors et à Échap. */
export function Deroulant({
  ouvert,
  fermer,
  children,
  vers = 'bas',
  className,
}: {
  ouvert: boolean
  fermer(): void
  children: ReactNode
  vers?: 'bas' | 'haut'
  className?: string
}) {
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.parentElement?.contains(e.target as Node)) fermer()
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
  }, [ouvert, fermer])
  if (!ouvert) return null
  return (
    <div ref={racine} className={`notak-arbre-deroulant${className ? ` ${className}` : ''}`} data-vers={vers} role="menu">
      {children}
    </div>
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
