import type { Fichier } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsFichier, RenduFichier, ouvrirFichier } from './Fichier'
import './fichier.css'
import { LARGEUR_FICHIER, choisirFichiers, recevoirFichiers } from './recepteur'
import { peutTelecharger, telecharger } from './telechargement'
import { t } from '../../langue'
import { ico } from '../../icones'

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
  OutilsApres: OutilsFichier,
  editable: true,
  hauteurParDefaut: 8,
  largeurMin: 12,
  ouvrir: (e, contexte) => void ouvrirFichier(e.contenu, contexte),
  outils: [
    {
      get libelle() {
        return t('type.image')
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
      clic: (ou, contexte) => choisirFichiers(ou, contexte, 'image/*'),
    },
    {
      get libelle() {
        return t('type.fichier')
      },
      icone: ico('trombone'),
      rang: 90,
      groupe: 'action',
      fantome: () => fantome(t('type.fichier'), ''),
      creer: (ou, contexte) => {
        choisirFichiers(ou, contexte)
        return []
      },
      clic: (ou, contexte) => choisirFichiers(ou, contexte),
    },
  ],
})

registre.recepteur({ priorite: 35, cumulable: true, recevoir: recevoirFichiers })

registre.entreeMenu({
  get libelle() {
    return t('menu.telechargerOriginal')
  },
  visible: (els, contexte) => peutTelecharger(els, contexte),
  faire: (els, contexte) => void telecharger(els, contexte),
})

registre.entreeMenu({
  get libelle() {
    return t('fichier.ouvrirFichier')
  },
  visible: (els) => els.length === 1 && els[0]!.contenu.type === 'fichier',
  faire: ([e], contexte) => e?.contenu.type === 'fichier' && void ouvrirFichier(e.contenu, contexte),
})
