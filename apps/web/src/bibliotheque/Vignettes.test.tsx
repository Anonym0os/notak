// @vitest-environment jsdom
import { type ResumeContenu, definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ApercuDossier } from '../api'
import { FournisseurVignettes, type SourceVignettes, Vignette, largeurDesVignettes, misePhoto, photoEntiere, placerDansLaBoite, texteSansPlan } from './Vignettes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('photoEntiere', () => {
  it('une photo en hauteur, carrée ou panoramique se montre entière ; une photo en largeur remplit la tuile', () => {
    expect(photoEntiere(4000, 6000)).toBe(true)
    expect(photoEntiere(3000, 3000)).toBe(true)
    expect(photoEntiere(9000, 3000)).toBe(true)
    expect(photoEntiere(6000, 4000)).toBe(false)
    expect(photoEntiere(4000, 3000)).toBe(false)
    expect(photoEntiere(1920, 1080)).toBe(false)
    // Des proportions inconnues : on remplit, comme avant.
    expect(photoEntiere(0, 0)).toBe(false)
  })

  it('demande une copie à la largeur d’une vignette, densité de l’écran comprise', () => {
    expect(largeurDesVignettes(1)).toBe(260)
    expect(largeurDesVignettes(2)).toBe(520)
    expect(largeurDesVignettes(8)).toBe(780)
  })
})

describe('une photo comme la toile la montre', () => {
  it('couchée d’un quart de tour et recadrée : le plan d’avant la rotation recouvre le cadre, l’image n’y montre que sa partie gardée', () => {
    const { plan, image } = misePhoto({ largeur: 2000, hauteur: 1000, recadrage: { x: 0.25, y: 0, largeur: 0.5, hauteur: 1 }, rotation: 90, miroirH: true })
    expect(plan).toEqual({ width: 'max(100cqh, calc(100cqw / 1))', height: 'max(100cqw, calc(100cqh * 1))', transform: 'translate(-50%, -50%) scale(-1, 1) rotate(90deg)' })
    expect(image).toEqual({ width: '200%', height: '100%', left: '-50%', top: '0%' })
    // Droite et entière : le plan est la photo, l'image le remplit.
    expect(misePhoto({ largeur: 3, hauteur: 2 })).toEqual({
      plan: { width: 'max(100cqw, calc(100cqh * 1.5))', height: 'max(100cqh, calc(100cqw / 1.5))', transform: 'translate(-50%, -50%)' },
      image: { width: '100%', height: '100%', left: '0%', top: '0%' },
    })
  })

  it('dans la boîte d’un plan : tournée autour de son centre, elle la recouvre ; recadrée, seule sa partie gardée y tombe', () => {
    // Une photo en largeur couchée dans sa boîte en hauteur : 40 × 20 avant le quart de tour, centrée sur la boîte.
    expect(placerDansLaBoite({ largeur: 2000, hauteur: 1000, rotation: 90 }, [0, 0, 20, 40, '', 'image', 0])).toEqual({ x: -20, y: -10, width: 40, height: 20, transform: 'translate(10 20) rotate(90)' })
    // Sa moitié droite seulement, dans une boîte carrée : l'image entière déborde à gauche, de sa moitié gauche.
    expect(placerDansLaBoite({ largeur: 2000, hauteur: 1000, recadrage: { x: 0.5, y: 0, largeur: 0.5, hauteur: 1 } }, [10, 0, 10, 10, '', 'image', 0])).toEqual({
      x: -15,
      y: -5,
      width: 20,
      height: 10,
      transform: 'translate(15 5)',
    })
  })
})

describe('la vignette d’une photo', () => {
  let hote: HTMLDivElement
  let racine: Root
  beforeEach(() => {
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
  })

  const photo = (largeur: number, hauteur: number): Extract<ResumeContenu, { genre: 'image' }> => ({ genre: 'image', element: 'p', titre: '', fichier: 'f-portrait', largeur, hauteur })
  const monter = async (resume: ResumeContenu) => {
    const demandes: [string, number | undefined][] = []
    const source: SourceVignettes = {
      adresse: async (f, l) => {
        demandes.push([f, l])
        return `/api/fichiers/${f}${l ? `?l=${l}` : ''}`
      },
      distant: () => true,
    }
    await act(async () =>
      racine.render(
        <FournisseurVignettes value={source}>
          <Vignette resume={resume} />
        </FournisseurVignettes>,
      ),
    )
    return { demandes, vignette: hote.querySelector<HTMLElement>('.biblio-vignette')! }
  }

  it('en hauteur : entière, et réduite à la taille de la tuile, pas l’original', async () => {
    const { demandes, vignette } = await monter(photo(4000, 6000))
    expect(vignette.dataset.cadrage).toBe('entier')
    expect(demandes).toEqual([['f-portrait', largeurDesVignettes()]])
    expect(vignette.querySelector('img')!.getAttribute('src')).toBe(`/api/fichiers/f-portrait?l=${largeurDesVignettes()}`)
  })

  it('en largeur : elle remplit la tuile', async () => {
    const { vignette } = await monter(photo(6000, 4000))
    expect(vignette.dataset.cadrage).toBeUndefined()
    expect(vignette.querySelector('img')).not.toBeNull()
  })

  it('se montre comme sur la toile : couchée, une photo en largeur est entière ; recadrée en largeur, une photo en hauteur remplit la tuile', async () => {
    const couchee = await monter({ ...photo(6000, 4000), rotation: 90 })
    expect(couchee.vignette.dataset.cadrage).toBe('entier')
    expect(couchee.vignette.querySelector('.biblio-vignette-cadre > .biblio-vignette-plan > img')).not.toBeNull()
    const recadree = await monter({ ...photo(4000, 6000), recadrage: { x: 0, y: 0.3, largeur: 1, hauteur: 0.4 } })
    expect(recadree.vignette.dataset.cadrage).toBeUndefined()
    // Dans son cadre libre, en largeur, elle remplit la tuile elle aussi.
    expect((await monter({ ...photo(4000, 6000), rapportCadre: 1.5 })).vignette.dataset.cadrage).toBeUndefined()
  })

  it('le plan d’une toile montre ses photos elles-mêmes, réduites ; le reste garde son dessin', async () => {
    const toile: ResumeContenu = {
      genre: 'toile',
      element: '',
      titre: 'Silak',
      boites: [
        [0, 0, 20, 30, '', 'image', 0, 'f-1'],
        [24, 0, 20, 30, '', 'image', 0],
        [0, 34, 34, 7, 'jaune', 'note', 1],
      ],
    }
    const { demandes, vignette } = await monter(toile)
    expect(demandes).toEqual([['f-1', largeurDesVignettes()]])
    const images = vignette.querySelectorAll('svg image')
    expect(images).toHaveLength(1)
    expect(images[0]!.getAttribute('href')).toBe(`/api/fichiers/f-1?l=${largeurDesVignettes()}`)
    expect(vignette.textContent).toBe('')
  })

  it('une photo du plan, tournée sur la toile, l’est aussi dans le plan', async () => {
    const toile: ResumeContenu = { genre: 'toile', element: '', titre: '', boites: [[0, 0, 20, 40, '', 'image', 0, 'f-1', { largeur: 2000, hauteur: 1000, rotation: 90 }]] }
    const { vignette } = await monter(toile)
    expect(vignette.querySelector('svg image')!.getAttribute('transform')).toBe('translate(10 20) rotate(90)')
    // La coupe reste celle de la boîte : elle ne tourne pas avec l'image.
    expect(vignette.querySelector('svg image')!.parentElement!.getAttribute('clip-path')).toMatch(/^url\(#plan-photo-/)
  })
})

describe('la vignette d’un dossier', () => {
  let hote: HTMLDivElement
  let racine: Root
  beforeEach(() => {
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
  })

  const dossier = (apercu?: ApercuDossier[]): ResumeContenu & { apercu?: ApercuDossier[] } => ({ genre: 'toile', element: '', titre: 'Clients', boites: [], dossier: true, ...(apercu ? { apercu } : {}) })
  const monter = async (resume: ResumeContenu & { apercu?: ApercuDossier[] }) => {
    const source: SourceVignettes = { adresse: async (f) => `/api/fichiers/${f}`, distant: () => true }
    await act(async () =>
      racine.render(
        <FournisseurVignettes value={source}>
          <Vignette resume={resume} />
        </FournisseurVignettes>,
      ),
    )
    return hote.querySelector<HTMLElement>('.biblio-vignette')!
  }

  it('montre ce qu’il range en petites vignettes, et les places qui restent ; un dossier rangé là, par son icône', async () => {
    // Même s'il portait son propre aperçu, un dossier rangé dans un autre ne s'y montre que par son icône.
    const range = dossier([{ tableau: 't3', resume: { genre: 'toile', element: '', titre: '', boites: [] } }])
    const vignette = await monter(
      dossier([
        { tableau: 't1', resume: { genre: 'toile', element: '', titre: 'Acme', boites: [[0, 0, 20, 10, 'jaune', 'note', 1]] } },
        { tableau: 'c', resume: { genre: 'image', element: 'p', titre: '', fichier: 'f-p', largeur: 4, hauteur: 3 } },
        { tableau: 't2', resume: range },
      ]),
    )
    expect(vignette.dataset.genre).toBe('dossier')
    const places = [...vignette.querySelectorAll('.biblio-apercu > *')]
    expect(places.map((p) => [p.className, (p as HTMLElement).dataset.genre])).toEqual([
      ['biblio-miniature', 'toile'],
      ['biblio-miniature', 'image'],
      ['biblio-miniature', 'dossier'],
      ['biblio-apercu-place', undefined],
    ])
    // Les miniatures ne sont pas des vignettes : les règles des tuiles (survol, choix, liste) ne les visent pas.
    expect(vignette.querySelectorAll('.biblio-vignette')).toHaveLength(0)
    expect(places[1]!.querySelector('img')!.getAttribute('src')).toBe('/api/fichiers/f-p')
    expect(places[2]!.querySelector('.biblio-apercu')).toBeNull()
  })

  it('vide, il garde son icône seule', async () => {
    const vignette = await monter(dossier())
    expect(vignette.querySelector('.biblio-apercu')).toBeNull()
    expect(vignette.querySelector('svg')).not.toBeNull()
  })
})

describe('une toile sans rien de posé', () => {
  it('se dit vide, ou dit ce qui attend dans ses non triés', () => {
    definirLangue('fr')
    const toile = (nonTries?: number): Extract<ResumeContenu, { genre: 'toile' }> => ({ genre: 'toile', element: '', titre: '', boites: [], ...(nonTries ? { nonTries } : {}) })
    expect(texteSansPlan(toile())).toBe('Toile vide')
    expect(texteSansPlan(toile(1))).toBe('1 élément non trié')
    expect(texteSansPlan(toile(9))).toBe('9 éléments non triés')
  })
})
