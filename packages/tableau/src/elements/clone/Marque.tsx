import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Element, Id } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { clonesDe, originalAffichable } from './original'
import { definition } from '../registre'
import { t, tn } from '../../langue'
import { Icone } from '../../icones'

/** Le nombre de copies de chaque original, calculé une fois par état du tableau (autant de cartes le lisent). */
const parEtat = new WeakMap<readonly Element[], Map<Id, number>>()
function comptes(elements: readonly Element[]): Map<Id, number> {
  let m = parEtat.get(elements)
  if (!m) {
    m = new Map()
    for (const e of elements) if (e.contenu.type === 'clone' && e.corbeille === undefined) m.set(e.contenu.cible, (m.get(e.contenu.cible) ?? 0) + 1)
    parEtat.set(elements, m)
  }
  return m
}

/** Les copies d'un élément (clones non jetés), suivies à chaque changement du tableau. */
export function useNombreDeClones(cible: Id, contexte: ContexteToile): number {
  return useSyncExternalStore(contexte.magasin.ecouter, () => comptes(contexte.magasin.lire().elements).get(cible) ?? 0)
}

/** Ce que dit la bulle : combien d'éléments forment le groupe (l'original, s'il est là, et ses clones). */
export function texteDuGroupe(copies: number): string {
  return copies <= 1 ? t('clone.plusDeCopie') : tn('clone.copies', copies)
}

/** Les exemplaires d'un groupe de copies, l'original d'abord : leur nom et ce qu'ils disent. */
function lister(contexte: ContexteToile, cible: Id): { id: Id; nom: string; texte: string }[] {
  const elements = contexte.magasin.lire().elements
  const original = originalAffichable(elements, cible)
  const texteDe = (e: Element) => definition(e.contenu.type)?.resume?.(e.contenu as never, contexte) ?? ''
  return [
    ...(original ? [{ id: original.id, nom: t('clone.original'), texte: texteDe(original) }] : []),
    ...clonesDe(elements, cible).map((c, i) => ({ id: c.id, nom: `${t('clone.copie')} ${i + 1}`, texte: texteDe(original ?? c) })),
  ]
}

/**
 * Le repère « cet élément existe en plusieurs exemplaires » : une petite icône en bas à gauche de la carte, à 30 %,
 * toujours là. Un clic ouvre la bulle qui compte les copies. Sur l'original, il n'y est que s'il a des clones.
 */
export function MarqueClone({ cible, contexte, toujours }: { cible: Id; contexte: ContexteToile; toujours?: boolean }) {
  const clones = useNombreDeClones(cible, contexte)
  const [ouverte, setOuverte] = useState(false)
  useEffect(() => {
    if (!ouverte) return
    const fermer = () => setOuverte(false)
    window.addEventListener('pointerdown', fermer)
    return () => window.removeEventListener('pointerdown', fermer)
  }, [ouverte])
  if (clones === 0 && !toujours) return null
  const copies = clones + (originalAffichable(contexte.magasin.lire().elements, cible) ? 1 : 0)
  // Chaque exemplaire, l'original en tête : un clic le montre.
  const lignes = ouverte ? lister(contexte, cible) : []
  return (
    <>
      <button
        type="button"
        className="notak-clone-marque"
        title={t('clone.marque')}
        aria-label={t('clone.marque')}
        aria-expanded={ouverte}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOuverte((o) => !o)
        }}
      >
        <Icone nom="copie" taille={12} />
      </button>
      {ouverte && (
        <div className="notak-clone-bulle" role="status" onPointerDown={(e) => e.stopPropagation()}>
          <p className="notak-clone-bulle-texte">{texteDuGroupe(copies)}</p>
          {copies > 1 && (
            <ul className="notak-clone-liste">
              {lignes.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="notak-clone-rangee"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOuverte(false)
                      contexte.montrer(l.id)
                    }}
                  >
                    <span className="notak-clone-rangee-nom">{l.nom}</span>
                    <span className="notak-clone-rangee-texte">{l.texte}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

