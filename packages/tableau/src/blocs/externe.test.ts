// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ContenuExterne, contenuExterneDe, oublierLesAccords } from '../elements/contenuExterne'
import { extensionsExternes } from '../elements/document/externe'
import type { Services } from '../elements/types'
import { definirLangue } from '../langue'
import { EXTENSIONS_BLOCS, SCHEMA_BLOCS } from './schema'
import { degrader } from './lisible'

/** Un hôte comme l'édition locale : des tableaux marqués, et ceux qui suivent sont prévenus. */
function hote(marques: string[]) {
  const m = new Set(marques)
  const ecouteurs = new Set<() => void>()
  const services: Services = {
    contenuExterne: (id) => (m.has(id) ? 'demander' : undefined),
    permettreContenuExterne: (id) => (m.delete(id), ecouteurs.forEach((f) => f())),
    ecouterContenuExterne: (f) => (ecouteurs.add(f), () => void ecouteurs.delete(f)),
  }
  return { services, ecouteurs }
}

const attend = (marques = ['T']) => contenuExterneDe(hote(marques).services, 'T', 'D')!

const IMAGE = 'https://img.exemple.org/photo.png'
const doc = (...blocs: object[]) => ({ type: 'doc', content: blocs })
const image = (attrs: object) => ({ type: 'image', attrs })
const signet = (attrs: object = {}) => ({
  type: 'apercuLien',
  attrs: { url: 'https://exemple.org/page', titre: 'Un titre', description: 'Une description', image: 'https://cdn.exemple.org/a.jpg', favicon: 'https://exemple.org/f.ico', ...attrs },
})

/** Le rendu fixe, celui de la lecture et de l'export. */
function statique(contenu: object, externe: ContenuExterne | null = null, rendu: 'lecture' | 'export' = 'lecture'): string {
  const extensions = extensionsExternes(EXTENSIONS_BLOCS, externe, rendu)
  return renderToStaticMarkup(renderToReactElement({ content: degrader(contenu as never, SCHEMA_BLOCS), extensions }))
}
const html = (markup: string) => Object.assign(document.createElement('div'), { innerHTML: markup })

beforeEach(() => definirLangue('fr'))
afterEach(() => {
  oublierLesAccords()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('le rendu fixe d’une image du texte', () => {
  it('une image du web se charge comme avant quand rien n’attend', () => {
    const img = html(statique(doc(image({ url: IMAGE, legende: 'Un port' })))).querySelector('img')!
    expect(img.getAttribute('src')).toBe(IMAGE)
    expect(img.getAttribute('alt')).toBe('Un port')
  })

  it('une adresse qui n’est pas du web ne devient jamais un `src`, comme dans l’éditeur', () => {
    for (const url of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'blob:https://x/abc', '//evil.example/x.png', 'photo.png', `https://a.example/${'x'.repeat(5000)}`]) {
      const sortie = statique(doc(image({ url })))
      expect(html(sortie).querySelector('img')?.hasAttribute('src'), url).toBe(false)
      expect(sortie).not.toContain('javascript:')
      expect(sortie).not.toContain('data:image')
      expect(sortie).not.toContain('evil.example')
    }
  })

  it('l’image d’un fichier du tableau n’a pas de `src` : la lecture lui donne le sien', () => {
    const f = html(statique(doc(image({ fichier: 'abc' })), attend())).querySelector('figure')!
    expect(f.dataset.fichier).toBe('abc')
    expect(f.querySelector('img')?.hasAttribute('src')).toBe(false)
    expect(f.querySelector('.notak-externe')).toBeNull()
  })

  it('dans une toile reçue, l’image d’un autre site n’est pas demandée : sa place dit d’où elle viendrait', () => {
    const sortie = statique(doc(image({ url: IMAGE, legende: 'Un port' })), attend())
    const d = html(sortie)
    expect(d.querySelector('img')).toBeNull()
    // Rien dans la page n'est une adresse à charger : l'adresse n'est qu'un nom, dans `data-externe`.
    expect(d.querySelector('[src], [srcset], [href], [style*="url("]')).toBeNull()
    expect(d.querySelector('.notak-externe-texte')?.textContent).toBe('Contenu de img.exemple.org')
    const b = d.querySelector<HTMLButtonElement>('button[data-externe]')!
    expect(b.type).toBe('button')
    expect(b.textContent).toBe('Afficher')
    expect(b.getAttribute('aria-label')).toBe('Afficher le contenu de img.exemple.org')
    expect(b.dataset.externe).toBe(`image:${IMAGE}`)
    // La légende reste : elle est du texte.
    expect(d.querySelector('figcaption')?.textContent).toBe('Un port')
  })

  it('dans un export, la place n’a pas de bouton', () => {
    const d = html(statique(doc(image({ url: IMAGE })), attend(), 'export'))
    expect(d.querySelector('img')).toBeNull()
    expect(d.querySelector('button')).toBeNull()
    expect(d.querySelector('.notak-externe-texte')?.textContent).toBe('Contenu de img.exemple.org')
  })

  it('une fois permise, l’image paraît ; une autre, non', () => {
    const e = attend()
    e.permettre(`image:${IMAGE}`)
    const d = html(statique(doc(image({ url: IMAGE }), image({ url: 'https://autre.example/b.png' })), e))
    expect([...d.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([IMAGE])
    expect(d.querySelectorAll('.notak-externe')).toHaveLength(1)
  })

  it('une adresse qui n’est pas du web n’a pas de place non plus : rien n’est à charger', () => {
    const d = html(statique(doc(image({ url: 'javascript:alert(1)' })), attend()))
    expect(d.querySelector('.notak-externe')).toBeNull()
    expect(d.querySelector('img')?.hasAttribute('src')).toBe(false)
  })
})

describe('le rendu fixe d’un signet', () => {
  it('se charge comme avant quand rien n’attend : l’image et la favicon', () => {
    const d = html(statique(doc(signet())))
    expect(d.querySelector('img.notak-apercu-lien-image')?.getAttribute('src')).toBe('https://cdn.exemple.org/a.jpg')
    expect(d.querySelector('img.notak-apercu-lien-icone')?.getAttribute('src')).toBe('https://exemple.org/f.ico')
  })

  it('dans une toile reçue, ni l’image ni la favicon : une place, et le titre, la description et l’adresse restent', () => {
    const d = html(statique(doc(signet()), attend()))
    expect(d.querySelector('img')).toBeNull()
    const a = d.querySelector<HTMLAnchorElement>('a.notak-apercu-lien')!
    expect(a.getAttribute('href')).toBe('https://exemple.org/page')
    expect(a.querySelector('.notak-externe-texte')?.textContent).toBe('Contenu de cdn.exemple.org, exemple.org')
    expect(a.querySelector<HTMLElement>('button[data-externe]')?.dataset.externe).toBe('signet:https://exemple.org/page')
    expect(a.querySelector('.notak-apercu-lien-titre')?.textContent).toBe('Un titre')
    expect(a.querySelector('.notak-apercu-lien-description')?.textContent).toBe('Une description')
  })

  it('permis, il se charge ; un signet sans rien de distant n’a pas de place', () => {
    const e = attend()
    e.permettre('signet:https://exemple.org/page')
    expect(html(statique(doc(signet()), e)).querySelectorAll('img')).toHaveLength(2)
    expect(html(statique(doc(signet({ image: null, favicon: null })), attend())).querySelector('.notak-externe')).toBeNull()
  })

  it('une image ou une favicon qui n’est pas du web est ignorée, dans une toile reçue comme ailleurs', () => {
    for (const externe of [null, attend()]) {
      const sortie = statique(doc(signet({ image: 'javascript:alert(1)', favicon: 'data:image/gif;base64,AAAA' })), externe)
      expect(sortie).not.toContain('javascript:')
      expect(sortie).not.toContain('data:image')
      expect(html(sortie).querySelector('img')).toBeNull()
      expect(html(sortie).querySelector('.notak-externe')).toBeNull()
    }
  })
})

/** L'éditeur du texte, avec l'image ou le signet donnés. */
function ouvrir(contenu: object | string, externe: ContenuExterne | null) {
  const element = document.createElement('div')
  document.body.append(element)
  return new Editor({ element, extensions: extensionsExternes(EXTENSIONS_BLOCS, externe, 'editeur'), content: contenu })
}

describe('l’image du texte dans l’éditeur', () => {
  it('une toile reçue : pas de `src`, une place ; « Afficher » charge cette image', () => {
    const e = attend()
    const ed = ouvrir(doc(image({ url: IMAGE })), e)
    const figure = ed.view.dom.querySelector<HTMLElement>('figure.notak-image-bloc')!
    expect(figure.querySelector('img')!.hasAttribute('src')).toBe(false)
    expect(figure.querySelector('.notak-externe-texte')?.textContent).toBe('Contenu de img.exemple.org')
    const bouton = figure.querySelector<HTMLButtonElement>('.notak-externe-bouton')!
    expect(bouton.getAttribute('aria-label')).toBe('Afficher le contenu de img.exemple.org')
    bouton.click()
    expect(figure.querySelector('img')!.getAttribute('src')).toBe(IMAGE)
    expect(figure.querySelector('.notak-externe')).toBeNull()
    ed.destroy()
  })

  it('l’accord de toute la toile charge l’image ouverte, sans toucher au texte', () => {
    const h = hote(['T'])
    const ed = ouvrir(doc(image({ url: IMAGE })), contenuExterneDe(h.services, 'T', 'D'))
    const figure = ed.view.dom.querySelector<HTMLElement>('figure')!
    expect(figure.querySelector('img')!.hasAttribute('src')).toBe(false)
    h.services.permettreContenuExterne!('T')
    expect(figure.querySelector('img')!.getAttribute('src')).toBe(IMAGE)
    expect(figure.querySelector('.notak-externe')).toBeNull()
    expect(JSON.stringify(ed.getJSON())).not.toContain('externe')
    ed.destroy()
  })

  it('une toile qui devient reçue retire une image déjà chargée, et la rend à l’accord', () => {
    const marques = new Set<string>()
    const ecouteurs = new Set<() => void>()
    const services: Services = {
      contenuExterne: (id) => (marques.has(id) ? 'demander' : undefined),
      ecouterContenuExterne: (f) => (ecouteurs.add(f), () => void ecouteurs.delete(f)),
    }
    const ed = ouvrir(doc(image({ url: IMAGE })), contenuExterneDe(services, 'T', 'D'))
    const figure = ed.view.dom.querySelector<HTMLElement>('figure')!
    expect(figure.querySelector('img')!.getAttribute('src')).toBe(IMAGE)
    marques.add('T')
    ecouteurs.forEach((f) => f())
    expect(figure.querySelector('img')!.hasAttribute('src')).toBe(false)
    expect(figure.querySelector('.notak-externe')).not.toBeNull()
    ed.destroy()
  })

  it('copier une image qui attend garde son adresse : le collage la retrouve, et rien n’est chargé pour autant', () => {
    const ed = ouvrir(doc(image({ url: IMAGE }), signet()), attend())
    const copie = ed.getHTML()
    expect(copie).toContain(`src="${IMAGE}"`)
    expect(copie).toContain('src="https://cdn.exemple.org/a.jpg"')
    expect(copie).not.toContain('notak-externe')
    // Recollée dans le même texte, elle redonne la même image.
    const autre = ouvrir(copie, attend())
    expect(autre.getJSON().content?.[0]?.attrs?.url).toBe(IMAGE)
    expect(autre.view.dom.querySelector('figure img')!.hasAttribute('src')).toBe(false)
    ed.destroy()
    autre.destroy()
  })

  it('fermer le texte arrête d’écouter', () => {
    const h = hote(['T'])
    const ed = ouvrir(doc(image({ url: IMAGE }), signet()), contenuExterneDe(h.services, 'T', 'D'))
    expect(h.ecouteurs.size).toBe(2)
    ed.destroy()
    expect(h.ecouteurs.size).toBe(0)
  })

  it('une image du fichier du tableau, ou du web quand rien n’attend, n’a pas de place', () => {
    const ed = ouvrir(doc(image({ url: IMAGE })), null)
    expect(ed.view.dom.querySelector('figure img')!.getAttribute('src')).toBe(IMAGE)
    expect(ed.view.dom.querySelector('.notak-externe')).toBeNull()
    ed.destroy()
    const local = ouvrir(doc(image({ fichier: 'abc' })), attend())
    expect(local.view.dom.querySelector('.notak-externe')).toBeNull()
    local.destroy()
  })
})

describe('le signet dans l’éditeur', () => {
  it('une toile reçue : ni image ni favicon, une place ; « Afficher » ouvre ni le lien ni la page', () => {
    const ouvert = vi.spyOn(window, 'open').mockImplementation(() => null)
    const ed = ouvrir(doc(signet()), attend())
    const carte = ed.view.dom.querySelector<HTMLElement>('a.notak-apercu-lien')!
    expect(carte.querySelector('img')).toBeNull()
    expect(carte.querySelector('.notak-externe-texte')?.textContent).toBe('Contenu de cdn.exemple.org, exemple.org')
    carte.querySelector<HTMLButtonElement>('.notak-externe-bouton')!.click()
    expect(ouvert).not.toHaveBeenCalled()
    expect(carte.querySelector('.notak-externe')).toBeNull()
    expect(carte.querySelector('img.notak-apercu-lien-image')?.getAttribute('src')).toBe('https://cdn.exemple.org/a.jpg')
    expect(carte.querySelector('img.notak-apercu-lien-icone')?.getAttribute('src')).toBe('https://exemple.org/f.ico')
    ed.destroy()
  })

  it('hors toile reçue, tout se charge d’emblée', () => {
    const ed = ouvrir(doc(signet()), null)
    expect(ed.view.dom.querySelectorAll('a.notak-apercu-lien img')).toHaveLength(2)
    expect(ed.view.dom.querySelector('.notak-externe')).toBeNull()
    ed.destroy()
  })
})
