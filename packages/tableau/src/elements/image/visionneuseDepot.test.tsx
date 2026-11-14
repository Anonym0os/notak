// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Magasin, creerMagasin } from '../../coeur/magasin'
import { type Element, nouvelId } from '../../coeur/tableau'
import '..'
import { fermerMenus } from '../../menuUnique'
import { Toile } from '../../Toile'
import { imageOuverte, ouvrirImage } from './visionneuse'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Le `DataTransfer` du navigateur, que jsdom n'a pas : la toile y recopie ce qu'on lui dépose. */
class DT {
  files: File[] = []
  private donnees = new Map<string, string>()
  items = { add: (f: File) => void this.files.push(f) }
  get types() {
    return [...this.donnees.keys(), ...(this.files.length > 0 ? ['Files'] : [])]
  }
  setData(type: string, valeur: string) {
    this.donnees.set(type, valeur)
  }
  getData(type: string) {
    return this.donnees.get(type) ?? ''
  }
}

let racine: Root
let hote: HTMLElement
const avant = { un: document.elementFromPoint, tous: document.elementsFromPoint }
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  document.elementFromPoint = () => null
  document.elementsFromPoint = () => []
  vi.stubGlobal('DataTransfer', DT)
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => ouvrirImage(null))
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  document.elementFromPoint = avant.un
  document.elementsFromPoint = avant.tous
  vi.unstubAllGlobals()
})

const image: Element = { id: nouvelId(), x: 40, y: 2, largeur: 10, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 900, typeMime: 'image/png' } }

async function monter(): Promise<Magasin> {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [image] })
  const services = { fichiers: { enregistrer: async () => 'f2', adresse: async () => '/api/fichiers/ab' } }
  act(() => racine.render(<Toile magasin={magasin} services={services} />))
  await act(async () => {})
  act(() => ouvrirImage(image.id))
  await act(async () => {})
  expect(document.querySelector('.notak-visionneuse')).not.toBeNull()
  return magasin
}

/** Ce qu'on glisse depuis le bureau : un texte, ou une photo. jsdom n'a ni DragEvent ni DataTransfer. */
const GLISSES: [string, () => { types: string[]; files: File[]; items: unknown[]; getData(t: string): string }][] = [
  ['un texte', () => ({ types: ['text/plain'], files: [], items: [], getData: (t: string) => (t === 'text/plain' ? 'Bonjour' : '') })],
  [
    'un fichier image',
    () => {
      const photo = new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' })
      return { types: ['Files'], files: [photo], items: [{ kind: 'file', type: 'image/png', getAsFile: () => photo }], getData: () => '' }
    },
  ],
]

function glisser(cible: globalThis.Element, type: string, donnees: object) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const transfert = { dropEffect: 'copy', effectAllowed: 'all', ...donnees }
  Object.defineProperties(e, { dataTransfer: { value: transfert }, clientX: { value: 600 }, clientY: { value: 400 } })
  act(() => void cible.dispatchEvent(e))
  return { e, transfert }
}

describe('un dépôt sur la visionneuse', () => {
  it.each(GLISSES)('%s lâché sur l’image ouverte ne se pose pas sur la toile derrière, et le curseur dit qu’il est refusé', async (_nom, donnees) => {
    const magasin = await monter()
    const avantDepot = JSON.stringify(magasin.lire().elements)
    const fond = document.querySelector('.notak-visionneuse-zone')!
    glisser(fond, 'dragenter', donnees())
    const survol = glisser(fond, 'dragover', donnees())
    const depot = glisser(fond, 'drop', donnees())
    await act(async () => {})
    await act(async () => {})
    expect(JSON.stringify(magasin.lire().elements)).toBe(avantDepot)
    expect(imageOuverte()).toBe(image.id)
    // Annulé, le survol empêche le navigateur d'ouvrir le fichier à la place de Notak ; « none » refuse le dépôt.
    expect(survol.e.defaultPrevented).toBe(true)
    expect(survol.transfert.dropEffect).toBe('none')
    expect(depot.e.defaultPrevented).toBe(true)
  })

  it('refermée, elle rend ses dépôts à la toile : le texte y devient une carte', async () => {
    const magasin = await monter()
    act(() => ouvrirImage(null))
    await act(async () => {})
    const toile = hote.querySelector('.notak-toile')!
    glisser(toile, 'dragover', GLISSES[0]![1]())
    glisser(toile, 'drop', GLISSES[0]![1]())
    await act(async () => {})
    await act(async () => {})
    expect(magasin.lire().elements.length).toBe(2)
  })
})
