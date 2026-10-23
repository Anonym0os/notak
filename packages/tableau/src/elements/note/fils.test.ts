import { describe, expect, it } from 'vitest'
import type { Commentaire, NoeudTexte } from '../../coeur/tableau'
import { avecFil, filsDuTexte, filsVivants, placerEnMarge, sansPassagesMuets } from './fils'

const marque = (fil: string) => ({ type: 'commentaireTexte', attrs: { fil } })
const texte = (...passages: [string, string?][]): NoeudTexte => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: passages.map(([t, fil]) => ({ type: 'text', text: t, ...(fil ? { marks: [marque(fil)] } : {}) })),
    },
  ],
})
const fil = (...mots: string[]): Commentaire => ({
  type: 'commentaire',
  messages: mots.map((m, i) => ({ id: `m${i}`, auteur: { id: 'a', nom: 'Ana' }, date: i, texte: m })),
})

describe('fils dans le texte', () => {
  it('lit les fils dans l\'ordre, une fois chacun', () => {
    const t = texte(['un ', 'b'], ['deux ', 'a'], ['trois', 'b'])
    expect(filsDuTexte(t)).toEqual(['b', 'a'])
  })

  it('un texte sans marque n\'a aucun fil', () => {
    expect(filsDuTexte(texte(['rien']))).toEqual([])
  })

  it('garde les fils dont le passage reste, jette les autres', () => {
    const fils = { a: fil('x'), b: fil('y') }
    expect(filsVivants(fils, texte(['mot', 'a']))).toEqual({ a: fils.a })
    expect(filsVivants(fils, texte(['mot']))).toBeUndefined()
    expect(filsVivants(undefined, texte(['mot', 'a']))).toBeUndefined()
  })

  it('rend les mêmes fils quand rien ne part', () => {
    const fils = { a: fil('x') }
    expect(filsVivants(fils, texte(['mot', 'a']))).toBe(fils)
  })

  it('pose un fil sans toucher aux autres', () => {
    const fils = { a: fil('x') }
    const apres = avecFil(fils, 'b', fil())
    expect(Object.keys(apres)).toEqual(['a', 'b'])
    expect(fils).toEqual({ a: fil('x') })
  })
})

describe('passages muets', () => {
  it('retire la marque d\'un fil sans message', () => {
    const t = texte(['avant ', 'a'], ['après', 'b'])
    const lu = sansPassagesMuets(t, { a: fil(), b: fil('ok') })
    expect(lu.content![0]!.content![0]!.marks).toBeUndefined()
    expect(lu.content![0]!.content![1]!.marks).toEqual([marque('b')])
  })

  it('retire la marque d\'un fil absent', () => {
    expect(filsDuTexte(sansPassagesMuets(texte(['x', 'zz']), undefined))).toEqual([])
  })

  it('rend le même objet quand rien ne change', () => {
    const t = texte(['x', 'a'])
    expect(sansPassagesMuets(t, { a: fil('ok') })).toBe(t)
  })

  it('garde les autres marques d\'un passage', () => {
    const t: NoeudTexte = { type: 'doc', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, marque('a')] }] }
    expect(sansPassagesMuets(t, { a: fil() }).content![0]!.marks).toEqual([{ type: 'bold' }])
  })
})

describe('marge', () => {
  it('chaque fiche à sa hauteur quand il y a la place', () => {
    expect(placerEnMarge([0, 100], [50, 50])).toEqual([0, 100])
  })

  it('une fiche trop proche passe sous la précédente', () => {
    expect(placerEnMarge([0, 10, 12], [40, 40, 40])).toEqual([0, 48, 96])
  })
})
