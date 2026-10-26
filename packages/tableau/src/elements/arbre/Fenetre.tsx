import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { Segments } from '../../communs'
import { BoutonIlot, FiletIlot, FilEcran, Ilot } from '../../Ilots'
import { LigneMenu, classeMenu } from '../../communs'
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
 * En haut à gauche, comme sur le tableau et le document (Ilots.tsx) : un seul îlot, le retour au tableau, le panneau
 * de gauche, puis le fil (le tableau qui porte la carte, puis son nom) et son état.
 */
export function EnTete({ titre, etat, fermer, navigation }: { titre: string; etat: string; fermer(): void; navigation?: { actif: boolean; basculer(): void } }) {
  return (
    <div className="notak-arbre-entete">
      <Ilot className="notak-ilot-fil">
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
        {/* Le fil cède sa place en premier quand la barre de la carte le touche (fenetre.css). */}
        <span className="notak-arbre-nom">
          <FiletIlot />
          <FilEcran titre={<span>{titre || t('type.arbre')}</span>} nom={titre || t('type.arbre')} fermer={fermer} apres={etat && <span className="notak-arbre-etat">{etat}</span>} />
        </span>
      </Ilot>
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
        <Flottant racine={racine} ancre={porteur} cote={vers} alignement={alignement} className={classeMenu(`notak-arbre-deroulant${className ? ` ${className}` : ''}`)} role="menu">
          {children}
        </Flottant>
      )}
    </>
  )
}

/**
 * Une entrée de menu déroulant : la ligne du menu commun (icône de 16 px, libellé, raccourci à droite, coche en fin de
 * ligne), ou, pour une entrée qui ouvre un sous-menu (`sous`), une flèche à la place du raccourci.
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
  return <LigneMenu icone={icone} libelle={libelle} raccourci={sous ? undefined : touche} coche={coche} sous={sous} desactive={inactif} onClick={onClick} onPointerEnter={onSurvol} />
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
      <Segments mode="onglets" large className="notak-arbre-onglets" options={onglets.map((o) => ({ valeur: o.id, libelle: o.libelle }))} valeur={actif} onChange={choisir} />
      <div className="notak-arbre-cote-corps" role="tabpanel">
        {children}
      </div>
    </aside>
  )
}
