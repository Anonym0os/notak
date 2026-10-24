import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Entree } from './Fenetre'
import { ECART_ANCRE, RETRAIT_MENU, poserMenu, poserSousMenu } from './geometrieMenus'
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

/** Le point où le menu voudrait s'ouvrir : le bord gauche et le bas de son bouton, ou le point cliqué. */
function voulu(ancre: HTMLElement | null | undefined, x: number, y: number) {
  const r = ancre?.getBoundingClientRect()
  return r ? { point: { x: r.left, y: r.bottom + ECART_ANCRE }, ancre: { haut: r.top, bas: r.bottom } } : { point: { x, y }, ancre: undefined }
}

/**
 * Un menu contextuel : posé au point cliqué (ou sous son bouton), il garde la fenêtre (il glisse, ou se retourne, s'il
 * déborde), s'ouvre en sous-menus, se parcourt aux flèches et se ferme à Échap, au clic dehors ou quand la fenêtre change
 * de taille. Les entrées grisées restent visibles, comme chez Xmind.
 */
export function MenuContextuel({ x = 0, y = 0, ancre, items, choisir, fermer, etiquette }: Props) {
  const racine = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(() => voulu(ancre, x, y).point)
  useLayoutEffect(() => {
    const r = racine.current?.getBoundingClientRect()
    if (!r) return
    const v = voulu(ancre, x, y)
    setPos(poserMenu(v.point, { l: r.width, h: r.height }, { l: window.innerWidth, h: window.innerHeight }, v.ancre))
  }, [x, y, ancre, items])
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
      const boutons = [...(racine.current?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled), :scope > .notak-arbre-menu-hote > button:not(:disabled)') ?? [])]
      if (boutons.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      const i = boutons.indexOf(document.activeElement as HTMLButtonElement)
      boutons[(i + (e.key === 'ArrowDown' ? 1 : -1) + boutons.length) % boutons.length]!.focus()
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
  const menu = (
    <div ref={racine} className="notak-arbre-deroulant notak-arbre-ctx" role="menu" aria-label={etiquette} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <Liste items={items} choisir={choisir} />
    </div>
  )
  const fenetre = ancre?.closest('.notak-arbre-fenetre')
  return ancre ? createPortal(menu, fenetre ?? document.body) : menu
}

function Liste({ items, choisir }: { items: Item[]; choisir(action: string): void }) {
  const [ouvert, setOuvert] = useState<string | null>(null)
  return (
    <>
      {items.map((it, i) =>
        it === 'sep' ? (
          <hr key={`s${i}`} />
        ) : it.sous ? (
          <div key={it.id} className="notak-arbre-menu-hote" data-ouvert={ouvert === it.id ? '' : undefined} onPointerEnter={() => setOuvert(it.id)}>
            <Entree icone={it.icone} libelle={it.libelle} sous inactif={it.inactif} onClick={() => setOuvert(ouvert === it.id ? null : it.id)} />
            {ouvert === it.id && <SousMenu items={it.sous} choisir={choisir} />}
          </div>
        ) : (
          <Entree key={it.id} icone={it.icone} libelle={it.libelle} touche={it.touche} inactif={it.inactif} onClick={() => choisir(it.id)} onSurvol={() => setOuvert(null)} />
        ),
      )}
    </>
  )
}

/** Un sous-menu, à droite de son entrée ; il passe à gauche s'il sortirait de la fenêtre, et remonte s'il en sortirait par le bas. */
function SousMenu({ items, choisir }: { items: Item[]; choisir(action: string): void }) {
  const racine = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ cote: 'droite' | 'gauche'; decalage: number }>({ cote: 'droite', decalage: 0 })
  useLayoutEffect(() => {
    const sous = racine.current?.getBoundingClientRect()
    const entree = racine.current?.parentElement?.getBoundingClientRect()
    const parent = racine.current?.parentElement?.closest('.notak-arbre-deroulant')?.getBoundingClientRect()
    if (!sous || !entree || !parent) return
    const boite = (r: DOMRect) => ({ x: r.left, y: r.top, l: r.width, h: r.height })
    setPlace(poserSousMenu(boite(parent), boite(entree), { l: sous.width, h: sous.height }, { l: window.innerWidth, h: window.innerHeight }))
  }, [])
  return (
    <div ref={racine} className="notak-arbre-deroulant notak-arbre-sous-menu" role="menu" data-cote={place.cote} style={place.decalage ? { top: place.decalage - RETRAIT_MENU } : undefined}>
      <Liste items={items} choisir={choisir} />
    </div>
  )
}
