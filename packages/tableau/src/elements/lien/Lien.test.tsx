// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Element, Lien } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import { oublierLesAccords } from '../contenuExterne'
import type { PropsRendu, Services } from '../types'
import { RenduLien } from './Lien'

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
  oublierLesAccords()
})

const SPOTIFY = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

const lien = (id: string, contenu: Partial<Lien>): Element<Lien> => ({
  id,
  x: 0,
  y: 0,
  largeur: 34,
  contenu: { type: 'lien', url: 'https://exemple.org/page', statut: 'pret', apercu: {}, ...contenu } as Lien,
})

/** Ce que l'édition locale prête : l'index dit quels tableaux viennent d'une copie reçue, et on est prévenu quand cela change. */
function hoteLocal(marques: string[]) {
  const m = new Set(marques)
  const ecouteurs = new Set<() => void>()
  return {
    contenuExterne: (id: string) => (m.has(id) ? ('demander' as const) : undefined),
    permettreContenuExterne: (id: string) => {
      m.delete(id)
      ecouteurs.forEach((f) => f())
    },
    ecouterContenuExterne: (f: () => void) => {
      ecouteurs.add(f)
      return () => void ecouteurs.delete(f)
    },
  } satisfies Services
}

function rendre(elements: Element<Lien>[], services: Services = {}, tableau = 'T') {
  const contexte = {
    services,
    magasin: { lire: () => ({ id: tableau, titre: '', elements }), corriger: () => {} },
    prendrePointEdition: () => null,
    finirEdition: () => {},
    jeter: () => {},
  }
  const props = (element: Element<Lien>) => ({ element, choisie: false, enEdition: false, contexte, brouillon: () => {}, changer: () => {} }) as unknown as PropsRendu<Lien>
  act(() => racine.render(<>{elements.map((e) => <RenduLien key={e.id} {...props(e)} />)}</>))
}

const cartes = () => [...hote.querySelectorAll<HTMLElement>('.notak-lien')]
const bouton = (de: ParentNode = hote) => de.querySelector<HTMLButtonElement>('.notak-externe-bouton')
const sorties = (de: ParentNode = hote) => [...de.querySelectorAll('iframe[src], img[src]')].map((e) => e.getAttribute('src'))

const morceau = (id = 'S') => lien(id, { url: SPOTIFY, apercu: { titre: 'Un morceau', image: 'https://i.scdn.co/image/abc', favicon: 'https://open.spotify.com/favicon.ico' } })
const video = (id = 'V') => lien(id, { url: YOUTUBE, apercu: { titre: 'Une vidéo', image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg', favicon: 'https://www.youtube.com/favicon.ico' } })

describe('un lien dans une toile qui n’attend rien (le serveur, ou une toile à soi)', () => {
  it('sans service de l’hôte : le lecteur se monte seul et l’aperçu comme la favicon se chargent', () => {
    rendre([morceau()])
    expect(sorties()).toEqual(['https://i.scdn.co/image/abc', expect.stringContaining('open.spotify.com/embed/track/'), 'https://open.spotify.com/favicon.ico'])
    expect(bouton()).toBeNull()
  })

  it('l’hôte connaît le service mais ne marque pas cette toile : rien ne change', () => {
    rendre([morceau()], hoteLocal(['AUTRE']))
    expect(hote.querySelector('iframe')).not.toBeNull()
    expect(bouton()).toBeNull()
  })
})

describe('un lien dans une toile venue d’une copie reçue', () => {
  it('un lecteur qui se monte seul n’est pas monté, ni l’aperçu ni la favicon : une place dit d’où cela viendrait', () => {
    rendre([morceau()], hoteLocal(['T']))
    expect(hote.querySelector('iframe')).toBeNull()
    expect(sorties()).toEqual([])
    const place = hote.querySelector('.notak-externe')!
    expect(place.textContent).toContain('Contenu de open.spotify.com, i.scdn.co')
    const b = bouton()!
    expect(b.tagName).toBe('BUTTON')
    expect(b.type).toBe('button')
    expect(b.textContent).toBe('Afficher')
    expect(b.getAttribute('aria-label')).toBe('Afficher le contenu de open.spotify.com, i.scdn.co')
    // La carte garde son titre et son adresse : seul ce qui vient d'ailleurs attend.
    expect(hote.textContent).toMatch(/Un\smorceau/)
  })

  it('« Afficher » charge cet élément seul, et la toile garde le reste en attente', () => {
    rendre([morceau('S1'), morceau('S2')], hoteLocal(['T']))
    expect(hote.querySelectorAll('.notak-externe')).toHaveLength(2)
    act(() => bouton(cartes()[0])!.click())
    expect(cartes()[0]!.querySelector('iframe')?.getAttribute('src')).toContain('open.spotify.com/embed/track/')
    expect(cartes()[0]!.querySelector('.notak-externe')).toBeNull()
    expect(cartes()[0]!.querySelector('img.notak-lien-favicon')).not.toBeNull()
    // La seconde carte attend encore.
    expect(cartes()[1]!.querySelector('iframe')).toBeNull()
    expect(sorties(cartes()[1]!)).toEqual([])
    expect(bouton(cartes()[1]!)).not.toBeNull()
  })

  it('une vidéo « au clic » : ni aperçu ni bouton « Lire » avant l’accord ; après, l’aperçu et « Lire », mais pas encore le lecteur', () => {
    rendre([video()], hoteLocal(['T']))
    expect(sorties()).toEqual([])
    expect(hote.querySelector('.notak-lien-lecture')).toBeNull()
    expect(hote.querySelector('.notak-externe-texte')?.textContent).toBe('Contenu de youtube-nocookie.com, i.ytimg.com, youtube.com')
    act(() => bouton()!.click())
    expect(sorties()).toEqual(['https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg', 'https://www.youtube.com/favicon.ico'])
    expect(hote.querySelector('iframe')).toBeNull()
    expect(hote.querySelector('.notak-lien-lecture')).not.toBeNull()
    // Un clic sur « Lire », ensuite, monte le lecteur comme partout.
    act(() => hote.querySelector<HTMLElement>('.notak-lien-media')!.click())
    expect(hote.querySelector('iframe')?.getAttribute('src')).toContain('youtube-nocookie.com/embed/')
  })

  it('un lien sans lecteur : l’image d’aperçu est remplacée par la place, la favicon par l’icône du lien', () => {
    rendre([lien('P', { apercu: { titre: 'Une page', image: 'https://cdn.exemple.org/a.jpg', favicon: 'https://exemple.org/f.ico' } })], hoteLocal(['T']))
    expect(sorties()).toEqual([])
    expect(hote.querySelector('.notak-externe-texte')?.textContent).toBe('Contenu de cdn.exemple.org, exemple.org')
    act(() => bouton()!.click())
    expect(sorties()).toEqual(['https://cdn.exemple.org/a.jpg', 'https://exemple.org/f.ico'])
  })

  it('une carte qui n’a qu’une favicon n’appelle rien non plus, et n’a rien à afficher', () => {
    rendre([lien('P', { apercu: { titre: 'Une page', favicon: 'https://exemple.org/f.ico' } })], hoteLocal(['T']))
    expect(sorties()).toEqual([])
    expect(bouton()).toBeNull()
  })

  it('l’image donnée à la carte est un fichier du tableau : elle reste, sans place ni bouton', async () => {
    const services: Services = { ...hoteLocal(['T']), fichiers: { enregistrer: async () => 'f', adresse: async () => 'blob:http://localhost/photo' } }
    await act(async () => rendre([lien('P', { image: { fichier: 'f', largeur: 400, hauteur: 300 }, apercu: { image: 'https://cdn.exemple.org/a.jpg' } })], services))
    expect(sorties()).toEqual(['blob:http://localhost/photo'])
    expect(bouton()).toBeNull()
  })

  it('en présentation : toujours pas de lecteur, pas d’image d’un autre site, et « Afficher » reste là', () => {
    rendre([morceau()], { ...hoteLocal(['T']), presentation: true })
    expect(hote.querySelector('iframe')).toBeNull()
    expect(sorties()).toEqual([])
    act(() => bouton()!.click())
    // Permis : l'image d'aperçu paraît, le lecteur, lui, ne se monte jamais en présentation.
    expect(hote.querySelector('iframe')).toBeNull()
    expect(sorties()).toContain('https://i.scdn.co/image/abc')
  })

  it('l’accord pour toute la toile (le bandeau) charge tout ce qui attendait, sans recharger la page', () => {
    const services = hoteLocal(['T'])
    rendre([morceau('S1'), video('V1')], services)
    expect(hote.querySelector('iframe')).toBeNull()
    expect(hote.querySelectorAll('.notak-externe')).toHaveLength(2)
    act(() => services.permettreContenuExterne('T'))
    expect(hote.querySelectorAll('.notak-externe')).toHaveLength(0)
    expect(hote.querySelectorAll('iframe')).toHaveLength(1)
    expect(sorties(cartes()[1]!)).toContain('https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg')
  })

  it('une toile qui devient reçue pendant qu’elle est ouverte démonte les lecteurs déjà montés', () => {
    const marques = new Set<string>()
    const ecouteurs = new Set<() => void>()
    const services: Services = {
      contenuExterne: (id) => (marques.has(id) ? 'demander' : undefined),
      ecouterContenuExterne: (f) => (ecouteurs.add(f), () => void ecouteurs.delete(f)),
    }
    rendre([morceau()], services)
    expect(hote.querySelector('iframe')).not.toBeNull()
    act(() => {
      marques.add('T')
      ecouteurs.forEach((f) => f())
    })
    expect(hote.querySelector('iframe')).toBeNull()
    expect(sorties()).toEqual([])
  })

  it('la place se lit en anglais aussi', () => {
    definirLangue('en')
    rendre([morceau()], hoteLocal(['T']))
    expect(hote.querySelector('.notak-externe-texte')?.textContent).toBe('Content from open.spotify.com, i.scdn.co')
    expect(bouton()!.textContent).toBe('Show')
  })

  it('une adresse d’aperçu qui n’est pas du web ne devient jamais une image, marquée ou non', () => {
    rendre([lien('P', { apercu: { titre: 'Piège', image: 'javascript:alert(1)', favicon: 'data:image/gif;base64,AAAA' } })], hoteLocal(['T']))
    expect(hote.querySelector('img[src^="javascript"], img[src^="data"]')).toBeNull()
    expect(bouton()).toBeNull()
  })
})
