import type { Element, Fichier } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsFichier, RenduFichier, copierLienFichier, ouvrirFichier } from './Fichier'
import './fichier.css'
import { LARGEUR_FICHIER, choisirFichiers, recevoirFichiers } from './recepteur'
import { basculerBanque } from '../image/banqueImages'
import { basculerEnvoi, fermerEnvoi } from './etatEnvoi'
import { peutTelecharger, telecharger } from './telechargement'
import { t } from '../../langue'
import { ico } from '../../icones'
import { couleurDuContenu } from '../couleur'
import { OutilCouleurCarte } from '../couleur/OutilCouleurCarte'

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
  get nom() {
    return t('type.fichier')
  },
  resume: (c) => c.titre ?? c.nom,
  suivant: () => null,
  Rendu: RenduFichier,
  Outils: OutilCouleurCarte,
  couleur: couleurDuContenu<Fichier>(),
  teinte: true,
  OutilsApres: OutilsFichier,
  editable: true,
  hauteurParDefaut: 8,
  largeurMin: 12,
  ouvrir: (e, contexte) => void ouvrirFichier(e.contenu, contexte),
  outils: [
    {
      get libelle() {
        return t('outil.image')
      },
      icone: ico('image'),
      rang: 80,
      groupe: 'action',
      fantome: () => fantome(t('type.image'), 'image/png'),
      // L'élément naît du choix fait dans le sélecteur, là où l'on a lâché l'outil.
      creer: (ou, contexte) => {
        choisirFichiers(ou, contexte, 'image/*')
        return []
      },
      // Avec une banque d'images, le clic ouvre son panneau (« Envoyer les vôtres » y mène au sélecteur) ; sans, le sélecteur.
      clic: (ou, contexte) => {
        fermerEnvoi()
        if (contexte.services.banqueImages) basculerBanque()
        else choisirFichiers(ou, contexte, 'image/*')
      },
    },
    {
      get libelle() {
        return t('outil.fichier')
      },
      icone: ico('trombone'),
      rang: 90,
      groupe: 'action',
      fantome: () => fantome(t('type.fichier'), ''),
      creer: (ou, contexte) => {
        choisirFichiers(ou, contexte)
        return []
      },
      // Un clic ouvre le panneau d'envoi (bouton et zone de dépôt) ; le glisser de l'outil garde le sélecteur.
      clic: () => basculerEnvoi(),
    },
  ],
})

registre.recepteur({ priorite: 35, cumulable: true, recevoir: recevoirFichiers })

const tousDe = (els: Element[], type: Element['contenu']['type']) => els.length > 0 && els.every((e) => e.contenu.type === type)

// Le même geste porte trois noms, comme chez Milanote : « Download original image », « …images » et « Download ».
registre.entreeMenu({
  get libelle() {
    return t('menu.telechargerImage')
  },
  visible: (els, contexte) => els.length === 1 && tousDe(els, 'image') && peutTelecharger(els, contexte),
  faire: (els, contexte) => void telecharger(els, contexte),
})

registre.entreeMenu({
  get libelle() {
    return t('menu.telechargerImages')
  },
  visible: (els, contexte) => els.length > 1 && tousDe(els, 'image') && peutTelecharger(els, contexte),
  faire: (els, contexte) => void telecharger(els, contexte),
})

registre.entreeMenu({
  get libelle() {
    return t('menu.telecharger')
  },
  visible: (els, contexte) => !tousDe(els, 'image') && peutTelecharger(els, contexte),
  faire: (els, contexte) => void telecharger(els, contexte),
})

// Copier l'adresse du fichier ; sans presse-papiers, c'est le fichier lui-même qu'on ouvre.
registre.entreeMenu({
  get libelle() {
    return t('fichier.copierLien')
  },
  visible: (els) => els.length === 1 && els[0]!.contenu.type === 'fichier',
  faire: ([e], contexte) => e?.contenu.type === 'fichier' && void copierLienFichier(e.contenu, contexte),
})
