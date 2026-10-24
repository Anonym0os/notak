import { Plugin, PluginKey } from '@tiptap/pm/state'
import { type Editor, Extension } from '@tiptap/react'
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PanneauFlottant } from '../PanneauFlottant'
import { t } from '../langue'
import type { Transaction } from '@tiptap/pm/state'
import { ACTIONS_BLOC, CATALOGUE, type Couleur, ENTREES_COULEURS, type Entree, TRANSFORMATIONS, chercher, couleurEnAttribut, declencheurSlash, tropLoin } from './catalogue'
import { colorerBlocs, dupliquer, racines, supprimer } from './gestes'
import { blocsChoisis } from './selection'
import { blocDuCurseur, blocVide, colorer, dupliquerBloc, inserer, insererDessous, supprimerBloc, transformer, versActuel } from './transformer'

/**
 * Le menu des blocs (docs/NOTION.md § 3) : ouvert par `/` dans le texte (la requête est ce qu'on tape derrière), ou
 * par « Transformer en » (⌘/, la bulle, la poignée), qui a son propre champ de recherche.
 */

/** Ce que le plugin dit au menu : où est le `/`, ce qu'on a tapé derrière, et où poser le menu. */
export interface EtatSlash {
  requete: string
  de: number
  a: number
  ou(): { left: number; top: number; right: number; bottom: number } | null
}

export interface PontMenu {
  slash(etat: EtatSlash | null): void
  /** Rend vrai si la touche a servi au menu. */
  touche(cle: string): boolean
}

const CLE = new PluginKey('menuSlash')

/** Lit, à chaque changement, le texte devant le curseur : `/` en tête de bloc ou après une espace ouvre le menu. */
export const extensionSlash = (pont: RefObject<PontMenu | null>) =>
  Extension.create({
    name: 'menuSlash',
    priority: 1200,
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: CLE,
          view: () => ({
            update(vue) {
              const { selection } = vue.state
              const { $from } = selection
              if (!selection.empty || !vue.hasFocus() || !$from.parent.isTextblock || $from.parent.type.spec.code) return pont.current?.slash(null)
              const avant = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
              const d = declencheurSlash(avant)
              if (!d) return pont.current?.slash(null)
              const ou = () => {
                try {
                  return vue.coordsAtPos(selection.from)
                } catch {
                  return null
                }
              }
              pont.current?.slash({ requete: d.requete, de: selection.from - d.longueur, a: selection.from, ou })
            },
            destroy: () => pont.current?.slash(null),
          }),
          props: {
            handleKeyDown: (_vue, e) => ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key) && !!pont.current?.touche(e.key),
          },
        }),
      ]
    },
  })

interface Props {
  editeur: Editor
  pont: RefObject<PontMenu | null>
  /**
   * Un menu demandé hors du `/` : « Transformer en » (⌘/, la bulle), le menu de la poignée, ses couleurs. `n` change à
   * chaque demande.
   */
  demande: Demande | null
  /** Copie l'adresse du bloc (le menu de la poignée). */
  copierLien?: (id: string) => void
  /** Commente le texte du bloc (le menu de la poignée). */
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

type Mode = { genre: 'slash'; etat: EtatSlash } | { genre: Demande['mode']; requete: string }

/** Ce que chaque menu propose. */
function catalogueDe(mode: Mode, image: boolean): readonly Entree[] {
  if (mode.genre === 'transformer') return TRANSFORMATIONS
  if (mode.genre === 'bloc') return ACTIONS_BLOC
  if (mode.genre === 'couleur') return ENTREES_COULEURS
  return CATALOGUE.filter((e) => image || e.id !== 'image')
}

export function MenuBlocs({ editeur, pont, demande, choisirImage, surCouleur, copierLien, commenterBloc }: Props) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [rang, setRang] = useState(0)
  // La requête qui trouvait encore quelque chose, et le `/` qu'Échap a fermé.
  const trouvee = useRef(0)
  const [ferme, setFerme] = useState<number | null>(null)
  const liste = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)

  const requete = mode ? (mode.genre === 'slash' ? mode.etat.requete : mode.requete) : ''
  // Les couleurs et les actions se montrent toutes dans leurs propres menus, même sans requête.
  const items = mode ? (mode.genre !== 'slash' && mode.genre !== 'transformer' && !requete.trim() ? [...catalogueDe(mode, !!choisirImage)] : chercher(catalogueDe(mode, !!choisirImage), requete)) : []
  const slashFerme = mode?.genre === 'slash' && (ferme === mode.etat.de || (items.length === 0 && tropLoin(requete, trouvee.current)))
  const visible = !!mode && !slashFerme
  if (items.length > 0) trouvee.current = requete.length

  useEffect(() => {
    if (!demande) return
    setMode({ genre: demande.mode, requete: '' })
    setRang(0)
  }, [demande])

  const ouvrir = (genre: Demande['mode']) => {
    setMode({ genre, requete: '' })
    setRang(0)
  }

  const fermer = () => {
    setMode(null)
    editeur.commands.focus()
  }

  const choisir = (e: Entree) => {
    if (!mode) return
    // Un sous-menu (couleur, transformer) remplace celui-ci : le focus reste dans son champ.
    if (e.effet.genre === 'action' && (e.effet.action === 'couleur' || e.effet.action === 'transformer')) {
      if (mode.genre === 'slash') editeur.chain().deleteRange({ from: mode.etat.de, to: mode.etat.a }).run()
      return ouvrir(e.effet.action)
    }
    // Le `/` et ce qu'on a tapé derrière s'en vont d'abord.
    if (mode.genre === 'slash') editeur.chain().focus().deleteRange({ from: mode.etat.de, to: mode.etat.a }).run()
    else editeur.commands.focus()
    setMode(null)
    // Les blocs choisis (la poignée, Échap) : les gestes valent pour eux tous.
    const choisis = blocsChoisis(editeur.state)
    const effet = e.effet
    const faire = (tr: Transaction | null) => tr && editeur.view.dispatch(tr)
    if (effet.genre === 'vers') {
      if (mode.genre === 'transformer' || blocVide(editeur)) transformer(editeur, effet.vers)
      else insererDessous(editeur, effet.vers)
    } else if (effet.genre === 'inserer') {
      if (effet.quoi === 'image') choisirImage?.()
      else inserer(editeur, effet.quoi)
    } else if (effet.genre === 'couleur') {
      if (choisis.length) faire(colorerBlocs(editeur.state, choisis, couleurEnAttribut(effet.couleur)))
      else colorer(editeur, effet.couleur)
      surCouleur(effet.couleur)
    } else if (effet.action === 'dupliquer') {
      if (choisis.length) faire(dupliquer(editeur.state, choisis))
      else dupliquerBloc(editeur)
    } else if (effet.action === 'supprimer') {
      if (choisis.length) faire(supprimer(editeur.state, choisis))
      else supprimerBloc(editeur)
    } else if (effet.action === 'lien' && choisis[0]) copierLien?.(choisis[0])
    else if (effet.action === 'commenter' && choisis[0]) commenterBloc?.(choisis[0])
  }

  const toucher = (k: string) => {
    if (!visible) return false
    if (items.length === 0) {
      if (k !== 'Escape') return false
      fermer()
      return true
    }
    if (k === 'ArrowDown') setRang((r) => (r + 1) % items.length)
    else if (k === 'ArrowUp') setRang((r) => (r + items.length - 1) % items.length)
    else if (k === 'Escape') {
      if (mode?.genre === 'slash') setFerme(mode.etat.de)
      else fermer()
    } else choisir(items[Math.min(rang, items.length - 1)]!)
    return true
  }

  // Le pont est relu à chaque frappe : il doit toujours voir l'état d'aujourd'hui.
  useEffect(() => {
    pont.current = {
      slash: (etat) => {
        setMode((avant) => {
          if (avant && avant.genre !== 'slash') return avant
          if (!etat) return null
          if (avant?.genre !== 'slash' || avant.etat.de !== etat.de) {
            setRang(0)
            trouvee.current = 0
          } else if (avant.etat.requete !== etat.requete) setRang(0)
          return { genre: 'slash', etat }
        })
      },
      touche: toucher,
    }
  })
  useEffect(() => () => void (pont.current = null), [pont])

  useLayoutEffect(() => {
    liste.current?.querySelector('[data-actif]')?.scrollIntoView?.({ block: 'nearest' })
  }, [rang, requete])

  // Le champ d'un sous-menu prend le focus une fois le panneau placé : caché, il ne le prendrait pas.
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
  }, [genre])

  if (!visible || !mode) return null
  const cible = () => {
    if (mode.genre === 'slash') return mode.etat.ou()
    const choisis = racines(editeur.state.doc, blocsChoisis(editeur.state))
    const dom = editeur.view.nodeDOM(choisis[0]?.pos ?? blocDuCurseur(editeur))
    if (!(dom instanceof HTMLElement)) return null
    // Le bord gauche du bloc seulement : un bloc large toucherait le bord de la fenêtre, et le panneau se cacherait.
    const r = dom.getBoundingClientRect()
    return { left: r.left, right: r.left + 1, top: r.top, bottom: r.bottom }
  }
  const actuel = mode.genre === 'transformer' ? versActuel(editeur) : null
  let categorie = ''
  return (
    <PanneauFlottant cible={cible} cote="bas" alignement="debut" distance={6} fleche={false} className="notak-menu-blocs-panneau" onPointerDown={(e) => mode.genre === 'slash' && e.preventDefault()}>
      <div className="notak-menu-blocs" role="dialog" aria-label={mode.genre === 'slash' ? t('blocs.menu') : t(`blocs.action.${mode.genre === 'bloc' ? 'transformer' : mode.genre}`)}>
        {mode.genre !== 'slash' && (
          <input
            ref={champ}
            className="notak-menu-blocs-filtre"
            value={mode.requete}
            placeholder={t(mode.genre === 'transformer' ? 'blocs.filtrer' : 'blocs.filtrerActions')}
            aria-label={t(mode.genre === 'transformer' ? 'blocs.filtrer' : 'blocs.filtrerActions')}
            onChange={(e) => {
              setMode({ genre: mode.genre, requete: e.target.value })
              setRang(0)
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                e.preventDefault()
                e.stopPropagation()
                toucher(e.key)
              }
            }}
            onBlur={() => setTimeout(() => setMode((m) => (m && m.genre !== 'slash' && !document.activeElement?.closest('.notak-menu-blocs') ? null : m)), 0)}
          />
        )}
        <div className="notak-menu-blocs-liste" ref={liste} role="listbox">
          {items.length === 0 && <div className="notak-menu-blocs-vide">{t('blocs.aucun')}</div>}
          {items.map((e, i) => {
            const titre = e.categorie !== categorie && (mode.genre === 'slash' || mode.genre === 'couleur') ? t(`blocs.categorie.${e.categorie}`) : null
            categorie = e.categorie
            const couleur = e.effet.genre === 'couleur' ? e.effet.couleur : null
            return (
              <div key={e.id} role="presentation">
                {titre && <div className="notak-menu-blocs-categorie">{titre}</div>}
                <div
                  role="option"
                  aria-selected={i === rang}
                  data-actif={i === rang || undefined}
                  className="notak-menu-blocs-entree"
                  onPointerDown={(ev) => ev.preventDefault()}
                  onPointerEnter={() => setRang(i)}
                  onClick={() => choisir(e)}
                >
                  <span className="notak-menu-blocs-signe" {...(couleur ? { 'data-couleur': `${couleur.nom}${couleur.fond ? '-fond' : ''}` } : {})} aria-hidden>
                    {e.signe}
                  </span>
                  <span className="notak-menu-blocs-nom">{e.libelle}</span>
                  {actuel && e.effet.genre === 'vers' && e.effet.vers === actuel && <span className="notak-menu-blocs-coche" aria-hidden>✓</span>}
                  {e.raccourci && <span className="notak-menu-blocs-raccourci">{e.raccourci}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </PanneauFlottant>
  )
}
