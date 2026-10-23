import { useMemo } from 'react'
import { t } from '../../langue'
import { type ModeleTableau } from '../../modeles/construire'
import { formesApercu } from '../../modeles/apercu'
import { FOND_NOTE } from '../note/couleurs'

/** Un modèle en petit : un rectangle par élément, de la couleur de la note, les colonnes en creux avec leur contenu. */
export function ApercuModele({ modele }: { modele: ModeleTableau }) {
  const { formes, largeur, hauteur } = useMemo(() => formesApercu(modele), [modele])
  const marge = 2
  return (
    <svg
      className="notak-modeles-apercu"
      viewBox={`${-marge} ${-marge} ${largeur + 2 * marge} ${hauteur + 2 * marge}`}
      role="img"
      aria-label={t('modele.apercu', { titre: modele.titre })}
    >
      {formes.map((f, i) => {
        const fond = f.couleur && f.couleur !== 'transparent' ? FOND_NOTE[f.couleur] : undefined
        if (f.genre === 'titre')
          return <rect key={i} x={f.x + f.largeur * 0.2} y={f.y + f.hauteur * 0.3} width={f.largeur * 0.6} height={f.hauteur * 0.4} rx={0.8} fill="currentColor" opacity={0.55} />
        if (f.genre === 'colonne')
          return <rect key={i} x={f.x} y={f.y} width={f.largeur} height={f.hauteur} rx={1.5} fill={fond ?? 'currentColor'} fillOpacity={0.14} stroke={fond ?? 'currentColor'} strokeOpacity={0.5} strokeWidth={0.5} />
        return (
          <rect
            key={i}
            x={f.x}
            y={f.y}
            width={f.largeur}
            height={f.hauteur}
            rx={1}
            fill={fond ?? 'var(--notak-carte)'}
            stroke="currentColor"
            strokeOpacity={fond ? 0 : 0.35}
            strokeWidth={0.4}
          />
        )
      })}
    </svg>
  )
}
