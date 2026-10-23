import type { Lien } from '../../coeur/tableau'

/** Les trois parties d'une carte de lien qu'on peut cacher : l'image ou le lecteur, le domaine et le titre, la légende. */
export type Partie = 'apercu' | 'infos' | 'legende'

const CHAMP = { apercu: 'sansApercu', infos: 'sansInfos', legende: 'sansLegende' } as const

export const affichage = (c: Lien): Record<Partie, boolean> => ({
  apercu: !c.sansApercu,
  infos: !c.sansInfos,
  legende: !c.sansLegende,
})

/**
 * Montre ou cache une partie. On ne cache pas la dernière partie visible : une carte sans rien à montrer
 * n'aurait plus de quoi se faire retrouver. Rend le même contenu quand le geste est refusé.
 */
export function avecPartie(c: Lien, partie: Partie, visible: boolean): Lien {
  const champ = CHAMP[partie]
  if (!visible && Object.values(affichage(c)).filter(Boolean).length <= 1 && affichage(c)[partie]) return c
  const { [champ]: _, ...reste } = c
  return visible ? reste : { ...reste, [champ]: true }
}
