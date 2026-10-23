import type { Croquis } from '../../coeur/tableau'
import { registre } from '../registre'
import { RenduCroquis } from './Croquis'
import './croquis.css'
import { type CroquisFeuille, croquisEnSvg, nouveauCroquis, resume } from './trace'
import { telecharger } from '../document/export'
import { t } from '../../langue'
import { ico } from '../../icones'
import { couleurDuContenu } from '../couleur'
import { OutilCouleurCarte } from '../couleur/OutilCouleurCarte'

registre.type<Croquis>({
  type: 'croquis',
  get nom() {
    return t('type.croquis')
  },
  resume,
  Rendu: RenduCroquis,
  Outils: OutilCouleurCarte,
  couleur: couleurDuContenu<Croquis>(),
  teinte: true,
  editable: true,
  // Comme Milanote : un clic sur le croquis déjà choisi ne l'ouvre pas, il faut un double-clic (ou Entrée).
  ouvreAuDoubleClic: true,
  aLaCreation: 'rien',
  hauteurParDefaut: 21,
  largeurMin: 12,
  suivant: () => null,
  outils: [
    {
      get libelle() {
        return t('type.croquis')
      },
      icone: ico('croquis'),
      rang: 200,
      vignette: 'croquis',
      tiroir: true,
      fantome: () => nouveauCroquis(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauCroquis(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})

// « Télécharger en SVG » : un seul croquis rempli est choisi.
registre.entreeMenu({
  get libelle() {
    return t('croquis.telechargerSvg')
  },
  visible: (els) => els.length === 1 && els[0]!.contenu.type === 'croquis' && els[0]!.contenu.traits.length > 0,
  faire: (els) => {
    const c = els[0]!.contenu
    if (c.type === 'croquis') telecharger(`${t('type.croquis')}.svg`, croquisEnSvg(c as CroquisFeuille), 'image/svg+xml')
  },
})
