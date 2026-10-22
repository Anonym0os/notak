import type { Lien } from '../../coeur/tableau'
import type { Point } from '../../coeur/geometrie'
import { type Element, nouvelId } from '../../coeur/tableau'
import { registre } from '../registre'
import { lireAdresse } from './adresse'
import { RenduLien } from './Lien'
import './lien.css'
import { OutilsLien } from './Outils'

const LARGEUR_LIEN = 34

const nouveauLien = (ou: Point, url: string): Element<Lien> => ({
  id: nouvelId(),
  x: Math.round(ou.x),
  y: Math.round(ou.y),
  largeur: LARGEUR_LIEN,
  contenu: { type: 'lien', url, statut: 'attente' },
})

registre.type<Lien>({
  type: 'lien',
  Rendu: RenduLien,
  editable: true,
  hauteurParDefaut: 20,
  sansFond: true,
  Outils: OutilsLien,
  outils: [
    {
      libelle: 'Lien',
      icone: '↗',
      rang: 20,
      fantome: () => nouveauLien({ x: 0, y: 0 }, ''),
      creer: (ou) => [{ type: 'creer', element: nouveauLien(ou, '') }],
    },
  ],
})

registre.recepteur({
  priorite: 30,
  recevoir(donnees, ou) {
    const url = lireAdresse(donnees.getData('text/plain'))
    if (!url) return null
    return [{ type: 'creer', element: nouveauLien(ou, url) }]
  },
})
