// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { coller, htmlRiche, type Presse } from './collage'
import { aDuMarkdownEnLigne, blocsDepuisMarkdown, enLigne } from './collageMarkdown'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const p = (text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type: 'paragraph', attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })

function ouvrir(blocs: NoeudTexte[], i = 0, ou: number | 'fin' = 'fin'): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  let pos = 0
  for (let k = 0; k < i; k++) pos += editeur.state.doc.child(k).nodeSize
  const n = editeur.state.doc.child(i)
  editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.create(editeur.state.doc, pos + 1 + (ou === 'fin' ? n.content.size : ou))))
  return editeur
}

const presse = (autre: Partial<Presse>): Presse => ({ texte: '', html: '', notak: '', vscode: '', ...autre })
const lire = (ed: Editor) => ((ed.getJSON() as NoeudTexte).content ?? []).map((n) => `${n.type}${n.attrs?.level ? n.attrs.level : ''}${n.attrs?.retrait ? `>${n.attrs.retrait}` : ''}${n.attrs?.coche ? '✓' : ''}:${(n.content ?? []).map((t) => t.text ?? '↵').join('')}`)

describe('collage : le Markdown devient des blocs à plat', () => {
  it('titres, puces imbriquées, numérotées, tâches, citation, séparateur, code', () => {
    const blocs = blocsDepuisMarkdown(
      ['# Un', '## Deux', '#### Quatre', '- a', '  - a1', '    - a11', '- b', '1. x', '2) y', '- [ ] à faire', '- [x] fait', '> cité', '> suite', '---', '```ts', 'let a = 1', '```', 'fin'].join('\n'),
    )
    const lu = blocs.map((n) => `${n.type}${n.attrs?.level ?? ''}${n.attrs?.retrait ? `>${n.attrs.retrait}` : ''}${n.attrs?.coche ? '✓' : ''}`)
    expect(lu).toEqual(['heading1', 'heading2', 'heading3', 'puce', 'puce>1', 'puce>2', 'puce', 'numero', 'numero', 'tache', 'tache✓', 'citation', 'horizontalRule', 'codeBlock', 'paragraph'])
    expect(blocs.find((n) => n.type === 'codeBlock')).toMatchObject({ attrs: { language: 'ts' }, content: [{ text: 'let a = 1' }] })
    expect(blocs.find((n) => n.type === 'citation')?.content?.map((t) => t.text ?? '↵')).toEqual(['cité', '↵', 'suite'])
  })

  it('l’indentation fixe le rang, par tabulation ou par espaces, et revient en arrière', () => {
    const blocs = blocsDepuisMarkdown('- a\n\t- b\n\t\t- c\n  - d\n- e')
    expect(blocs.map((n) => n.attrs?.retrait ?? 0)).toEqual([0, 1, 2, 1, 0])
  })

  it('une ligne vide sépare sans rien produire ; chaque ligne de texte est un bloc', () => {
    const blocs = blocsDepuisMarkdown('un\n\ndeux\ntrois')
    expect(blocs.map((n) => n.content?.[0]?.text)).toEqual(['un', 'deux', 'trois'])
  })

  it('le Markdown en ligne : gras, italique, barré, code, lien, adresse', () => {
    const marques = (s: string) => enLigne(s).map((n) => `${n.text}:${(n.marks ?? []).map((m) => m.type).join('+')}`)
    expect(marques('un **gras** et *italique* et ~~barré~~ et `code`')).toEqual(['un :', 'gras:bold', ' et :', 'italique:italic', ' et :', 'barré:strike', ' et :', 'code:code'])
    expect(marques('[Notak](https://notak.fr)')).toEqual(['Notak:link'])
    expect(marques('voir https://notak.fr/doc ici')).toEqual(['voir :', 'https://notak.fr/doc:link', ' ici:'])
    expect(marques('**a *b* c**')).toEqual(['a :bold', 'b:bold+italic', ' c:bold'])
    expect(aDuMarkdownEnLigne('rien')).toBe(false)
    expect(aDuMarkdownEnLigne('snake_case_mot')).toBe(false)
  })
})

describe('collage : coller dans l’éditeur', () => {
  it('du Markdown sur plusieurs lignes prend la place d’un texte vide', () => {
    const ed = ouvrir([p('avant'), p('')], 1)
    expect(coller(ed.view, presse({ texte: '# Titre\n- a\n  - b\ntexte' }), false)).toBe(true)
    expect(lire(ed)).toEqual(['paragraph:avant', 'heading1:Titre', 'puce:a', 'puce>1:b', 'paragraph:texte'])
    expect(ed.state.selection.$from.parent.textContent).toBe('texte')
  })

  it('sous un bloc plein, les blocs se posent après lui et ses enfants, à son retrait', () => {
    const ed = ouvrir([{ type: 'puce', content: [{ type: 'text', text: 'a' }] }, p('a1', { retrait: 1 }), p('b')], 0, 1)
    coller(ed.view, presse({ texte: 'x\ny' }), false)
    expect(lire(ed)).toEqual(['puce:a', 'paragraph>1:a1', 'paragraph:x', 'paragraph:y', 'paragraph:b'])
    const ed2 = ouvrir([p('r', { retrait: 0 }), { type: 'puce', attrs: { retrait: 1 }, content: [{ type: 'text', text: 'enfant' }] }], 1)
    coller(ed2.view, presse({ texte: '- x\n  - y' }), false)
    expect(lire(ed2)).toEqual(['paragraph:r', 'puce>1:enfant', 'puce>1:x', 'puce>2:y'])
  })

  it('une adresse seule sur un passage choisi en fait un lien, le texte reste', () => {
    const ed = ouvrir([p('voir ici')], 0, 'fin')
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 6, 9)))
    expect(coller(ed.view, presse({ texte: 'https://notak.fr' }), false)).toBe(true)
    const contenu = ed.getJSON().content?.[0]?.content as NoeudTexte[]
    expect(contenu.map((n) => n.text)).toEqual(['voir ', 'ici'])
    expect(contenu[1]?.marks?.[0]).toMatchObject({ type: 'link', attrs: { href: 'https://notak.fr' } })
  })

  it('une adresse seule au curseur devient un lien à son propre texte', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse({ texte: 'https://notak.fr/x' }), false)
    const contenu = ed.getJSON().content?.[0]?.content as NoeudTexte[]
    expect(contenu[0]).toMatchObject({ text: 'https://notak.fr/x', marks: [{ type: 'link', attrs: { href: 'https://notak.fr/x' } }] })
  })

  it('une ligne en Markdown en ligne garde ses marques', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse({ texte: 'un **gras**' }), false)
    expect((ed.getJSON().content?.[0]?.content as NoeudTexte[]).map((n) => `${n.text}:${n.marks?.[0]?.type ?? ''}`)).toEqual(['un :', 'gras:bold'])
  })

  it('un texte simple est laissé à ProseMirror', () => {
    const ed = ouvrir([p('')])
    expect(coller(ed.view, presse({ texte: 'bonjour' }), false)).toBe(false)
  })

  it('dans un bloc de code, le texte entre tel quel, sans conversion', () => {
    const ed = ouvrir([{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }])
    coller(ed.view, presse({ texte: '# pas un titre\n- ni une puce' }), false)
    expect(lire(ed)).toEqual(['codeBlock:x# pas un titre\n- ni une puce'])
  })

  it('⌘⇧V : texte brut, rien n’est converti', () => {
    const ed = ouvrir([p('')])
    expect(coller(ed.view, presse({ texte: '# Titre\n- a' }), true)).toBe(false)
  })

  it('du code venu d’un éditeur de code, sur plusieurs lignes, devient un bloc de code', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse({ texte: 'const a = 1\nconst b = 2\n', vscode: '{"version":1,"mode":"typescript"}' }), false)
    expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ text: 'const a = 1\nconst b = 2' }] })
  })
})

describe('collage : le HTML devient des blocs à plat', () => {
  const html = (corps: string) => `<meta charset="utf-8">${corps}`

  it('des listes imbriquées de Google Docs ou de Notion rangent les blocs par leur retrait', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse({ html: html('<h2>Titre</h2><ul><li><p>a</p><ul><li>a1</li><li>a2<ul><li>a21</li></ul></li></ul></li><li>b</li></ul><ol><li>un</li><li>deux</li></ol>') }), false)
    expect(lire(ed)).toEqual(['heading2:Titre', 'puce:a', 'puce>1:a1', 'puce>1:a2', 'puce>2:a21', 'puce:b', 'numero:un', 'numero:deux'])
  })

  it('des listes à plat portant leur rang dans aria-level', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse({ html: html('<ul><li aria-level="1">a</li></ul><ul><li aria-level="2">b</li></ul><ul><li aria-level="1">c</li></ul>') }), false)
    expect(lire(ed)).toEqual(['puce:a', 'puce>1:b', 'puce:c'])
  })

  it('les cases à cocher font des tâches, cochées ou non', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse({ html: html('<ul><li><input type="checkbox" checked> fait</li><li><input type="checkbox"> à faire</li></ul>') }), false)
    expect(lire(ed)).toEqual(['tache✓:fait', 'tache: à faire'].map((x) => x.replace(': ', ':')))
  })

  it('une citation, un bloc de code, un séparateur', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse({ html: html('<blockquote><p>cité</p><p>suite</p></blockquote><pre><code>let a</code></pre><hr><p>fin <b>gras</b></p>') }), false)
    expect(lire(ed)).toEqual(['citation:cité↵suite', 'codeBlock:let a', 'horizontalRule:', 'paragraph:fin gras'])
  })

  it('les couleurs d’une page web ne suivent pas', () => {
    const ed = ouvrir([p('')])
    coller(ed.view, presse({ html: html('<h1 style="color: red"><span style="color: red">Titre</span></h1><p>texte</p>') }), false)
    expect(ed.getJSON().content?.[0]?.content?.[0]?.marks).toBeUndefined()
  })

  it('un seul paragraphe, ou un HTML sans mise en forme riche, reste du texte en ligne', () => {
    const ed = ouvrir([p('')])
    expect(coller(ed.view, presse({ html: html('<p>un <b>mot</b></p>'), texte: 'un mot' }), false)).toBe(false)
    expect(htmlRiche('<div><span style="color: red">x</span><br></div>')).toBe(false)
    expect(htmlRiche('<ul><li>x</li></ul>')).toBe(true)
  })
})
