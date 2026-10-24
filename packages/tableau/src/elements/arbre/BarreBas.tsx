import { useEffect, useRef, useState } from 'react'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { Deroulant, Entree } from './Fenetre'
import { Flottant } from './Flottant'
import { enPourcent, entreesZoom } from './modele/zoom'

/**
 * La barre du bas de la carte ouverte, comme celle de Xmind (docs/XMIND.md § 10) : deux pastilles flottantes. À
 * gauche, l'onglet de la feuille ; à droite, le compteur de sujets, le zoom, puis Gantt, plan, Zen et Pitch.
 * Quand la fenêtre se resserre, le compteur, le zoom, le Gantt puis les modes s'effacent dans cet ordre (le CSS le
 * fait par des seuils de largeur).
 */

export interface PropsBarreBas {
  titre: string
  lectureSeule: boolean
  sujets: number
  choisis: number
  mots: number
  caracteres: number
  /** 1 = 100 %. */
  zoom: number
  enPlan: boolean
  zenActif: boolean
  pitchActif: boolean
  zoomer(z: number): void
  ajuster(): void
  basculerPlan(): void
  zen(): void
  presenter(): void
  renommer(titre: string): void
  dupliquer(): void
  nouvelle(): void
  enregistrer(): void
}

export const formaterZoom = (pourcent: number) => t('arbre.bas.pourcent', { n: pourcent })

/** Un bouton de la pastille de droite : 28 de haut, l'icône à 24. */
function BoutonBas({ icone, info, touche, actif, inactif, classe, onClick }: { icone: NomIcone; info: string; touche?: string; actif?: boolean; inactif?: boolean; classe?: string; onClick?: () => void }) {
  return (
    <button type="button" className={classe ? `notak-arbre-bas-bouton ${classe}` : 'notak-arbre-bas-bouton'} aria-label={info} title={info} aria-keyshortcuts={touche} aria-pressed={actif} disabled={inactif} onClick={onClick}>
      <Icone nom={icone} taille={24} trait={1.4} />
    </button>
  )
}

/** Ce qui se ferme au clic dehors et à Échap, sans voler la touche à la carte. */
function useFermeture(ouvert: boolean, fermer: () => void) {
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => {
      // La bulle des comptes est posée hors de la barre (Flottant) : la cliquer ne la ferme pas.
      if (!racine.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.notak-arbre-bas-popover')) fermer()
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
  return racine
}

/** Le compteur : « Sujets: 12 » ou « Sujets: 3 / 12 » avec une sélection ; un clic ouvre les comptes. */
export function Compteur({ sujets, choisis, mots, caracteres }: Pick<PropsBarreBas, 'sujets' | 'choisis' | 'mots' | 'caracteres'>) {
  const [ouvert, setOuvert] = useState(false)
  const racine = useFermeture(ouvert, () => setOuvert(false))
  const libelle = choisis > 0 ? t('arbre.bas.compteSel', { s: choisis, n: sujets }) : t('arbre.bas.compte', { n: sujets })
  return (
    <div ref={racine} className="notak-arbre-bas-hote notak-arbre-bas-compteur">
      <button type="button" className="notak-arbre-bas-texte" aria-haspopup="dialog" aria-expanded={ouvert} title={t('arbre.bas.compteInfo')} onClick={() => setOuvert((o) => !o)}>
        {/* Une largeur réservée par le texte le plus long : la barre ne saute pas quand on sélectionne. */}
        <span aria-hidden className="notak-arbre-bas-reserve">
          {t('arbre.bas.compteSel', { s: sujets, n: sujets })}
        </span>
        <span className="notak-arbre-bas-valeur">{libelle}</span>
      </button>
      {ouvert && (
        <Flottant ancre={racine.current} cote="haut" alignement="centre" ecart={12} className="notak-arbre-bas-popover" role="dialog" aria-label={t('arbre.bas.compteInfo')}>
          <p>{t('arbre.bas.compte', { n: sujets })}</p>
          <p>{t('arbre.bas.mots', { n: mots })}</p>
          <p>{t('arbre.bas.caracteres', { n: caracteres })}</p>
        </Flottant>
      )}
    </div>
  )
}

/** Le pourcentage et son menu : les paliers, le zoom courant coché ; « Ajuster la carte » en mode carte. */
export function MenuZoom({ zoom, enPlan, zoomer, ajuster }: Pick<PropsBarreBas, 'zoom' | 'enPlan' | 'zoomer' | 'ajuster'>) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div className="notak-arbre-bas-hote notak-arbre-bas-zoom">
      <button type="button" className="notak-arbre-bas-texte" aria-haspopup="menu" aria-expanded={ouvert} title={t('arbre.bas.zoomInfo')} onClick={() => setOuvert((o) => !o)}>
        <span aria-hidden className="notak-arbre-bas-reserve">
          {formaterZoom(500)}
        </span>
        <span className="notak-arbre-bas-valeur">{formaterZoom(enPourcent(zoom))}</span>
        <Icone nom="chevronBas" taille={12} trait={2} />
      </button>
      <Deroulant ouvert={ouvert} fermer={() => setOuvert(false)} vers="haut" alignement="centre" className="notak-arbre-bas-menu">
        {entreesZoom(zoom, enPlan).map((e) => (
          <Entree
            key={e.valeur}
            libelle={formaterZoom(e.valeur)}
            coche={e.coche}
            onClick={() => {
              zoomer(e.valeur / 100)
              setOuvert(false)
            }}
          />
        ))}
        {!enPlan && (
          <>
            <hr />
            <Entree
              libelle={t('arbre.ajuster')}
              coche={false}
              onClick={() => {
                ajuster()
                setOuvert(false)
              }}
            />
          </>
        )}
      </Deroulant>
    </div>
  )
}

/**
 * L'onglet de la feuille. Une feuille de Notak est une carte posée sur la toile : celle-ci est la seule de son
 * élément, donc rien à faire défiler, et « Supprimer » reste grisé.
 */
export function OngletFeuille({ titre, lectureSeule, renommer, dupliquer, nouvelle, enregistrer }: Pick<PropsBarreBas, 'titre' | 'lectureSeule' | 'renommer' | 'dupliquer' | 'nouvelle' | 'enregistrer'>) {
  const [menu, setMenu] = useState(false)
  const [edition, setEdition] = useState<string | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (edition !== null) {
      champ.current?.focus()
      champ.current?.select()
    }
    // Seulement à l'ouverture du champ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition === null])
  const nom = titre || t('type.arbre')
  const valider = () => {
    if (edition !== null && edition.trim() && edition !== titre) renommer(edition)
    setEdition(null)
  }
  return (
    <div className="notak-arbre-bas-hote notak-arbre-bas-feuille" data-actif="">
      {edition === null ? (
        <button type="button" className="notak-arbre-bas-onglet" aria-current="page" title={nom} onDoubleClick={() => !lectureSeule && setEdition(titre)} onContextMenu={(e) => (e.preventDefault(), !lectureSeule && setMenu(true))}>
          <span>{nom}</span>
        </button>
      ) : (
        <input
          ref={champ}
          className="notak-arbre-bas-renommer"
          value={edition}
          aria-label={t('arbre.bas.renommer')}
          onChange={(e) => setEdition(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') valider()
            else if (e.key === 'Escape') setEdition(null)
          }}
        />
      )}
      {!lectureSeule && edition === null && (
        <button type="button" className="notak-arbre-bas-chevron" aria-haspopup="menu" aria-expanded={menu} aria-label={t('arbre.bas.feuilleMenu')} onClick={() => setMenu((m) => !m)}>
          <Icone nom="chevronBas" taille={12} trait={2} />
        </button>
      )}
      <Deroulant ouvert={menu} fermer={() => setMenu(false)} vers="haut" className="notak-arbre-bas-menu notak-arbre-bas-menu-feuille">
        <Entree libelle={t('arbre.bas.renommer')} onClick={() => (setMenu(false), setEdition(titre))} />
        <hr />
        <Entree libelle={t('arbre.bas.dupliquer')} onClick={() => (setMenu(false), dupliquer())} />
        <Entree libelle={t('arbre.bas.supprimer')} inactif onClick={undefined} />
        <hr />
        <Entree libelle={t('arbre.bas.nouvelle')} onClick={() => (setMenu(false), nouvelle())} />
        <hr />
        <Entree libelle={t('arbre.bas.enregistrer')} onClick={() => (setMenu(false), enregistrer())} />
      </Deroulant>
    </div>
  )
}

export function BarreBas(p: PropsBarreBas) {
  return (
    <div
      className="notak-arbre-bas"
      onKeyDown={(e) => {
        // Espace et Entrée activent le bouton qui a le focus : la carte n'y voit pas un geste (éditer, créer).
        if (e.key === ' ' || e.key === 'Enter' || e.target instanceof HTMLInputElement) e.stopPropagation()
      }}
    >
      <div className="notak-arbre-bas-pastille notak-arbre-bas-feuilles">
        <OngletFeuille titre={p.titre} lectureSeule={p.lectureSeule} renommer={p.renommer} dupliquer={p.dupliquer} nouvelle={p.nouvelle} enregistrer={p.enregistrer} />
        {!p.lectureSeule && (
          <>
            <span className="notak-arbre-bas-filet" />
            <button type="button" className="notak-arbre-bas-bouton notak-arbre-bas-plus" aria-label={t('arbre.bas.nouvelleInfo')} title={t('arbre.bas.nouvelleInfo')} aria-keyshortcuts="Alt+Meta+N" onClick={p.nouvelle}>
              <Icone nom="ajouter" taille={24} trait={1.4} />
            </button>
          </>
        )}
      </div>
      <div className="notak-arbre-bas-pastille notak-arbre-bas-controles">
        {!p.enPlan && (
          <>
            <Compteur sujets={p.sujets} choisis={p.choisis} mots={p.mots} caracteres={p.caracteres} />
            <span className="notak-arbre-bas-filet notak-arbre-bas-coupe-compteur" />
          </>
        )}
        <MenuZoom zoom={p.zoom} enPlan={p.enPlan} zoomer={p.zoomer} ajuster={p.ajuster} />
        <span className="notak-arbre-bas-filet notak-arbre-bas-coupe-zoom" />
        <BoutonBas icone="gantt" info={t('arbre.bas.gantt')} touche="Alt+Meta+G" classe="notak-arbre-bas-gantt" inactif />
        <span className="notak-arbre-bas-filet notak-arbre-bas-coupe-gantt" />
        <div className="notak-arbre-bas-modes">
          {p.enPlan ? (
            <BoutonBas icone="carteMentale" info={t('arbre.bas.versCarte')} touche="Shift+Meta+M" onClick={p.basculerPlan} />
          ) : (
            <>
              <BoutonBas icone="arbrePlan" info={t('arbre.bas.versPlan')} touche="Shift+Meta+M" onClick={p.basculerPlan} />
              <BoutonBas icone="pleinEcran" info={t('arbre.bas.zen')} touche="Alt+Meta+F" actif={p.zenActif} onClick={p.zen} />
            </>
          )}
          <BoutonBas icone="fichierPresentation" info={t('arbre.bas.pitch')} touche="Alt+Meta+P" actif={p.pitchActif} onClick={p.presenter} />
        </div>
      </div>
    </div>
  )
}
