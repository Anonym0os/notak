import { regional } from './formats'
import type { Table } from '../../coeur/tableau'
import { registre } from '../registre'
import { RenduTable } from './Table'
import { OutilsTable } from './Outils'
import { plageDe, tableDepuisCollage } from './actions'
import { resumeTable } from './affichage'
import { focaliser, lireEtat, poserEtat } from './etat'
import { ajusterALaPoignee, calerSurGrille, largeursDe, nouvelleTable } from './grille'
import { lireCollage } from './pressePapiers'
import { t } from '../../langue'
import './table.css'
import { ico } from '../../icones'

registre.type<Table>({
  type: 'table',
  get nom() {
    return t('type.table')
  },
  resume: resumeTable,
  Rendu: RenduTable,
  Outils: OutilsTable,
  hauteurParDefaut: 25,
  largeurMin: 12,
  // La poignée du coin n'étire pas la table : elle ajoute des colonnes et des lignes, ou retire celles qui sont vides.
  tirerPoignee(element, largeurTiree, dHauteurUG) {
    const t0 = element.contenu
    const { table, largeurs } = ajusterALaPoignee(t0, largeursDe(t0, element.largeur), largeurTiree - element.largeur, dHauteurUG)
    // La largeur totale reste sur la grille, comme après un geste sur une colonne.
    const calees = calerSurGrille(largeurs)
    return { largeur: Math.round(calees.reduce((a, b) => a + b, 0) * 1000) / 1000, contenu: { ...table, largeurs: calees } }
  },
  suivant: (e, places) => ({ ...nouvelleTable(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      get libelle() {
        return t('type.table')
      },
      icone: ico('table'),
      rang: 100,
      vignette: 'table',
      fantome: () => nouvelleTable(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleTable(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})

// Entrée (ou F2) sur une table seule choisie, sans cellule : elle choisit A1, et le clavier est à elle.
registre.raccourci((e, contexte) => {
  if ((e.key !== 'Enter' && e.key !== 'F2') || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false
  if (contexte.selection.size !== 1) return false
  const id = [...contexte.selection][0]!
  const el = contexte.magasin.lire().elements.find((x) => x.id === id)
  if (!el || el.contenu.type !== 'table' || el.verrou || contexte.services.lectureSeule) return false
  if (lireEtat(id).plages.length > 0) return false
  const a1 = { l: 0, c: 0 }
  poserEtat(id, { plages: [plageDe(a1)], ancre: a1, tete: a1 })
  focaliser(id)
  return true
})

// Un tableau de tableur collé sur la toile (Excel, Sheets, une autre table) devient une table. Avant les images :
// un tableur met aussi une capture de ses cellules dans le presse-papiers, dont on ne veut pas.
registre.recepteur({
  priorite: 45,
  recevoir(donnees, ou) {
    const html = donnees.getData('text/html')
    if (!/<table[\s>]/i.test(html)) return null
    return [{ type: 'creer', element: tableDepuisCollage(lireCollage(html, donnees.getData('text/plain')), Math.round(ou.x), Math.round(ou.y), regional()) }]
  },
})
