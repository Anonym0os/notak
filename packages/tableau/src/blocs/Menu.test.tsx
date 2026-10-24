// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { act, createRef } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { MenuBlocs, type PontMenu, extensionSlash } from './Menu'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let editeur: Editor | null = null
let mesures = 0
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  mesures = 0
})
afterEach(() => {
  act(() => racine.unmount())
  editeur?.destroy()
  editeur = null
  hote.remove()
})

const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })

async function monter(blocs: NoeudTexte[]): Promise<Editor> {
  const pont = createRef<PontMenu | null>() as { current: PontMenu | null }
  const ed = new Editor({ extensions: [...EXTENSIONS_BLOCS, extensionSlash(pont)], content: { type: 'doc', content: blocs } })
  editeur = ed
  const ids = poserIds(ed.state)
  if (ids) ed.view.dispatch(ids)
  ed.view.hasFocus = () => true
  // jsdom ne mesure rien : le curseur avance de 7 px par caractère, et on compte les mesures.
  ed.view.coordsAtPos = (pos) => {
    mesures++
    return { left: 100 + pos * 7, right: 100 + pos * 7, top: 200, bottom: 219 }
  }
  await act(async () => {
    racine.render(<MenuBlocs editeur={ed} pont={pont} demande={null} surCouleur={() => {}} copierLien={() => {}} commenterBloc={() => {}} choisirImage={() => {}} />)
  })
  await act(async () => void ed.view.dispatch(ed.state.tr.setSelection(TextSelection.atEnd(ed.state.doc))))
  return ed
}
const taper = (ed: Editor, texte: string) => act(async () => void ed.commands.insertContent(texte))
const touche = (ed: Editor, key: string, plus: KeyboardEventInit = {}) => act(async () => void ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...plus })))
const nom = (x: Element) => x.querySelector('.notak-menu-blocs-nom')?.textContent ?? x.textContent
const lignes = () => [...document.querySelectorAll('.notak-menu-blocs [role="option"]')].map((x) => `${nom(x)}${x.querySelector('.notak-menu-blocs-droite')?.textContent ?? ''}`)

describe('NOTION.md § 2 : le menu « / »', () => {
  it('à l’ouverture : les sections dans l’ordre, le pied « Fermer le menu · esc », l’invite en ligne', async () => {
    const ed = await monter([b('paragraph', '')])
    await taper(ed, '/')
    const titres = [...document.querySelectorAll('.notak-menu-blocs-categorie')].map((x) => x.textContent)
    expect(titres).toEqual(['Blocs de base', 'Média', 'Blocs avancés', 'Transformer en', 'Actions', 'Couleur du texte', 'Couleur d’arrière-plan'])
    expect(document.querySelector('.notak-menu-blocs-pied')?.textContent).toBe('Fermer le menuesc')
    expect(ed.view.dom.querySelector('.notak-slash-texte')?.textContent).toBe('/')
    expect(ed.view.dom.querySelector('.notak-slash-fantome')?.textContent).toBe('Saisissez du texte pour chercher')
    expect(document.querySelector('.notak-menu-blocs-entree[data-actif]')?.textContent).toContain('Texte')
  })

  it('le texte tapé est surligné dans le bloc, l’invite part avec la première lettre', async () => {
    const ed = await monter([b('paragraph', '')])
    await taper(ed, '/enc')
    expect(ed.view.dom.querySelector('.notak-slash-texte')?.textContent).toBe('/enc')
    expect(ed.view.dom.querySelector('.notak-slash-fantome')).toBeNull()
    expect(lignes()).toEqual(['Encadré', 'Encadré · Transformer en', 'Fermer le menuesc'])
    expect(document.querySelector('.notak-menu-blocs-categorie')?.textContent).toBe('Résultats filtrés')
  })

  it('l’ancre est prise à l’ouverture : taper davantage ne la mesure plus', async () => {
    const ed = await monter([b('paragraph', '')])
    await taper(ed, '/')
    const apres = mesures
    expect(apres).toBeGreaterThan(0)
    await taper(ed, 'tit')
    await taper(ed, 're')
    expect(mesures).toBe(apres)
  })

  it('↑ depuis la première ligne atteint le pied, Entrée dessus ferme le menu et laisse le texte', async () => {
    const ed = await monter([b('paragraph', '')])
    await taper(ed, '/tit')
    await touche(ed, 'ArrowUp')
    expect(document.querySelector('.notak-menu-blocs-pied [data-actif]')).not.toBeNull()
    await touche(ed, 'Enter')
    expect(document.querySelector('.notak-menu-blocs')).toBeNull()
    expect(ed.state.doc.textContent).toBe('/tit')
  })

  it('Échap ferme, le texte reste ; la quatrième lettre sans résultat ferme aussi', async () => {
    const ed = await monter([b('paragraph', '')])
    await taper(ed, '/tit')
    await touche(ed, 'Escape')
    expect(document.querySelector('.notak-menu-blocs')).toBeNull()
    expect(ed.state.doc.textContent).toBe('/tit')
    expect(ed.view.dom.querySelector('.notak-slash-texte')).toBeNull()
    ed.commands.clearContent()
    await taper(ed, '/')
    expect(document.querySelector('.notak-menu-blocs')).not.toBeNull()
    await taper(ed, 'qxz')
    expect(document.querySelector('.notak-menu-blocs')).not.toBeNull()
    await taper(ed, 'w')
    expect(document.querySelector('.notak-menu-blocs')).toBeNull()
  })

  it('Entrée choisit : le paragraphe vide devient le bloc', async () => {
    const ed = await monter([b('paragraph', '')])
    await taper(ed, '/titre 2')
    await touche(ed, 'Enter')
    expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect(ed.state.doc.childCount).toBe(1)
  })
})

describe('NOTION.md § 3 : le menu d’actions du bloc', () => {
  it('⌘/ l’ouvre, avec son champ de recherche ; Transformer en puis Couleur, copier le lien, dupliquer, supprimer, commenter', async () => {
    const ed = await monter([b('heading', 'Un titre', { level: 2 })])
    await touche(ed, '/', { metaKey: true })
    const menu = document.querySelector('.notak-menu-blocs[data-genre="bloc"]')
    expect(menu).not.toBeNull()
    expect(menu!.querySelector('input')?.getAttribute('placeholder')).toBe('Rechercher des actions…')
    expect(menu!.querySelector('.notak-menu-blocs-categorie')?.textContent).toBe('Titre 2')
    expect(lignes()).toEqual(['Transformer en', 'Couleur', 'Copier le lien du bloc⌘⌃L', 'Dupliquer⌘D', 'Supprimer' + 'Suppr', 'Commenter⌘⇧M'])
  })

  it('un clic sur « Couleur » ouvre le sous-menu : dernière utilisée, texte, fond', async () => {
    const ed = await monter([b('paragraph', 'Un texte')])
    await touche(ed, '/', { metaKey: true })
    const couleur = [...document.querySelectorAll<HTMLElement>('.notak-menu-blocs [role="option"]')].find((x) => nom(x) === 'Couleur')!
    await act(async () => void couleur.click())
    const sous = document.querySelector('.notak-menu-blocs[data-genre="sous"]')!
    expect([...sous.querySelectorAll('.notak-menu-blocs-categorie')].map((x) => x.textContent)).toEqual(['Utilisé dernièrement', 'Couleur du texte', 'Couleur d’arrière-plan'])
    const rouge = [...sous.querySelectorAll<HTMLElement>('[role="option"]')].find((x) => nom(x) === 'Texte rouge')!
    await act(async () => void rouge.click())
    expect(ed.state.doc.child(0).attrs.couleur).toBe('rouge')
    expect(document.querySelector('.notak-menu-blocs')).toBeNull()
  })

  it('taper dans le champ cherche à travers les sous-menus', async () => {
    const ed = await monter([b('paragraph', 'Un texte')])
    await touche(ed, '/', { metaKey: true })
    const champ = document.querySelector<HTMLInputElement>('.notak-menu-blocs-filtre')!
    const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      poser.call(champ, 'rouge')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(lignes()).toEqual(['Texte rouge', 'Fond rouge'])
  })
})
