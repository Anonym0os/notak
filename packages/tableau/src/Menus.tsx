import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Element } from './coeur/tableau'
import { definition } from './elements/registre'
import type { ContexteToile } from './elements/types'

/** Une entrée du menu ; `null` trace un séparateur. */
export type Entree = { libelle: string; raccourci?: string; coche?: boolean; faire(): void } | null

/**
 * Le menu du clic droit, posé au point cliqué et ramené dans la toile s'il déborde. Un clic dehors, Échap
 * ou une entrée choisie le ferment.
 */
export function MenuContextuel({ x, y, entrees, fermer }: { x: number; y: number; entrees: Entree[]; fermer(): void }) {
  const boite = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ x, y })
  useLayoutEffect(() => {
    const n = boite.current
    const toile = n?.parentElement
    if (!n || !toile) return
    setPlace({
      x: Math.max(4, Math.min(x, toile.clientWidth - n.offsetWidth - 4)),
      y: Math.max(4, Math.min(y, toile.clientHeight - n.offsetHeight - 4)),
    })
  }, [x, y])
  useEffect(() => {
    const dehors = (e: PointerEvent) => !boite.current?.contains(e.target as Node) && fermer()
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [fermer])
  // Pas deux séparateurs de suite, ni au bord.
  const propres = entrees.filter((e, i, t) => e !== null || (i > 0 && i < t.length - 1 && t[i - 1] !== null))
  return (
    <div
      ref={boite}
      className="notak-menu"
      role="menu"
      style={{ left: place.x, top: place.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {propres.map((e, i) =>
        e === null ? (
          <div key={`s${i}`} className="notak-menu-sep" role="separator" />
        ) : (
          <button
            key={e.libelle}
            type="button"
            role={e.coche === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={e.coche}
            onClick={() => {
              fermer()
              e.faire()
            }}
          >
            <span className="notak-menu-coche">{e.coche ? '✓' : ''}</span>
            <span className="notak-menu-libelle">{e.libelle}</span>
            {e.raccourci && <kbd>{e.raccourci}</kbd>}
          </button>
        ),
      )}
    </div>
  )
}

const resume = (e: Element, contexte: ContexteToile) => {
  const def = definition(e.contenu.type)
  return def?.resume?.(e.contenu as never, contexte).trim() || def?.nom || 'Élément'
}

/**
 * La corbeille du tableau : ce qu'on y a mis, du plus récent au plus ancien. On remet un élément où il était ;
 * vider la corbeille demande confirmation, et c'est le seul geste qui efface vraiment.
 */
export function PanneauCorbeille({
  elements,
  contexte,
  restaurer,
  vider,
  fermer,
}: {
  elements: Element[]
  contexte: ContexteToile
  restaurer(e: Element): void
  vider(): void
  fermer(): void
}) {
  const [confirmer, setConfirmer] = useState(false)
  return (
    <div className="notak-corbeille" role="dialog" aria-label="Corbeille" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="notak-corbeille-tete">
        <strong>Corbeille</strong>
        <button type="button" aria-label="Fermer" onClick={fermer}>
          ×
        </button>
      </div>
      {elements.length === 0 ? (
        <p className="notak-corbeille-vide">Rien à la corbeille.</p>
      ) : (
        <ul>
          {elements.map((e) => (
            <li key={e.id}>
              <span className="notak-corbeille-nom">{resume(e, contexte)}</span>
              <button type="button" onClick={() => restaurer(e)}>
                Remettre
              </button>
            </li>
          ))}
        </ul>
      )}
      {elements.length > 0 &&
        (confirmer ? (
          <div className="notak-corbeille-pied">
            <span>Effacer pour de bon ?</span>
            <button type="button" className="notak-danger" onClick={vider}>
              Effacer
            </button>
            <button type="button" onClick={() => setConfirmer(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <div className="notak-corbeille-pied">
            <button type="button" onClick={() => setConfirmer(true)}>
              Vider la corbeille
            </button>
          </div>
        ))}
    </div>
  )
}

/**
 * La recherche dans le tableau ouvert : ce qui ne correspond pas s'efface sur la toile, Entrée montre le résultat
 * suivant (Maj+Entrée le précédent), Échap ferme.
 */
export function Recherche(props: {
  requete: string
  appel: number
  nombre: number
  rang: number
  changer(r: string): void
  aller(sens: 1 | -1): void
  fermer(): void
}) {
  const { requete, appel, nombre, rang, changer, aller, fermer } = props
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    champ.current?.focus()
    champ.current?.select()
  }, [appel])
  const compte = !requete.trim() ? '' : nombre === 0 ? 'Aucun résultat' : rang < 0 ? `${nombre} résultat${nombre > 1 ? 's' : ''}` : `${rang + 1} sur ${nombre}`
  return (
    <div className="notak-recherche" role="search" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <input
        ref={champ}
        type="search"
        placeholder="Chercher dans ce tableau"
        aria-label="Chercher dans ce tableau"
        value={requete}
        spellCheck={false}
        onChange={(e) => changer(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            aller(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            fermer()
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault()
            champ.current?.select()
          }
        }}
      />
      <span className="notak-recherche-compte" aria-live="polite">
        {compte}
      </span>
      <button type="button" title="Résultat précédent (Maj+Entrée)" disabled={nombre === 0} onClick={() => aller(-1)}>
        ↑
      </button>
      <button type="button" title="Résultat suivant (Entrée)" disabled={nombre === 0} onClick={() => aller(1)}>
        ↓
      </button>
      <button type="button" title="Fermer (Échap)" onClick={fermer}>
        ×
      </button>
    </div>
  )
}
