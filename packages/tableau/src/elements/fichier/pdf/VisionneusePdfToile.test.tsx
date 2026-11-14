// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Magasin, creerMagasin } from '../../../coeur/magasin'
import { type Element, type Fichier, nouvelId, nouvelleNote } from '../../../coeur/tableau'
import '../..'
import { fermerMenus } from '../../../menuUnique'
import { Toile } from '../../../Toile'
import { ouvrirFenetreFichier, useFichierOuvert } from '../ouverture'

// pdf.js ne tourne pas sous jsdom : le faux moteur, et une carte sans aperçu.
vi.mock('../apercuPdf', async () => (await import('./fauxPdf')).moduleFaux)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ne mesure rien : la vue de la visionneuse fait 1000 × 800 px, et une toile ne se dessine pas.
const proto = HTMLElement.prototype
const avant = {
  largeur: Object.getOwnPropertyDescriptor(proto, 'clientWidth'),
  hauteur: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
  contexte: HTMLCanvasElement.prototype.getContext,
}
beforeAll(() => {
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 1000 })
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 800 })
  HTMLCanvasElement.prototype.getContext = (() => null) as never
})
afterAll(() => {
  if (avant.largeur) Object.defineProperty(proto, 'clientWidth', avant.largeur)
  if (avant.hauteur) Object.defineProperty(proto, 'clientHeight', avant.hauteur)
  HTMLCanvasElement.prototype.getContext = avant.contexte
})

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.hasPointerCapture ??= () => false
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([37, 80, 68, 70])))
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => ouvrirFenetreFichier(null))
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  vi.unstubAllGlobals()
})

const pdf: Element<Fichier> = { id: nouvelId(), x: 40, y: 2, largeur: 34, contenu: { type: 'fichier', fichier: 'f1', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 1000 } }
const note: Element = { ...nouvelleNote(2, 40), contenu: { type: 'note', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Derrière' }] }] } } }

let ouvert: string | null = null
function Temoin() {
  ouvert = useFichierOuvert()
  return null
}

/**
 * La toile, le PDF et une note ; le PDF choisi, puis ouvert. La note a bougé deux fois, et le second pas est défait :
 * ⌘Z et ⇧⌘Z auraient de quoi faire.
 */
async function monter() {
  const magasin: Magasin = creerMagasin({ titre: '', etiquettes: [], elements: [pdf, note] })
  magasin.faire([{ type: 'deplacer', id: note.id, de: [note.x, note.y], vers: [note.x + 5, note.y] }])
  magasin.faire([{ type: 'deplacer', id: note.id, de: [note.x + 5, note.y], vers: [note.x + 10, note.y] }])
  magasin.annuler()
  const services = { fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } }
  act(() =>
    racine.render(
      <>
        <Toile magasin={magasin} services={services} />
        <Temoin />
      </>,
    ),
  )
  await act(async () => {})
  const toile = hote.querySelector<HTMLElement>('.notak-toile')!
  // Le PDF choisi : Retour arrière le jetterait si la toile lisait la touche.
  act(() => void hote.querySelector(`.notak-carte[data-id="${pdf.id}"]`)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
  act(() => ouvrirFenetreFichier(pdf.id))
  for (let i = 0; i < 4; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))))
  expect(document.querySelector('.notak-pdf')).not.toBeNull()
  return { magasin, toile }
}

const etat = (m: Magasin) => JSON.stringify(m.lire().elements)
const touche = (n: Element | HTMLElement, init: KeyboardEventInit) =>
  act(() => void (n as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })))

const TOUCHES: [string, KeyboardEventInit][] = [
  ['Retour arrière', { key: 'Backspace', code: 'Backspace' }],
  ['Suppr', { key: 'Delete', code: 'Delete' }],
  ['⌘Z', { key: 'z', code: 'KeyZ', metaKey: true }],
  ['⇧⌘Z', { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true }],
  ['⌘A', { key: 'a', code: 'KeyA', metaKey: true }],
  ['⌘D', { key: 'd', code: 'KeyD', metaKey: true }],
]

describe('le PDF ouvert, la toile dessous ne bouge pas', () => {
  for (const [ou, cible] of [
    ['le focus sur la toile', () => hote.querySelector<HTMLElement>('.notak-toile')!],
    ['le focus dans la visionneuse', () => document.querySelector<HTMLElement>('.notak-pdf')!],
  ] as const) {
    it.each(TOUCHES)(`${ou} : %s ne touche pas la toile`, async (_nom, init) => {
      const { magasin } = await monter()
      const avant = etat(magasin)
      const n = cible()
      act(() => n.focus())
      touche(n, init)
      await act(async () => {})
      expect(etat(magasin)).toEqual(avant)
      expect(ouvert).toBe(pdf.id)
    })
  }

  it('Échap ferme la visionneuse, et la toile reprend ses touches : Retour arrière jette le PDF', async () => {
    const { magasin, toile } = await monter()
    touche(toile, { key: 'Escape', code: 'Escape' })
    await act(async () => {})
    expect(ouvert).toBeNull()
    expect(document.querySelector('.notak-pdf')).toBeNull()
    act(() => toile.focus())
    touche(toile, { key: 'Backspace', code: 'Backspace' })
    await act(async () => {})
    expect(magasin.lire().elements.find((e) => e.id === pdf.id)?.corbeille).toBeDefined()
  })

  it('en dessin, ⌘Z défait le dernier trait, sans remonter à la toile', async () => {
    const { magasin } = await monter()
    const avant = etat(magasin)
    const v = document.querySelector<HTMLElement>('.notak-pdf')!
    touche(v, { key: 'D', code: 'KeyD', shiftKey: true })
    const couche = document.querySelector('.notak-pdf-page[data-page="1"] .notak-pdf-saisie')!
    const pointeur = (type: string) => act(() => void couche.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10, bubbles: true, cancelable: true })))
    pointeur('pointerdown')
    pointeur('pointerup')
    expect(document.querySelectorAll('.notak-pdf-page[data-page="1"] .notak-pdf-traits g')).toHaveLength(1)
    touche(v, { key: 'z', code: 'KeyZ', metaKey: true })
    expect(document.querySelectorAll('.notak-pdf-page[data-page="1"] .notak-pdf-traits g')).toHaveLength(0)
    expect(etat(magasin)).toEqual(avant)
  })

  it('un fichier lâché sur la visionneuse ne se pose pas sur la toile derrière', async () => {
    const { magasin } = await monter()
    const avant = magasin.lire().elements.length
    // jsdom n'a ni DragEvent ni DataTransfer : un dépôt de fichier comme le bureau l'envoie.
    const fichier = new File([new Uint8Array([37, 80, 68, 70])], 'autre.pdf', { type: 'application/pdf' })
    const v = document.querySelector<HTMLElement>('.notak-pdf-defile')!
    let refuse = false
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const e = new Event(type, { bubbles: true, cancelable: true })
      const transfert = { dropEffect: 'copy', effectAllowed: 'all', types: ['Files'], files: [fichier], items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => fichier }], getData: () => '' }
      Object.defineProperties(e, { dataTransfer: { value: transfert }, clientX: { value: 500 }, clientY: { value: 400 } })
      act(() => void v.dispatchEvent(e))
      if (type === 'dragover') refuse = transfert.dropEffect === 'none'
    }
    await act(async () => {})
    expect(magasin.lire().elements).toHaveLength(avant)
    expect(refuse).toBe(true)
  })
})
