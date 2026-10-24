import { type ReactNode, useEffect, useRef, useState } from 'react'
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
export function EnTete({ titre, etat, fermer }: { titre: string; etat: string; fermer(): void }) {
  return (
    <div className="notak-arbre-entete">
      <button type="button" className="notak-arbre-pastille notak-arbre-maison" aria-label={t('arbre.fermer')} title={t('arbre.fermer')} onClick={fermer}>
        <Icone nom="maison" taille={20} trait={1.5} />
      </button>
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

/** Une entrée de menu : icône, libellé, raccourci à droite. */
export function Entree({
  icone,
  libelle,
  touche,
  coche,
  inactif,
  onClick,
}: {
  icone?: NomIcone | undefined
  libelle: string
  touche?: string | undefined
  coche?: boolean | undefined
  inactif?: boolean | undefined
  onClick?: (() => void) | undefined
}) {
  return (
    <button type="button" role={coche === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={coche} disabled={inactif} onClick={onClick}>
      <span className="notak-arbre-entree-icone">{icone ? <Icone nom={icone} taille={16} trait={1.6} /> : coche ? <Icone nom="coche" taille={14} /> : null}</span>
      <span className="notak-arbre-entree-libelle">{libelle}</span>
      {touche && <kbd>{touche}</kbd>}
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

/** Les paliers du menu du zoom, en pour cent. */
const ZOOMS = [300, 200, 150, 125, 100, 75, 50, 25] as const

/** En bas à droite : le nombre de sujets, le zoom, et les quatre modes. */
export function BarreEtat({
  sujets,
  choisis,
  zoom,
  zoomer,
  ajuster,
  notes,
  plan,
  zen,
  presenter,
  enPlan,
  notesOuvertes,
}: {
  sujets: number
  choisis: number
  zoom: number
  zoomer(z: number): void
  ajuster(): void
  notes(): void
  plan(): void
  zen(): void
  presenter(): void
  enPlan: boolean
  notesOuvertes: boolean
}) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="notak-arbre-etat notak-arbre-pilule">
      <span className="notak-arbre-compte">
        {t('arbre.sujets')} {choisis > 0 ? `${choisis} / ${sujets}` : sujets}
      </span>
      <span className="notak-arbre-filet" />
      <div className="notak-arbre-menu-hote">
        <button type="button" className="notak-arbre-zoom" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          {Math.round(zoom * 100)} %
          <Icone nom="chevronBas" taille={12} trait={2} />
        </button>
        <Deroulant ouvert={menu} fermer={() => setMenu(false)} vers="haut">
          <Entree libelle={t('arbre.zoomPlus')} touche="⌘+" onClick={() => zoomer(Math.min(3, zoom * 1.25))} />
          <Entree libelle={t('arbre.zoomMoins')} touche="⌘−" onClick={() => zoomer(Math.max(0.25, zoom / 1.25))} />
          <Entree libelle={t('arbre.tailleReelle')} touche="⌘0" onClick={() => (zoomer(1), setMenu(false))} />
          <Entree libelle={t('arbre.ajuster')} touche="⇧⌘H" onClick={() => (ajuster(), setMenu(false))} />
          <hr />
          {ZOOMS.map((z) => (
            <Entree key={z} libelle={`${z} %`} coche={Math.round(zoom * 100) === z} onClick={() => (zoomer(z / 100), setMenu(false))} />
          ))}
        </Deroulant>
      </div>
      <span className="notak-arbre-filet" />
      <BoutonIcone icone="notes" libelle={t('arbre.toutesNotes')} actif={notesOuvertes} onClick={notes} />
      <BoutonIcone icone="arbrePlan" libelle={t('arbre.plan')} touche="⇧⌘M" actif={enPlan} onClick={plan} />
      <BoutonIcone icone="pleinEcran" libelle={t('arbre.zen')} touche="⌥⌘F" onClick={zen} />
      <BoutonIcone icone="fichierPresentation" libelle={t('arbre.presenter')} touche="⌥⌘P" onClick={presenter} />
    </div>
  )
}

/** En bas à gauche : la feuille, comme l'onglet de feuille de Xmind. */
export function Feuille({ nom }: { nom: string }) {
  return (
    <div className="notak-arbre-feuilles notak-arbre-pilule">
      <span className="notak-arbre-feuille" aria-current="page">
        {nom || t('type.arbre')}
      </span>
    </div>
  )
}
