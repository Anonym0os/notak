import type { Fichier } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsFichier, RenduFichier, ouvrirFichier } from './Fichier'
import './fichier.css'
import { LARGEUR_FICHIER, choisirFichiers, recevoirFichiers } from './recepteur'

/** Le fantôme des outils d'envoi : une carte de fichier sans fichier. */
const fantome = (nom: string, typeMime: string) => ({
  id: 'fantome',
  x: 0,
  y: 0,
  largeur: LARGEUR_FICHIER,
  contenu: { type: 'fichier' as const, fichier: '', nom, typeMime, taille: 0 },
})

registre.type<Fichier>({
  type: 'fichier',
  nom: 'Fichier',
  resume: (c) => c.titre ?? c.nom,
  suivant: () => null,
  Rendu: RenduFichier,
  Outils: OutilsFichier,
  editable: true,
  hauteurParDefaut: 8,
  largeurMin: 12,
  ouvrir: (e, contexte) => void ouvrirFichier(e.contenu, contexte),
  outils: [
    {
      libelle: 'Image',
      icone: '🖼',
      rang: 80,
      fantome: () => fantome('Image', 'image/png'),
      // L'élément naît du choix fait dans le sélecteur, là où l'on a lâché l'outil.
      creer: (ou, contexte) => {
        choisirFichiers(ou, contexte, 'image/*')
        return []
      },
      clic: (ou, contexte) => choisirFichiers(ou, contexte, 'image/*'),
    },
    {
      libelle: 'Fichier',
      icone: '📎',
      rang: 90,
      fantome: () => fantome('Fichier', ''),
      creer: (ou, contexte) => {
        choisirFichiers(ou, contexte)
        return []
      },
      clic: (ou, contexte) => choisirFichiers(ou, contexte),
    },
  ],
})

registre.recepteur({ priorite: 35, cumulable: true, recevoir: recevoirFichiers })
