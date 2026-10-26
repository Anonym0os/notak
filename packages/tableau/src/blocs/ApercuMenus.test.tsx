// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { act, createRef } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { MenuBlocs, type PontMenu, extensionSlash } from './Menu'
import { coller } from './collage'
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

const p = (text: string): NoeudTexte => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) })

async function monter(blocs: NoeudTexte[]): Promise<Editor> {
  const pont = createRef<PontMenu | null>() as { current: PontMenu | null }
  const ed = new Editor({ extensions: [...EXTENSIONS_BLOCS, extensionSlash(pont)], content: { type: 'doc', content: blocs } })
  editeur = ed
  const ids = poserIds(ed.state)
  if (ids) ed.view.dispatch(ids)
  ed.view.hasFocus = () => true
  ed.view.coordsAtPos = (pos) => ({ left: 100 + pos * 7, right: 100 + pos * 7, top: 200, bottom: 219 })
  await act(async () => {
    racine.render(<MenuBlocs editeur={ed} pont={pont} demande={null} surCouleur={() => {}} copierLien={() => {}} commenterBloc={() => {}} choisirImage={() => {}} />)
  })
  await act(async () => void ed.view.dispatch(ed.state.tr.setSelection(TextSelection.atEnd(ed.state.doc))))
  return ed
}
const taper = (ed: Editor, texte: string) => act(async () => void ed.commands.insertContent(texte))
const touche = (ed: Editor, key: string) => act(async () => void ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
const types = (ed: Editor) => ((ed.getJSON() as NoeudTexte).content ?? []).map((n) => n.type)
const URL1 = 'https://notak.fr/docs'
const champ = () => document.querySelector<HTMLInputElement>('.notak-apercu-champ input')
const saisir = (valeur: string) =>
  act(async () => {
    const c = champ()!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(c, valeur)
    c.dispatchEvent(new Event('input', { bubbles: true }))
  })
const toucheChamp = (key: string) => act(async () => void champ()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
const lignes = () => [...document.querySelectorAll('.notak-apercu-coller [role="option"]')].map((x) => `${x.textContent}${x.hasAttribute('data-actif') ? '*' : ''}`)

describe('NOTION.md § 2.2 : « Aperçu de lien web » dans le menu « / »', () => {
  it('l’entrée est dans la section média ; choisie, elle ouvre le champ « Collez le lien… » sous le bloc', async () => {
    const ed = await monter([p('')])
    await taper(ed, '/')
    const entrees = [...document.querySelectorAll('.notak-menu-blocs [role="option"]')].map((x) => x.textContent)
    expect(entrees.indexOf('Aperçu de lien web')).toBeGreaterThan(entrees.indexOf('Image'))
    await taper(ed, 'miniature')
    await touche(ed, 'Enter')
    expect(document.querySelector('.notak-menu-blocs[data-genre="slash"]')).toBeNull()
    expect(ed.state.doc.textContent).toBe('')
    expect(champ()?.placeholder).toBe('Collez le lien…')
    expect(document.querySelector('.notak-apercu-creer')?.textContent).toBe('Créer l’aperçu')
  })

  it('Entrée pose la carte à la place du bloc vide et ferme le champ', async () => {
    const ed = await monter([p('')])
    await taper(ed, '/bookmark')
    await touche(ed, 'Enter')
    await saisir('notak.fr/docs')
    await toucheChamp('Enter')
    expect(types(ed)).toEqual(['apercuLien', 'paragraph'])
    expect(ed.state.doc.child(0).attrs.url).toBe('https://notak.fr/docs')
    expect(champ()).toBeNull()
  })

  it('le bouton « Créer l’aperçu » fait de même ; sans adresse valable, rien ne se pose et le champ le dit', async () => {
    const ed = await monter([p('un texte')])
    await taper(ed, ' /miniature')
    await touche(ed, 'Enter')
    await saisir('bonjour')
    await act(async () => void document.querySelector<HTMLElement>('.notak-apercu-creer')!.click())
    expect(types(ed)).toEqual(['paragraph'])
    expect(champ()?.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('.notak-apercu-erreur')?.textContent).toBe('Saisissez une adresse complète')
    await saisir(URL1)
    await act(async () => void document.querySelector<HTMLElement>('.notak-apercu-creer')!.click())
    // Le bloc avait du texte : la carte vient dessous.
    expect(types(ed)).toEqual(['paragraph', 'apercuLien', 'paragraph'])
    expect(ed.state.doc.child(0).textContent).toBe('un texte ')
  })

  it('Échap annule, le bloc reste vide ; un clic dehors aussi', async () => {
    const ed = await monter([p('')])
    await taper(ed, '/miniature')
    await touche(ed, 'Enter')
    await toucheChamp('Escape')
    expect(champ()).toBeNull()
    expect(types(ed)).toEqual(['paragraph'])
    await taper(ed, '/miniature')
    await touche(ed, 'Enter')
    expect(champ()).not.toBeNull()
    await act(async () => void document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(champ()).toBeNull()
    expect(types(ed)).toEqual(['paragraph'])
  })
})

describe('NOTION.md § 10.3 : le menu « coller comme »', () => {
  const collerUrl = (ed: Editor) => act(async () => void coller(ed.view, { texte: URL1, html: '', notak: '', vscode: '' }, false))

  it('s’ouvre sous le lien collé, comme chez Notion : « Coller en tant que », « Aperçu » (choisi d’avance) et « URL »', async () => {
    const ed = await monter([p('')])
    await collerUrl(ed)
    expect(lignes()).toEqual(['Aperçu*', 'URL'])
    expect(document.querySelector('.notak-apercu-coller')?.getAttribute('aria-label')).toBe('Coller en tant que')
    expect(document.querySelector('.notak-apercu-coller .notak-groupe')?.textContent).toBe('Coller en tant que')
    expect(ed.state.doc.textContent).toBe(URL1)
  })

  it('un clic sur « Aperçu » pose la carte ; sur « Lien », le lien reste', async () => {
    const ed = await monter([p('')])
    await collerUrl(ed)
    await act(async () => void document.querySelector<HTMLElement>('.notak-apercu-coller [data-id="apercu"]')!.click())
    expect(types(ed)).toEqual(['apercuLien', 'paragraph'])
    expect(document.querySelector('.notak-apercu-coller')).toBeNull()
    ed.destroy()
    const autre = await monter([p('')])
    await collerUrl(autre)
    await act(async () => void document.querySelector<HTMLElement>('.notak-apercu-coller [data-id="lien"]')!.click())
    expect(types(autre)).toEqual(['paragraph'])
    expect(autre.state.doc.textContent).toBe(URL1)
    expect(document.querySelector('.notak-apercu-coller')).toBeNull()
  })

  it('↓ puis Entrée au clavier ; le rang actif suit', async () => {
    const ed = await monter([p('')])
    await collerUrl(ed)
    await touche(ed, 'ArrowDown')
    expect(lignes()).toEqual(['Aperçu', 'URL*'])
    await touche(ed, 'Enter')
    expect(types(ed)).toEqual(['paragraph'])
    expect(ed.state.doc.textContent).toBe(URL1)
  })

  it('taper autre chose le ferme et garde le lien', async () => {
    const ed = await monter([p('')])
    await collerUrl(ed)
    await touche(ed, 'x')
    expect(document.querySelector('.notak-apercu-coller')).toBeNull()
    expect(types(ed)).toEqual(['paragraph'])
  })
})
