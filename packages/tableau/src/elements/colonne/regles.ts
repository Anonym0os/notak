import type { Element } from '../../coeur/tableau'
import { definition } from '../registre'

/** Une colonne n'accepte ni colonne, ni ligne. */
export const accepteDansColonne = (e: Element) =>
  e.contenu.type !== 'colonne' && definition(e.contenu.type)?.calque !== 'lignes'
