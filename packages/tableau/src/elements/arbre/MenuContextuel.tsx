import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Entree } from './Fenetre'
import type { Item } from './menus'

interface Props {
  /** Où le menu s'ouvre : le point cliqué, en px de la fenêtre. */
  x: number
  y: number
  items: Item[]
  /** L'identifiant de l'entrée choisie. */
  choisir(action: string): void
  fermer(): void
  etiquette?: string
}

/**
 * Un menu contextuel : posé au point cliqué, il garde la fenêtre (il se retourne s'il déborde), s'ouvre en sous-menus,
 * se parcourt aux flèches et se ferme à Échap ou au clic dehors. Les entrées grisées restent visibles, comme chez Xmind.
 */
export function MenuContextuel({ x, y, items, choisir, fermer, etiquette }: Props) {
  const racine = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useLayoutEffect(() => {
    const r = racine.current?.getBoundingClientRect()
    if (!r) return
    setPos({ x: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) })
  }, [x, y, items])
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) fermer()
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
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [fermer])
  return (
    <div ref={racine} className="notak-arbre-deroulant notak-arbre-menu notak-arbre-ctx" role="menu" aria-label={etiquette} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <Liste items={items} choisir={choisir} />
    </div>
  )
}

function Liste({ items, choisir }: { items: Item[]; choisir(action: string): void }) {
  const [ouvert, setOuvert] = useState<string | null>(null)
  return (
    <>
      {items.map((it, i) =>
        it === 'sep' ? (
          <hr key={`s${i}`} />
        ) : it.sous ? (
          <div key={it.id} className="notak-arbre-menu-hote" onPointerEnter={() => setOuvert(it.id)}>
            <Entree libelle={it.libelle} touche="›" inactif={it.inactif} onClick={() => setOuvert(ouvert === it.id ? null : it.id)} />
            {ouvert === it.id && <SousMenu items={it.sous} choisir={choisir} />}
          </div>
        ) : (
          <Entree key={it.id} libelle={it.libelle} touche={it.touche} inactif={it.inactif} onClick={() => choisir(it.id)} />
        ),
      )}
    </>
  )
}

/** Un sous-menu, à droite de son entrée ; il passe à gauche s'il sortirait de la fenêtre. */
function SousMenu({ items, choisir }: { items: Item[]; choisir(action: string): void }) {
  const racine = useRef<HTMLDivElement>(null)
  const [gauche, setGauche] = useState(false)
  useLayoutEffect(() => {
    const r = racine.current?.getBoundingClientRect()
    if (r && r.right > window.innerWidth - 8) setGauche(true)
  }, [])
  return (
    <div ref={racine} className="notak-arbre-deroulant notak-arbre-sous-menu" role="menu" style={gauche ? { left: 'auto', right: 'calc(100% + 6px)' } : undefined}>
      <Liste items={items} choisir={choisir} />
    </div>
  )
}
