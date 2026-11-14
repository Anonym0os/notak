import { describe, expect, it } from 'vitest'
import { nouvelId } from '../coeur/tableau'
import { type ElementLu, type TableauLu, dateDeLId, resumesDuTableau } from './contenu'

const poser = (id: string, contenu: ElementLu['contenu'], champs: Partial<ElementLu> = {}): ElementLu => ({ id, x: 0, y: 0, largeur: 20, contenu, ...champs })
const toile = (elements: ElementLu[]): TableauLu => ({ titre: 'Voyage', elements })

describe('le résumé d’une toile montrée en dossier', () => {
  it('le dit ; une toile ordinaire, non', () => {
    expect(resumesDuTableau({ titre: 'Projets', dossier: true, elements: [] })[0]).toMatchObject({ genre: 'toile', titre: 'Projets', dossier: true })
    expect(resumesDuTableau({ titre: 'Projets', elements: [] })[0]).not.toHaveProperty('dossier')
  })
})

describe('les résumés d’une toile pour la bibliothèque', () => {
  it('une photo : sa légende, son fichier, sa plus petite copie et ses proportions', () => {
    const image = {
      type: 'image',
      fichier: 'f-grande',
      largeurOrigine: 4000,
      hauteurOrigine: 3000,
      legende: '  Le port  ',
      tailles: [
        { largeur: 1600, fichier: 'f-1600' },
        { largeur: 400, fichier: 'f-400' },
        { largeur: 800, fichier: 'f-800' },
      ],
    }
    expect(resumesDuTableau(toile([poser('p', image)]))[1]).toEqual({
      genre: 'image',
      element: 'p',
      titre: 'Le port',
      fichier: 'f-grande',
      petite: 'f-400',
      largeur: 4000,
      hauteur: 3000,
    })
  })

  it('un lien : son titre ou celui de la page, son site, sa description, et l’image qu’on lui a choisie d’abord', () => {
    const apercu = { titre: 'Le Monde', description: 'Actualités', image: 'https://exemple.fr/une.jpg', site: 'Le Monde', favicon: 'https://exemple.fr/f.ico' }
    const [, page, choisie, nue] = resumesDuTableau(
      toile([
        poser('a', { type: 'lien', url: 'https://exemple.fr', statut: 'pret', apercu }),
        poser('b', { type: 'lien', url: 'https://exemple.fr/b', statut: 'pret', apercu, titre: 'À lire', legende: 'pour lundi', image: { fichier: 'f-perso', largeur: 10, hauteur: 10 } }),
        poser('c', { type: 'lien', url: 'https://exemple.fr/c', statut: 'attente' }),
      ]),
    )
    expect(page).toEqual({
      genre: 'lien',
      element: 'a',
      titre: 'Le Monde',
      url: 'https://exemple.fr',
      site: 'Le Monde',
      description: 'Actualités',
      image: 'https://exemple.fr/une.jpg',
      favicon: 'https://exemple.fr/f.ico',
    })
    expect(choisie).toMatchObject({ titre: 'À lire', description: 'pour lundi', fichierImage: 'f-perso' })
    expect(choisie).not.toHaveProperty('image')
    expect(nue).toEqual({ genre: 'lien', element: 'c', titre: '', url: 'https://exemple.fr/c' })
  })

  it('une adresse qui mène à une image est son propre aperçu', () => {
    const [, lien] = resumesDuTableau(toile([poser('a', { type: 'lien', url: 'https://exemple.fr/chat.png', statut: 'pret', apercu: { estImage: true } })]))
    expect(lien).toMatchObject({ genre: 'lien', image: 'https://exemple.fr/chat.png' })
  })

  it('un fichier : son nom donné ou d’origine, son type et sa taille', () => {
    const [, donne, brut] = resumesDuTableau(
      toile([
        poser('a', { type: 'fichier', fichier: 'f1', nom: 'devis-2026.pdf', typeMime: 'application/pdf', taille: 52_000, titre: 'Devis' }),
        poser('b', { type: 'fichier', fichier: 'f2', nom: 'plan.dwg', typeMime: 'application/octet-stream', taille: 9 }),
      ]),
    )
    expect(donne).toEqual({ genre: 'fichier', element: 'a', titre: 'Devis', fichier: 'f1', nom: 'devis-2026.pdf', typeMime: 'application/pdf', taille: 52_000 })
    expect(brut).toMatchObject({ titre: 'plan.dwg', nom: 'plan.dwg' })
  })

  it('rangés dans une colonne ou dans les non triés, ils comptent ; à la corbeille, non', () => {
    const resumes = resumesDuTableau(
      toile([
        poser('col', { type: 'colonne', titre: 'Idées' }),
        poser('dans', { type: 'lien', url: 'https://a.fr', statut: 'pret' }, { parent: 'col', ordre: '1' }),
        poser('attend', { type: 'lien', url: 'https://b.fr', statut: 'pret' }, { nonTrie: 1 }),
        poser('jete', { type: 'lien', url: 'https://c.fr', statut: 'pret' }, { corbeille: 1 }),
      ]),
    )
    expect(resumes.flatMap((r) => (r.genre === 'lien' ? [r.element] : []))).toEqual(['dans', 'attend'])
  })

  it('un élément né d’un identifiant daté dit quand ; celui d’un modèle, non', () => {
    const quand = Date.UTC(2026, 10, 4, 10, 30)
    const id = nouvelId(quand)
    expect(dateDeLId(id)).toBe(quand)
    expect(dateDeLId(crypto.randomUUID())).toBeUndefined()
    expect(dateDeLId('0000000000AAAAAAAAAAAAAAAA')).toBeUndefined()
    const [, page, image] = resumesDuTableau(
      toile([poser(id, { type: 'document', titre: 'Notes', texte: { type: 'doc', content: [] } }), poser(crypto.randomUUID(), { type: 'image', fichier: 'f', largeurOrigine: 1, hauteurOrigine: 1 })]),
    )
    expect(page).toMatchObject({ genre: 'document', cree: quand })
    expect(image).not.toHaveProperty('cree')
  })
})

describe('le plan d’une toile, pour sa vignette', () => {
  const planDe = (elements: ElementLu[]) => {
    const r = resumesDuTableau(toile(elements))[0]!
    return r.genre === 'toile' ? r : null
  }

  it('une photo y porte son fichier (sa plus petite copie d’abord) et la hauteur qu’elle a sur la toile', () => {
    const plan = planDe([
      poser('en-hauteur', { type: 'image', fichier: 'f-portrait', largeurOrigine: 2000, hauteurOrigine: 3000 }),
      poser('petite', { type: 'image', fichier: 'f-grande', largeurOrigine: 4000, hauteurOrigine: 3000, tailles: [{ largeur: 400, fichier: 'f-400' }] }),
      // Couchée d'un quart de tour, recadrée de moitié en largeur, ou dans un cadre libre.
      poser('couchee', { type: 'image', fichier: 'f-c', largeurOrigine: 2000, hauteurOrigine: 1000, rotation: 90 }),
      poser('recadree', { type: 'image', fichier: 'f-r', largeurOrigine: 2000, hauteurOrigine: 1000, recadrage: { x: 0, y: 0, largeur: 0.5, hauteur: 1 } }),
      poser('cadre', { type: 'image', fichier: 'f-k', largeurOrigine: 2000, hauteurOrigine: 1000, rapportCadre: 4 }),
      poser('note', { type: 'note', texte: { type: 'doc', content: [] } }),
    ])!
    expect(plan.boites.map((b) => [b[3], b[7]])).toEqual([
      [30, 'f-portrait'],
      [15, 'f-400'],
      [40, 'f-c'],
      [20, 'f-r'],
      [5, 'f-k'],
      [7, undefined],
    ])
  })

  it('un dessin a la hauteur de ses traits, pas celle d’une note', () => {
    const plan = planDe([poser('d', { type: 'dessin', traits: [], largeurOrigine: 40, hauteurOrigine: 10 })])!
    expect(plan.boites[0]!.slice(2, 6)).toEqual([20, 5, '', 'dessin'])
  })

  it('ce qui attend dans les non triés se compte : une toile sans rien de posé n’est pas forcément vide', () => {
    const plan = planDe([
      poser('a', { type: 'image', fichier: 'f', largeurOrigine: 1, hauteurOrigine: 1 }, { nonTrie: 1 }),
      poser('b', { type: 'note', texte: { type: 'doc', content: [] } }, { nonTrie: 2 }),
      poser('c', { type: 'note', texte: { type: 'doc', content: [] } }, { nonTrie: 3, corbeille: 4 }),
    ])!
    expect(plan.boites).toEqual([])
    expect(plan.nonTries).toBe(2)
    expect(planDe([])).not.toHaveProperty('nonTries')
  })
})
