import { Plugin, PluginKey } from '@tiptap/pm/state'
import { type Editor, Extension } from '@tiptap/react'
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PanneauFlottant } from '../PanneauFlottant'
import { t } from '../langue'
import { CATALOGUE, type Couleur, type Entree, TRANSFORMATIONS, chercher, declencheurSlash, tropLoin } from './catalogue'
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
  /** « Transformer en » est demandé (⌘/, la bulle) : le compteur change à chaque demande. */
  transformerEn: number
  /** Choisir une image dans les fichiers ; absent, l'entrée Image n'est pas proposée. */
  choisirImage?: () => void
  /** La couleur choisie, pour ⌘⇧H et la bulle. */
  surCouleur(c: Couleur): void
}

type Mode = { genre: 'slash'; etat: EtatSlash } | { genre: 'transformer'; requete: string }

export function MenuBlocs({ editeur, pont, transformerEn, choisirImage, surCouleur }: Props) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [rang, setRang] = useState(0)
  // La requête qui trouvait encore quelque chose, et le `/` qu'Échap a fermé.
  const trouvee = useRef(0)
  const [ferme, setFerme] = useState<number | null>(null)
  const liste = useRef<HTMLDivElement>(null)

  const catalogue = mode?.genre === 'transformer' ? TRANSFORMATIONS : CATALOGUE.filter((e) => choisirImage || e.id !== 'image')
  const requete = mode ? (mode.genre === 'slash' ? mode.etat.requete : mode.requete) : ''
  const items = mode ? chercher(catalogue, requete) : []
  const slashFerme = mode?.genre === 'slash' && (ferme === mode.etat.de || (items.length === 0 && tropLoin(requete, trouvee.current)))
  const visible = !!mode && !slashFerme
  if (items.length > 0) trouvee.current = requete.length

  useEffect(() => {
    if (transformerEn > 0) {
      setMode({ genre: 'transformer', requete: '' })
      setRang(0)
    }
  }, [transformerEn])

  const fermer = () => {
    setMode(null)
    editeur.commands.focus()
  }

  const choisir = (e: Entree) => {
    if (!mode) return
    // Le `/` et ce qu'on a tapé derrière s'en vont d'abord.
    if (mode.genre === 'slash') editeur.chain().focus().deleteRange({ from: mode.etat.de, to: mode.etat.a }).run()
    else editeur.commands.focus()
    setMode(null)
    const effet = e.effet
    if (effet.genre === 'vers') {
      if (mode.genre === 'transformer' || blocVide(editeur)) transformer(editeur, effet.vers)
      else insererDessous(editeur, effet.vers)
    } else if (effet.genre === 'inserer') {
      if (effet.quoi === 'image') choisirImage?.()
      else inserer(editeur, effet.quoi)
    } else if (effet.genre === 'couleur') {
      colorer(editeur, effet.couleur)
      surCouleur(effet.couleur)
    } else if (effet.action === 'dupliquer') dupliquerBloc(editeur)
    else if (effet.action === 'supprimer') supprimerBloc(editeur)
    else {
      setMode({ genre: 'transformer', requete: '' })
      setRang(0)
    }
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
          if (avant?.genre === 'transformer') return avant
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

  if (!visible || !mode) return null
  const cible = () => {
    if (mode.genre === 'slash') return mode.etat.ou()
    const dom = editeur.view.nodeDOM(blocDuCurseur(editeur))
    return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
  }
  const actuel = mode.genre === 'transformer' ? versActuel(editeur) : null
  let categorie = ''
  return (
    <PanneauFlottant cible={cible} cote="bas" alignement="debut" distance={6} fleche={false} className="notak-menu-blocs-panneau" onPointerDown={(e) => mode.genre === 'slash' && e.preventDefault()}>
      <div className="notak-menu-blocs" role="dialog" aria-label={mode.genre === 'transformer' ? t('blocs.action.transformer') : t('blocs.menu')}>
        {mode.genre === 'transformer' && (
          <input
            className="notak-menu-blocs-filtre"
            autoFocus
            value={mode.requete}
            placeholder={t('blocs.filtrer')}
            aria-label={t('blocs.filtrer')}
            onChange={(e) => {
              setMode({ genre: 'transformer', requete: e.target.value })
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
            onBlur={() => setTimeout(() => setMode((m) => (m?.genre === 'transformer' && !document.activeElement?.closest('.notak-menu-blocs') ? null : m)), 0)}
          />
        )}
        <div className="notak-menu-blocs-liste" ref={liste} role="listbox">
          {items.length === 0 && <div className="notak-menu-blocs-vide">{t('blocs.aucun')}</div>}
          {items.map((e, i) => {
            const titre = e.categorie !== categorie && mode.genre === 'slash' ? t(`blocs.categorie.${e.categorie}`) : null
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
