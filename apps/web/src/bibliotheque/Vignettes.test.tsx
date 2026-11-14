// @vitest-environment jsdom
import { type ResumeContenu, definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FournisseurVignettes, type SourceVignettes, Vignette, largeurDesVignettes, photoEntiere, texteSansPlan } from './Vignettes'

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

  const photo = (largeur: number, hauteur: number): ResumeContenu => ({ genre: 'image', element: 'p', titre: '', fichier: 'f-portrait', largeur, hauteur })
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
