import type { ReactNode } from 'react'
import type { PassageCellule } from '../../coeur/tableau'
import { type Morceau, morceaux } from './riche'
import { styleDePassage } from './richeDom'

/** Un morceau de texte dans les balises de ses marques, comme l'éditeur le montre. */
function MorceauRendu({ m }: { m: Morceau }) {
  let n: ReactNode = m.texte
  if (m.couleur || m.surligne) n = <span style={styleDePassage(m)}>{n}</span>
  if (m.barre) n = <s>{n}</s>
  if (m.italique) n = <i>{n}</i>
  if (m.gras) n = <b>{n}</b>
  if (m.lien) {
    n = (
      <a
        href={m.lien}
        target="_blank"
        rel="noopener noreferrer"
        // Un lien s'ouvre d'un clic, table choisie ou non.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {n}
      </a>
    )
  }
  return <>{n}</>
}

/** Le texte d'une cellule avec ses passages (gras d'un mot, lien, couleur…). */
export function PassagesRendus({ texte, passages }: { texte: string; passages: readonly PassageCellule[] }) {
  return (
    <>
      {morceaux(texte, passages).map((m, i) => (
        <MorceauRendu key={i} m={m} />
      ))}
    </>
  )
}
