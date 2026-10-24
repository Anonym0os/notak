// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentTexte, Element } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import type { ContexteToile } from '../types'
import { RenduDocument } from './Document'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const doc = (texte: string, plus: Partial<DocumentTexte> = {}): Element<DocumentTexte> => ({
  id: 'D',
  x: 0,
  y: 0,
  largeur: 10,
  contenu: { type: 'document', titre: 'Notes', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }] }, ...plus },
})

function monter(element: Element<DocumentTexte>, options: { lectureSeule?: boolean; enEdition?: boolean }) {
  const contexte = {
    services: { lectureSeule: !!options.lectureSeule },
    // Sans texte partagé : le document s'écrit seul.
    magasin: {},
    finirEdition: () => {},
    choisir: () => {},
    selection: new Set(['D']),
  } as unknown as ContexteToile
  act(() =>
    racine.render(
      <RenduDocument element={element} choisie enEdition={!!options.enEdition} contexte={contexte} brouillon={() => {}} changer={() => {}} />,
    ),
  )
}

describe('le document ouvert en grand', () => {
  it('en édition, une page à la Notion : la barre du haut, le titre dans la page, la boîte ancre des fils (NOTION.md § 9)', () => {
    monter(doc('bonjour'), { enEdition: true })
    expect(document.querySelector('.notak-document-boite[data-marge-ancre]')).not.toBeNull()
    expect(document.querySelector('.notak-document-entete .notak-document-fermer')).not.toBeNull()
    expect(document.querySelector('.notak-page textarea.notak-page-titre')).not.toBeNull()
    expect(document.querySelector('.notak-document-outils')).toBeNull()
  })

  it('en lecture seule, le titre de la page n’est pas un champ', () => {
    monter(doc('bonjour'), { lectureSeule: true })
    act(() => void hote.querySelector('.notak-document')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const boite = document.querySelector('.notak-document-boite')!
    expect(boite.getAttribute('data-lecture')).toBe('true')
    expect(boite.querySelector('h1.notak-page-titre')).not.toBeNull()
    expect(boite.querySelector('textarea')).toBeNull()
  })

  it('un bloc d’une version plus récente ouvre le document en lecture seule, sans rien perdre (NOTION.md § 1)', () => {
    const recent = doc('', {
      texte: { type: 'doc', content: [{ type: 'blocDuFutur', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'gardé' }] }] }] },
    })
    monter(recent, { enEdition: true })
    const boite = document.querySelector('.notak-document-boite')!
    expect(boite.getAttribute('data-lecture')).toBe('true')
    expect(boite.querySelector('.ProseMirror')).toBeNull()
    expect(boite.querySelector('.notak-document-plus-recent')).not.toBeNull()
    expect(boite.querySelector('.notak-texte')!.textContent).toBe('gardé')
  })

  it('`/` ouvre le menu des blocs, la requête le filtre, Entrée transforme le bloc vide (NOTION.md § 3)', async () => {
    monter(doc('', { texte: { type: 'doc', content: [{ type: 'paragraph' }] } }), { enEdition: true })
    const pm = document.querySelector('.ProseMirror') as HTMLElement & { editor: import('@tiptap/react').Editor }
    const ed = pm.editor
    // jsdom ne donne pas le focus à un contenteditable.
    ed.view.hasFocus = () => true
    await act(async () => {
      ed.commands.focus('end')
      ed.commands.insertContent('/tit')
    })
    const menu = document.querySelector('.notak-menu-blocs')
    expect(menu).not.toBeNull()
    expect(menu!.querySelector('[data-actif]')?.textContent).toContain('Titre 1')
    await act(async () => void ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(ed.state.doc.textContent).toBe('')
    expect(document.querySelector('.notak-menu-blocs')).toBeNull()
  })
})
