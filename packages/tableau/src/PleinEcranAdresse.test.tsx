// @vitest-environment jsdom
import { act, useCallback, useMemo, useState } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Magasin, creerMagasin } from './coeur/magasin'
import { type Element, type Id, nouvelId } from './coeur/tableau'
import './elements'
import { imageOuverte, ouvrirImage } from './elements/image/visionneuse'
import type { Services } from './elements/types'
import { fermerMenus } from './menuUnique'
import { Toile } from './Toile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => ouvrirImage(null))
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
})

const texte = { type: 'doc', content: [{ type: 'paragraph' }] }
const document_: Element = { id: nouvelId(), x: 2, y: 2, largeur: 17, contenu: { type: 'document', titre: 'Notes', texte } }
const note: Element = { id: nouvelId(), x: 30, y: 2, largeur: 17, contenu: { type: 'note', texte } }

describe('le plein écran d’un élément a une adresse', () => {
  it('l’adresse qui nomme un document le choisit et l’ouvre en grand, sans le redire à l’application', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [document_, note] })
    const pleinEcran = vi.fn()
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: document_.id, pleinEcran }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).not.toBeNull()
    expect(pleinEcran).not.toHaveBeenCalled()
  })

  it('une adresse qui nomme un élément absent ou sans plein écran n’ouvre rien', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [document_, note] })
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: note.id }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).toBeNull()
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: 'inconnu' }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).toBeNull()
  })

  it('quand l’adresse perd l’élément (retour du navigateur), le document se referme', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [document_] })
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: document_.id }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).not.toBeNull()
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: null }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).toBeNull()
  })
})

describe('une image ouverte d’un double-clic, puis refermée', () => {
  const image: Element = { id: nouvelId(), x: 40, y: 2, largeur: 10, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 900, typeMime: 'image/png' } }

  /** L'espace tel que le tient `EspaceNotak` : ce que la toile ouvre en grand s'écrit dans l'adresse, qui le lui redit. */
  function Espace({ magasin, services, adresses }: { magasin: Magasin; services: Services; adresses: (Id | null)[] }) {
    const [adresse, setAdresse] = useState<Id | null>(null)
    const pleinEcran = useCallback(
      (id: Id | null) => {
        adresses.push(id)
        setAdresse(id)
      },
      [adresses],
    )
    const tout = useMemo<Services>(() => ({ ...services, elementAdresse: adresse, pleinEcran }), [services, adresse, pleinEcran])
    return <Toile magasin={magasin} services={tout} />
  }

  const pointeur = (cible: globalThis.Element, type: string, x: number, y: number) =>
    act(() => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
      Object.assign(e, { pointerId: 1, pointerType: 'mouse', isPrimary: true })
      cible.dispatchEvent(e)
    })

  // Ce qui est sous le pointeur, que jsdom ne calcule pas : chaque essai le dit, puis on rend l'original.
  let sous: globalThis.Element | null = null
  const avant = { un: document.elementFromPoint, tous: document.elementsFromPoint }
  beforeEach(() => {
    document.elementFromPoint = () => sous
    document.elementsFromPoint = () => (sous ? [sous] : [])
    HTMLElement.prototype.setPointerCapture ??= () => {}
    HTMLElement.prototype.releasePointerCapture ??= () => {}
    HTMLElement.prototype.hasPointerCapture ??= () => false
  })
  afterEach(() => {
    document.elementFromPoint = avant.un
    document.elementsFromPoint = avant.tous
    sous = null
  })

  it('ne revient pas quand on glisse une toile neuve sur la toile, et l’adresse ne la nomme plus', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [image] })
    const adresses: (Id | null)[] = []
    const services: Services = {
      fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' },
      creerTableau: () => 'neuve',
      tableau: () => ({ titre: '', etiquettes: [], elements: [] }),
    }
    act(() => racine.render(<Espace magasin={magasin} services={services} adresses={adresses} />))
    await act(async () => {})
    const toile = hote.querySelector<HTMLElement>('.notak-toile')!

    // Le double-clic sur l'image la montre en grand, et l'adresse le dit.
    const carte = hote.querySelector(`.notak-carte[data-id="${image.id}"]`)!
    sous = carte
    act(() => void carte.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 600, clientY: 100 })))
    await act(async () => {})
    expect(imageOuverte()).toBe(image.id)
    expect(adresses).toEqual([image.id])

    // Échap la referme : l'adresse ne la nomme plus.
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    await act(async () => {})
    expect(imageOuverte()).toBeNull()
    expect(adresses.at(-1)).toBeNull()

    // L'outil « Toile », tiré de la colonne et lâché sur la toile : la toile neuve naît, l'image reste fermée.
    const outil = hote.querySelector<HTMLElement>('.notak-barre-outils button[aria-label="Toile"]')!
    sous = toile
    pointeur(outil, 'pointerdown', 20, 200)
    pointeur(toile, 'pointermove', 120, 400)
    pointeur(toile, 'pointermove', 200, 500)
    pointeur(toile, 'pointerup', 200, 500)
    await act(async () => {})
    expect(magasin.lire().elements.some((e) => e.contenu.type === 'tableau')).toBe(true)
    expect(imageOuverte()).toBeNull()
    expect(adresses.at(-1)).toBeNull()
  })
})
