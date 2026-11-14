// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BarreOutils } from './Barres'
import './elements'
import { definirLangue } from './langue'
import { fermerMenus } from './menuUnique'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
})

const monter = (grisee = false, dansLaCorbeille = 0) =>
  act(() =>
    racine.render(
      <BarreOutils
        grisee={grisee}
        surAppui={() => {}}
        rebond={null}
        corbeille={{ nombre: dansLaCorbeille, ouverte: false, basculer: () => {} }}
        nonTries={{ nombre: 0, ouverte: false, basculer: () => {} }}
      />,
    ),
  )

/** Les libellés affichés sous les outils de la barre (ceux du « ••• » quand il est ouvert), la corbeille comprise. */
const libelles = () => [...hote.querySelectorAll('nav .notak-outil .notak-outil-libelle')]

describe('la barre de création', () => {
  it('les outils n’ont plus de title natif : un aria-label, et l’infobulle maison', () => {
    monter()
    const boutons = [...hote.querySelectorAll('nav .notak-outil, nav .notak-outil-plus, .notak-non-tries-bouton')]
    expect(boutons.length).toBeGreaterThan(8)
    expect(boutons.filter((b) => b.hasAttribute('title'))).toEqual([])
    expect(hote.querySelectorAll('nav .notak-infobulle-hote').length).toBeGreaterThan(8)
  })

  it('après un glisser de l’outil Image, la bulle invite à cliquer ; après un clic sur un autre outil, elle invite à glisser', () => {
    const avec = (rebond: { libelle: string; n: number; texte?: 'barre.cliquer' }) =>
      act(() =>
        racine.render(
          <BarreOutils grisee={false} surAppui={() => {}} rebond={rebond} corbeille={{ nombre: 0, ouverte: false, basculer: () => {} }} nonTries={{ nombre: 0, ouverte: false, basculer: () => {} }} />,
        ),
      )
    avec({ libelle: 'Ajouter une image', n: 1, texte: 'barre.cliquer' })
    expect(hote.querySelector('.notak-bulle-outil')?.textContent).toBe('Cliquez sur l’outil pour ajouter une image')
    avec({ libelle: 'À faire', n: 2 })
    expect(hote.querySelector('.notak-bulle-outil')?.textContent).toBe('Glissez l’outil sur le fond')
  })

  it('les gestes s’appellent À faire, Image, Envoyer, Dessiner ; les Étiquettes sont dans le « ••• »', () => {
    monter()
    const noms = [...hote.querySelectorAll('nav > .notak-outil-place .notak-outil-libelle')].map((l) => l.textContent)
    expect(noms).toEqual(expect.arrayContaining(['À faire', 'Image', 'Envoyer', 'Dessiner']))
    expect(noms).not.toContain('Étiquettes')
    expect(hote.querySelector('nav > .notak-barre-sep')).not.toBeNull()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-outil-plus')!.click())
    expect(hote.querySelector('.notak-tiroir')).not.toBeNull()
  })

  it('met un mot court sous chaque outil, en français comme en anglais ; le nom entier reste pour l’infobulle et la lecture à voix haute', () => {
    const outil = (nom: string) => hote.querySelector(`nav .notak-outil[aria-label="${nom}"] .notak-outil-libelle`)?.textContent
    try {
      for (const [langue, commentaire, image] of [
        ['fr', ['Commentaire', 'Commenter'], ['Ajouter une image', 'Image']],
        ['en', ['Comment', 'Comment'], ['Add image', 'Add image']],
      ] as const) {
        act(() => definirLangue(langue))
        monter()
        // Le « ••• » ouvert : ce qui y est rangé faute de place compte aussi.
        act(() => hote.querySelector<HTMLButtonElement>('.notak-outil-plus')!.click())
        expect(outil(commentaire[0])).toBe(commentaire[1])
        expect(outil(image[0])).toBe(image[1])
        // « Commentaire » et « Ajouter une image » étaient coupés : ceux de la barre tiennent en neuf lettres au plus.
        const barre = libelles().filter((l) => !l.closest('.notak-tiroir'))
        expect(barre.length).toBeGreaterThan(8)
        for (const l of barre) expect(l.textContent!.length, l.textContent!).toBeLessThanOrEqual(9)
        expect(barre.map((l) => l.textContent)).toContain(langue === 'fr' ? 'Corbeille' : 'Trash')
        act(() => hote.querySelector<HTMLButtonElement>('.notak-outil-plus')!.click())
      }
    } finally {
      act(() => definirLangue('fr'))
    }
  })

  it('dit ce que la corbeille contient par une pastille sur son icône, et son seul nom dessous', () => {
    monter(false, 8)
    const corbeille = hote.querySelector('nav [data-corbeille]')!
    expect(corbeille.querySelector('.notak-outil-libelle')!.textContent).toBe('Corbeille')
    expect(corbeille.querySelector('.notak-outil-icone .notak-outil-nombre')!.textContent).toBe('8')
    expect(corbeille.getAttribute('aria-label')).toBe('Corbeille (8)')
    monter(false, 150)
    expect(corbeille.querySelector('.notak-outil-nombre')!.textContent).toBe('99+')
    monter(false, 0)
    expect(corbeille.querySelector('.notak-outil-nombre')).toBeNull()
    expect(corbeille.getAttribute('aria-label')).toBe('Corbeille')
  })

  it('un libellé plus large que sa tuile se lit en entier : sa taille baisse juste assez, son interligne reste', () => {
    const style = document.createElement('style')
    style.textContent = '.notak-outil-libelle { font-size: 11px; line-height: 13px; }'
    document.head.append(style)
    // Seule la corbeille déborde : 88 px de texte pour 64 de place.
    const largeur = (e: Element, deborde: number) => (e.classList.contains('notak-outil-libelle') && e.textContent === 'Corbeille' ? deborde : 40)
    const texte = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
      return largeur(this, 88)
    })
    const place = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return largeur(this, 64)
    })
    try {
      monter()
      const corbeille = hote.querySelector<HTMLElement>('nav [data-corbeille] .notak-outil-libelle')!
      expect(parseFloat(corbeille.style.fontSize)).toBe(8)
      expect(corbeille.style.lineHeight).toBe('13px')
      expect(hote.querySelector<HTMLElement>('nav .notak-outil-place .notak-outil-libelle')!.style.fontSize).toBe('')
    } finally {
      texte.mockRestore()
      place.mockRestore()
      style.remove()
    }
  })

  it('l’aperçu d’un modèle la montre grisée', () => {
    monter(true)
    expect(hote.querySelector('nav')?.hasAttribute('data-grisee')).toBe(true)
  })
})
