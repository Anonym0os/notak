import type { Dessin } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsDessin, RenduDessin, ouvrirDessinLibre } from './Dessin'
import { t, tn } from '../../langue'
import '../croquis/croquis.css'
import './dessin.css'
import { ico } from '../../icones'

registre.type<Dessin>({
  type: 'dessin',
  get nom() {
    return t('type.dessin')
  },
  resume: (c) => tn('dessin.resume', c.traits.length),
  Rendu: RenduDessin,
  sansFond: true,
  largeurMin: 2,
  proportion: (c) => c.largeurOrigine / c.hauteurOrigine,
  suivant: () => null,
  // Un double-clic rouvre le dessin dans le mode de dessin, avec ses traits.
  ouvrir: (element, contexte) => ouvrirDessinLibre(contexte, element),
  OutilsApres: OutilsDessin,
  outils: [
    {
      get libelle() {
        return t('outil.dessin')
      },
      icone: ico('dessin'),
      rang: 135,
      groupe: 'action',
      fantome: () => ({ id: 'fantome', x: 0, y: 0, largeur: 6, contenu: { type: 'dessin', traits: [], largeurOrigine: 6, hauteurOrigine: 4 } }),
      // Glisser l'outil ou le cliquer ouvre la couche de dessin : ce qu'on y trace se pose là où on l'a tracé.
      creer: (_ou, contexte) => {
        ouvrirDessinLibre(contexte)
        return []
      },
      clic: (_ou, contexte) => ouvrirDessinLibre(contexte),
    },
  ],
})
