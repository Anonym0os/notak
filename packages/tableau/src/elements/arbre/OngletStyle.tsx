import type { Arbre, Id } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'
import { Panneau, type Section } from './Panneau'

/** L'onglet Style du panneau de côté. Provisoire : le panneau du sujet, en attendant l'onglet de Xmind. */
export function OngletStyle({ lecture, choisis, courant, faire, contexte, section }: { arbre: Arbre; lecture: Lecture; choisis: Id[]; courant: Id; faire(g: Geste): void; contexte: ContexteToile; section?: Section | undefined }) {
  const ids = choisis.filter((x) => lecture.sujets.has(x))
  return <Panneau lecture={lecture} ids={ids.length ? ids : [courant]} section={section} faire={faire} contexte={contexte} fermer={() => {}} />
}
