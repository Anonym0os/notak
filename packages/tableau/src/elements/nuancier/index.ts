import type { Nuancier } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsNuancier, OutilsNuancierApres, RenduNuancier } from './Nuancier'
import { LARGEUR_NUANCIER, analyserCode, avecNomEnLegende, codeAffiche, couleurSuivante, nouveauNuancier } from './couleur'
import { t } from '../../langue'
import './nuancier.css'
import { ico } from '../../icones'

registre.type<Nuancier>({
  type: 'nuancier',
  get nom() {
    return t('type.nuancier')
  },
  resume: (c) => codeAffiche(c.couleur),
  Rendu: RenduNuancier,
  Outils: OutilsNuancier,
  OutilsApres: OutilsNuancierApres,
  editable: true,
  aLaCreation: 'rien',
  // Sans légende, l'aplat seul ; avec, un cadre blanc dont l'aplat est la partie haute.
  sansFond: (c) => !c.avecLegende,
  hauteurParDefaut: 12,
  largeurMin: 4,
  largeurNaturelle: () => LARGEUR_NUANCIER,
  // Libre en largeur comme en hauteur, comme Milanote : la poignée règle aussi la hauteur (17 × 12 UG par défaut).
  hauteurBornable: true,
  suivant: (e, places) => ({ ...nouveauNuancier(places.dessous.x, places.dessous.y, e.contenu.couleur), largeur: e.largeur }),
  outils: [
    {
      get libelle() {
        return t('type.nuancier')
      },
      icone: ico('palette'),
      rang: 210,
      vignette: 'nuancier',
      tiroir: true,
      fantome: () => nouveauNuancier(0, 0),
      creer: (ou) => [{ type: 'creer', element: avecNomEnLegende(nouveauNuancier(Math.round(ou.x), Math.round(ou.y), couleurSuivante())) }],
    },
  ],
})

// Un code couleur collé seul (« #3a76df », « rgb(58, 118, 223) », « hsl(217, 71%, 54%) ») devient un nuancier, avant les liens et les notes.
registre.recepteur({
  priorite: 32,
  recevoir(donnees, ou) {
    const texte = donnees.getData('text/plain').trim()
    // Le dièse (ou rgb(…), hsl(…)) est exigé : « cafe » ou « add » sont des mots avant d'être des couleurs.
    const couleur = /^(#|rgba?\(|hsla?\()/i.test(texte) && texte.length <= 24 ? analyserCode(texte) : null
    if (!couleur) return null
    const format = texte.toLowerCase().startsWith('rgb') ? 'rgb' : texte.toLowerCase().startsWith('hsl') ? 'hsl' : undefined
    const n = nouveauNuancier(Math.round(ou.x), Math.round(ou.y), couleur)
    return [{ type: 'creer', element: avecNomEnLegende(format ? { ...n, contenu: { ...n.contenu, format } } : n) }]
  },
})
