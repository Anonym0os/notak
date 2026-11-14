// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Camera } from '../../coeur/camera'
import { type Magasin, creerMagasin } from '../../coeur/magasin'
import { type Element, nouvelId, nouvelleNote } from '../../coeur/tableau'
import '..'
import { fermerMenus } from '../../menuUnique'
import { Toile } from '../../Toile'
import { annoter, etatAnnotation } from './modeAnnotation'
import { imageOuverte, ouvrirImage } from './visionneuse'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
const avant = { un: document.elementFromPoint, tous: document.elementsFromPoint }
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  HTMLElement.prototype.hasPointerCapture ??= () => false
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => {
    ouvrirImage(null)
    annoter(null)
  })
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  document.elementFromPoint = avant.un
  document.elementsFromPoint = avant.tous
})

const image: Element = { id: nouvelId(), x: 40, y: 2, largeur: 10, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 900, typeMime: 'image/png' } }
const note: Element = { ...nouvelleNote(2, 40), contenu: { type: 'note', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Derrière' }] }] } } }

interface Montee {
  magasin: Magasin
  camera: () => Camera | undefined
  toile: HTMLElement
}

/**
 * La toile, une image et une note ; l'image ouverte d'un double-clic, et choisie. La note a bougé deux fois, et le
 * second pas est défait : ⌘Z et ⇧⌘Z auraient de quoi faire.
 */
async function monter(): Promise<Montee> {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [image, note] })
  magasin.faire([{ type: 'deplacer', id: note.id, de: [note.x, note.y], vers: [note.x + 5, note.y] }])
  magasin.faire([{ type: 'deplacer', id: note.id, de: [note.x + 5, note.y], vers: [note.x + 10, note.y] }])
  magasin.annuler()
  let camera: Camera | undefined
  const services = { fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } }
  act(() => racine.render(<Toile magasin={magasin} services={services} surCamera={(c) => void (camera = c)} />))
  await act(async () => {})
  const carte = hote.querySelector(`.notak-carte[data-id="${image.id}"]`)!
  document.elementFromPoint = () => carte
  document.elementsFromPoint = () => [carte]
  // Un clic la choisit, puis le double-clic l'ouvre (le second appui d'un vrai double-clic sur une image choisie ouvre sa
  // légende, que le double-clic referme : ce n'est pas l'objet de ces essais).
  const souris = (type: string, detail: number) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: 700, clientY: 100, detail })
    Object.defineProperties(e, { pointerType: { value: 'mouse' }, pointerId: { value: 1 }, isPrimary: { value: true } })
    act(() => void carte.dispatchEvent(e))
  }
  for (const type of ['pointerdown', 'pointerup', 'click']) souris(type, 1)
  souris('dblclick', 2)
  await act(async () => {})
  expect(imageOuverte()).toBe(image.id)
  expect(hote.querySelector(`.notak-carte[data-id="${image.id}"]`)!.hasAttribute('data-choisie')).toBe(true)
  return { magasin, camera: () => camera, toile: hote.querySelector<HTMLElement>('.notak-toile')! }
}

const surMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const creation = surMac ? { ctrlKey: true, metaKey: true } : { ctrlKey: true, altKey: true }

/** Les touches qui, sur la toile, jettent, choisissent, copient, défont, déplacent ou créent. */
const TOUCHES: [string, KeyboardEventInit][] = [
  ['Retour arrière', { key: 'Backspace', code: 'Backspace' }],
  ['Suppr', { key: 'Delete', code: 'Delete' }],
  ['⌘ Retour arrière', { key: 'Backspace', code: 'Backspace', metaKey: true }],
  ['⌘A', { key: 'a', code: 'KeyA', metaKey: true }],
  ['⌘D', { key: 'd', code: 'KeyD', metaKey: true }],
  ['⌘Z', { key: 'z', code: 'KeyZ', metaKey: true }],
  ['⇧⌘Z', { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true }],
  ['⌘Y', { key: 'y', code: 'KeyY', metaKey: true }],
  ['⌥→', { key: 'ArrowRight', code: 'ArrowRight', altKey: true }],
  ['⇧⌘↑', { key: 'ArrowUp', code: 'ArrowUp', metaKey: true, shiftKey: true }],
  ['⌘ Entrée', { key: 'Enter', code: 'Enter', metaKey: true }],
  ['la création d’une colonne', { key: 'g', code: 'KeyG', ...creation }],
  ['Z (tout cadrer)', { key: 'z', code: 'KeyZ' }],
  ['une lettre', { key: 'a', code: 'KeyA' }],
]

/** Le presse-papiers : ce que ⌘C, ⌘X et ⌘V envoient à la page. */
const PRESSE_PAPIERS = ['copy', 'cut', 'paste'] as const

const presseePapiers = () => ({ setData: vi.fn(), getData: (type: string) => (type === 'text/plain' ? 'Collé' : ''), files: [], items: [], types: ['text/plain'] })

const OU: [string, () => HTMLElement][] = [
  // Le double-clic qui ouvre l'image laisse le focus à la toile.
  ['le focus sur la toile', () => hote.querySelector<HTMLElement>('.notak-toile')!],
  // Un bouton de la barre de la visionneuse garde le focus après un clic.
  ['le focus sur un bouton de la visionneuse', () => document.querySelector<HTMLElement>('.notak-visionneuse-barre button')!],
]

/** Ce que la toile montre et garde : ses éléments, ce qui est choisi, la vue. */
function etat(m: Montee) {
  return {
    elements: JSON.stringify(m.magasin.lire().elements),
    choisis: [...hote.querySelectorAll<HTMLElement>('.notak-carte[data-choisie]')].map((n) => n.dataset.id).sort(),
    camera: JSON.stringify(m.camera()),
  }
}

describe('la visionneuse ouverte, aucune touche ne remonte à la toile', () => {
  for (const [ou, cible] of OU) {
    describe(ou, () => {
      it.each(TOUCHES)('%s ne touche pas la toile', async (_nom, init) => {
        const m = await monter()
        const avant = etat(m)
        const n = cible()
        act(() => n.focus())
        act(() => void n.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })))
        act(() => void n.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init })))
        await act(async () => {})
        expect(etat(m)).toEqual(avant)
        expect(imageOuverte()).toBe(image.id)
        expect(etatAnnotation().id).toBeNull()
      })

      it.each(PRESSE_PAPIERS)('%s ne touche pas la toile', async (type) => {
        const m = await monter()
        const avant = etat(m)
        const n = cible()
        act(() => n.focus())
        const donnees = presseePapiers()
        const e = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperty(e, 'clipboardData', { value: donnees })
        act(() => void n.dispatchEvent(e))
        await act(async () => {})
        expect(etat(m)).toEqual(avant)
        expect(donnees.setData).not.toHaveBeenCalled()
      })
    })
  }
})

describe('les touches de la visionneuse restent les siennes', () => {
  const touche = (n: HTMLElement, init: KeyboardEventInit) =>
    act(() => void n.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })))

  it('Échap la ferme, et la toile reprend ensuite ses touches : Retour arrière jette l’image', async () => {
    const m = await monter()
    touche(m.toile, { key: 'Escape', code: 'Escape' })
    await act(async () => {})
    expect(imageOuverte()).toBeNull()
    act(() => m.toile.focus())
    touche(m.toile, { key: 'Backspace', code: 'Backspace' })
    await act(async () => {})
    expect(m.magasin.lire().elements.find((e) => e.id === image.id)?.corbeille).toBeDefined()
  })

  it('Maj+D ouvre le dessin sur l’image, comme « Dessiner »', async () => {
    const m = await monter()
    touche(m.toile, { key: 'D', code: 'KeyD', shiftKey: true })
    await act(async () => {})
    expect(imageOuverte()).toBeNull()
    expect(etatAnnotation().id).toBe(image.id)
  })

  it('⌘+ et ⌘0 zooment l’image, pas la vue derrière', async () => {
    const m = await monter()
    const vue = JSON.stringify(m.camera())
    touche(m.toile, { key: '=', code: 'Equal', metaKey: true })
    await act(async () => {})
    expect(document.querySelector<HTMLElement>('.notak-visionneuse-image')!.style.transform).toContain('scale(1.25)')
    touche(m.toile, { key: '0', code: 'Digit0', metaKey: true })
    await act(async () => {})
    expect(document.querySelector<HTMLElement>('.notak-visionneuse-image')!.style.transform).toContain('scale(1)')
    expect(JSON.stringify(m.camera())).toBe(vue)
  })
})
