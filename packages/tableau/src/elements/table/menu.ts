import type { Id } from '../../coeur/tableau'
import { t, tn } from '../../langue'
import type { Entree } from '../../communs'
import type { ContexteToile } from '../types'
import {
  bornerPlages,
  droitsDe,
  glisserColonnes,
  glisserLignes,
  insererAutourColonnes,
  insererAutourLignes,
  retirerLesColonnes,
  retirerLesLignes,
  viderSelection,
} from './actions'
import { collerDepuisLeSysteme } from './collage'
import { focaliser, lireEtat } from './etat'
import { type Geste, modifierTable } from './modifier'

/**
 * Les entrées du menu d'une table pour les cellules choisies, en cinq groupes : presse-papiers, lignes, colonnes,
 * déplacements, retraits. Seules les insertions montrent leur raccourci. `barre` : le « ••• » de la barre d'outils,
 * sans le presse-papiers ni « ajouter en dessous » et « ajouter à droite » (la barre a déjà ces deux boutons).
 * Les entrées se relisent à chaque ouverture : le menu dit toujours ce qui vaut pour la sélection.
 */
export function entreesTable(contexte: ContexteToile, id: Id, forme: 'clic' | 'barre'): Entree[] {
  const el = contexte.magasin.lire().elements.find((x) => x.id === id)
  if (!el || el.contenu.type !== 'table') return []
  const plages = bornerPlages(lireEtat(id).plages, el.contenu)
  if (plages.length === 0) return []
  const d = droitsDe(el.contenu, plages)
  const barre = forme === 'barre'
  const geste = (f: Geste) => () => {
    modifierTable(contexte, id, f)
    focaliser(id)
  }
  const presse = (commande: 'cut' | 'copy') => () => {
    focaliser(id)
    document.execCommand(commande)
  }
  // Le singulier vaut pour une ligne, ou quand ce sont des colonnes entières (et inversement).
  const nl = d.lignes === 1 || (d.colonnesEntieres && !d.lignesEntieres) ? 1 : 2
  const nc = d.colonnes === 1 || (d.lignesEntieres && !d.colonnesEntieres) ? 1 : 2
  const sortie: Entree[] = []
  if (!barre) {
    sortie.push(
      { libelle: t('toile.couper'), icone: 'menuCouper', faire: presse('cut') },
      { libelle: t('commun.copier'), icone: 'menuCopier', faire: presse('copy') },
      { libelle: t('table.menu.coller'), icone: 'menuColler', faire: () => void collerDepuisLeSysteme(contexte, id, false).then(() => focaliser(id)) },
      { libelle: t('table.menu.collerValeurs'), icone: 'menuStyleColler', faire: () => void collerDepuisLeSysteme(contexte, id, true).then(() => focaliser(id)) },
      null,
    )
  }
  if (d.afficherLignes) {
    sortie.push({ libelle: tn('table.menu.lignesDessus', nl), icone: 'ligneAjout', raccourci: '⌥↑', desactive: !d.insererLignes, faire: geste((tab, l) => insererAutourLignes(tab, l, plages, 'dessus')) })
    if (!barre) sortie.push({ libelle: tn('table.menu.lignesDessous', nl), icone: 'ligneAjout', raccourci: '⌥↓', desactive: !d.insererLignes, faire: geste((tab, l) => insererAutourLignes(tab, l, plages, 'dessous')) })
    sortie.push(null)
  }
  if (d.afficherColonnes) {
    sortie.push({ libelle: tn('table.menu.colonnesGauche', nc), icone: 'colonneAjout', raccourci: '⌥←', desactive: !d.insererColonnes, faire: geste((tab, l) => insererAutourColonnes(tab, l, plages, 'gauche')) })
    if (!barre) sortie.push({ libelle: tn('table.menu.colonnesDroite', nc), icone: 'colonneAjout', raccourci: '⌥→', desactive: !d.insererColonnes, faire: geste((tab, l) => insererAutourColonnes(tab, l, plages, 'droite')) })
    sortie.push(null)
  }
  if (d.deplacerLignes) {
    sortie.push(
      { libelle: tn('table.menu.lignesHaut', nl), icone: 'haut', desactive: !d.lignesHaut, faire: geste((tab) => glisserLignes(tab, plages, -1)) },
      { libelle: tn('table.menu.lignesBas', nl), icone: 'bas', desactive: !d.lignesBas, faire: geste((tab) => glisserLignes(tab, plages, 1)) },
    )
  }
  if (d.deplacerColonnes) {
    sortie.push(
      { libelle: tn('table.menu.colonnesVersGauche', nc), icone: 'gauche', desactive: !d.colonnesGauche, faire: geste((tab, l) => glisserColonnes(tab, l, plages, -1)) },
      { libelle: tn('table.menu.colonnesVersDroite', nc), icone: 'droite', desactive: !d.colonnesDroite, faire: geste((tab, l) => glisserColonnes(tab, l, plages, 1)) },
    )
  }
  sortie.push(null, { libelle: tn('table.menu.vider', plages.length > 1 || d.lignes * d.colonnes > 1 ? 2 : 1), icone: 'gomme', faire: geste((tab) => ({ table: viderSelection(tab, plages) })) })
  if (d.afficherLignes) sortie.push({ libelle: tn('table.menu.retirerLignes', nl), icone: 'ligneRetrait', danger: true, desactive: !d.retirerLignes, faire: geste((tab) => retirerLesLignes(tab, plages)) })
  if (d.afficherColonnes) sortie.push({ libelle: tn('table.menu.retirerColonnes', nc), icone: 'colonneRetrait', danger: true, desactive: !d.retirerColonnes, faire: geste((tab, l) => retirerLesColonnes(tab, l, plages)) })
  return sortie
}
