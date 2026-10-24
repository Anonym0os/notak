import type { Id } from '../../../coeur/tableau'
import { type Boite, type Cote, type Disposition, type Lien, ECARTS } from '../disposition'
import { ECART_CENTRAL } from '../disposition/commun'
import type { Lacher } from './lacher'
import type { Lecture } from './sujets'

/**
 * Le repère de dépôt d'un sujet qu'on glisse (docs/XMIND.md § 4 bis) : un faux nœud plein, de 50 × 18 px, posé là où le
 * sujet s'insérera, et relié à son futur parent par une branche de la même forme que les autres. Aucun cadre autour
 * du parent : seul ce repère se montre.
 */
export const REPERE = { l: 50, h: 18, rayon: 4 } as const

/** L'espace entre le repère et le frère dont il se détache (ou le dernier frère). */
const ECART_FRERE = 6

export interface Repere {
  parent: Id
  /** Le faux nœud. */
  boite: Boite
  /** Du côté du parent d'où partent ses branches, et la forme que ses liens prennent. */
  cote: Cote
  forme: Lien['forme']
}

/**
 * Où dessiner le repère pour ce lâcher. `deplaces` : les sujets qu'on glisse, qui ne comptent pas parmi les frères
 * (leur place sera libre). `null` quand le sujet ne se rattache à rien (il flotte : aucun repère).
 */
export function repereDeDepot(l: Lecture, d: Disposition, cible: Lacher, deplaces: ReadonlySet<Id>): Repere | null {
  if (cible.type === 'libre') return null
  const parent = d.boites.get(cible.parent)
  if (!parent) return null
  const tous = d.liens.filter((x) => x.de === cible.parent && !deplaces.has(x.vers))
  const rang = cible.type === 'enfant' ? tous.length : Math.max(0, Math.min(cible.index, tous.length))
  // Le central range ses enfants des deux côtés : le repère se met du côté de celui devant lequel il s'insère.
  const modele = tous[rang] ?? tous[rang - 1] ?? d.liens.find((x) => x.vers === cible.parent)
  const cote: Cote = modele?.cote ?? 'droite'
  const liens = tous.filter((x) => x.cote === cote)
  const freres = liens.flatMap((x) => d.boites.get(x.vers) ?? [])
  const forme: Lien['forme'] = modele?.forme ?? 'courbe'
  const index = tous.slice(0, rang).filter((x) => x.cote === cote).length
  const [avant, apres] = [freres[index - 1], freres[index]]
  const ecart = cible.parent === l.central ? ECART_CENTRAL : ECARTS.principal
  const horizontal = cote === 'droite' || cote === 'gauche'
  const { l: largeur, h: hauteur } = REPERE
  if (horizontal) {
    // La colonne des frères : leur bord de départ, sinon à un écart du parent.
    const x = cote === 'droite' ? (freres[0]?.x ?? parent.x + parent.l + ecart) : (freres[0] ? freres[0].x + freres[0].l : parent.x - ecart) - largeur
    const y = avant && apres ? (avant.y + avant.h + apres.y) / 2 - hauteur / 2 : apres ? apres.y - ECART_FRERE - hauteur : avant ? avant.y + avant.h + ECART_FRERE : parent.y + parent.h / 2 - hauteur / 2
    return { parent: cible.parent, boite: { x, y, l: largeur, h: hauteur }, cote, forme }
  }
  // Un organigramme : les frères sont côte à côte, sous (ou sur) le parent.
  const y = cote === 'bas' ? (freres[0]?.y ?? parent.y + parent.h + ecart) : (freres[0] ? freres[0].y + freres[0].h : parent.y - ecart) - hauteur
  const x = avant && apres ? (avant.x + avant.l + apres.x) / 2 - largeur / 2 : apres ? apres.x - ECART_FRERE - largeur : avant ? avant.x + avant.l + ECART_FRERE : parent.x + parent.l / 2 - largeur / 2
  return { parent: cible.parent, boite: { x, y, l: largeur, h: hauteur }, cote, forme }
}
