import type { Clone, Contenu, Element } from '../../coeur/tableau'
import { definition, registre } from '../registre'
import type { ContexteToile } from '../types'
import { OutilsClone, RenduClone } from './Clone'
import './clone.css'
import { RESUME_SANS_ORIGINAL, cibleDe, clonesEmportes, nouveauClone, originalAffichable, originalDe, peutCloner, placeAcote } from './original'

/**
 * Les clones de ces éléments, posés à côté de chacun. Un élément déjà clone donne un clone de son original.
 * Le dernier clone créé est choisi.
 */
export function cloner(elements: readonly Element[], contexte: ContexteToile) {
  const aCloner = elements.filter((e) => peutCloner(e.contenu) || e.contenu.type === 'clone')
  if (aCloner.length === 0 || contexte.services.lectureSeule) return
  const clones = aCloner.map((e) => {
    const r = contexte.rect(e.id)
    const place = placeAcote(r?.min.x ?? e.x, r?.min.y ?? e.y, r ? r.max.x - r.min.x : e.largeur)
    return nouveauClone(place.x, place.y, cibleDe(e), e.largeur)
  })
  contexte.magasin.faire(clones.map((element) => ({ type: 'creer' as const, element })))
  contexte.choisir(clones.map((c) => c.id))
}

registre.type<Clone>({
  type: 'clone',
  nom: 'Clone',
  resume: (c, contexte) => {
    const original = originalAffichable(contexte.magasin.lire().elements, c.cible)
    const texte = original && definition(original.contenu.type)?.resume?.(original.contenu as never, contexte)
    return original ? `Clone de ${texte || definition(original.contenu.type)?.nom || 'l’original'}` : RESUME_SANS_ORIGINAL
  },
  Rendu: RenduClone,
  Outils: OutilsClone,
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
  outils: [
    {
      libelle: 'Clone',
      icone: '⧉',
      rang: 150,
      tiroir: true,
      fantome: () => nouveauClone(0, 0, '', 17),
      // Le clone de l'élément choisi, là où l'on lâche l'outil.
      creer: (ou, contexte) => {
        const choisis = contexte.magasin.lire().elements.filter((e) => contexte.selection.has(e.id))
        const source = choisis.length === 1 ? choisis[0] : undefined
        if (!source || !(peutCloner(source.contenu) || source.contenu.type === 'clone')) return []
        return [{ type: 'creer', element: nouveauClone(Math.round(ou.x), Math.round(ou.y), cibleDe(source), source.largeur) }]
      },
    },
  ],
})

const clonables = (elements: readonly Element[]) =>
  elements.length > 0 && elements.every((e) => peutCloner(e.contenu as Contenu) || e.contenu.type === 'clone')

registre.entreeMenu({
  libelle: 'Cloner',
  visible: (elements, contexte) => clonables(elements) && !contexte.services.lectureSeule,
  faire: (elements, contexte) => cloner(elements, contexte),
})
