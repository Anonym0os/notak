import { comparerOrdre } from '../../coeur/ordre'
import { type Colonne, type Element, type Id, type Operation, type RenvoiTableau } from '../../coeur/tableau'
import { definition, registre, tousLesTypes } from '../registre'
import { iconeDuTitre } from '../tableau/initialisation'
import { t } from '../../langue'

/** La largeur d'un tableau imbriqué sur la toile, en unités de grille. */
const LARGEUR_TABLEAU = 10

/**
 * Ce que la colonne devient en tableau : ses éléments, sortis de la colonne, dans l'ordre de la colonne. Le tableau
 * neuf les garde dans ses non triés (le placement qu'on leur donne ici ne sert que s'il les pose un jour sur la toile).
 */
export function elementsDuTableau(enfants: readonly Element[], hauteur: (e: Element) => number): Element[] {
  let y = 5
  return [...enfants]
    .sort((a, b) => comparerOrdre(a.ordre, b.ordre))
    .map((e) => {
      const { parent: _p, ordre: _o, ...reste } = e
      const pose = { ...reste, x: 5, y }
      y += Math.ceil(hauteur(e)) + 2
      return pose
    })
}

/**
 * Convertir une colonne en tableau : la colonne devient la carte d'un tableau (même identifiant, même titre), ses
 * éléments partent dans ce tableau. Un seul pas : les éléments (et leurs lignes) quittent la toile, la colonne change de visage.
 */
export function pasDeConversion(colonne: Element<Colonne>, partants: readonly Element[], cible: Id): Operation[] {
  const titre = colonne.contenu.titre
  const icone = iconeDuTitre(titre)
  const carte: RenvoiTableau = { type: 'tableau', cible, ...(icone ? { icone } : {}) }
  return [
    ...partants.map((element): Operation => ({ type: 'supprimer', element })),
    { type: 'contenu', id: colonne.id, avant: colonne.contenu, apres: carte },
    { type: 'redimensionner', id: colonne.id, de: colonne.largeur, vers: LARGEUR_TABLEAU },
  ]
}

registre.entreeMenu({
  icone: 'convertir',
  get libelle() {
    return t('menu.convertirTableau')
  },
  visible: (els, contexte) =>
    els.length > 0 &&
    els.every((e) => e.contenu.type === 'colonne') &&
    !contexte.services.lectureSeule &&
    !!contexte.services.creerTableau &&
    !!contexte.services.deposerDans,
  faire(els, contexte) {
    const { creerTableau, deposerDans, colorerTableau } = contexte.services
    if (!creerTableau || !deposerDans) return
    const pas: Operation[] = []
    for (const e of els) {
      if (e.contenu.type !== 'colonne') continue
      const colonne = e as Element<Colonne>
      const tableau = contexte.magasin.lire()
      const enfants = tableau.elements.filter((x) => x.parent === colonne.id && x.corbeille === undefined)
      const cible = creerTableau(colonne.contenu.titre || t('tableau.nouveau'))
      if (colonne.contenu.couleur) colorerTableau?.(cible, colonne.contenu.couleur)
      const venus = elementsDuTableau(enfants, (x) => {
        const r = contexte.rect(x.id)
        return r ? r.max.y - r.min.y : (definition(x.contenu.type)?.hauteurParDefaut ?? 8)
      })
      // Les lignes attachées aux éléments qui partent les suivent hors de la toile.
      const lignes = tousLesTypes()
        .flatMap((d) => d.emporterAvec?.(enfants, tableau) ?? [])
        .filter((l, i, tous) => !enfants.some((x) => x.id === l.id) && tous.findIndex((x) => x.id === l.id) === i)
      // Les cartes attendent dans les non triés du tableau neuf, dans l'ordre de la colonne.
      if (venus.length > 0) deposerDans(cible, venus, true)
      pas.push(...pasDeConversion(colonne, [...enfants, ...lignes], cible))
    }
    if (pas.length > 0) contexte.magasin.faire(pas)
  },
})
