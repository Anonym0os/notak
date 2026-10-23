import { Icone } from '../../icones'
import type { Pastille } from './icones'

/** Le signe d'une icône de tableau, qu'elle vienne de la petite bibliothèque ou du catalogue. */
export function Glyphe({ pastille, taille = 35, trait = 1.5 }: { pastille: Extract<Pastille, { genre: 'icone' | 'catalogue' }>; taille?: number; trait?: number }) {
  if (pastille.genre === 'icone') return <Icone nom={pastille.icone} taille={taille} trait={trait} />
  const Dessin = pastille.dessin
  return <Dessin size={taille} stroke={trait} color="currentColor" className="notak-ico" aria-hidden="true" />
}
