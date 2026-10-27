import { useEffect, useMemo, useRef } from 'react'
import { type Entree, FeuilleMenu, ListeMenu, classeMenu, enFeuille, ligneVisee, naviguer } from '../../communs'
import { Flottant } from './Flottant'
import { ECART_ANCRE } from './geometrieMenus'
import type { Item } from './menus'

interface Props {
  /** Où le menu s'ouvre : le point cliqué, en px de la fenêtre. Ignoré si `ancre` est donnée. */
  x?: number
  y?: number
  /**
   * Le bouton qui ouvre le menu (le « + » de la barre) : le menu s'ouvre à son bord gauche, 6 px sous lui (au-dessus s'il
   * n'a pas la place dessous), sans jamais le recouvrir ; un clic sur ce bouton ne le ferme pas (le bouton s'en charge).
   * Le menu se pose alors dans la fenêtre de la carte, hors de la pilule : son flou voit la carte, pas la pilule.
   */
  ancre?: HTMLElement | null
  items: Item[]
  /** L'identifiant de l'entrée choisie. */
  choisir(action: string): void
  fermer(): void
  etiquette?: string
}

/** Les entrées de la carte (identifiant, sous-menus) en entrées du menu commun. */
const entreesDe = (items: Item[], choisir: (action: string) => void): Entree[] =>
  items.map((it): Entree =>
    it === 'sep'
      ? null
      : {
          libelle: it.libelle,
          icone: it.icone,
          ...(it.touche ? { raccourci: it.touche } : {}),
          ...(it.inactif ? { desactive: true } : {}),
          ...(it.danger ? { danger: true } : {}),
          ...(it.sous ? { sous: entreesDe(it.sous, choisir) } : {}),
          faire: () => choisir(it.id),
        },
  )

/**
 * Un menu contextuel de la carte : le menu commun (`communs/Menu.tsx`), posé au point cliqué (ou sous son bouton), par
 * `Flottant` qui lui garde la fenêtre (il glisse, ou se retourne, s'il déborde ; plus haut qu'elle, il défile). Il se
 * ferme à Échap, au clic dehors et quand la fenêtre change de taille. Les entrées grisées restent visibles, comme chez
 * Xmind. Il ne prend pas le focus à l'ouverture : la première flèche bas le prend, et la carte le retrouve à la fermeture
 * (`Flottant`), sans quoi ses touches meurent.
 */
export function MenuContextuel(props: Props) {
  // Au doigt sur un téléphone : la feuille qui monte du bas, comme le menu de la toile.
  if (enFeuille()) return <FeuilleMenu entrees={entreesDe(props.items, props.choisir)} fermer={props.fermer} />
  return <MenuAuPoint {...props} />
}

function MenuAuPoint({ x = 0, y = 0, ancre, items, choisir, fermer, etiquette }: Props) {
  const racine = useRef<HTMLDivElement>(null)
  const point = useMemo(() => ({ x, y, l: 0, h: 0 }), [x, y])
  const entrees = entreesDe(items, choisir)
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node
      if (!racine.current?.contains(cible) && !ancre?.contains(cible)) fermer()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        return fermer()
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const cible = racine.current && ligneVisee(racine.current, e)
      if (!cible) return
      e.preventDefault()
      e.stopPropagation()
      cible.focus()
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', touche, true)
    window.addEventListener('resize', fermer)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', touche, true)
      window.removeEventListener('resize', fermer)
    }
  }, [fermer, ancre])
  return (
    <Flottant
      racine={racine}
      ancre={ancre ?? point}
      cote={ancre ? 'bas' : 'libre'}
      ecart={ECART_ANCRE}
      className={classeMenu('notak-arbre-ctx')}
      role="menu"
      aria-label={etiquette}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(ev) => {
        // Une touche tapée dans le menu y reste : la carte ne l'entend pas (Entrée n'ajoute pas un sujet).
        ev.stopPropagation()
        naviguer(ev)
      }}
    >
      <ListeMenu entrees={entrees} fermer={fermer} />
    </Flottant>
  )
}
