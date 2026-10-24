import { t } from '../../../langue'
import { enfantsDe } from './sujets'
import type { Titreur } from './gestes'

/** Comme Xmind : « Sujet principal 3 » sous le central, « Sous-sujet 2 » ailleurs, « Sujet flottant ». */
export const titreNeuf: Titreur = (l, parent, genre) => {
  if (genre === 'flottant') return t('arbre.flottant')
  if (genre === 'parent' || parent === null) return t('arbre.parent')
  const n = enfantsDe(l, parent).length + 1
  return parent === l.central ? t('arbre.principal', { n }) : t('arbre.sous', { n })
}
