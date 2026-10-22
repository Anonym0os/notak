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
    outilsCommuns.push(o)
  },
  entreeMenu(e: EntreeMenu) {
    entreesMenu.push(e)
  },
}

export const definition = (type: TypeContenu) => types.get(type)
export const tousLesTypes = () => [...types.values()]
export const tousLesRecepteurs = () => recepteurs
export const tousLesRaccourcis = () => raccourcis
export const tousLesOutilsCommuns = () => outilsCommuns
export const toutesLesEntreesMenu = () => entreesMenu
