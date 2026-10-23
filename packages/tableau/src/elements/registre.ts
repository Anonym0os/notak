import type { Contenu, TypeContenu } from '../coeur/tableau'
import type { EntreeMenu, OutilCommun, Raccourci, Recepteur, TypeElement } from './types'

const types = new Map<TypeContenu, TypeElement>()
const recepteurs: Recepteur[] = []
const raccourcis: Raccourci[] = []
const outilsCommuns: { outil: OutilCommun; rang: number }[] = []

/** Où paraissent les outils d'un type qui se montrent après les outils communs « de tête » (étiquettes, réactions, commentaire). */
export const RANG_APRES_TETE = 45
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
  /**
   * `rang` place l'outil dans la barre de sélection, croissant : 10 la couleur, 20 les étiquettes, 30 les réactions,
   * 40 le commentaire ; les outils propres au type qui suivent viennent à `RANG_APRES_TETE` ; 60 l'arrangement.
   */
  outilCommun(o: OutilCommun, rang = 50) {
    // Un module rechargé (à chaud) se déclare une seconde fois : il remplace sa première déclaration.
    const i = o.name ? outilsCommuns.findIndex((x) => x.outil.name === o.name) : -1
    if (i >= 0) outilsCommuns[i] = { outil: o, rang }
    else outilsCommuns.push({ outil: o, rang })
    outilsCommuns.sort((a, b) => a.rang - b.rang)
  },
  entreeMenu(e: EntreeMenu) {
    // Une entrée porte le nom de son geste : deux entrées du même nom n'en font qu'une dans le menu.
    const i = entreesMenu.findIndex((x) => x.libelle === e.libelle)
    if (i >= 0) entreesMenu[i] = e
    else entreesMenu.push(e)
  },
}

/**
 * Les `DataTransfer` qui viennent d'un glisser-déposer (et non d'un collage ou d'un sélecteur) : ils ont un point visé,
 * et ce qu'on lâche sur un élément peut l'atteindre. La toile recopie les données avant de les passer aux récepteurs,
 * et la copie perd l'effet permis du glisser : c'est ici qu'elle le garde.
 */
const depots = new WeakSet<DataTransfer>()
export const marquerDepot = (d: DataTransfer) => void depots.add(d)
export const estUnDepotToile = (d: DataTransfer) => depots.has(d)

export const definition = (type: TypeContenu) => types.get(type)
export const tousLesTypes = () => [...types.values()]
export const tousLesRecepteurs = () => recepteurs
export const tousLesRaccourcis = () => raccourcis
export const tousLesOutilsCommuns = () => outilsCommuns.map((x) => x.outil)
/** Les outils communs avec leur rang, du premier au dernier. */
export const tousLesOutilsCommunsRanges = () => outilsCommuns
export const toutesLesEntreesMenu = () => entreesMenu
