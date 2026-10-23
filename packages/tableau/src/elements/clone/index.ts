import type { Clone, Contenu, Element } from '../../coeur/tableau'
import { definition, registre } from '../registre'
import type { ContexteToile } from '../types'
import { OutilsClone, RenduClone } from './Clone'
import './clone.css'
import { cibleDe, clonesEmportes, nouveauClone, originalAffichable, originalDe, peutCloner, placeAcote, resumeSansOriginal } from './original'
import { t } from '../../langue'
import { cleEntre, comparerOrdre } from '../../coeur/ordre'

/**
 * Les clones de ces éléments, posés à côté de chacun. Un élément déjà clone donne un clone de son original.
 * Le dernier clone créé est choisi.
 */
export function cloner(elements: readonly Element[], contexte: ContexteToile) {
  const aCloner = elements.filter((e) => peutCloner(e.contenu) || e.contenu.type === 'clone')
  if (aCloner.length === 0 || contexte.services.lectureSeule) return
  const tous = contexte.magasin.lire().elements
  const clones = aCloner.map((e) => {
    const place = placeAcote(e.x, e.y)
    const clone = nouveauClone(place.x, place.y, cibleDe(e), e.largeur)
    if (!e.parent) return clone
    // Rangé dans une colonne, le clone naît juste après.
    const freres = tous.filter((x) => x.parent === e.parent).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
    return { ...clone, parent: e.parent, ordre: cleEntre(e.ordre, freres[freres.findIndex((x) => x.id === e.id) + 1]?.ordre) }
  })
  contexte.magasin.faire(clones.map((element) => ({ type: 'creer' as const, element })))
  contexte.choisir(clones.map((c) => c.id))
}

registre.type<Clone>({
  type: 'clone',
  get nom() {
    return t('type.clone')
  },
  resume: (c, contexte) => {
    const original = originalAffichable(contexte.magasin.lire().elements, c.cible)
    const texte = original && definition(original.contenu.type)?.resume?.(original.contenu as never, contexte)
    return original ? t('clone.resume', { texte: texte || definition(original.contenu.type)?.nom || t('clone.lOriginal') }) : resumeSansOriginal()
  },
  Rendu: RenduClone,
  OutilsApres: OutilsClone,
  hauteurParDefaut: 8,
  hauteurBornable: true,
  largeurMin: 8,
  // Quand l'original part à la corbeille, ses clones le suivent : ils ne diraient plus rien sans lui.
  emporterAvec: clonesEmportes,
  // Il se place comme n'importe quelle carte ; l'écrire, c'est écrire l'original (depuis l'original).
  ouvrir: (e, contexte) => {
    const original = originalDe(contexte.magasin.lire().elements, e.contenu.cible)
    if (original) contexte.commencerEdition(original.id)
  },
  suivant: () => null,
})

const clonables = (elements: readonly Element[]) =>
  elements.length > 0 && elements.every((e) => peutCloner(e.contenu as Contenu) || e.contenu.type === 'clone')

registre.entreeMenu({
  get libelle() {
    return t('clone.cloner')
  },
  // Un seul élément à la fois, comme chez Milanote.
  visible: (elements, contexte) => elements.length === 1 && clonables(elements) && !contexte.services.lectureSeule,
  faire: (elements, contexte) => cloner(elements, contexte),
})
