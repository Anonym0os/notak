import type { Nuancier } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsNuancier, RenduNuancier } from './Nuancier'
import { LARGEUR_NUANCIER, PROPORTION_NUANCIER, codeAffiche, normaliserHex, nouveauNuancier } from './couleur'
import './nuancier.css'

registre.type<Nuancier>({
  type: 'nuancier',
  nom: 'Nuancier',
  resume: (c) => codeAffiche(c.couleur),
  Rendu: RenduNuancier,
  Outils: OutilsNuancier,
  editable: true,
  sansFond: true,
  hauteurParDefaut: 12,
  largeurMin: 4,
  largeurNaturelle: () => LARGEUR_NUANCIER,
  proportion: () => PROPORTION_NUANCIER,
  suivant: (e, places) => ({ ...nouveauNuancier(places.dessous.x, places.dessous.y, e.contenu.couleur), largeur: e.largeur }),
  outils: [
    {
      libelle: 'Nuancier',
      icone: '🎨',
      rang: 110,
      tiroir: true,
      fantome: () => nouveauNuancier(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauNuancier(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})

// Un code couleur collé seul (« #3a76df ») devient un nuancier, avant les liens et les notes.
registre.recepteur({
  priorite: 32,
  recevoir(donnees, ou) {
    const texte = donnees.getData('text/plain').trim()
    // Le dièse est exigé : « cafe » ou « add » sont des mots avant d'être des couleurs.
    const couleur = texte.startsWith('#') && texte.length <= 7 ? normaliserHex(texte) : null
    return couleur ? [{ type: 'creer', element: nouveauNuancier(Math.round(ou.x), Math.round(ou.y), couleur) }] : null
  },
})
