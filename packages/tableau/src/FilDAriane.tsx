import { Fragment, type ReactNode, type Ref, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { tronquerFil } from './coeur/espace'
import type { Id } from './coeur/tableau'
import { MenuEntrees } from './communs/Menu'
import { useFermeture } from './communs/Popover'
import { Icone, type NomIcone } from './icones'
import { t } from './langue'
import './ilots.css'

/**
 * Le fil d'Ariane : le chemin de l'accueil jusqu'à l'endroit où l'on est. Le même dessin dans l'en-tête d'une toile, dans
 * la page et la carte mentale ouvertes en grand, et en tête d'un dossier de la bibliothèque. Comme le fil de Notion (en
 * haut d'une page) et la barre de chemin du Finder, chaque niveau porte l'icône de ce qu'il est (l'accueil, un dossier,
 * une toile, une page, une carte mentale) devant son nom, et chacun y mène d'un clic ; celui où l'on est, au bout, se lit
 * plus foncé et en gras, et ne mène nulle part. Quand la place manque, les niveaux du milieu passent dans « … », dont le
 * menu les redonne avec leurs icônes ; l'accueil et les derniers niveaux restent.
 */

/** Ce qu'est un niveau du fil : son icône le dit. */
export type GenreNiveau = 'accueil' | 'dossier' | 'toile' | 'page' | 'carte'

export interface Niveau {
  id: Id
  titre: string
  genre: GenreNiveau
  /** Une toile privée (par elle ou par une toile au-dessus) : un cadenas suit son nom, comme sur sa tuile. */
  prive?: boolean
}

/** Le cadenas d'un niveau privé, après son nom : discret, et dit au lecteur d'écran. */
const Cadenas = ({ grand = false }: { grand?: boolean }) => (
  <span className="notak-fil-prive" role="img" aria-label={t('espace.privee')} title={t('espace.privee')}>
    <Icone nom="verrou" taille={grand ? 15 : 12} trait={2} />
  </span>
)
/** Ce que le cadenas ajoute à la largeur d'un niveau. */
const CADENAS = 16

/** Des attributs posés sur un niveau : la cible d'un dépôt (`data-depot-tableau`), son survol, son chargement. */
export type AttributsNiveau = Record<`data-${string}`, string | true | undefined>

/** Les icônes de la bibliothèque (`ICONE_GENRE`) : un dossier, une toile, une page, une carte mentale. */
const ICONES: Record<GenreNiveau, NomIcone> = { accueil: 'maison', dossier: 'dossier', toile: 'tableau', page: 'document', carte: 'carteMentale' }

/** L'icône d'un niveau. L'accueil est la tuile bleue à la maison de la colonne de la bibliothèque, partout où il paraît. */
export function IconeNiveau({ genre, grand = false }: { genre: GenreNiveau; grand?: boolean }) {
  if (genre === 'accueil')
    return (
      <span className="notak-fil-accueil" aria-hidden>
        <Icone nom="maison" taille={grand ? 13 : 11} trait={2.4} />
      </span>
    )
  return <Icone nom={ICONES[genre]} taille={grand ? 20 : 16} trait={grand ? 1.6 : 1.75} className="notak-fil-icone" />
}

/**
 * Ce que prend un niveau dans le fil, hors son nom : ses marges, son icône et l'écart qui la suit, puis le chevron qui le
 * sépare du suivant (toile.css). Le nom se coupe à `NOM` (`NOM_ICI` pour l'endroit où l'on est) ; « … » prend
 * `SUSPENSION`. Des estimations larges : un fil un peu court vaut mieux qu'un fil qui déborde.
 */
const POLICE = '500 14px'
const POLICE_ICI = '600 14px'
const NOM = 150
const NOM_ICI = 220
const AUTOUR = 51
const SUSPENSION = 50

/** Le canvas qui mesure les noms ; `null` quand il n'y en a pas (un essai), `undefined` tant qu'on ne l'a pas cherché. */
let mesureur: CanvasRenderingContext2D | null | undefined
/** La largeur d'un texte dans la police de l'application ; sans canvas, une estimation. */
function largeurTexte(texte: string, police: string): number {
  if (mesureur === undefined) mesureur = typeof document === 'undefined' ? null : (document.createElement('canvas').getContext?.('2d') ?? null)
  if (!mesureur) return texte.length * 7.5
  mesureur.font = `${police} ${getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'}`
  return mesureur.measureText(texte).width
}

/**
 * Le fil. `niveaux` va de l'accueil au parent de l'endroit où l'on est ; `ici` est cet endroit : son genre, son nom, et ce
 * qui le montre (un titre qu'on renomme dans la toile, le titre de la page dans la bibliothèque), son nom seul sinon.
 * `place` : la largeur que le fil peut prendre, en pixels. `seulIci` : au téléphone, rien que l'endroit où l'on est.
 */
export function FilDAriane({
  niveaux,
  ici,
  aller,
  place = Number.POSITIVE_INFINITY,
  seulIci = false,
  titreDessous = false,
  attributs,
  apres,
  className,
  etiquette,
  ref,
}: {
  niveaux: readonly Niveau[]
  ici: { genre: GenreNiveau; titre: string; prive?: boolean; contenu?: ReactNode; infobulle?: string; attributs?: AttributsNiveau }
  aller(id: Id): void
  place?: number
  seulIci?: boolean
  /**
   * L'endroit où l'on est se lit dessous, en titre de la page (un dossier de la bibliothèque) : le chemin a sa ligne
   * au-dessus, et toute sa place.
   */
  titreDessous?: boolean
  attributs?(n: Niveau): AttributsNiveau
  /** Ce qui suit l'endroit où l'on est : l'état de l'enregistrement, « Lecture seule ». */
  apres?: ReactNode
  className?: string
  etiquette?: string
  ref?: Ref<HTMLElement>
}) {
  const sansTitre = t('commun.sansTitre')
  const cle = niveaux.map((n) => `${n.id}␟${n.titre}`).join('␞') + `␞${ici.titre}`
  const { visibles, caches } = useMemo(() => {
    const tous = niveaux.length + 1
    if (seulIci) return { visibles: [niveaux.length], caches: [] as number[] }
    if (!Number.isFinite(place)) return { visibles: [...Array(tous).keys()], caches: [] as number[] }
    const largeurs = niveaux.map((n) => Math.min(NOM, largeurTexte(n.titre || sansTitre, POLICE)) + AUTOUR + (n.prive ? CADENAS : 0))
    if (titreDessous) {
      const chemin = tronquerFil(largeurs, place, SUSPENSION)
      return { visibles: [...chemin.visibles, niveaux.length], caches: chemin.caches }
    }
    largeurs.push(Math.min(NOM_ICI, largeurTexte(ici.titre || sansTitre, POLICE_ICI)) + AUTOUR + (ici.prive ? CADENAS : 0))
    return tronquerFil(largeurs, place, SUSPENSION)
    // `cle` dit les niveaux et les titres : les tableaux eux-mêmes changent d'identité à chaque rendu.
  }, [cle, place, seulIci, titreDessous])

  const chevron = (
    <span className="notak-fil-sep" aria-hidden>
      <Icone nom="chevronDroite" taille={14} />
    </span>
  )
  const parents = visibles.filter((i) => i < niveaux.length)
  return (
    <nav ref={ref} className={`notak-fil${titreDessous ? ' notak-fil-dessous' : ''}${className ? ` ${className}` : ''}`} aria-label={etiquette ?? t('espace.fil')}>
      {parents.map((i, rang) => {
        const n = niveaux[i]!
        return (
          <Fragment key={`${n.id}:${i}`}>
            <span className="notak-fil-bloc">
              <button type="button" className="notak-fil-segment" data-genre={n.genre} title={n.titre || sansTitre} onClick={() => aller(n.id)} {...attributs?.(n)}>
                <IconeNiveau genre={n.genre} />
                <span className="notak-fil-nom">{n.titre || sansTitre}</span>
                {n.prive && <Cadenas />}
              </button>
              {chevron}
            </span>
            {/* Les niveaux du milieu, après l'accueil (le premier) : un « … » et son menu. */}
            {rang === 0 && caches.length > 0 && <Suspension niveaux={caches.map((c) => niveaux[c]!)} aller={aller} chevron={chevron} />}
          </Fragment>
        )
      })}
      <div className="notak-fil-titre" aria-current="page" data-genre={ici.genre} title={ici.infobulle ?? (ici.titre || sansTitre)} {...ici.attributs}>
        <IconeNiveau genre={ici.genre} grand={titreDessous} />
        {ici.contenu ?? <span className="notak-fil-nom">{ici.titre || sansTitre}</span>}
        {ici.prive && <Cadenas grand={titreDessous} />}
      </div>
      {apres}
    </nav>
  )
}

/** « … » : les niveaux qui n'ont pas trouvé place, dans le menu commun de Notak, chacun avec son icône. */
function Suspension({ niveaux, aller, chevron }: { niveaux: readonly Niveau[]; aller(id: Id): void; chevron: ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const bouton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useFermeture({ racine: menu, ancre: bouton, actif: ouvert, fermer: () => setOuvert(false) })
  // Ouvert, le menu prend le clavier : les flèches parcourent les niveaux, Entrée y va.
  useLayoutEffect(() => {
    if (ouvert) menu.current?.querySelector<HTMLButtonElement>('.notak-e')?.focus({ preventScroll: true })
  }, [ouvert])
  const sansTitre = t('commun.sansTitre')
  return (
    <span className="notak-fil-bloc">
      <button
        ref={bouton}
        type="button"
        className="notak-fil-segment notak-fil-suspension"
        aria-label={t('espace.niveauxCaches')}
        title={t('espace.niveauxCaches')}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        <Icone nom="plus" taille={16} />
      </button>
      {ouvert && (
        <MenuEntrees
          ref={menu}
          className="notak-fil-menu"
          entrees={niveaux.map((n) => ({ libelle: n.titre || sansTitre, icone: ICONES[n.genre], faire: () => aller(n.id) }))}
          fermer={() => {
            setOuvert(false)
            bouton.current?.focus({ preventScroll: true })
          }}
        />
      )}
      {chevron}
    </span>
  )
}

/**
 * La place du fil, en pixels, suivie quand la fenêtre ou ce qui l'entoure change de taille ; infinie tant qu'on ne peut
 * pas la mesurer (un essai). Rend aussi la `ref` à poser sur le fil : un fil qui paraît plus tard (un dossier qu'on
 * ouvre) se mesure dès qu'il est là.
 *
 * `ilot` : le fil vit au bout d'un îlot qui se règle sur lui ; il peut prendre ce que l'îlot peut prendre (sa largeur
 * maximale, et avec `ilot-zone` ce que lui laissent les îlots voisins dans la bande qui les porte), moins les boutons de
 * l'îlot. `parent` : il remplit son parent, dont la largeur ne dépend pas de lui.
 */
export function usePlaceDuFil(mode: 'ilot' | 'ilot-zone' | 'parent'): [number, (n: HTMLElement | null) => void] {
  const [fil, setFil] = useState<HTMLElement | null>(null)
  const [place, setPlace] = useState(Number.POSITIVE_INFINITY)
  useLayoutEffect(() => {
    const ilot = mode === 'parent' ? null : fil?.closest<HTMLElement>('.notak-ilot')
    const conteneur = mode === 'parent' ? fil?.parentElement : mode === 'ilot-zone' ? ilot?.parentElement : null
    if (!fil || (mode !== 'parent' && !ilot)) return
    const mesurer = () => {
      const bande = !conteneur?.clientWidth ? Number.POSITIVE_INFINITY : mode === 'parent' ? conteneur.clientWidth : bandeLaissee(conteneur, ilot!)
      if (mode === 'parent') return setPlace(bande)
      // Une largeur maximale en pixels (`min(440px, 40vw)` se résout ainsi) ; `none`, et c'est la bande qui borne.
      const max = getComputedStyle(ilot!).maxWidth
      const plafond = Math.min(max.endsWith('px') ? Number.parseFloat(max) : Number.POSITIVE_INFINITY, bande)
      setPlace(Number.isFinite(plafond) ? plafond - (ilot!.offsetWidth - fil.offsetWidth) : plafond)
    }
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(mesurer)
    // Les îlots voisins changent de largeur aussi (un partage, une pastille de plus) : ce qu'ils laissent avec eux.
    for (const x of [conteneur, ilot, ...(mode === 'ilot-zone' && conteneur ? conteneur.children : [])]) if (x) obs.observe(x)
    // La largeur maximale d'un îlot suit celle de la fenêtre (vw) : un îlot qui n'a pas bougé peut en gagner.
    window.addEventListener('resize', mesurer)
    return () => {
      obs.disconnect()
      window.removeEventListener('resize', mesurer)
    }
  }, [fil, mode])
  return [place, setFil]
}

/** Ce que la bande laisse à l'îlot du fil : sa largeur intérieure, moins ses autres enfants et leurs écarts. */
function bandeLaissee(bande: HTMLElement, ilot: HTMLElement): number {
  const style = getComputedStyle(bande)
  const ecart = Number.parseFloat(style.columnGap) || 0
  const interieur = bande.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0)
  const voisins = [...bande.children].filter((c): c is HTMLElement => c !== ilot && c instanceof HTMLElement && c.offsetWidth > 0)
  return interieur - voisins.reduce((total, c) => total + c.offsetWidth + ecart, 0)
}
