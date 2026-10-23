import { type Element, type RenvoiTableau, nouvelId } from '../../coeur/tableau'
import { cleEntre, comparerOrdre } from '../../coeur/ordre'
import { registre } from '../registre'
import type { Point } from '../../coeur/geometrie'
import type { ContexteToile } from '../types'
import { nouveauRaccourci } from './icones'
import { OutilsRenvoi } from './Outils'
import { RenduRenvoi } from './Renvoi'
import { demanderRenommage } from './renommage'
import { demanderModele } from './modele'
import { t } from '../../langue'
import './tableau.css'
import { ico } from '../../icones'

const LARGEUR_RENVOI = 10

/** Un tableau neuf, vide, et son renvoi posé là ; son titre se saisit aussitôt. */
function nouveauRenvoi(ou: Point, contexte: ContexteToile, renommer = true): Element<RenvoiTableau> | null {
  const cible = contexte.services.creerTableau?.(t('tableau.nouveau'))
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
  get libelle() {
    return t('menu.ouvrirOnglet')
  },
  visible: (els, contexte) => els.length === 1 && els[0]!.contenu.type === 'tableau' && !!contexte.services.ouvrirDansOnglet,
  faire: ([e], contexte) => e?.contenu.type === 'tableau' && contexte.services.ouvrirDansOnglet?.(e.contenu.cible),
})

registre.entreeMenu({
  get libelle() {
    return t('menu.creerRaccourci')
  },
  // Un seul tableau, qui n'est pas lui-même un raccourci.
  visible: (els, contexte) => els.length === 1 && els[0]!.contenu.type === 'tableau' && !els[0]!.contenu.raccourci && !contexte.services.lectureSeule,
  faire(els, contexte) {
    // Un raccourci naît à 6 UG à droite et 5 UG plus bas que son tableau ; rangé dans une colonne, juste après lui.
    const neufs = els.flatMap((e) => {
      if (e.contenu.type !== 'tableau') return []
      const neuf = nouveauRaccourci(e as Element<RenvoiTableau>, { x: e.x + 6, y: e.y + 5 })
      if (!e.parent) return [neuf]
      const freres = contexte.magasin.lire().elements.filter((x) => x.parent === e.parent).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
      const apres = freres[freres.findIndex((x) => x.id === e.id) + 1]
      return [{ ...neuf, x: e.x, y: e.y, parent: e.parent, ordre: cleEntre(e.ordre, apres?.ordre) }]
    })
    contexte.magasin.faire(neufs.map((element) => ({ type: 'creer' as const, element })))
    contexte.choisir(neufs.map((e) => e.id))
  },
})

registre.entreeMenu({
  get libelle() {
    return t('menu.renommer')
  },
  visible: (els) => els.length === 1 && els[0]!.contenu.type === 'tableau',
  tuile: true,
  faire: ([e]) => e && demanderRenommage(e.id),
})

registre.type<RenvoiTableau>({
  type: 'tableau',
  redimensionnable: false,
  get nom() {
    return t('type.tableau')
  },
  resume: (c, contexte) => (c.raccourci && c.titre) || (contexte.services.tableau?.(c.cible)?.titre ?? ''),
  Rendu: RenduRenvoi,
  Outils: OutilsRenvoi,
  // Sa couleur est celle du tableau, rangée dans l'espace : la changer ne passe pas par l'historique de celui-ci.
  couleur: {
    lire: (e, contexte) => (e.contenu.raccourci && e.contenu.couleur) || contexte.services.tableau?.(e.contenu.cible)?.couleur,
    // Un raccourci a sa couleur : elle se range dans sa carte, et le tableau garde la sienne.
    ailleurs: (e, couleur, contexte) =>
      e.contenu.raccourci
        ? contexte.magasin.faire([{ type: 'contenu', id: e.id, avant: e.contenu, apres: { ...e.contenu, couleur } }])
        : contexte.services.colorerTableau?.(e.contenu.cible, couleur),
  },
  sansFond: true,
  sansInclinaison: true,
  ouvrir: (e, contexte) => contexte.services.ouvrirTableau?.(e.contenu.cible),
  hauteurParDefaut: 14,
  suivant: (e, _places, _format, contexte) => nouveauRenvoi({ x: e.x + 17, y: e.y }, contexte),
  largeurMin: LARGEUR_RENVOI,
  outils: [
    {
      get libelle() {
        return t('type.tableau')
      },
      icone: ico('tableau'),
      rang: 50,
      vignette: 'tableau',
      fantome: () => ({ id: '', x: 0, y: 0, largeur: LARGEUR_RENVOI, contenu: { type: 'tableau', cible: '' } }),
      prise: { x: LARGEUR_RENVOI / 2, y: LARGEUR_RENVOI / 2 },
      creer(ou, contexte) {
        const element = nouveauRenvoi(ou, contexte)
        return element ? [{ type: 'creer', element }] : []
      },
    },
    {
      // Un tableau neuf qui propose d'abord ses modèles ; le laisser vide ramène au renommage de l'outil ordinaire.
      get libelle() {
        return t('outil.tableauModele')
      },
      icone: ico('modele'),
      rang: 270,
      vignette: 'modele',
      tiroir: true,
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

