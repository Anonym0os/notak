import { type HTMLAttributes, type ReactNode, type Ref, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icone, type NomIcone } from '../icones'
import { PastillePersonne } from '../pastille'
import { Feuille, enFeuille } from './Feuille'
import './menu.css'

/**
 * Le menu commun de Notak : la toile, le document à blocs et la carte mentale posent leurs menus avec ces mêmes
 * pièces (conteneur, ligne, séparateur, titre de groupe, sous-menu, raccourci). Les menus qui n'ont pas de focus
 * itinérant (le « / » du document, dont le champ garde le focus) n'utilisent que les pièces ; `MenuContextuel` et
 * `ListeMenu` ajoutent la navigation au clavier des menus qui prennent le focus.
 */

/** Une entrée du menu ; `null` trace un séparateur. */
export type Entree = {
  libelle: string
  raccourci?: string
  coche?: boolean
  /** Le menu reste ouvert après le choix (une bascule). */
  reste?: boolean
  desactive?: boolean
  /** Un sous-menu qui s'ouvre à droite (au survol, au clic ou avec la flèche droite). */
  sous?: Entree[]
  /** Une ligne d'information, sans clic : une personne (avatar) et ce qu'elle a fait. */
  info?: { nom: string; couleur?: string; photo?: string }
  /** Une pastille de couleur devant le libellé (les couleurs du canevas). */
  pastille?: string
  /** L'icône devant le libellé ; dès qu'une entrée en a une, les autres gardent sa place, pour que les libellés s'alignent. */
  icone?: NomIcone
  /** Une action qui détruit ou retire : dite en rouge. */
  danger?: boolean
  faire(): void
} | null

/** Les touches d'un raccourci, une pastille chacune : « ⇧⌘Z » donne ⇧, ⌘, Z. */
export const touchesDe = (raccourci: string): string[] => {
  const touches: string[] = []
  let reste = raccourci
  while (reste && '⌘⌥⇧⌃'.includes(reste[0]!)) {
    touches.push(reste[0]!)
    reste = reste.slice(1)
  }
  if (reste) touches.push(reste)
  return touches
}

/** Un raccourci : une pastille `<kbd>` par touche (« ⌘⇧K » donne ⌘, ⇧, K). */
export function Touches({ touches, className }: { touches: string; className?: string }) {
  return (
    <span className={className ? `notak-touches ${className}` : 'notak-touches'} aria-label={touches}>
      {touchesDe(touches).map((k, i) => (
        <kbd key={i} className="notak-kbd">
          {k}
        </kbd>
      ))}
    </span>
  )
}

/** Les classes d'un menu, pour qui pose lui-même son conteneur (une fenêtre flottante qui se place seule). */
export const classeMenu = (className?: string) => `notak-pop notak-menu${className ? ` ${className}` : ''}`

/** Le conteneur d'un menu : un popover de 14 px de rayon, rembourré de 6. À l'appelant de le placer. */
export function Menu({ className, ref, ...reste }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return <div role="menu" {...reste} ref={ref} className={classeMenu(className)} />
}

interface PropsLigne extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** `button` par défaut (le menu à focus itinérant) ; `div` pour une liste de choix dont le focus est ailleurs. */
  as?: 'button' | 'div'
  /** L'icône de 16 px (Tabler, par `icones.tsx`). */
  icone?: NomIcone
  /** Un dessin propre à la ligne à la place de l'icône (la tuile « A » d'une couleur) ; `large` : plus grand que 16 px. */
  signe?: ReactNode
  large?: boolean
  /** Une pastille de couleur à la place de l'icône. */
  pastille?: string
  /** Garde la place d'une icône sur une ligne qui n'en a pas, pour que les libellés s'alignent. */
  reserverIcone?: boolean
  libelle: ReactNode
  /** Ce qui suit le libellé en retrait. */
  detail?: ReactNode
  /** Le raccourci, à lire par `Touches`. */
  raccourci?: string
  /** Du texte libre au bord droit (une légende), à la place du raccourci. */
  fin?: ReactNode
  /** Une coche en fin de ligne quand c'est vrai ; définie, elle fait de la ligne une case à cocher (et garde sa place). */
  coche?: boolean | undefined
  /** Garde la place d'une coche sur une ligne qui n'en a pas. */
  reserverCoche?: boolean
  /** La ligne ouvre un sous-menu : une flèche en fin de ligne. */
  sous?: boolean
  /** Une action qui détruit ou retire : dite en rouge. */
  danger?: boolean
  /** La ligne choisie au clavier (liste dont le focus est ailleurs). */
  actif?: boolean
  desactive?: boolean
}

/**
 * Une ligne de menu : icône, libellé coupé par une ellipse, raccourci, coche, flèche de sous-menu. Rouge quand elle
 * détruit, claire quand elle est survolée, au focus ou active.
 */
export function LigneMenu({ as = 'button', icone, signe, large, pastille, reserverIcone, libelle, detail, raccourci, fin, coche, reserverCoche, sous, danger, actif, desactive, ...reste }: PropsLigne) {
  const Balise = as
  const contenu = (
    <>
      {(icone || signe || pastille || reserverIcone) && (
        <span className="notak-e-icone" aria-hidden data-large={large || undefined}>
          {icone ? <Icone nom={icone} taille={16} trait={1.8} /> : pastille ? <span className="notak-e-pastille" style={{ background: pastille }} /> : signe}
        </span>
      )}
      <span className="notak-e-libelle">
        {libelle}
        {detail && <span className="notak-e-detail"> · {detail}</span>}
      </span>
      {fin}
      {raccourci && <Touches touches={raccourci} />}
      {(coche !== undefined || reserverCoche) && <span className="notak-e-coche">{coche ? <Icone nom="coche" taille={15} trait={2} /> : null}</span>}
      {sous && <Icone nom="chevronDroite" taille={16} className="notak-e-fleche" />}
    </>
  )
  const commun = {
    role: coche === undefined ? 'menuitem' : 'menuitemcheckbox',
    'aria-checked': coche,
    'aria-haspopup': sous ? ('menu' as const) : undefined,
    ...reste,
    className: reste.className ? `notak-e ${reste.className}` : 'notak-e',
    'data-actif': actif || undefined,
    'data-danger': danger || undefined,
  }
  return as === 'button' ? (
    <button type="button" {...(commun as HTMLAttributes<HTMLButtonElement>)} disabled={desactive}>
      {contenu}
    </button>
  ) : (
    <Balise {...commun} aria-disabled={desactive || undefined}>
      {contenu}
    </Balise>
  )
}

/** Le trait entre deux familles de lignes. */
export function SeparateurMenu() {
  return <div className="notak-sep" role="separator" />
}

/** Le titre d'une famille de lignes. */
export function TitreMenu({ children }: { children: ReactNode }) {
  return (
    <div className="notak-groupe" role="presentation">
      {children}
    </div>
  )
}

/** L'écart gardé entre un menu et le bord de la fenêtre. */
const BORD_MENU = 8

/**
 * Où poser un sous-menu pour qu'il reste tout entier dans la fenêtre : à droite de son entrée, sinon à gauche ; aligné
 * sur elle, sinon remonté juste ce qu'il faut. Plus haut que la fenêtre, il défile. `liste` est sa boîte telle qu'il
 * s'ouvre (à droite, aligné, en px de la fenêtre) ; le résultat dit le côté, la remontée et la hauteur maximale.
 */
export function placerSousMenu(
  liste: { left: number; top: number; width: number; height: number },
  entree: { left: number },
  fenetre: { largeur: number; hauteur: number },
): { aGauche: boolean; remonte: number; hauteurMax: number } {
  const hauteurMax = fenetre.hauteur - 2 * BORD_MENU
  const aGauche = liste.left + liste.width > fenetre.largeur - BORD_MENU && entree.left - liste.width - 2 >= BORD_MENU
  const bas = liste.top + Math.min(liste.height, hauteurMax)
  const remonte = Math.max(0, Math.min(bas - (fenetre.hauteur - BORD_MENU), liste.top - BORD_MENU))
  return { aGauche, remonte, hauteurMax }
}

/** La liste d'un sous-menu, ramenée dans la fenêtre dès qu'elle paraît (`placerSousMenu`). Flèche gauche y revient. */
function SousListe({ children, retour }: { children: ReactNode; retour(ev: React.KeyboardEvent<HTMLDivElement>): void }) {
  const liste = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ aGauche: boolean; remonte: number; hauteurMax: number } | null>(null)
  useLayoutEffect(() => {
    const n = liste.current
    const entree = n?.parentElement
    if (!n || !entree) return
    const r = n.getBoundingClientRect()
    setPlace(
      placerSousMenu(
        { left: r.left, top: r.top, width: r.width, height: n.scrollHeight },
        { left: entree.getBoundingClientRect().left },
        { largeur: window.innerWidth, hauteur: window.innerHeight },
      ),
    )
  }, [])
  return (
    <Menu
      ref={liste}
      className="notak-menu-sous-liste"
      data-a-gauche={place?.aGauche || undefined}
      style={place ? { marginTop: -place.remonte, maxHeight: place.hauteurMax } : { visibility: 'hidden' }}
      onKeyDown={(ev) => {
        if (ev.key !== 'ArrowLeft') return
        ev.preventDefault()
        ev.stopPropagation()
        retour(ev)
      }}
    >
      {children}
    </Menu>
  )
}

/** Les lignes qu'on atteint aux flèches dans la liste `liste` : les siennes, celles de ses sous-menus ouverts exclues. */
const lignesDe = (liste: HTMLElement) => [...liste.querySelectorAll<HTMLButtonElement>(':scope > .notak-e:not(:disabled), :scope > .notak-menu-sous > .notak-e:not(:disabled)')]

/**
 * La ligne que la touche vise dans le menu `racine` : flèches haut et bas (en boucle), Début, Fin, ou une lettre qui
 * va à la ligne qui commence par elle. La liste est celle où se trouve le focus, le sous-menu ouvert ou le menu.
 * Rend `null` quand la touche n'est pas pour la navigation.
 */
export function ligneVisee(racine: HTMLElement, ev: { key: string }): HTMLButtonElement | null {
  const actif = document.activeElement
  const liste = (actif && racine.contains(actif) ? actif.closest<HTMLElement>('[role=menu]') : null) ?? racine
  const boutons = lignesDe(liste)
  if (!boutons.length) return null
  const i = boutons.indexOf(actif as HTMLButtonElement)
  if (ev.key === 'ArrowDown') return boutons[(i + 1) % boutons.length]!
  if (ev.key === 'ArrowUp') return boutons[(i - 1 + boutons.length) % boutons.length]!
  if (ev.key === 'Home') return boutons[0]!
  if (ev.key === 'End') return boutons[boutons.length - 1]!
  if (ev.key.length === 1 && /\p{L}/u.test(ev.key)) {
    const k = ev.key.toLocaleLowerCase()
    const suite = [...boutons.slice(i + 1), ...boutons.slice(0, i + 1)]
    return suite.find((b) => b.textContent?.trim().toLocaleLowerCase().startsWith(k)) ?? null
  }
  return null
}

/** Pas deux séparateurs de suite, ni au bord. */
const sansSeparateursEnTrop = (entrees: Entree[]) => entrees.filter((e, i, t) => e !== null || (i > 0 && i < t.length - 1 && t[i - 1] !== null))

/**
 * Les lignes d'un menu faites de ses entrées : séparateurs, informations, sous-menus qui s'ouvrent au survol, au clic
 * ou à la flèche droite. Une entrée choisie ferme le menu (`fermer`), sauf si elle `reste`. `ouvertA` est l'instant où
 * le menu s'est ouvert : le bouton droit relâché sur une ligne la choisit, mais pas le relâchement qui a ouvert le menu.
 */
export function ListeMenu({ entrees, fermer, ouvertA }: { entrees: Entree[]; fermer(): void; ouvertA?: number }) {
  const [sousOuvert, setSousOuvert] = useState<string | null>(null)
  const propres = sansSeparateursEnTrop(entrees)
  const avecCoches = propres.some((e) => e?.coche !== undefined)
  const avecIcones = propres.some((e) => e?.icone !== undefined)
  const choisir = (e: Exclude<Entree, null>) => {
    if (!e.reste) fermer()
    e.faire()
  }
  return (
    <>
      {propres.map((e, i) => {
        if (e === null) return <SeparateurMenu key={`s${i}`} />
        if (e.info) {
          return (
            <div key={e.libelle} className="notak-menu-info">
              <PastillePersonne taille={20} nom={e.info.nom} couleur={e.info.couleur} adresse={e.info.photo} titre="" />
              <span>{e.libelle}</span>
            </div>
          )
        }
        if (e.sous) {
          const ouvert = sousOuvert === e.libelle
          return (
            <div key={e.libelle} className="notak-menu-sous" onPointerLeave={() => setSousOuvert((o) => (o === e.libelle ? null : o))}>
              <LigneMenu
                icone={e.icone}
                reserverIcone={avecIcones}
                libelle={e.libelle}
                sous
                desactive={e.desactive}
                aria-expanded={ouvert}
                onPointerEnter={(ev) => {
                  ev.currentTarget.focus({ preventScroll: true })
                  setSousOuvert(e.libelle)
                }}
                onClick={() => setSousOuvert(e.libelle)}
                onKeyDown={(ev) => {
                  if (ev.key !== 'ArrowRight' && ev.key !== 'Enter' && ev.key !== ' ') return
                  ev.preventDefault()
                  ev.stopPropagation()
                  setSousOuvert(e.libelle)
                  const parent = ev.currentTarget.parentElement
                  requestAnimationFrame(() => parent?.querySelector<HTMLButtonElement>('.notak-menu-sous-liste .notak-e:not(:disabled)')?.focus({ preventScroll: true }))
                }}
              />
              {ouvert && (
                <SousListe
                  retour={(ev) => {
                    setSousOuvert(null)
                    ev.currentTarget.parentElement?.querySelector<HTMLButtonElement>(':scope > .notak-e')?.focus({ preventScroll: true })
                  }}
                >
                  <ListeMenu entrees={e.sous} fermer={fermer} {...(ouvertA !== undefined ? { ouvertA } : {})} />
                </SousListe>
              )}
            </div>
          )
        }
        return (
          <LigneMenu
            key={e.libelle}
            icone={e.icone}
            reserverIcone={avecIcones}
            pastille={e.pastille}
            libelle={e.libelle}
            raccourci={e.raccourci}
            coche={e.coche}
            reserverCoche={avecCoches}
            danger={e.danger}
            desactive={e.desactive}
            onPointerEnter={(ev) => {
              ev.currentTarget.focus({ preventScroll: true })
              setSousOuvert(null)
            }}
            onPointerUp={(ev) => {
              // Appuyer du bouton droit, glisser jusqu'à l'entrée et relâcher la choisit (pas le relâchement qui ouvre).
              if (ev.button === 2 && ouvertA !== undefined && performance.now() - ouvertA > 250) choisir(e)
            }}
            onClick={() => choisir(e)}
          />
        )
      })}
    </>
  )
}

/** Aux flèches, la ligne suivante prend le focus ; une lettre va à la ligne qui commence par elle. */
export const naviguer = (ev: React.KeyboardEvent<HTMLElement>) => {
  const cible = ligneVisee(ev.currentTarget, ev)
  if (!cible) return
  ev.preventDefault()
  cible.focus()
}

/** Un menu fait de ses entrées (`ListeMenu`), qui se parcourt au clavier (`naviguer`). À l'appelant de le placer et de le fermer. */
export function MenuEntrees({ entrees, fermer, ouvertA, onKeyDown, ...reste }: { entrees: Entree[]; fermer(): void; ouvertA?: number } & Omit<HTMLAttributes<HTMLDivElement>, 'children'> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <Menu
      {...reste}
      onKeyDown={(ev) => {
        onKeyDown?.(ev)
        if (!ev.defaultPrevented) naviguer(ev)
      }}
    >
      <ListeMenu entrees={entrees} fermer={fermer} {...(ouvertA !== undefined ? { ouvertA } : {})} />
    </Menu>
  )
}

/**
 * Le menu du clic droit, posé au point cliqué et ramené dans son parent (la toile) s'il déborde. Il prend le focus :
 * les flèches passent d'une ligne à l'autre (les grisées sont sautées), Entrée choisit, une lettre va à la ligne qui
 * commence par elle, flèche droite ouvre un sous-menu et flèche gauche en revient. Un clic dehors, Échap, un
 * redimensionnement de la fenêtre ou une entrée choisie le ferment ; le bouton droit relâché sur une ligne la choisit aussi.
 */
export function MenuContextuel(props: { x: number; y: number; entrees: Entree[]; fermer(): void }) {
  return enFeuille() ? <FeuilleMenu entrees={props.entrees} fermer={props.fermer} /> : <MenuAuPoint {...props} />
}

/** Au doigt sur un téléphone, le menu monte du bas en feuille : des lignes larges, pas de raccourcis du clavier. */
export function FeuilleMenu({ entrees, fermer, titre }: { entrees: Entree[]; fermer(): void; titre?: ReactNode }) {
  return (
    <Feuille fermer={fermer} titre={titre} role="presentation">
      <div role="menu" className="notak-menu notak-tiroir-bas-menu">
        <ListeMenu entrees={entrees} fermer={fermer} />
      </div>
    </Feuille>
  )
}

function MenuAuPoint({ x, y, entrees, fermer }: { x: number; y: number; entrees: Entree[]; fermer(): void }) {
  const boite = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ x, y })
  const ouvertA = useRef(performance.now())
  useLayoutEffect(() => {
    const n = boite.current
    const parent = n?.parentElement
    if (!n || !parent) return
    setPlace({
      x: Math.max(8, Math.min(x, parent.clientWidth - n.offsetWidth - 8)),
      y: Math.max(8, Math.min(y, parent.clientHeight - n.offsetHeight - 8)),
    })
    n.querySelector<HTMLButtonElement>('.notak-e:not(:disabled)')?.focus({ preventScroll: true })
  }, [x, y])
  useEffect(() => {
    const dehors = (e: PointerEvent) => !boite.current?.contains(e.target as Node) && fermer()
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    // La molette ne fait pas défiler la toile sous un menu ouvert.
    const molette = (e: WheelEvent) => !boite.current?.contains(e.target as Node) && e.preventDefault()
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', touche, true)
    document.addEventListener('wheel', molette, { capture: true, passive: false })
    window.addEventListener('resize', fermer)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', touche, true)
      document.removeEventListener('wheel', molette, true)
      window.removeEventListener('resize', fermer)
    }
  }, [fermer])
  return (
    <MenuEntrees
      ref={boite}
      className="notak-menu-ctx"
      style={{ left: place.x, top: place.y }}
      entrees={entrees}
      fermer={fermer}
      ouvertA={ouvertA.current}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(ev) => ev.stopPropagation()}
    />
  )
}
