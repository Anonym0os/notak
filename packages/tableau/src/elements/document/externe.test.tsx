// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentTexte, Element } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import { oublierLesAccords, contenuExterneDe } from '../contenuExterne'
import type { ContexteToile, Services } from '../types'
import { RenduDocument } from './Document'
import { sujetDocument } from './sujetExport'

// Les pages de l'export se dessinent sur un canevas, que jsdom n'a pas : on regarde ce qu'on lui donne.
const capture = vi.hoisted(() => ({ html: [] as string[] }))
vi.mock('../../export/capture', () => ({
  capturerPages: vi.fn(async (_titre: string, html: string) => (capture.html.push(html), [])),
  enBlob: vi.fn(async () => new Blob()),
  pdfDePagesA4: vi.fn(async () => new Blob()),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  capture.html = []
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  document.body.replaceChildren()
  oublierLesAccords()
})

const IMAGE = 'https://img.exemple.org/photo.png'
const texte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }, { type: 'image', attrs: { url: IMAGE } }] }
const document_ = (plus: Partial<DocumentTexte> = {}): Element<DocumentTexte> => ({
  id: 'D',
  x: 0,
  y: 0,
  largeur: 10,
  contenu: { type: 'document', titre: 'Notes', texte, ...plus } as DocumentTexte,
})

/** Comme l'édition locale : une toile marquée « reçue », qui prévient quand cela change. */
function hoteLocal(marques: string[]) {
  const m = new Set(marques)
  const ecouteurs = new Set<() => void>()
  return {
    contenuExterne: (id: string) => (m.has(id) ? ('demander' as const) : undefined),
    permettreContenuExterne: (id: string) => (m.delete(id), ecouteurs.forEach((f) => f())),
    ecouterContenuExterne: (f: () => void) => (ecouteurs.add(f), () => void ecouteurs.delete(f)),
  } satisfies Services
}

function monter(element: Element<DocumentTexte>, services: Services) {
  const contexte = {
    services,
    magasin: { lire: () => ({ id: 'T', titre: '', elements: [element] }) },
    finirEdition: () => {},
    choisir: () => {},
    selection: new Set(['D']),
  } as unknown as ContexteToile
  act(() => racine.render(<RenduDocument element={element} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />))
  return contexte
}

const sources = (de: ParentNode = document) => [...de.querySelectorAll('img[src]')].map((i) => i.getAttribute('src'))
const afficher = (de: ParentNode = document) => de.querySelector<HTMLButtonElement>('button[data-externe]')

describe('un document dans une toile venue d’une copie reçue', () => {
  it('la carte ne demande pas l’image d’un autre site : une place, puis « Afficher » la charge', () => {
    monter(document_({ carte: true }), hoteLocal(['T']))
    expect(sources(hote)).toEqual([])
    expect(hote.querySelector('.notak-externe-texte')?.textContent).toBe('Contenu de img.exemple.org')
    act(() => afficher(hote)!.click())
    expect(sources(hote)).toEqual([IMAGE])
    expect(hote.querySelector('.notak-externe')).toBeNull()
  })

  it('sans marque (le serveur, ou une toile à soi), l’image se charge d’emblée', () => {
    monter(document_({ carte: true }), {})
    expect(sources(hote)).toEqual([IMAGE])
    monter(document_({ carte: true }), hoteLocal(['AUTRE']))
    expect(sources(hote)).toEqual([IMAGE])
    expect(afficher(hote)).toBeNull()
  })

  it('le document lu en grand : la même attente, et l’accord donné sur la carte vaut dans la page', () => {
    const services: Services = { ...hoteLocal(['T']), lectureSeule: true }
    monter(document_({ carte: true }), services)
    act(() => void hote.querySelector('.notak-document')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const page = document.querySelector('.notak-document-boite')!
    expect(sources(page)).toEqual([])
    expect(page.querySelector('.notak-externe')).not.toBeNull()
    // Un clic sur « Afficher » dans la page : l'image paraît dans la page comme sur la carte.
    act(() => afficher(page)!.click())
    expect(sources(page)).toEqual([IMAGE])
    expect(sources(hote)).toEqual([IMAGE])
  })

  it('l’accord de toute la toile charge ce qui attendait, dans la page ouverte', () => {
    const services: Services = { ...hoteLocal(['T']), lectureSeule: true }
    monter(document_(), services)
    act(() => void hote.querySelector('.notak-document')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const page = document.querySelector('.notak-document-boite')!
    expect(sources(page)).toEqual([])
    act(() => services.permettreContenuExterne!('T'))
    expect(sources(page)).toEqual([IMAGE])
  })

  it('« Afficher » ne glisse ni ne choisit la carte, et, sur un signet, n’ouvre pas son lien', () => {
    const signet = { type: 'apercuLien', attrs: { url: 'https://exemple.org/p', titre: 'Un titre', image: IMAGE, favicon: null } }
    monter(document_({ texte: { type: 'doc', content: [signet] } as never }), { ...hoteLocal(['T']), lectureSeule: true })
    act(() => void hote.querySelector('.notak-document')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const page = document.querySelector('.notak-document-boite')!
    const lien = page.querySelector<HTMLAnchorElement>('a.notak-apercu-lien')!
    expect(lien.contains(afficher(page))).toBe(true)
    const vus: string[] = []
    const fin = new AbortController()
    // Ce que la carte (appui) et le lien (clic) verraient passer.
    document.addEventListener('pointerdown', () => vus.push('pointerdown'), { signal: fin.signal })
    document.addEventListener('click', (e) => vus.push(e.defaultPrevented ? 'click-annule' : 'click'), { signal: fin.signal })
    act(() => void afficher(page)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    act(() => afficher(page)!.click())
    fin.abort()
    expect(vus).toEqual([])
    expect(sources(page)).toEqual([IMAGE])
  })
})

describe('l’export d’un document d’une toile reçue', () => {
  const pdf = (externe: ReturnType<typeof contenuExterneDe>) => sujetDocument('Notes', () => texte as never, undefined, undefined, externe).formats.find((f) => f.id === 'pdf')!

  it('n’appelle aucun autre site tant que l’image n’est pas permise : la place est sans bouton', async () => {
    await pdf(contenuExterneDe(hoteLocal(['T']), 'T', 'D')).preparer({} as never)
    expect(capture.html).toHaveLength(1)
    expect(capture.html[0]).not.toContain('<img')
    expect(capture.html[0]).not.toContain('<button')
    expect(capture.html[0]).toContain('Contenu de img.exemple.org')
  })

  it('charge l’image que la personne a permise', async () => {
    const e = contenuExterneDe(hoteLocal(['T']), 'T', 'D')!
    e.permettre(`image:${IMAGE}`)
    await pdf(e).preparer({} as never)
    expect(capture.html[0]).toContain(`<img src="${IMAGE}"`)
  })

  it('hors toile reçue, rien ne change', async () => {
    await pdf(null).preparer({} as never)
    expect(capture.html[0]).toContain(`<img src="${IMAGE}"`)
  })
})
