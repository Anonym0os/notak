import type { Lieu } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsLieu, RenduLieu } from './Lieu'
import { nouveauLieu, resume } from './adresse'
import { t } from '../../langue'
import './lieu.css'

registre.type<Lieu>({
  type: 'lieu',
  get nom() {
    return t('type.lieu')
  },
  resume,
  Rendu: RenduLieu,
  Outils: OutilsLieu,
  editable: true,
  hauteurParDefaut: 9,
  largeurMin: 16,
  suivant: (e, places) => ({ ...nouveauLieu(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      get libelle() {
        return t('type.lieu')
      },
      icone: '📍',
      rang: 120,
      tiroir: true,
      fantome: () => nouveauLieu(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauLieu(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
