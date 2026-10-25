// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
  document.body.replaceChildren()
})

function ouvrir(legende = ''): { ed: Editor; figure: HTMLElement } {
  const element = document.createElement('div')
  document.body.append(element)
  editeur = new Editor({
    element,
    extensions: EXTENSIONS_BLOCS,
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Avant' }] },
        { type: 'image', attrs: { url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', legende } },
        { type: 'paragraph', content: [{ type: 'text', text: 'Après' }] },
      ],
    },
  })
  return { ed: editeur, figure: editeur.view.dom.querySelector<HTMLElement>('figure.notak-image-bloc')! }
}

const image = (ed: Editor) => ed.state.doc.child(1).attrs
const boutons = (figure: HTMLElement) => [...figure.querySelectorAll<HTMLButtonElement>('.notak-image-barre button')]
const bouton = (figure: HTMLElement, nom: string) => boutons(figure).find((b) => b.getAttribute('aria-label') === nom)!

describe('NOTION.md § 2 : la barre de l’image', () => {
  it('six icônes, comme chez Notion : commenter, alignement, légende, voir en grand, télécharger, « ••• »', () => {
    const { figure } = ouvrir()
    expect(boutons(figure).map((b) => b.getAttribute('aria-label'))).toEqual(['Commenter', 'Alignement', 'Ajouter une légende', 'Voir en grand', 'Télécharger', 'Plus d’actions'])
  })

  it('« Commenter » et « ••• » demandent au document de commenter le bloc, d’ouvrir son menu', () => {
    const { ed, figure } = ouvrir()
    const vus: string[] = []
    ed.view.dom.addEventListener('notak-commenter-bloc', () => vus.push('commenter'))
    ed.view.dom.addEventListener('notak-menu-bloc', () => vus.push('menu'))
    ed.view.dispatch(ed.state.tr.setNodeAttribute(ed.state.doc.child(0).nodeSize, 'id', 'img1'))
    bouton(figure, 'Commenter').click()
    bouton(figure, 'Plus d’actions').click()
    expect(vus).toEqual(['commenter', 'menu'])
  })

  it('l’alignement ouvre ses trois choix ; un choix aligne l’image, se marque et referme le menu', () => {
    const { ed, figure } = ouvrir()
    bouton(figure, 'Alignement').click()
    expect(figure.querySelectorAll('.notak-image-alignements button')).toHaveLength(3)
    bouton(figure, 'Aligner à gauche').click()
    expect(figure.querySelector('.notak-image-alignements')).toBeNull()
    expect(image(ed).alignement).toBe('gauche')
    expect(figure.dataset.alignement).toBe('gauche')
    bouton(figure, 'Alignement').click()
    expect(figure.querySelector('.notak-image-alignements [data-actif="true"]')?.getAttribute('data-valeur')).toBe('gauche')
  })

  it('« Légende » ouvre une légende à écrire, Entrée l’écrit et repasse sous l’image', () => {
    const { ed, figure } = ouvrir()
    expect(figure.querySelector('figcaption')).toBeNull()
    bouton(figure, 'Ajouter une légende').click()
    const legende = figure.querySelector('figcaption')!
    expect(document.activeElement).toBe(legende)
    legende.textContent = '  Un port  '
    legende.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(image(ed).legende).toBe('Un port')
    expect(ed.state.selection.$from.parent.textContent).toBe('Après')
  })

  it('une légende vidée part avec son invite', () => {
    const { ed, figure } = ouvrir('Un port')
    const legende = figure.querySelector('figcaption')!
    legende.focus()
    legende.textContent = ''
    legende.blur()
    expect(image(ed).legende).toBe('')
    expect(figure.querySelector('figcaption')).toBeNull()
  })
})
