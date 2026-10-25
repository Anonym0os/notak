// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { Bulle } from './Bulle'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let editeur: Editor | null = null
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  editeur?.destroy()
  editeur = null
  hote.remove()
})

const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })
const attendre = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

/** Un éditeur et une bulle ; jsdom ne mesure rien : on donne une ligne de 19 px à `coordsAtPos`. */
async function monter(blocs: NoeudTexte[], de: number, a: number): Promise<Editor> {
  const ed = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs } })
  editeur = ed
  const ids = poserIds(ed.state)
  if (ids) ed.view.dispatch(ids)
  ed.view.hasFocus = () => true
  ed.view.coordsAtPos = () => ({ left: 100, right: 100, top: 200, bottom: 219 })
  await act(async () => {
    racine.render(<Bulle editeur={ed} surCouleur={() => {}} commenter={() => {}} menuBloc={() => {}} />)
  })
  await act(async () => void ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, de, a))))
  return ed
}

describe('NOTION.md § 4 : la bulle', () => {
  it('paraît 200 ms après la sélection, pas avant', async () => {
    await monter([b('paragraph', 'Bonjour le monde')], 1, 8)
    expect(document.querySelector('.notak-bulle')).toBeNull()
    await attendre(260)
    expect(document.querySelector('.notak-bulle')).not.toBeNull()
  })

  it('le nom du type du bloc, puis la couleur, B I U, effacer le format ; le lien, S, code, « … » ; commenter', async () => {
    await monter([b('heading', 'Un titre long', { level: 1 })], 1, 6)
    await attendre(260)
    const bulle = document.querySelector('.notak-bulle')!
    expect(bulle.querySelector('.notak-bulle-type-nom')?.textContent).toBe('Titre 1')
    const rangees = [...bulle.querySelectorAll('.notak-bulle-rangee')].map((r) => [...r.querySelectorAll('button')].map((x) => x.getAttribute('aria-label')))
    expect(rangees).toEqual([
      ['Couleur', 'Gras', 'Italique', 'Souligné', 'Effacer le format'],
      ['Lien', 'Barré', 'Code', 'Plus d’actions'],
    ])
    expect(bulle.querySelector('.notak-bulle-commenter')?.textContent).toBe('Commenter')
  })

  it('un paragraphe s’appelle « Texte normal »', async () => {
    await monter([b('paragraph', 'Bonjour')], 1, 4)
    await attendre(260)
    expect(document.querySelector('.notak-bulle-type-nom')?.textContent).toBe('Texte normal')
  })

  it('une sélection sur plusieurs blocs n’a ni type ni lien', async () => {
    await monter([b('paragraph', 'Bonjour'), b('paragraph', 'monde')], 3, 12)
    await attendre(260)
    const bulle = document.querySelector('.notak-bulle')!
    expect(bulle.querySelector('.notak-bulle-type')).toBeNull()
    expect(bulle.querySelector('[aria-label="Lien"]')).toBeNull()
    expect(bulle.querySelector('[aria-label="Gras"]')).not.toBeNull()
  })

  it('une sélection qui grandit au clavier ne déplace pas la bulle', async () => {
    const ed = await monter([b('paragraph', 'Bonjour le monde')], 1, 4)
    await attendre(260)
    const panneau = document.querySelector<HTMLElement>('.notak-bulle-panneau')!
    const avant = [panneau.style.left, panneau.style.top]
    ed.view.coordsAtPos = () => ({ left: 400, right: 400, top: 300, bottom: 319 })
    await act(async () => void ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 12))))
    await attendre(260)
    expect(document.querySelector<HTMLElement>('.notak-bulle-panneau')).not.toBeNull()
    expect([panneau.style.left, panneau.style.top]).toEqual(avant)
  })

  it('dans du code, ne porte que « Commenter » (rien ne s’y met en forme)', async () => {
    await monter([b('codeBlock', 'let x = 1')], 1, 4)
    await attendre(260)
    const bulle = document.querySelector('.notak-bulle')!
    expect(bulle.querySelector('.notak-bulle-commenter')).not.toBeNull()
    expect(bulle.querySelectorAll('.notak-bulle-bouton, .notak-bulle-type')).toHaveLength(0)
  })

  it('se cache 200 ms après que la sélection est vidée', async () => {
    const ed = await monter([b('paragraph', 'Bonjour')], 1, 4)
    await attendre(260)
    await act(async () => void ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 2))))
    expect(document.querySelector('.notak-bulle')).not.toBeNull()
    await attendre(260)
    expect(document.querySelector('.notak-bulle')).toBeNull()
  })
})

describe('NOTION.md § 5 : l’éditeur de lien de la bulle', () => {
  it('⌘K l’ouvre sur la sélection ; Entrée pose le lien ; le texte garde sa sélection', async () => {
    const ed = await monter([b('paragraph', 'Bonjour le monde')], 1, 8)
    await act(async () => void ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })))
    const champ = document.querySelector<HTMLInputElement>('.notak-bulle-lien-champ')!
    expect(champ).not.toBeNull()
    expect(document.querySelector('.notak-bulle')).toBeNull()
    const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      poser.call(champ, 'exemple.fr')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(document.querySelector('.notak-bulle-lien .notak-menu-blocs-nom')?.textContent).toBe('Lien vers l’adresse')
    await act(async () => void champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    expect(document.querySelector('.notak-bulle-lien')).toBeNull()
    const morceaux = (ed.getJSON().content?.[0]?.content ?? []) as { text?: string; marks?: { type: string; attrs?: { href?: string } }[] }[]
    const lien = morceaux.find((n) => n.marks?.some((m) => m.type === 'link'))
    expect(lien?.text).toBe('Bonjour')
    expect(lien?.marks?.[0]?.attrs?.href).toBe('https://exemple.fr')
  })

  it('une saisie qui n’est pas une adresse ne pose rien ; « supprimer le lien » retire celui qui existe', async () => {
    const ed = await monter([{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour', marks: [{ type: 'link', attrs: { href: 'https://a.fr' } }] }] }], 1, 8)
    await act(async () => void ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })))
    const champ = document.querySelector<HTMLInputElement>('.notak-bulle-lien-champ')!
    expect(champ.value).toBe('https://a.fr')
    const retirer = [...document.querySelectorAll<HTMLElement>('.notak-bulle-lien .notak-menu-blocs-entree')].find((x) => x.textContent?.includes('Supprimer le lien'))!
    await act(async () => void retirer.click())
    expect(JSON.stringify(ed.getJSON())).not.toContain('"link"')
  })
})
