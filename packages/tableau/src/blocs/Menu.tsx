import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { type Editor, Extension } from '@tiptap/react'
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PanneauFlottant } from '../PanneauFlottant'
import { LigneMenu, SeparateurMenu, TitreMenu } from '../communs'
import { t } from '../langue'
import { ApercuMenus } from './ApercuMenus'
import { type Couleur, type Entree, declencheurSlash, fermeParEspaces, tropLoin } from './catalogue'
import { blocA } from './gestes'
import { type Groupe, agirSurBlocs, couleurDuPremier, idsCibles, lignesDe, listeBloc, listeCouleur, listeSlash, listeTransformer, suffixeDe, typeDeLaCible } from './menuActions'
import { ouvrirApercu } from './collerComme'
import { type AncreFigee, ancreBloc, ancreSlash, dansTriangle, defilement, garderAncre, suivreDefilement } from './menuAncre'
import { lireRecentes, retenirCouleur } from './menuCouleurs'
import { IconeMenu } from './menuIcones'
import { choisirDansSlash } from './menuInsertion'
import { blocsChoisis } from './selection'
import { transformer } from './transformer'

/**
 * Les menus des blocs (docs/NOTION.md § 2 et § 3) :
 * - le menu « / », ouvert par `/` dans le texte (la requête est ce qu'on tape derrière), accroché une fois pour
 *   toutes là où il s'est ouvert ;
 * - le menu du bloc (⌘/, la poignée, le bouton « … » de la bulle), avec son champ de recherche et ses sous-menus
 *   « Transformer en » et « Couleur » ;
 * - « Transformer en » et le sous-menu de couleur, seuls, quand on les demande ainsi.
 */

/** Ce que le plugin dit au menu : où est le `/`, ce qu'on a tapé derrière, et comment mesurer son ancre. */
export interface EtatSlash {
  requete: string
  de: number
  a: number
  /** Le texte du bloc, pour la règle de l'espace seule. */
  texteDuBloc: string
  /** Une composition (IME) est en cours : le menu ne se ferme pas faute de résultat. */
  composition: boolean
  /** Le rectangle d'ancrage, mesuré à l'ouverture seulement : le menu ne suit pas la frappe. */
  mesurer(): { left: number; top: number; right: number; bottom: number } | null
}

export interface PontMenu {
  slash(etat: EtatSlash | null): void
  /** Rend vrai si la touche a servi au menu. */
  touche(cle: string, e?: { shiftKey?: boolean }): boolean
  /** Ouvre le menu du bloc (⌘/). */
  ouvrir(mode: Demande['mode']): void
}

/** Ce que le menu « / » a pris du texte : la zone `/` + filtre, que l'état du plugin garde pour la dessiner. */
type ZoneSlash = { de: number; a: number } | null
const CLE = new PluginKey<ZoneSlash>('menuSlash')

/**
 * Lit, à chaque changement, le texte devant le curseur : `/` en tête de bloc ou après une séparation ouvre le menu.
 * Pendant qu'il est ouvert, le `/` et ce qu'on tape derrière sont posés sur un fond gris, avec l'invite après la barre.
 */
export const extensionSlash = (pont: RefObject<PontMenu | null>) =>
  Extension.create({
    name: 'menuSlash',
    priority: 1200,
    addProseMirrorPlugins() {
      return [
        new Plugin<ZoneSlash>({
          key: CLE,
          state: {
            init: () => null,
            apply: (tr, zone): ZoneSlash => {
              const meta = tr.getMeta(CLE) as ZoneSlash | undefined
              if (meta !== undefined) return meta
              return zone && tr.docChanged ? { de: tr.mapping.map(zone.de), a: tr.mapping.map(zone.a) } : zone
            },
          },
          view: () => ({
            update(vue) {
              const { selection } = vue.state
              const { $from } = selection
              if (!selection.empty || !vue.hasFocus() || !$from.parent.isTextblock || $from.parent.type.spec.code) return pont.current?.slash(null)
              const avant = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
              const d = declencheurSlash(avant)
              if (!d) return pont.current?.slash(null)
              const de = selection.from - d.longueur
              const mesurer = () => {
                try {
                  return ancreSlash(vue.coordsAtPos(de), vue.coordsAtPos(selection.from))
                } catch {
                  return null
                }
              }
              pont.current?.slash({ requete: d.requete, de, a: selection.from, texteDuBloc: $from.parent.textContent, composition: vue.composing, mesurer })
            },
            destroy: () => pont.current?.slash(null),
          }),
          props: {
            decorations: (state) => {
              const zone = CLE.getState(state)
              if (!zone || zone.de >= zone.a || zone.a > state.doc.content.size) return null
              const decos = [Decoration.inline(zone.de, zone.a, { class: 'notak-slash-texte' })]
              // Rien tapé derrière la barre : l'invite grise s'affiche en ligne, dans la même pastille.
              if (zone.a - zone.de === 1)
                decos.push(
                  Decoration.widget(
                    zone.a,
                    () => {
                      const invite = document.createElement('span')
                      invite.className = 'notak-slash-fantome'
                      invite.contentEditable = 'false'
                      invite.textContent = t('menus.fantome')
                      return invite
                    },
                    { side: 1, key: 'menu-slash-fantome' },
                  ),
                )
              return DecorationSet.create(state.doc, decos)
            },
            handleKeyDown: (_vue, e) => {
              // Pendant une composition (IME), Entrée valide la composition, pas une ligne du menu.
              if (e.isComposing) return false
              // ⌘/ ouvre le menu d'actions du bloc, pas « Transformer en ».
              if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === '/' && pont.current) {
                pont.current.ouvrir('bloc')
                return true
              }
              return ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key) && !!pont.current?.touche(e.key, e)
            },
          },
        }),
      ]
    },
  })

interface Props {
  editeur: Editor
  pont: RefObject<PontMenu | null>
  /**
   * Un menu demandé hors du `/` : le menu du bloc (la poignée, le bouton « … » de la bulle), « Transformer en »
   * seul, ses couleurs. `n` change à chaque demande. ⌘/ n'a pas besoin de passer par là : le plugin l'ouvre.
   */
  demande: Demande | null
  /** Copie l'adresse du bloc (le menu du bloc). */
  copierLien?: (id: string) => void
  /** Commente le texte du bloc (le menu du bloc). */
  commenterBloc?: (id: string) => void
  /** Choisir une image dans les fichiers ; absent, l'entrée Image n'est pas proposée. */
  choisirImage?: () => void
  /** La couleur choisie, pour ⌘⇧H et la bulle. */
  surCouleur(c: Couleur): void
}

export interface Demande {
  mode: 'transformer' | 'bloc' | 'couleur'
  n: number
}

type Mode = { genre: 'slash'; etat: EtatSlash; ancre: AncreFigee | null } | { genre: Demande['mode']; requete: string; ancre: AncreFigee | null }

/** Un sous-menu ouvert depuis une ligne du menu du bloc. */
interface Sous {
  menu: 'transformer' | 'couleur'
  /** La ligne qui l'a ouvert, qu'il vise. */
  ligne: HTMLElement
  /** Il a été ouvert au clavier : les flèches s'y promènent. */
  clavier: boolean
  rang: number
}

/** Le bloc que le menu du bloc vise : à gauche de sa poignée, centré sur sa première ligne (mesuré). */
function mesurerBloc(editeur: Editor): AncreFigee | null {
  const choisis = blocsChoisis(editeur.state)
  const { doc, selection } = editeur.state
  const pos = choisis.length ? blocPremier(editeur, choisis[0]!) : blocA(selection.$from)
  if (pos === null) return null
  const dom = editeur.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  const r = dom.getBoundingClientRect()
  let ligne = { top: r.top, bottom: r.top + 24 }
  try {
    if (doc.nodeAt(pos)?.isTextblock) ligne = editeur.view.coordsAtPos(pos + 1)
  } catch {
    /* pas de mesure de la première ligne : la poignée se calera sur le haut du bloc */
  }
  return { cle: pos, boite: ancreBloc(r.left, ligne), defil: defilement(editeur.view.dom) }
}

function blocPremier(editeur: Editor, id: string): number | null {
  let trouve: number | null = null
  editeur.state.doc.descendants((n, pos) => {
    if (trouve === null && n.attrs.id === id) trouve = pos
    return trouve === null
  })
  return trouve
}

export function MenuBlocs({ editeur, pont, demande, choisirImage, surCouleur, copierLien, commenterBloc }: Props) {
  const [mode, setMode] = useState<Mode | null>(null)
  const modeRef = useRef<Mode | null>(null)
  const [rang, setRang] = useState(0)
  const [sous, setSous] = useState<Sous | null>(null)
  const [recentes, setRecentes] = useState<Couleur[]>(() => lireRecentes())
  // La requête qui trouvait encore quelque chose, et le `/` que le menu a fermé (Échap, ou une règle de fermeture).
  const trouvee = useRef(0)
  const [ferme, setFerme] = useState<number | null>(null)
  const liste = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)
  const sousPanneau = useRef<HTMLDivElement | null>(null)
  const minuteur = useRef<number | undefined>(undefined)
  const pointeur = useRef<{ x: number; y: number; avant: { x: number; y: number } }>({ x: 0, y: 0, avant: { x: 0, y: 0 } })

  const poser = (m: Mode | null) => {
    modeRef.current = m
    setMode(m)
  }

  const requete = mode ? (mode.genre === 'slash' ? mode.etat.requete : mode.requete) : ''
  const ids = mode && mode.genre !== 'slash' ? idsCibles(editeur) : []
  const cible = mode && mode.genre !== 'slash' ? typeDeLaCible(editeur, ids) : { vers: null, titre: '' }
  const groupes: Groupe[] = !mode
    ? []
    : mode.genre === 'slash'
      ? listeSlash(requete, { image: !!choisirImage, lien: !!copierLien })
      : mode.genre === 'bloc'
        ? listeBloc(requete, { lien: ids.length === 1 && !!copierLien, commenter: !!commenterBloc, titre: cible.titre })
        : mode.genre === 'transformer'
          ? listeTransformer(requete)
          : listeCouleur(requete, recentes[0] ?? null)
  const lignes = lignesDe(groupes)
  const slash = mode?.genre === 'slash'
  const nbRangs = lignes.length + (slash ? 1 : 0)
  const fermeAuto = mode?.genre === 'slash' && (ferme === mode.etat.de || fermeParEspaces(requete, mode.etat.texteDuBloc) || (lignes.length === 0 && !mode.etat.composition && tropLoin(requete, trouvee.current)))
  const visible = !!mode && !fermeAuto
  if (lignes.length > 0) trouvee.current = requete.length

  // Une règle de fermeture se déclenche une fois : on ne rouvre pas le menu en revenant en arrière.
  useEffect(() => {
    if (mode?.genre === 'slash' && fermeAuto && ferme !== mode.etat.de) setFerme(mode.etat.de)
  })

  // Le `/` et son filtre, dessinés dans le texte tant que le menu est ouvert.
  const zone = visible && mode?.genre === 'slash' ? { de: mode.etat.de, a: mode.etat.a } : null
  useEffect(() => {
    if (editeur.isDestroyed) return
    editeur.view.dispatch(editeur.state.tr.setMeta(CLE, zone).setMeta('addToHistory', false))
  }, [editeur, zone?.de, zone?.a])

  const ouvrir = (genre: Demande['mode']) => {
    poser({ genre, requete: '', ancre: mesurerBloc(editeur) })
    setSous(null)
    setRang(0)
  }

  useEffect(() => {
    if (demande) ouvrir(demande.mode)
  }, [demande])

  const fermer = () => {
    clearTimeout(minuteur.current)
    poser(null)
    setSous(null)
    editeur.commands.focus()
  }

  const choisir = (e: Entree) => {
    const m = modeRef.current
    if (!m) return
    if (e.sousMenu) {
      const ligne = liste.current?.querySelector<HTMLElement>(`[data-id="${e.id}"]`)
      if (ligne) setSous({ menu: e.sousMenu, ligne, clavier: true, rang: 0 })
      return
    }
    const effet = e.effet
    const services = {
      ...(copierLien ? { copierLien } : {}),
      ...(commenterBloc ? { commenterBloc } : {}),
      surCouleur: (c: Couleur) => {
        setRecentes(retenirCouleur(c))
        surCouleur(c)
      },
    }
    if (m.genre === 'slash') {
      const zoneSlash = { de: m.etat.de, a: m.etat.a }
      poser(null)
      choisirDansSlash(editeur, e, zoneSlash, choisirImage, () => ouvrirApercu(editeur.view, { genre: 'champ' }))
      if (effet.genre === 'action' || effet.genre === 'couleur') agirSurBlocs(editeur, effet, services)
    } else {
      poser(null)
      editeur.commands.focus()
      if (effet.genre === 'vers') transformer(editeur, effet.vers)
      else agirSurBlocs(editeur, effet, services)
    }
    setSous(null)
    clearTimeout(minuteur.current)
  }

  const lignesSous = sous ? lignesDe(sous.menu === 'transformer' ? listeTransformer('') : listeCouleur('', recentes[0] ?? null)) : []

  const toucher = (k: string, e?: { shiftKey?: boolean }) => {
    if (!visible) return false
    if (k === 'Enter' && e?.shiftKey) return false
    // Les flèches se promènent dans le sous-menu quand il a été ouvert au clavier.
    if (sous?.clavier) {
      if (k === 'Escape') setSous(null)
      else if (k === 'ArrowDown') setSous({ ...sous, rang: (sous.rang + 1) % lignesSous.length })
      else if (k === 'ArrowUp') setSous({ ...sous, rang: (sous.rang + lignesSous.length - 1) % lignesSous.length })
      else if (lignesSous[sous.rang]) choisir(lignesSous[sous.rang]!)
      return true
    }
    if (k === 'Escape') {
      if (sous) setSous(null)
      else if (mode?.genre === 'slash') setFerme(mode.etat.de)
      else fermer()
    } else if (nbRangs === 0) return false
    else if (k === 'ArrowDown') setRang((r) => (Math.min(r, nbRangs - 1) + 1) % nbRangs)
    else if (k === 'ArrowUp') setRang((r) => (Math.min(r, nbRangs - 1) + nbRangs - 1) % nbRangs)
    else {
      const r = Math.min(rang, nbRangs - 1)
      // Le pied fait partie du cycle ; Entrée dessus ferme le menu.
      if (slash && r === lignes.length) {
        if (mode?.genre === 'slash') setFerme(mode.etat.de)
      } else choisir(lignes[r]!)
    }
    return true
  }

  // Le pont est relu à chaque frappe : il doit toujours voir l'état d'aujourd'hui.
  useEffect(() => {
    pont.current = {
      slash: (etat) => {
        const avant = modeRef.current
        if (avant && avant.genre !== 'slash') return
        if (!etat) {
          if (avant) poser(null)
          if (ferme !== null) setFerme(null)
          return
        }
        const meme = avant?.genre === 'slash' && avant.etat.de === etat.de
        if (!meme) {
          setRang(0)
          setSous(null)
          trouvee.current = 0
        } else if (avant.etat.requete !== etat.requete) setRang(0)
        // L'ancre est prise à l'ouverture : tant que le `/` est le même, le menu reste où il est.
        const ancre = garderAncre(meme ? avant.ancre : null, etat.de, etat.mesurer, () => defilement(editeur.view.dom))
        poser({ genre: 'slash', etat, ancre })
      },
      touche: toucher,
      ouvrir,
    }
  })
  useEffect(() => () => void (pont.current = null), [pont])
  useEffect(() => () => clearTimeout(minuteur.current), [])

  useLayoutEffect(() => {
    liste.current?.querySelector('[data-actif]')?.scrollIntoView?.({ block: 'nearest' })
  }, [rang, requete])

  // Le champ du menu du bloc prend le focus une fois le panneau placé : caché, il ne le prendrait pas.
  const genre = mode?.genre
  useEffect(() => {
    if (!genre || genre === 'slash') return
    let image = 0
    let essais = 0
    const viser = () => {
      champ.current?.focus()
      if (document.activeElement !== champ.current && ++essais < 20) image = requestAnimationFrame(viser)
    }
    image = requestAnimationFrame(viser)
    return () => cancelAnimationFrame(image)
  }, [genre, mode?.ancre?.cle])

  if (!visible || !mode) return <ApercuMenus editeur={editeur} />
  const ancre = mode.ancre
  const hote = editeur.view.dom.closest<HTMLElement>('[aria-modal], .notak-espace')
  // Sans mesure (une mesure qui échoue), le panneau reste caché : il se placera à la mesure suivante.
  const cibleDe = () => (ancre ? suivreDefilement(ancre.boite, ancre.defil, defilement(editeur.view.dom)) : null)
  const actuel = cible.vers
  const couleurActuelle = sous?.menu === 'couleur' || mode.genre === 'couleur' ? couleurDuPremier(editeur, ids) : null
  const estCouleurActuelle = (e: Entree) => e.effet.genre === 'couleur' && couleurActuelle && e.effet.couleur.nom === couleurActuelle.nom && e.effet.couleur.fond === couleurActuelle.fond

  // Le survol ouvre le sous-menu après 120 ms et le ferme 100 ms après ; un pointeur en route vers lui ne le ferme pas.
  const survoler = (i: number, e: Entree, ligne: HTMLElement) => {
    setRang(i)
    if (mode.genre === 'slash') return
    clearTimeout(minuteur.current)
    if (e.sousMenu) {
      if (sous?.menu === e.sousMenu) return
      minuteur.current = window.setTimeout(() => setSous({ menu: e.sousMenu!, ligne, clavier: false, rang: 0 }), 120)
    } else if (sous) {
      const p = sousPanneau.current?.getBoundingClientRect()
      if (p && dansTriangle(pointeur.current, pointeur.current.avant, { x: p.left, y: p.top }, { x: p.left, y: p.bottom })) return
      minuteur.current = window.setTimeout(() => setSous(null), 100)
    }
  }

  const rendreLigne = (e: Entree, actif: boolean, survol: (ligne: HTMLElement) => void, groupe?: Groupe) => {
    const couleur = e.effet.genre === 'couleur' ? e.effet.couleur : null
    const coche = (mode.genre !== 'slash' && e.effet.genre === 'vers' && e.effet.vers === actuel) || estCouleurActuelle(e)
    const raccourci = e.sousMenu ? undefined : e.raccourci
    // L'exemple markdown (« ## ») tient la place du raccourci dans le menu « / » ; il ne se lit pas comme des touches.
    const exemple = e.sousMenu || e.raccourci ? undefined : e.section === 'base' || e.section === 'media' || e.section === 'avances' ? e.markdown : undefined
    const suffixe = groupe?.suffixe ? suffixeDe(e) : ''
    return (
      <LigneMenu
        key={e.id}
        as="div"
        role="option"
        aria-selected={actif}
        data-id={e.id}
        actif={actif}
        {...(couleur
          ? {
              large: true,
              signe: (
                <span className="notak-menu-teinte" style={couleur.fond ? { background: couleur.nom === 'defaut' ? undefined : `var(--notak-bloc-${couleur.nom}-fond)` } : { color: couleur.nom === 'defaut' ? undefined : `var(--notak-bloc-${couleur.nom})` }}>
                  A
                </span>
              ),
            }
          : { signe: <IconeMenu nom={e.icone} taille={16} /> })}
        libelle={e.libelle}
        detail={suffixe || undefined}
        raccourci={raccourci && !coche ? raccourci : undefined}
        fin={exemple && !coche ? <span className="notak-e-detail">{exemple}</span> : undefined}
        coche={coche ? true : undefined}
        sous={!!e.sousMenu}
        onPointerDown={(ev) => ev.preventDefault()}
        onPointerEnter={(ev) => survol(ev.currentTarget)}
        onClick={() => choisir(e)}
      />
    )
  }

  let i = -1
  const corps = groupes.map((g, k) => (
    <div key={g.cle} role="presentation">
      {k > 0 && <SeparateurMenu />}
      <div role="group">
        {g.titre && <TitreMenu>{g.titre}</TitreMenu>}
        {g.lignes.map((e) => {
          const n = ++i
          return rendreLigne(e, n === Math.min(rang, nbRangs - 1) && !sous?.clavier, (ligne) => survoler(n, e, ligne), g)
        })}
      </div>
    </div>
  ))

  return (
    <>
      <PanneauFlottant
        cible={cibleDe}
        hote={hote}
        cote={slash ? 'bas' : 'gauche'}
        alignement={slash ? 'debut' : 'centre'}
        distance={slash ? 12 : 5}
        fleche={false}
        garderCote={slash}
        className="notak-menu-blocs-panneau"
        onPointerDown={(e) => {
          // Le menu « / » laisse le focus au texte ; les autres le laissent à leur champ.
          if (slash || !(e.target instanceof HTMLInputElement)) e.preventDefault()
        }}
      >
        <div
          className="notak-pop notak-menu-blocs"
          data-genre={mode.genre}
          role="dialog"
          aria-label={slash ? t('blocs.menu') : t(`blocs.action.${mode.genre === 'bloc' ? 'transformer' : mode.genre}`)}
          onPointerMove={(e) => (pointeur.current = { x: e.clientX, y: e.clientY, avant: { x: pointeur.current.x, y: pointeur.current.y } })}
          onPointerLeave={() => slash && setRang(0)}
        >
          {mode.genre !== 'slash' && (
            <div className="notak-menu-blocs-entete">
              <input
                ref={champ}
                className="notak-menu-blocs-filtre"
                value={mode.requete}
                placeholder={t('menus.chercherActions')}
                aria-label={t('menus.chercherActions')}
                onChange={(e) => {
                  poser({ ...mode, requete: e.target.value })
                  setSous(null)
                  setRang(0)
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'ArrowRight' && !sous && e.currentTarget.selectionStart === e.currentTarget.value.length && lignes[Math.min(rang, nbRangs - 1)]?.sousMenu) {
                    e.preventDefault()
                    return choisir(lignes[Math.min(rang, nbRangs - 1)]!)
                  }
                  if (e.key === 'ArrowLeft' && sous?.clavier) {
                    e.preventDefault()
                    return setSous(null)
                  }
                  if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
                    e.preventDefault()
                    e.stopPropagation()
                    toucher(e.key, e)
                  }
                }}
                onBlur={() =>
                  setTimeout(() => {
                    if (document.activeElement?.closest('.notak-menu-blocs') || modeRef.current?.genre === 'slash') return
                    poser(null)
                    setSous(null)
                  }, 0)
                }
              />
            </div>
          )}
          <div className="notak-menu-blocs-liste" ref={liste} role="listbox">
            {lignes.length === 0 && !slash && <div className="notak-menu-blocs-vide">{t('blocs.aucun')}</div>}
            {corps}
          </div>
          {slash && (
            <div className="notak-menu-blocs-pied">
              <LigneMenu
                as="div"
                role="option"
                aria-selected={rang === lignes.length}
                actif={rang === lignes.length}
                libelle={t('menus.fermer')}
                fin={<span className="notak-e-detail">{t('menus.echap')}</span>}
                onPointerDown={(ev) => ev.preventDefault()}
                onPointerEnter={() => setRang(lignes.length)}
                onClick={() => mode.genre === 'slash' && setFerme(mode.etat.de)}
              />
            </div>
          )}
        </div>
      </PanneauFlottant>
      {sous && (
        <PanneauFlottant cible={() => sous.ligne} hote={hote} cote="droite" alignement="debut" distance={2} fleche={false} className="notak-menu-blocs-panneau notak-menu-blocs-sous" panneau={sousPanneau} onPointerDown={(e) => e.preventDefault()}>
          <div
            className="notak-pop notak-menu-blocs"
            data-genre="sous"
            role="menu"
            onPointerEnter={() => clearTimeout(minuteur.current)}
            onPointerLeave={() => {
              clearTimeout(minuteur.current)
              minuteur.current = window.setTimeout(() => setSous(null), 100)
            }}
          >
            <div className="notak-menu-blocs-liste">
              {(sous.menu === 'transformer' ? listeTransformer('') : listeCouleur('', recentes[0] ?? null)).map((g, k) => (
                <div key={g.cle} role="presentation">
                  {k > 0 && <SeparateurMenu />}
                  <div role="group">
                    {g.titre && <TitreMenu>{g.titre}</TitreMenu>}
                    {g.lignes.map((e) => rendreLigne(e, sous.clavier && lignesSous[sous.rang]?.id === e.id, () => setSous({ ...sous, rang: lignesSous.findIndex((x) => x.id === e.id) }), g))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PanneauFlottant>
      )}
      <ApercuMenus editeur={editeur} />
    </>
  )
}
