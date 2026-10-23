import { type Element, type RenvoiTableau, nouvelId } from '../../coeur/tableau'
import { registre } from '../registre'
import type { Point } from '../../coeur/geometrie'
import type { ContexteToile } from '../types'
import { nouveauRaccourci } from './icones'
import { OutilsRenvoi } from './Outils'
import { RenduRenvoi } from './Renvoi'
import { demanderRenommage } from './renommage'
import { demanderModele } from './modele'
import './tableau.css'

const LARGEUR_RENVOI = 10

/** Un tableau neuf, vide, et son renvoi posé là ; son titre se saisit aussitôt. */
function nouveauRenvoi(ou: Point, contexte: ContexteToile, renommer = true): Element<RenvoiTableau> | null {
  const cible = contexte.services.creerTableau?.('Nouveau tableau')
  if (!cible) return null
  const element: Element<RenvoiTableau> = {
    id: nouvelId(),
    x: Math.round(ou.x),
    y: Math.round(ou.y),
    largeur: LARGEUR_RENVOI,
    contenu: { type: 'tableau', cible },
  }
  if (renommer) demanderRenommage(element.id)
  return element
}

registre.entreeMenu({
  libelle: 'Ouvrir dans un nouvel onglet',
  visible: (els, contexte) => els.length === 1 && els[0]!.contenu.type === 'tableau' && !!contexte.services.ouvrirDansOnglet,
  faire: ([e], contexte) => e?.contenu.type === 'tableau' && contexte.services.ouvrirDansOnglet?.(e.contenu.cible),
})

registre.entreeMenu({
  libelle: 'Créer un raccourci',
  visible: (els, contexte) => els.length > 0 && els.every((e) => e.contenu.type === 'tableau') && !contexte.services.lectureSeule,
  faire(els, contexte) {
    // À droite de chaque carte, sur sa ligne : le raccourci naît là où l'œil le trouve.
    const neufs = els.flatMap((e) =>
      e.contenu.type === 'tableau' ? [nouveauRaccourci(e as Element<RenvoiTableau>, { x: e.x + e.largeur + 4, y: e.y })] : [],
    )
    contexte.magasin.faire(neufs.map((element) => ({ type: 'creer' as const, element })))
    contexte.choisir(neufs.map((e) => e.id))
  },
})

registre.entreeMenu({
  libelle: 'Renommer',
  visible: (els) => els.length === 1 && els[0]!.contenu.type === 'tableau',
  faire: ([e]) => e && demanderRenommage(e.id),
})

registre.type<RenvoiTableau>({
  type: 'tableau',
  nom: 'Tableau',
  resume: (c, contexte) => contexte.services.tableau?.(c.cible)?.titre ?? '',
  Rendu: RenduRenvoi,
  Outils: OutilsRenvoi,
  // Sa couleur est celle du tableau, rangée dans l'espace : la changer ne passe pas par l'historique de celui-ci.
  couleur: {
    lire: (e, contexte) => contexte.services.tableau?.(e.contenu.cible)?.couleur,
    ailleurs: (e, couleur, contexte) => contexte.services.colorerTableau?.(e.contenu.cible, couleur),
  },
  sansFond: true,
  sansInclinaison: true,
  ouvrir: (e, contexte) => contexte.services.ouvrirTableau?.(e.contenu.cible),
  hauteurParDefaut: 14,
  suivant: (e, _places, _format, contexte) => nouveauRenvoi({ x: e.x + 17, y: e.y }, contexte),
  largeurMin: LARGEUR_RENVOI,
  outils: [
    {
      libelle: 'Tableau',
      icone: '▣',
      rang: 50,
      fantome: () => ({ id: '', x: 0, y: 0, largeur: LARGEUR_RENVOI, contenu: { type: 'tableau', cible: '' } }),
      prise: { x: LARGEUR_RENVOI / 2, y: LARGEUR_RENVOI / 2 },
      creer(ou, contexte) {
        const element = nouveauRenvoi(ou, contexte)
        return element ? [{ type: 'creer', element }] : []
      },
    },
    {
      // Un tableau neuf qui propose d'abord ses modèles ; le laisser vide ramène au renommage de l'outil ordinaire.
      libelle: 'Tableau modèle',
      icone: '▤',
      rang: 51,
      fantome: () => ({ id: '', x: 0, y: 0, largeur: LARGEUR_RENVOI, contenu: { type: 'tableau', cible: '' } }),
      prise: { x: LARGEUR_RENVOI / 2, y: LARGEUR_RENVOI / 2 },
      creer(ou, contexte) {
        const element = nouveauRenvoi(ou, contexte, false)
        if (!element) return []
        demanderModele(element.id)
        return [{ type: 'creer', element }]
      },
    },
  ],
})

