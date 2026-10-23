import { useSyncExternalStore } from 'react'
import type { Clone, Element } from '../../coeur/tableau'
import { definition } from '../registre'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { originalAffichable, originalDe } from './original'
import { t } from '../../langue'

const rien = () => {}

/** L'original d'un clone, suivi à chaque changement du tableau, même s'il est à la corbeille. */
function useOriginal(cible: string, contexte: ContexteToile): Element | undefined {
  return useSyncExternalStore(contexte.magasin.ecouter, () => originalAffichable(contexte.magasin.lire().elements, cible))
}

/**
 * Le clone dessine son original, sans cadre de plus : le rendu du type est celui de l'original, et ce qu'on y
 * change (cocher une case, résoudre) change l'original. Seuls la place et la largeur sont ceux du clone.
 */
export function RenduClone({ element, choisie, contexte }: PropsRendu<Clone>) {
  const original = useOriginal(element.contenu.cible, contexte)
  const def = original && definition(original.contenu.type)
  if (!original || !def) {
    return (
      <p className="notak-clone-absent" data-vide={element.contenu.cible ? undefined : ''}>
        {element.contenu.cible ? 'L’original de ce clone n’existe plus' : 'Clone'}
      </p>
    )
  }
  const Original = def.Rendu
  const sansFond = typeof def.sansFond === 'function' ? def.sansFond(original.contenu) : def.sansFond
  return (
    <>
      <Original
        element={original}
        choisie={choisie}
        enEdition={false}
        contexte={contexte}
        brouillon={rien}
        changer={(apres) => {
          const actuel = contexte.magasin.lire().elements.find((e) => e.id === original.id)
          if (actuel) contexte.magasin.faire([{ type: 'contenu', id: original.id, avant: actuel.contenu, apres }])
        }}
      />
      {sansFond && <span className="notak-clone-nu" hidden />}
      <span className="notak-clone-marque" title="Clone : le même élément à plusieurs endroits" aria-label="Clone">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
          <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" />
        </svg>
      </span>
    </>
  )
}

export function OutilsClone({ elements, contexte }: PropsOutils<Clone>) {
  if (elements.length !== 1) return null
  const clone = elements[0]!
  const original = originalDe(contexte.magasin.lire().elements, clone.contenu.cible)
  // Détacher se contente d'un original à la corbeille : c'est le moyen de garder un clone rapporté seul.
  const aDetacher = originalAffichable(contexte.magasin.lire().elements, clone.contenu.cible)
  const detacher = () => {
    if (!aDetacher) return
    // Une copie indépendante : le clone prend le contenu de l'original, et ne le suit plus.
    contexte.magasin.faire([{ type: 'contenu', id: clone.id, avant: clone.contenu, apres: aDetacher.contenu }])
  }
  return (
    <>
      <button type="button" title={t('clone.choisirOriginal')} disabled={!original} onClick={() => original && contexte.choisir([original.id])}>
        {t('clone.original')}
      </button>
      {!contexte.services.lectureSeule && (
        <button type="button" title={t('clone.detacher.titre')} disabled={!aDetacher} onClick={detacher}>
          {t('clone.detacher')}
        </button>
      )}
    </>
  )
}
