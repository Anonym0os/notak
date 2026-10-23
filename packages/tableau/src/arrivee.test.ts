import { describe, expect, it } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { type Note, nonTriesDe, texteBrut } from './coeur/tableau'
import { adresseWeb, decomposerArrivee, elementsArrives, elementsDeTexte, poserDansNonTries } from './arrivee'

describe('adresseWeb', () => {
  it('reconnaît une adresse http ou https seule', () => {
    expect(adresseWeb('https://exemple.fr/a?b=1')).toBe('https://exemple.fr/a?b=1')
    expect(adresseWeb('  http://exemple.fr  ')).toBe('http://exemple.fr')
  })
  it('refuse le reste', () => {
    for (const v of [undefined, '', 'exemple.fr', 'javascript:alert(1)', 'https://a b.fr', 'texte https://a.fr', 'ftp://a.fr']) expect(adresseWeb(v)).toBeNull()
  })
})

describe('decomposerArrivee', () => {
  it('une adresse donnée à part fait un lien, sans recopier le titre', () => {
    expect(decomposerArrivee({ titre: 'Une page', adresse: 'https://exemple.fr/p' })).toEqual([{ genre: 'lien', url: 'https://exemple.fr/p' }])
  })
  it('une adresse seule dans le texte (le cas courant) fait un lien', () => {
    expect(decomposerArrivee({ titre: 'Une page', texte: 'https://exemple.fr/p' })).toEqual([{ genre: 'lien', url: 'https://exemple.fr/p' }])
  })
  it('le texte autour de l’adresse devient une note', () => {
    expect(decomposerArrivee({ texte: 'À lire demain https://exemple.fr/p merci' })).toEqual([
      { genre: 'lien', url: 'https://exemple.fr/p' },
      { genre: 'note', texte: 'À lire demain  merci' },
    ])
  })
  it('l’adresse répétée dans le texte ne fait pas de note en plus', () => {
    expect(decomposerArrivee({ texte: 'https://exemple.fr/p', adresse: 'https://exemple.fr/p' })).toHaveLength(1)
  })
  it('sans adresse, le titre et le texte font une note', () => {
    expect(decomposerArrivee({ titre: 'Courses', texte: 'Lait, pain' })).toEqual([{ genre: 'note', texte: 'Courses\nLait, pain' }])
    expect(decomposerArrivee({ texte: 'Juste une idée' })).toEqual([{ genre: 'note', texte: 'Juste une idée' }])
  })
  it('ne double pas un texte qui répète le titre', () => {
    expect(decomposerArrivee({ titre: 'Idée', texte: 'Idée' })).toEqual([{ genre: 'note', texte: 'Idée' }])
  })
  it('ne fait rien d’un partage vide', () => {
    expect(decomposerArrivee({})).toEqual([])
    expect(decomposerArrivee({ titre: '  ', texte: '\n' })).toEqual([])
  })
})

describe('elementsDeTexte et poserDansNonTries', () => {
  it('les éléments sont datés pour les non triés, dans l’ordre d’arrivée', () => {
    const els = elementsDeTexte({ texte: 'Voir https://exemple.fr' }, 1000)
    expect(els.map((e) => [e.contenu.type, e.nonTrie])).toEqual([['lien', 1000], ['note', 1001]])
    expect(els[0]!.contenu).toMatchObject({ url: 'https://exemple.fr', statut: 'attente' })
    expect(texteBrut((els[1]!.contenu as Note).texte)).toBe('Voir')
  })
  it('se posent dans les non triés du tableau, en un pas d’historique', () => {
    const m = creerMagasin({ titre: 'Accueil', elements: [] })
    poserDansNonTries(m, elementsDeTexte({ texte: 'un', titre: 'deux' }, 5))
    expect(nonTriesDe(m.lire())).toHaveLength(1)
    expect(m.annuler()).toBe(true)
    expect(m.lire().elements).toHaveLength(0)
  })
  it('ne pose rien quand il n’y a rien', () => {
    const m = creerMagasin({ titre: 'Accueil', elements: [] })
    poserDansNonTries(m, [])
    expect(m.annuler()).toBe(false)
  })
})

describe('elementsArrives', () => {
  it('compte les images qu’on ne sait pas prendre', async () => {
    const mauvais = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    const r = await elementsArrives({ texte: 'bonjour', fichiers: [mauvais] }, { enregistrer: async () => 'x', adresse: async () => null }, 1)
    expect(r.elements).toHaveLength(1)
    expect(r.ignores).toBe(1)
  })
  it('laisse les images sans dépôt de fichiers', async () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    expect((await elementsArrives({ fichiers: [png] }, undefined, 1)).ignores).toBe(1)
  })
})
