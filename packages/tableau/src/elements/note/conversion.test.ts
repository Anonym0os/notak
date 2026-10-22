// @vitest-environment jsdom
import { generateJSON } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import { type NoeudTexte, docDepuisTexte } from '../../coeur/tableau'
import { adresseSeule, caseSeule, contientDuTexte, docDepuisCollage, docEstVide, normaliserUrl, sansCouleursCollees } from './conversion'
import { EXTENSIONS_NOTE } from './extensions'

const paragraphe = (texte?: string): NoeudTexte => ({ type: 'paragraph', ...(texte ? { content: [{ type: 'text', text: texte }] } : {}) })
const doc = (...content: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content })
const aucun = () => doc(paragraphe())

describe('docDepuisTexte', () => {
  it('fait un paragraphe par ligne, les lignes vides restent vides', () => {
    expect(docDepuisTexte('a\n\nb')).toEqual(doc(paragraphe('a'), paragraphe(), paragraphe('b')))
  })
})

describe('docEstVide', () => {
  it('ne reconnaît qu\'un seul bloc de texte sans rien dedans', () => {
    expect(docEstVide(doc(paragraphe()))).toBe(true)
    expect(docEstVide(doc({ type: 'heading', attrs: { level: 1 } }))).toBe(true)
    expect(docEstVide(doc(paragraphe('a')))).toBe(false)
    expect(docEstVide(doc(paragraphe(), paragraphe()))).toBe(false)
    expect(docEstVide(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [paragraphe()] }] }))).toBe(false)
  })
})

describe('docDepuisCollage', () => {
  it('prend le HTML quand il porte du texte', () => {
    const html = doc(paragraphe('gras'))
    expect(docDepuisCollage({ html: '<p>x</p>', texte: 'x' }, () => html)).toEqual(html)
  })

  it('retombe sur le texte brut quand le HTML ne porte rien', () => {
    expect(docDepuisCollage({ html: '<img src="a">', texte: 'a\nb' }, aucun)).toEqual(docDepuisTexte('a\nb'))
    expect(docDepuisCollage({ html: '', texte: 'a\r\nb\n' }, aucun)).toEqual(docDepuisTexte('a\nb'))
  })

  it('ne rend rien quand il n\'y a rien à garder', () => {
    expect(docDepuisCollage({ html: '', texte: '  \n' }, aucun)).toBeNull()
  })

  it('contientDuTexte ignore les espaces', () => {
    expect(contientDuTexte(doc(paragraphe(' ')))).toBe(false)
    expect(contientDuTexte(doc(paragraphe('a')))).toBe(true)
  })
})

describe('sansCouleursCollees', () => {
  it('retire les couleurs venues d\'ailleurs et garde le reste', () => {
    const colle = doc({
      type: 'paragraph',
      content: [{ type: 'text', text: 'a', marks: [{ type: 'textStyle', attrs: { color: 'red' } }, { type: 'bold' }] }],
    })
    expect(sansCouleursCollees(colle).content![0]!.content![0]!.marks).toEqual([{ type: 'bold' }])
  })
})

describe('HTML collé', () => {
  it('garde titres, gras et listes, et laisse tomber ce qu\'il ne connaît pas', () => {
    const json = generateJSON('<h1>T</h1><h2>x</h2><p>a <strong>b</strong></p><ul><li>c</li></ul><table><tr><td>z</td></tr></table>', EXTENSIONS_NOTE) as NoeudTexte
    const types = json.content!.map((n) => n.type)
    expect(types.slice(0, 2)).toEqual(['heading', 'heading'])
    expect(json.content![0]!.attrs).toMatchObject({ level: 1 })
    expect(json.content![1]!.attrs).toMatchObject({ level: 2 })
    expect(types).toContain('bulletList')
    expect(JSON.stringify(json)).toContain('"bold"')
  })
})

describe('normaliserUrl', () => {
  it('ajoute https quand il manque et laisse les protocoles', () => {
    expect(normaliserUrl(' silak.fr ')).toBe('https://silak.fr')
    expect(normaliserUrl('mailto:a@b.fr')).toBe('mailto:a@b.fr')
    expect(normaliserUrl('http://x.fr')).toBe('http://x.fr')
    expect(normaliserUrl('  ')).toBe('')
  })
})

describe('conversions en tapant', () => {
  const doc = (texte: string) => docDepuisTexte(texte)
  it('une note qui n’est qu’une adresse devient un lien', () => {
    expect(adresseSeule(doc('notak.fr'))).toBe('https://notak.fr')
    expect(adresseSeule(doc('voir notak.fr'))).toBeNull()
    expect(adresseSeule(doc('notak.fr\nautre'))).toBeNull()
    expect(adresseSeule(doc('ana@notak.fr'))).toBeNull()
  })
  it('une adresse en code reste du texte', () => {
    const code = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'notak.fr', marks: [{ type: 'code' }] }] }] }
    expect(adresseSeule(code)).toBeNull()
  })
  it('une case seule devient une tâche, cochée avec x', () => {
    expect(caseSeule(doc('[] '))).toBe(false)
    expect(caseSeule(doc('[ ] '))).toBe(false)
    expect(caseSeule(doc('[x] '))).toBe(true)
    expect(caseSeule(doc('[] lait'))).toBeNull()
  })
})
