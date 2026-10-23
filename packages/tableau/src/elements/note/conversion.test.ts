// @vitest-environment jsdom
import { generateJSON } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import { type NoeudTexte, docDepuisTexte } from '../../coeur/tableau'
import { adresseSeule, adressesEnLiens, caseSeule, collageEnTaches, contientDuTexte, couleurSeule, decouperAdresses, lireCouleur, tachesDepuisTexte, docDepuisCollage, docEstVide, normaliserUrl, sansCouleursCollees } from './conversion'
import { EXTENSIONS_NOTE } from './extensions'
import { ICONES_ENCADRE, ICONE_ENCADRE_DEFAUT, iconeSuivante } from './noeuds'

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

describe('decouperAdresses', () => {
  it('repère une adresse avec protocole, www ou extension connue', () => {
    expect(decouperAdresses('voir https://a.fr/x, puis www.b.com et c.io.')).toEqual([
      { texte: 'voir ' },
      { texte: 'https://a.fr/x', url: 'https://a.fr/x' },
      { texte: ', puis ' },
      { texte: 'www.b.com', url: 'https://www.b.com' },
      { texte: ' et ' },
      { texte: 'c.io', url: 'https://c.io' },
      { texte: '.' },
    ])
  })
  it('laisse tel quel un nom de fichier ou un mot ordinaire', () => {
    expect(decouperAdresses('node.js et notes.txt')).toEqual([{ texte: 'node.js et notes.txt' }])
  })
})

describe('adressesEnLiens', () => {
  it('coupe le texte et pose un lien sur l\'adresse, en gardant les marques', () => {
    const gras = [{ type: 'bold' }]
    expect(adressesEnLiens(doc({ type: 'paragraph', content: [{ type: 'text', text: 'va sur a.fr', marks: gras }] }))).toEqual(
      doc({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'va sur ', marks: gras },
          { type: 'text', text: 'a.fr', marks: [...gras, { type: 'link', attrs: { href: 'https://a.fr' } }] },
        ],
      }),
    )
  })
  it('ne touche ni un lien existant ni le code', () => {
    const d = doc({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'a.fr', marks: [{ type: 'link', attrs: { href: 'https://x.fr' } }] },
        { type: 'text', text: 'b.fr', marks: [{ type: 'code' }] },
      ],
    })
    expect(adressesEnLiens(d)).toEqual(d)
  })
})

describe('tachesDepuisTexte', () => {
  const tache = (t: string, checked: boolean): NoeudTexte => ({
    type: 'taskItem',
    attrs: { checked },
    content: [{ type: 'paragraph', ...(t ? { content: [{ type: 'text', text: t }] } : {}) }],
  })
  it('fait une liste de tâches de lignes à cases', () => {
    expect(tachesDepuisTexte('- [ ] lait\n[x] pain\r\n☑ thé\n\n☐ ')).toEqual(
      doc({ type: 'taskList', content: [tache('lait', false), tache('pain', true), tache('thé', true), tache('', false)] }),
    )
  })
  it('refuse dès qu\'une ligne n\'est pas une case, ou s\'il n\'y a rien', () => {
    expect(tachesDepuisTexte('[ ] a\nb')).toBeNull()
    expect(tachesDepuisTexte('- a\n- b')).toBeNull()
    expect(tachesDepuisTexte('  \n')).toBeNull()
  })
})

describe('collage dans la note', () => {
  it('un tableau HTML devient une table, la ligne d\'en-tête en têtes', () => {
    const d = docDepuisCollage(
      { html: '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>', texte: '' },
      (html) => generateJSON(html, EXTENSIONS_NOTE) as NoeudTexte,
    )
    expect(d?.content?.[0]?.type).toBe('table')
    const lignes = d!.content![0]!.content!
    expect(lignes.map((l) => l.content!.map((c) => c.type))).toEqual([['enteteTable', 'enteteTable'], ['celluleTable', 'celluleTable']])
  })
})

describe('encadré', () => {
  it('se relit depuis le HTML avec son icône', () => {
    const d = generateJSON('<div data-type="encadre" data-icone="⚠️"><p>x</p></div>', EXTENSIONS_NOTE)
    expect(d.content[0]).toMatchObject({ type: 'encadre', attrs: { icone: '⚠️' } })
  })
  it('un encadré neuf porte l\'avertissement', () => {
    const d = generateJSON('<div data-type="encadre"><p>x</p></div>', EXTENSIONS_NOTE)
    expect(d.content[0]).toMatchObject({ type: 'encadre', attrs: { icone: ICONE_ENCADRE_DEFAUT } })
    expect(ICONE_ENCADRE_DEFAUT).toBe('⚠️')
  })
  it('l\'icône suivante fait le tour', () => {
    expect(iconeSuivante('💡')).toBe('ℹ️')
    expect(iconeSuivante(ICONES_ENCADRE.at(-1)!)).toBe('💡')
  })
})

describe('un code couleur seul', () => {
  it('lit hexadécimal, rgb et hsl', () => {
    expect(lireCouleur('#3a76df')).toEqual({ couleur: '#3a76df', format: 'hex' })
    expect(lireCouleur('#ABC')).toEqual({ couleur: '#aabbcc', format: 'hex' })
    expect(lireCouleur('#aabbcc80')).toEqual({ couleur: '#aabbcc', format: 'hex' })
    expect(lireCouleur('rgb(79, 140, 255)')).toEqual({ couleur: '#4f8cff', format: 'rgb' })
    expect(lireCouleur('rgba(79 140 255 / 0.5)')).toEqual({ couleur: '#4f8cff', format: 'rgb' })
    expect(lireCouleur('hsl(0, 100%, 50%)')).toEqual({ couleur: '#ff0000', format: 'hsl' })
    expect(lireCouleur('hsl(219, 100%, 65%)')?.couleur).toBe('#4d8bff')
  })

  it('refuse ce qui n\'en est pas un', () => {
    for (const t of ['cafe', 'add', '#abcde', 'rgb(300, 0, 0)', 'hsl(10, 120%, 50%)', 'bonjour #fff', '']) expect(lireCouleur(t)).toBeNull()
  })

  it('une note qui n\'est que cela devient un nuancier, pas une note avec un mot de plus', () => {
    expect(couleurSeule(docDepuisTexte('#fff'))?.couleur).toBe('#ffffff')
    expect(couleurSeule(docDepuisTexte('#fff et du texte'))).toBeNull()
    expect(couleurSeule(docDepuisTexte('#fff\n#000'))).toBeNull()
  })
})

describe('des tâches collées dans une note', () => {
  it('une note vide devient la liste de ces tâches', () => {
    const taches = collageEnTaches(aucun(), '☐ pain\n☑ lait')
    expect(taches?.content?.[0]?.type).toBe('taskList')
    expect(taches?.content?.[0]?.content).toHaveLength(2)
  })

  it('une note qui a déjà du texte, ou un texte sans cases, ne change pas', () => {
    expect(collageEnTaches(doc(paragraphe('déjà')), '☐ pain')).toBeNull()
    expect(collageEnTaches(aucun(), 'du texte simple')).toBeNull()
  })
})
