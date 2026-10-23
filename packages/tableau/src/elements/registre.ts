import type { Contenu, TypeContenu } from '../coeur/tableau'
import type { EntreeMenu, OutilCommun, Raccourci, Recepteur, TypeElement } from './types'

const types = new Map<TypeContenu, TypeElement>()
const recepteurs: Recepteur[] = []
const raccourcis: Raccourci[] = []
const outilsCommuns: OutilCommun[] = []
const entreesMenu: EntreeMenu[] = []

export const registre = {
  type<C extends Contenu>(def: TypeElement<C>) {
    types.set(def.type, def as unknown as TypeElement)
  },
  recepteur(r: Recepteur) {
    recepteurs.push(r)
    recepteurs.sort((a, b) => b.priorite - a.priorite)
  },
  raccourci(r: Raccourci) {
    raccourcis.push(r)
  },
  outilCommun(o: OutilCommun) {
    // Un module rechargé (à chaud) se déclare une seconde fois : il remplace sa première déclaration.
    const i = o.name ? outilsCommuns.findIndex((x) => x.name === o.name) : -1
    if (i >= 0) outilsCommuns[i] = o
    else outilsCommuns.push(o)
  },
  entreeMenu(e: EntreeMenu) {
    // Une entrée porte le nom de son geste : deux entrées du même nom n'en font qu'une dans le menu.
    const i = entreesMenu.findIndex((x) => x.libelle === e.libelle)
    if (i >= 0) entreesMenu[i] = e
    else entreesMenu.push(e)
  },
}

export const definition = (type: TypeContenu) => types.get(type)
export const tousLesTypes = () => [...types.values()]
export const tousLesRecepteurs = () => recepteurs
export const tousLesRaccourcis = () => raccourcis
export const tousLesOutilsCommuns = () => outilsCommuns
export const toutesLesEntreesMenu = () => entreesMenu
