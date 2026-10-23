// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BarreSelection } from './Barres'
import { creerMagasin } from './coeur/magasin'
import { type Contenu, type Element, nouvelId } from './coeur/tableau'
import './elements'
import type { ContexteToile } from './elements/types'
import { fermerMenus } from './menuUnique'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
})

const texte = { type: 'doc', content: [{ type: 'paragraph' }] }
const el = (contenu: Contenu, plus: Partial<Element> = {}): Element => ({ id: nouvelId(), x: 0, y: 0, largeur: 20, contenu, ...plus })

const CONTENUS: Record<string, Contenu> = {
  note: { type: 'note', texte },
  lien: { type: 'lien', url: 'https://exemple.fr', statut: 'attente' },
  'lien-video': { type: 'lien', url: 'https://youtu.be/dQw4w9WgXcQ', statut: 'pret' },
  image: { type: 'image', fichier: 'f', largeurOrigine: 100, hauteurOrigine: 100 },
  fichier: { type: 'fichier', fichier: 'f', nom: 'a.pdf', typeMime: 'application/pdf', taille: 10 },
  document: { type: 'document', titre: '', texte },
  colonne: { type: 'colonne', titre: 'Col' } as Contenu,
  tableau: { type: 'tableau', cible: 'autre' },
  ligne: { type: 'ligne', depart: { element: 'a' }, arrivee: { element: 'b' }, pointeDepart: 'rien', pointeArrivee: 'fleche', trait: 'plein', epaisseur: 2 },
  commentaire: { type: 'commentaire', messages: [] } as unknown as Contenu,
  nuancier: { type: 'nuancier', couleur: '#4f8cff' },
  croquis: { type: 'croquis', traits: [] },
  taches: { type: 'taches', texte } as unknown as Contenu,
}

/** Les tuiles de la barre de gauche pour ce type : celles de la colonne, puis celles rangées dans « ••• ». */
function listes(type: string) {
  const e = el(CONTENUS[type]!)
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [e] })
  const contexte = {
    magasin,
    choisir: () => {},
    rect: () => null,
    commencerEdition: () => {},
    selection: new Set([e.id]),
    services: { fichiers: { enregistrer: async () => 'x', adresse: async () => null }, tableau: () => undefined, colorerTableau: () => {}, presence: { moi: () => ({ id: 'ana', nom: 'Ana', couleur: '#e33' }), autres: () => [], ecouter: () => () => {}, signaler() {} } },
  } as unknown as ContexteToile
  act(() => racine.render(<BarreSelection elements={[e]} contexte={contexte} position={{ x: 0, y: 0 }} aGauche />))
  const libelles = (hors: boolean) =>
    [...hote.querySelectorAll('button.notak-outil')].filter((b) => !!b.closest('.notak-tiroir') === hors).map((b) => b.querySelector('.notak-outil-libelle')!.textContent)
  return { visibles: libelles(false), rangees: libelles(true) }
}

const COMMUNS = ['Étiquettes', 'Réagir', 'Commenter']

describe('la barre de gauche, type par type (ordre de Milanote)', () => {
  it('note : Couleur, étiquettes, réactions, commentaire', () => {
    expect(listes('note').visibles).toEqual(['Couleur', ...COMMUNS])
  })

  it('lien sans média : Renommer, Légende, Adresse (Aperçu et Infos du lien n’ont rien à montrer)', () => {
    const { visibles, rangees } = listes('lien')
    expect(visibles).toEqual(['Couleur', ...COMMUNS, 'Renommer', 'Légende', 'Adresse'])
    expect(rangees).not.toContain('Ouvrir')
  })

  it('lien à média : Couleur, étiquettes, réactions, commentaire, puis Aperçu, Infos du lien, Renommer, Légende', () => {
    const { visibles } = listes('lien-video')
    expect(visibles).toEqual(['Couleur', ...COMMUNS, 'Aperçu', 'Infos du lien', 'Renommer', 'Légende', 'Adresse'])
  })

  it('image : Dessiner et Légende visibles ; pivoter, recadrer et détourer dans « ••• »', () => {
    const { visibles, rangees } = listes('image')
    expect(visibles).toEqual(['Couleur', ...COMMUNS, 'Dessiner', 'Légende'])
    expect(rangees).toEqual(expect.arrayContaining(['Pivoter', 'Recadrer', 'Détourer']))
  })

  it('fichier : Mode, Renommer, Légende', () => {
    expect(listes('fichier').visibles).toEqual(['Couleur', ...COMMUNS, 'Icône', 'Renommer', 'Légende'])
  })

  it('document : Mode (visible) ; Ouvrir dans « ••• »', () => {
    const { visibles, rangees } = listes('document')
    expect(visibles).toEqual(['Couleur', ...COMMUNS, 'Icône'])
    expect(rangees).toContain('Ouvrir')
  })

  it('colonne : Couleur, Renommer', () => {
    expect(listes('colonne').visibles).toEqual(['Couleur', 'Renommer', ...COMMUNS])
  })

  it('tableau : Couleur, Icône, Renommer ; le modèle dans « ••• »', () => {
    const { visibles } = listes('tableau')
    expect(visibles.slice(0, 3)).toEqual(['Couleur', 'Icône', 'Renommer'])
  })

  it('ligne : Couleur, Début, Fin, Libellé, Pointillé, Épaisseur ; ni points ni ronds', () => {
    const { visibles, rangees } = listes('ligne')
    expect(visibles.slice(0, 6)).toEqual(['Couleur', 'Début', 'Fin', 'Libellé', 'Pointillé', 'Épaisseur'])
    expect(rangees).not.toEqual(expect.arrayContaining(['Points']))
    expect(rangees).not.toEqual(expect.arrayContaining(['Début rond']))
  })

  it('nuancier : Couleur, étiquettes, réactions, commentaire, Affichage', () => {
    expect(listes('nuancier').visibles).toEqual(['Couleur', ...COMMUNS, 'HEX'])
  })

  it('croquis : Couleur, étiquettes, réactions, commentaire, Dessiner', () => {
    expect(listes('croquis').visibles).toEqual(['Couleur', ...COMMUNS, 'Dessiner'])
  })

  it('liste de tâches : Couleur puis Titre', () => {
    expect(listes('taches').visibles.slice(0, 2)).toEqual(['Couleur', 'Titre'])
  })

  it('commentaire : répondre, résoudre et replier dans « ••• »', () => {
    const { visibles, rangees } = listes('commentaire')
    expect(visibles).not.toContain('Répondre')
    expect(rangees).toEqual(expect.arrayContaining(['Répondre', 'Résoudre', 'Replier']))
  })
})
