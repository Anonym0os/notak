import type { Id } from '../../coeur/tableau'
import { t, tn } from '../../langue'
import type { Entree } from '../../Menus'
import type { ContexteToile } from '../types'
import {
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
 * Les entrées du menu d'une table (clic droit, et « ••• » de la barre d'outils, sans le presse-papiers) pour les
 * cellules choisies. Elles se relisent à chaque ouverture : le menu dit toujours ce qui vaut pour la sélection.
 */
export function entreesTable(contexte: ContexteToile, id: Id, avecPresse: boolean): Entree[] {
  const el = contexte.magasin.lire().elements.find((x) => x.id === id)
  const plages = lireEtat(id).plages
  if (!el || el.contenu.type !== 'table' || plages.length === 0) return []
  const d = droitsDe(el.contenu, plages)
  const geste = (f: Geste) => () => {
    modifierTable(contexte, id, f)
    focaliser(id)
  }
  const presse = (commande: 'cut' | 'copy') => () => {
    focaliser(id)
    document.execCommand(commande)
  }
  const sortie: Entree[] = []
  if (avecPresse) {
    sortie.push(
      { libelle: t('toile.couper'), raccourci: '⌘X', faire: presse('cut') },
      { libelle: t('commun.copier'), raccourci: '⌘C', faire: presse('copy') },
      { libelle: t('table.menu.coller'), raccourci: '⌘V', faire: () => void collerDepuisLeSysteme(contexte, id, false).then(() => focaliser(id)) },
      { libelle: t('table.menu.collerValeurs'), faire: () => void collerDepuisLeSysteme(contexte, id, true).then(() => focaliser(id)) },
      null,
    )
  }
  if (d.afficherLignes) {
    sortie.push(
      { libelle: tn('table.menu.lignesDessus', d.lignes), raccourci: '⌥↑', desactive: !d.insererLignes, faire: geste((tab, l) => insererAutourLignes(tab, l, plages, 'dessus')) },
      { libelle: tn('table.menu.lignesDessous', d.lignes), raccourci: '⌥↓', desactive: !d.insererLignes, faire: geste((tab, l) => insererAutourLignes(tab, l, plages, 'dessous')) },
    )
  }
  if (d.afficherColonnes) {
    sortie.push(
      { libelle: tn('table.menu.colonnesGauche', d.colonnes), raccourci: '⌥←', desactive: !d.insererColonnes, faire: geste((tab, l) => insererAutourColonnes(tab, l, plages, 'gauche')) },
      { libelle: tn('table.menu.colonnesDroite', d.colonnes), raccourci: '⌥→', desactive: !d.insererColonnes, faire: geste((tab, l) => insererAutourColonnes(tab, l, plages, 'droite')) },
    )
  }
  sortie.push(null)
  if (d.lignesEntieres && !d.plusieurs) {
    sortie.push(
      { libelle: tn('table.menu.lignesHaut', d.lignes), desactive: !d.lignesHaut, faire: geste((tab) => glisserLignes(tab, plages, -1)) },
      { libelle: tn('table.menu.lignesBas', d.lignes), desactive: !d.lignesBas, faire: geste((tab) => glisserLignes(tab, plages, 1)) },
    )
  }
  if (d.colonnesEntieres && !d.plusieurs) {
    sortie.push(
      { libelle: tn('table.menu.colonnesVersGauche', d.colonnes), desactive: !d.colonnesGauche, faire: geste((tab, l) => glisserColonnes(tab, l, plages, -1)) },
      { libelle: tn('table.menu.colonnesVersDroite', d.colonnes), desactive: !d.colonnesDroite, faire: geste((tab, l) => glisserColonnes(tab, l, plages, 1)) },
    )
  }
  sortie.push(
    null,
    { libelle: tn('table.menu.vider', plages.length > 1 || d.lignes * d.colonnes > 1 ? 2 : 1), raccourci: '⌫', faire: geste((tab) => ({ table: viderSelection(tab, plages) })) },
    { libelle: tn('table.menu.retirerLignes', d.lignes), raccourci: '⌘⌫', desactive: !d.retirerLignes, faire: geste((tab) => retirerLesLignes(tab, plages)) },
    { libelle: tn('table.menu.retirerColonnes', d.colonnes), desactive: !d.retirerColonnes, faire: geste((tab, l) => retirerLesColonnes(tab, l, plages)) },
  )
  return sortie
}
