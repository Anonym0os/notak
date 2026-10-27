import type { Extensions } from '@tiptap/react'
import { ApercuLien, ImageBloc, type RenduTexte } from '../../blocs/noeuds'
import type { ContenuExterne } from '../contenuExterne'

/**
 * Les extensions du texte dont l'image et le signet n'appellent aucun autre site tant que la toile attend l'accord
 * (`contenuExterne.ts`) : `rendu` dit qui dessine (voir `RenduTexte`). Sans `externe` (le serveur), les extensions sont
 * celles qu'on a données.
 */
export function extensionsExternes(extensions: Extensions, externe: ContenuExterne | null, rendu: RenduTexte): Extensions {
  if (!externe) return extensions
  return extensions.map((x) => (x.name === 'image' ? ImageBloc.configure({ externe, rendu }) : x.name === 'apercuLien' ? ApercuLien.configure({ externe, rendu }) : x))
}
