import type { Lien } from '../../coeur/tableau'
import { dimensionsApercu } from './imageApercu'
import { lecteurDe } from './lecteurs'

/** Les trois parties d'une carte de lien qu'on peut cacher : l'image ou le lecteur, le domaine et le titre, la légende. */
export type Partie = 'apercu' | 'infos' | 'legende'

const CHAMP = { apercu: 'sansApercu', infos: 'sansInfos', legende: 'sansLegende' } as const

/** Sous cette largeur (UG), le texte s'efface de lui-même : il ne reste que le média. */
export const LARGEUR_MEDIA_SEUL = 12
/** Largeur minimale d'une carte qui montre un média (comme une image), et sans média (UG). */
const LARGEUR_MIN_MEDIA = 4
const LARGEUR_MIN_TEXTE = 17

/** Le lien peut-il montrer un média : un lecteur intégré, ou une image d'aperçu déjà lue ? */
export const aUnMedia = (c: Lien) => !!lecteurDe(c.url) || !!c.image || (c.statut === 'pret' && !!c.apercu?.image)

/** Le média est-il montré (il existe, et l'aperçu n'est pas caché) ? */
export const mediaVisible = (c: Lien) => aUnMedia(c) && !c.sansApercu

/** « Média seul » : le média est là, et le texte (domaine, titre, légende) est caché ou n'a pas la place. */
export const mediaSeul = (c: Lien, largeur?: number) =>
  mediaVisible(c) && (!!c.sansInfos || (largeur !== undefined && largeur < LARGEUR_MEDIA_SEUL))

/**
 * Ce que la carte montre. Avec la `largeur` (UG), le média seul est celui de Milanote : il cache en bloc le domaine,
 * le titre ET la légende. Sans elle, les trois réglages tels qu'ils sont enregistrés.
 */
export function affichage(c: Lien, largeur?: number): Record<Partie, boolean> {
  if (largeur === undefined) return { apercu: !c.sansApercu, infos: !c.sansInfos, legende: !c.sansLegende }
  const seul = mediaSeul(c, largeur)
  return { apercu: !c.sansApercu, infos: !seul, legende: !seul && !c.sansLegende }
}

/** Largeur minimale quand on redimensionne : 4 UG avec un média (comme une image), 17 UG sans. */
export const largeurMinLien = (c: Lien) => (mediaVisible(c) ? LARGEUR_MIN_MEDIA : LARGEUR_MIN_TEXTE)

/** Largeur sur hauteur de ce qu'on voit en média seul, pour qu'il garde ses proportions (une vidéo, une image dont on connaît la taille) ; 0 : la carte est libre. */
export function proportionLien(c: Lien): number {
  if (!mediaSeul(c)) return 0
  const l = lecteurDe(c.url)
  if (l && !c.image) return l.genre === 'video' && l.proportions ? l.proportions : 0
  const d = dimensionsApercu(c)
  return d ? d.largeur / d.hauteur : 0
}

/** La largeur d'origine de l'image d'aperçu en UG (10 px l'unité), quand on la connaît ; un lecteur n'en a pas. */
export function largeurOrigineLien(c: Lien): number | undefined {
  if (!mediaVisible(c) || (lecteurDe(c.url) && !c.image)) return undefined
  const d = dimensionsApercu(c)
  return d ? d.largeur / 10 : undefined
}

/** Un lien à image d'aperçu ne s'étire pas au-delà de la taille d'origine de l'image (jamais sous sa largeur minimale). */
export function largeurMaxLien(c: Lien): number | undefined {
  const origine = largeurOrigineLien(c)
  return origine === undefined ? undefined : Math.max(largeurMinLien(c), Math.round(origine))
}

/**
 * Montre ou cache une partie. On ne cache pas la dernière partie visible : une carte sans rien à montrer
 * n'aurait plus de quoi se faire retrouver. Rend le même contenu quand le geste est refusé.
 * Remettre l'aperçu remet aussi « tout montrer » (le média seul s'éteint).
 */
export function avecPartie(c: Lien, partie: Partie, visible: boolean): Lien {
  const champ = CHAMP[partie]
  if (!visible && Object.values(affichage(c)).filter(Boolean).length <= 1 && affichage(c)[partie]) return c
  const reste: Lien = { ...c }
  delete reste[champ]
  // Remettre l'aperçu remet « tout montrer ».
  if (visible && partie === 'apercu') delete reste.sansInfos
  return visible ? reste : { ...reste, [champ]: true }
}
