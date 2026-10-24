import type { Arbre } from '../../coeur/tableau'
import { Barre } from './Barre'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'

/** L'onglet Carte du panneau de côté. Provisoire : les réglages de l'ancienne barre. */
export function OngletCarte({ arbre, lecture, faire }: { arbre: Arbre; lecture: Lecture; faire(g: Geste): void }) {
  return <Barre arbre={arbre} lecture={lecture} choisis={[]} faire={faire} relier={() => {}} panneau={() => {}} relation={null} />
}
