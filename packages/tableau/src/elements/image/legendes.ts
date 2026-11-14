import type { Element, Image, Operation } from '../../coeur/tableau'
import { avecLegende } from './geometrie'

/** En dessous de cette largeur (UG), l'image n'est plus qu'un média : sa légende est masquée, comme chez Milanote. */
export const LARGEUR_LEGENDE_MIN = 8

/** L'image montre une légende : un texte, ou l'invite vide qu'on a demandée (« Légende », « Ajouter une légende »). */
export const aUneLegende = (c: Image) => !!c.legende || !!c.legendeAffichee

/** Assez large pour qu'une légende s'y voie. */
export const assezLarge = (e: Element) => e.largeur >= LARGEUR_LEGENDE_MIN

/**
 * Ce qu'on peut faire de la légende de ces images, au clic droit comme dans la feuille « ••• » : l'ajouter à celles
 * qui n'en ont pas (assez larges pour la montrer), la modifier (une seule image, qui en a une), la retirer.
 */
export function gestesLegende(els: readonly Element<Image>[]): { ajouter: boolean; modifier: boolean; retirer: boolean } {
  const larges = els.filter(assezLarge)
  return {
    ajouter: larges.some((e) => !aUneLegende(e.contenu) || (els.length === 1 && !e.contenu.legende)),
    modifier: els.length === 1 && larges.length === 1 && !!els[0]!.contenu.legende,
    retirer: els.some((e) => aUneLegende(e.contenu)),
  }
}

/** Montre la légende vide, avec son invite, des images qui n'en ont pas : on l'écrit ensuite d'un clic. */
export function afficherLegendes(els: readonly Element<Image>[]): Operation[] {
  return els
    .filter((e) => !aUneLegende(e.contenu))
    .map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: { ...e.contenu, legendeAffichee: true } }))
}

/** Retire la légende de ces images : son texte et son invite. */
export function retirerLegendes(els: readonly Element<Image>[]): Operation[] {
  return els
    .filter((e) => aUneLegende(e.contenu))
    .map((e) => {
      const { legendeAffichee: _, ...reste } = avecLegende(e.contenu, '')
      return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: reste }
    })
}
