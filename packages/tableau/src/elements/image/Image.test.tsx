// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Image } from '../../coeur/tableau'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import './index'
import { RenduImage } from './Image'

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
    camera: { x: 0, y: 0, echelle: 1 },
    services: { fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } },
    finirEdition: () => {},
    commencerEdition: () => {},
  }) as unknown as ContexteToile

async function rendre(contenu: Partial<Image>, plus: Partial<Element<Image>> = {}, choisie = false) {
  const element: Element<Image> = {
    id: 'i1',
    x: 0,
    y: 0,
    largeur: 20,
    contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 200, typeMime: 'image/jpeg', ...contenu },
    ...plus,
  }
  await act(async () => {
    racine.render(<RenduImage element={element} choisie={choisie} enEdition={false} contexte={contexte()} brouillon={() => {}} changer={() => {}} />)
  })
}

describe('la carte d’une image', () => {
  it('la hauteur tombe sur la grille, moins les 2 px de la bordure', async () => {
    await rendre({})
    // 20 UG de large à 3 : 2, soit 13,33 UG, arrondies à 13 : 130 − 2 px.
    expect((hote.querySelector('.notak-image-cadre') as HTMLElement).style.height).toBe('128px')
  })

  it('la légende se range dans la carte, et l’invite reste tant qu’elle est affichée', async () => {
    await rendre({ legende: 'Un port' })
    expect(hote.querySelector('.notak-legende')?.textContent).toBe('Un port')
    await rendre({ legendeAffichee: true })
    expect(hote.querySelector('.notak-legende[data-vide]')).not.toBeNull()
    await rendre({})
    expect(hote.querySelector('.notak-legende')).toBeNull()
  })

  it('sous 8 UG de large, la légende est masquée', async () => {
    await rendre({ legende: 'Un port' }, { largeur: 6 })
    expect(hote.querySelector('.notak-legende')).toBeNull()
  })

  it('le type dit sa carte : blanche, sauf une image transparente qui n’a pas rendu son fond', () => {
    const def = definition('image')!
    const sansFond = def.sansFond as (c: Image) => boolean
    const base = { type: 'image', fichier: 'f', largeurOrigine: 1, hauteurOrigine: 1 } as const
    expect(sansFond({ ...base, typeMime: 'image/jpeg' })).toBe(false)
    expect(sansFond({ ...base, typeMime: 'image/png', transparente: true })).toBe(true)
    expect(sansFond({ ...base, typeMime: 'image/png', transparente: true, fondBlanc: true })).toBe(false)
    expect(def.retraitPx?.(base)).toBe(2)
  })
})
