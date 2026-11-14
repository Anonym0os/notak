import type { Paquet } from '../../coeur/pressePapiers'
import { toileDeLaCarte } from '../../coeur/reglesDroits'
import type { Element, Id } from '../../coeur/tableau'
import { t, tn } from '../../langue'

// La carte d'un dossier qu'un outil rattaché a généré (`DroitsTableau.generes`, que le serveur dit à la toile) bouge sur
// sa toile, et rien d'autre : la synchro annulerait tout autre geste chez tout le monde. Un geste qui emporte ailleurs
// (corbeille, non triés, une autre toile, couper) ou qui double (dupliquer, copier) la laisse donc de côté d'emblée,
// comme un élément verrouillé, et l'avis dit pourquoi ; ce qu'on a choisi avec elle suit son chemin.

export type Generes = Readonly<Record<Id, string>> | undefined

/** L'outil qui a généré le dossier que montre cette carte ; `undefined` : une autre carte, ou un raccourci vers lui. */
export function outilDe(e: Pick<Element, 'contenu'> | undefined, generes: Generes): string | undefined {
  const toile = e && generes ? toileDeLaCarte(e) : undefined
  return toile === undefined ? undefined : generes![toile]
}

/** Ce qu'un geste qui emporte ailleurs laisse sur la toile, et les dossiers générés qui l'y retiennent. */
export interface Retenus {
  ids: ReadonlySet<Id>
  dossiers: Id[]
}

/**
 * Parmi `ids`, ce qui reste quand un geste les emporte ailleurs : la carte d'un dossier généré, et la colonne qui en
 * range une (elle l'emporterait avec elle).
 */
export function retenus(elements: readonly Element[], ids: Iterable<Id>, generes: Generes): Retenus {
  const voulus = new Set(ids)
  const gardes = new Set<Id>()
  const dossiers = new Set<Id>()
  for (const e of generes ? elements : []) {
    if (outilDe(e, generes) === undefined) continue
    const parSoi = voulus.has(e.id)
    const parSaColonne = e.parent !== undefined && voulus.has(e.parent)
    if (!parSoi && !parSaColonne) continue
    if (parSoi) gardes.add(e.id)
    if (parSaColonne) gardes.add(e.parent!)
    dossiers.add(toileDeLaCarte(e)!)
  }
  return { ids: gardes, dossiers: [...dossiers] }
}

/**
 * Un paquet (dupliquer, copier, la copie d'Alt au glisser) sans les cartes de dossiers générés : il ne s'en pose pas
 * une seconde. `paquet` : `null` s'il ne reste rien.
 */
export function sansGeneres(p: Paquet | null, generes: Generes): { paquet: Paquet | null; dossiers: Id[] } {
  if (!p || !generes) return { paquet: p, dossiers: [] }
  const doubles = p.elements.filter((e) => outilDe(e, generes) !== undefined)
  if (doubles.length === 0) return { paquet: p, dossiers: [] }
  const reste = p.elements.filter((e) => outilDe(e, generes) === undefined)
  return { paquet: reste.length > 0 ? { ...p, elements: reste } : null, dossiers: [...new Set(doubles.map((e) => toileDeLaCarte(e)!))] }
}

/**
 * L'avis, le même que celui de la bibliothèque : « « Clients » est généré par Silak : il reste tel quel. », ou combien
 * d'un même outil. Vide s'il n'y en a pas.
 */
export function avisGeneres(dossiers: readonly Id[], generes: Generes, titreDe: (toile: Id) => string | undefined): string {
  const premier = dossiers[0]
  const outil = premier === undefined ? undefined : generes?.[premier]
  if (premier === undefined || outil === undefined) return ''
  return tn('toile.genere.reste', dossiers.length, { titre: titreDe(premier) || t('commun.sansTitre'), outil })
}

/** Le texte d'un geste, suivi de l'avis des cartes qui sont restées ; l'avis seul quand rien d'autre n'a été fait. */
export const avecAvis = (texte: string, avis: string): string => [texte, avis].filter(Boolean).join('. ')
