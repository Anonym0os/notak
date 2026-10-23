// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Fichier } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { RenduFichier } from './Fichier'

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
})

const contexte = (): ContexteToile =>
  ({
    magasin: creerMagasin({ titre: '', etiquettes: [], elements: [] }),
    services: { fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } },
    finirEdition: () => {},
  }) as unknown as ContexteToile

async function rendre(contenu: Partial<Fichier>, plus: Partial<Element<Fichier>> = {}) {
  const element: Element<Fichier> = {
    id: 'e1',
    x: 0,
    y: 0,
    largeur: 34,
    contenu: { type: 'fichier', fichier: 'f1', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 1_240_000, ...contenu },
    ...plus,
  }
  await act(async () => {
    racine.render(<RenduFichier element={element} choisie={false} enEdition={false} contexte={contexte()} brouillon={() => {}} changer={() => {}} />)
  })
}

describe('la carte d’un fichier', () => {
  it('en carte : le titre, puis « Télécharger - Ouvrir - taille » pour un PDF', async () => {
    await rendre({})
    expect(hote.querySelector('.notak-fichier-nom')?.textContent).toBe('devis.pdf')
    expect(hote.querySelector('.notak-fichier-details')?.textContent).toBe('Télécharger - Ouvrir - 1,2 MB')
    expect(hote.querySelector('iframe.notak-fichier-pdf')).not.toBeNull()
  })

  it('« Ouvrir » ne se propose que pour un PDF ou un texte', async () => {
    await rendre({ nom: 'budget.xlsx', typeMime: '' })
    expect(hote.querySelector('.notak-fichier-details')?.textContent).toBe('Télécharger - 1,2 MB')
    expect(hote.querySelector('.notak-fichier-sans-apercu')?.textContent).toBe('Aucun aperçu disponible')
  })

  it('en icône : la feuille, le nom dessous, la taille, sans aperçu', async () => {
    await rendre({ icone: true }, { largeur: 10 })
    expect(hote.querySelector('.notak-fichier')?.hasAttribute('data-feuille')).toBe(true)
    expect(hote.querySelector('.notak-feuille-grande')).not.toBeNull()
    expect(hote.querySelector('.notak-fichier-texte .notak-fichier-nom')?.textContent).toBe('devis.pdf')
    expect(hote.querySelector('.notak-fichier-details')?.textContent).toBe('1,2 MB')
    expect(hote.querySelector('iframe')).toBeNull()
  })

  it('le contour de sélection suit le papier de la feuille, pas celle de la petite icône d’une carte', async () => {
    await rendre({ icone: true }, { largeur: 10 })
    const contour = hote.querySelector('.notak-feuille-grande .notak-feuille-contour')
    expect(contour?.getAttribute('d')).toBe('M0 0H40L56 16V72H0Z')
    await rendre({})
    expect(hote.querySelector('.notak-feuille-contour')).toBeNull()
  })

  it('sans les infos : rien que l’aperçu', async () => {
    await rendre({ sansInfos: true })
    expect(hote.querySelector('.notak-fichier-meta')).toBeNull()
    expect(hote.querySelector('iframe.notak-fichier-pdf')).not.toBeNull()
  })

  it('la légende se range dans la carte', async () => {
    await rendre({ legende: 'Version signée' })
    expect(hote.querySelector('.notak-fichier-legende')?.textContent).toBe('Version signée')
  })
})
