// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { coller } from './collage'
import { MIME_NOTAK, copiable, inlineHtml, inlineMarkdown, versHtml, versMarkdown } from './copie'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'
import { CLE_CHOIX, choisir } from './selection'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const t = (text: string, marks: NoeudTexte['marks'] = []): NoeudTexte => ({ type: 'text', text, ...(marks.length ? { marks } : {}) })
const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [t(text)] } : {}) })

const PAGE: NoeudTexte[] = [
  b('heading', 'Titre', { level: 2 }),
  b('puce', 'a'),
  b('puce', 'a1', { retrait: 1 }),
  b('puce', 'b'),
  b('numero', 'un'),
  b('numero', 'deux'),
  b('tache', 'fait', { coche: true }),
  b('tache', 'à faire'),
  b('citation', 'cité'),
  { type: 'codeBlock', attrs: { language: 'ts' }, content: [t('let a = 1')] },
  { type: 'horizontalRule' },
  { type: 'paragraph', content: [t('un '), t('gras', [{ type: 'bold' }]), t(' et '), t('lien', [{ type: 'link', attrs: { href: 'https://notak.fr' } }])] },
]

function ouvrir(blocs: NoeudTexte[]): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  return editeur
}

describe('copie : le Markdown lisible du presse-papiers', () => {
  it('titres, listes indentées, numérotées, tâches, citation, code, séparateur, marques', () => {
    expect(versMarkdown(PAGE)).toBe(
      [
        '## Titre',
        '',
        '- a\n    - a1\n- b',
        '',
        '1. un\n2. deux',
        '',
        '- [x] fait\n- [ ] à faire',
        '',
        '> cité',
        '',
        '```ts\nlet a = 1\n```',
        '',
        '---',
        '',
        'un **gras** et [lien](https://notak.fr)',
      ]
        .join('\n'),
    )
  })

  it('une adresse dont le texte est l’adresse s’écrit seule', () => {
    expect(inlineMarkdown([t('https://a.fr', [{ type: 'link', attrs: { href: 'https://a.fr' } }])])).toBe('https://a.fr')
  })

  it('ce que le Markdown copié redonne en collant est la même structure', () => {
    const ed = ouvrir([{ type: 'paragraph' }])
    coller(ed.view, { texte: versMarkdown(PAGE.slice(0, 9)), html: '', notak: '', vscode: '' }, false)
    expect((ed.getJSON().content ?? []).map((n) => `${n.type}${n.attrs?.retrait ? `>${n.attrs.retrait}` : ''}`)).toEqual(['heading', 'puce', 'puce>1', 'puce', 'numero', 'numero', 'tache', 'tache', 'citation'])
  })
})

describe('copie : le HTML propre', () => {
  it('h2, listes imbriquées, listes numérotées, cases, blockquote, pre, hr', () => {
    expect(versHtml(PAGE)).toBe(
      '<h2>Titre</h2>' +
        '<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>' +
        '<ol><li>un</li><li>deux</li></ol>' +
        '<ul><li><input type="checkbox" disabled checked> fait</li><li><input type="checkbox" disabled> à faire</li></ul>' +
        '<blockquote><p>cité</p></blockquote>' +
        '<pre><code class="language-ts">let a = 1</code></pre>' +
        '<hr>' +
        '<p>un <strong>gras</strong> et <a href="https://notak.fr">lien</a></p>',
    )
  })

  it('le texte est échappé', () => {
    expect(inlineHtml([t('a < b & "c"')])).toBe('a &lt; b &amp; &quot;c&quot;')
  })
})

describe('copie : ce que la sélection pose', () => {
  it('plusieurs blocs : Markdown, HTML et le type de Notak ; un seul bloc : la copie de ProseMirror', () => {
    const ed = ouvrir([b('puce', 'un'), b('puce', 'deux'), b('paragraph', 'trois')])
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 2, 12)))
    const copie = copiable(ed.view)!
    expect(copie.texte).toBe('- n\n- deux\n\nt')
    expect(copie.html).toContain('<ul>')
    expect(JSON.parse(copie.notak).content).toHaveLength(3)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 2, 3)))
    expect(copiable(ed.view)).toBeNull()
  })

  it('un tableau, des colonnes, une image : la copie reste à ProseMirror', () => {
    const ed = ouvrir([{ type: 'paragraph' }, { type: 'image', attrs: { fichier: 'f' } }, { type: 'paragraph' }])
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, ed.state.doc.content.size - 1)))
    expect(copiable(ed.view)).toBeNull()
  })

  it('des blocs choisis se copient entiers, avec leurs enfants, et se recollent à l’identique avec des ids neufs', () => {
    const ed = ouvrir([b('puce', 'a', { couleur: 'rouge' }), b('puce', 'a1', { retrait: 1 }), b('paragraph', 'fin')])
    const id = ed.state.doc.child(0).attrs.id as string
    ed.view.dispatch(choisir(ed.state, { ancre: id, tete: id }))
    expect(CLE_CHOIX.getState(ed.state)).not.toBeNull()
    const copie = copiable(ed.view)!
    expect(copie.texte).toBe('- a\n    - a1')
    // Recoller sous « fin ».
    ed.view.dispatch(ed.state.tr.setMeta(CLE_CHOIX, null).setSelection(TextSelection.atEnd(ed.state.doc)))
    expect(coller(ed.view, { texte: copie.texte, html: copie.html, notak: copie.notak, vscode: '' }, false)).toBe(true)
    const blocs = ed.getJSON().content ?? []
    expect(blocs.map((n) => `${n.type}${n.attrs?.retrait ? `>${n.attrs.retrait}` : ''}`)).toEqual(['puce', 'puce>1', 'paragraph', 'puce', 'puce>1'])
    expect(blocs[3]?.attrs?.couleur).toBe('rouge')
    expect(blocs[3]?.attrs?.id).toBeTruthy()
    expect(blocs[3]?.attrs?.id).not.toBe(blocs[0]?.attrs?.id)
  })

  it('copier pose les trois types dans le presse-papiers ; couper retire les blocs', () => {
    const ed = ouvrir([b('puce', 'un'), b('puce', 'deux')])
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 2, 9)))
    const posees: Record<string, string> = {}
    const evenement = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'clipboardData', { value: { clearData: () => undefined, setData: (k: string, v: string) => (posees[k] = v) } })
      return e
    }
    const copie = evenement('copy')
    ed.view.dom.dispatchEvent(copie)
    expect(copie.defaultPrevented).toBe(true)
    expect(Object.keys(posees).sort()).toEqual(['application/x-notak-blocs', 'text/html', 'text/plain'].sort())
    expect(posees[MIME_NOTAK]).toContain('"puce"')
    ed.view.dom.dispatchEvent(evenement('cut'))
    expect(ed.state.doc.textContent).toBe('u')
  })
})
