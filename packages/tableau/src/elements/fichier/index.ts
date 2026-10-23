import type { Element, Fichier } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsFichier, RenduFichier, copierLienFichier } from './Fichier'
import { apercuDe, lisible } from './genre'
import { amorcerLegendeFichier, ouvrirFenetreFichier, viserEdition } from './ouverture'
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
  // Une feuille (le mode icône) n'a pas de poignée : on la déplace, c'est tout. Sans aperçu ni lecteur, la carte garde ses 34 UG.
  largeurMin: 4,
  sansFond: (c) => !!c.icone,
  sansPoignee: (c) => !!c.icone || !!c.sansApercu || (apercuDe(c.nom, c.typeMime, false) === null && lisible(c.typeMime) === null),
  // Le double-clic montre le fichier dans sa fenêtre : un PDF ou un texte se lit, le reste s'agrandit.
  ouvrir: (e) => ouvrirFenetreFichier(e.id),
  surFrappe: (e, caractere, contexte) => {
    if (contexte.services.lectureSeule || e.contenu.icone || e.contenu.sansInfos) return false
    viserEdition('legende')
    amorcerLegendeFichier(caractere)
    return true
  },
  outils: [
    {
      get libelle() {
        return t('outil.image')
      },
      icone: ico('image'),
      rang: 80,
      groupe: 'action',
      fantome: () => fantome(t('type.image'), 'image/png'),
      // Rien ne naît d'un glisser (voir `cliquerSeulement`) : l'image naît du panneau, ou du sélecteur de fichiers.
      creer: () => [],
      // Glisser l'outil ne crée rien, comme chez Milanote : il rebondit et la bulle invite à cliquer.
      cliquerSeulement: true,
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
