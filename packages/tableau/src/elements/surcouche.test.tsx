// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Camera } from '../coeur/camera'
import { type Magasin, creerMagasin } from '../coeur/magasin'
import { type Element, nouvelId, nouvelleNote } from '../coeur/tableau'
import '.'
import { fermerMenus } from '../menuUnique'
import { Toile } from '../Toile'
import { DUREE_TENUE } from './enGrand'

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
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  HTMLElement.prototype.hasPointerCapture ??= () => false
  document.elementFromPoint = (x, y) => sousLePointeur(x, y)
  document.elementsFromPoint = (x, y) => [sousLePointeur(x, y)]
  vi.stubGlobal('DataTransfer', DT)
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  for (const n of document.body.querySelectorAll(':scope > [aria-hidden="true"]')) n.remove()
  document.elementFromPoint = avant.un
  document.elementsFromPoint = avant.tous
  vi.unstubAllGlobals()
})

// Une page vide : son éditeur, ouvert, ne cherche pas à faire défiler un texte que jsdom ne sait pas mesurer.
const texte = { type: 'doc', content: [{ type: 'paragraph' }] }
const page: Element = { id: nouvelId(), x: 40, y: 2, largeur: 17, contenu: { type: 'document', titre: 'Notes', texte } }
const note: Element = { ...nouvelleNote(2, 40), contenu: { type: 'note', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Derrière' }] }] } } }

/** Où l'on presse : là où la note est posée sur la toile, sous la page ouverte en grand. */
const X = 300
const Y = 600

/**
 * Ce que le navigateur trouve sous le pointeur, que jsdom ne calcule pas : la page ouverte en grand couvre tout ; sinon,
 * ce qui est posé sur la page à cet endroit (une boîte fixe sous `body`, la dernière posée au-dessus), sinon la note.
 */
function sousLePointeur(x: number, y: number): globalThis.Element {
  const fond = document.querySelector('.notak-document-fond')
  if (fond) return fond
  const poses = [...document.body.children].filter((n): n is HTMLElement => n instanceof HTMLElement && n !== hote && n.style.position === 'fixed')
  for (const n of poses.reverse()) {
    const [l, t, w, h] = [n.style.left, n.style.top, n.style.width, n.style.height].map((v) => Number.parseFloat(v))
    if (x >= l! && x <= l! + w! && y >= t! && y <= t! + h!) return n
  }
  return hote.querySelector(`.notak-carte[data-id="${note.id}"] .notak-note`) ?? hote.querySelector(`.notak-carte[data-id="${note.id}"]`)!
}

interface Montee {
  magasin: Magasin
  camera: () => Camera | undefined
  toile: HTMLElement
  noteSurLaToile: () => HTMLElement
}

/** La toile, une page et une note ; la page ouverte en grand (son adresse la nomme), dans sa surcouche. */
async function monter(): Promise<Montee> {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [page, note] })
  magasin.faire([{ type: 'deplacer', id: note.id, de: [note.x, note.y], vers: [note.x + 5, note.y] }])
  let camera: Camera | undefined
  // Un dépôt de fichiers : ce qu'on lâcherait sur la toile y deviendrait une carte.
  const fichiers = { enregistrer: async () => 'f9', adresse: async () => null }
  act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: page.id, fichiers }} surCamera={(c) => void (camera = c)} />))
  await act(async () => {})
  expect(document.querySelector('.notak-document-fond')).not.toBeNull()
  return {
    magasin,
    camera: () => camera,
    toile: hote.querySelector<HTMLElement>('.notak-toile')!,
    noteSurLaToile: () => hote.querySelector<HTMLElement>(`.notak-carte[data-id="${note.id}"]`)!,
  }
}

describe('la page ouverte en grand, aucune touche ne remonte à la toile', () => {
  const TOUCHES: [string, KeyboardEventInit][] = [
    ['⌘+', { key: '=', code: 'Equal', metaKey: true }],
    ['⌘−', { key: '-', code: 'Minus', metaKey: true }],
    ['Retour arrière', { key: 'Backspace', code: 'Backspace' }],
    ['⌘A', { key: 'a', code: 'KeyA', metaKey: true }],
    ['⌘Z', { key: 'z', code: 'KeyZ', metaKey: true }],
  ]
  it.each(TOUCHES)('%s, le focus resté sur la toile, ne touche ni la vue ni les éléments', async (_nom, init) => {
    const m = await monter()
    const vue = JSON.stringify(m.camera())
    const elements = JSON.stringify(m.magasin.lire().elements)
    act(() => m.toile.focus())
    act(() => void m.toile.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })))
    // Le zoom de la toile s'anime : on lui laisse le temps d'arriver.
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(JSON.stringify(m.camera())).toBe(vue)
    expect(JSON.stringify(m.magasin.lire().elements)).toBe(elements)
    expect(document.querySelector('.notak-document-fond')).not.toBeNull()
  })
})

function glisser(cible: globalThis.Element, type: string, donnees: object) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const transfert = { dropEffect: 'copy', effectAllowed: 'all', ...donnees }
  Object.defineProperties(e, { dataTransfer: { value: transfert }, clientX: { value: X }, clientY: { value: Y } })
  act(() => void cible.dispatchEvent(e))
  return { e, transfert }
}

describe('un dépôt sur la page ouverte en grand', () => {
  const unTexte = () => ({ types: ['text/plain'], files: [], items: [], getData: (t: string) => (t === 'text/plain' ? 'Bonjour' : '') })
  const unFichier = () => {
    const f = new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' })
    return { types: ['Files'], files: [f], items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => f }], getData: () => '' }
  }

  it('un texte lâché sur son fond ne se pose pas sur la toile derrière, et le curseur dit qu’il est refusé', async () => {
    const m = await monter()
    const elements = JSON.stringify(m.magasin.lire().elements)
    const fond = document.querySelector('.notak-document-fond')!
    const survol = glisser(fond, 'dragover', unTexte())
    const depot = glisser(fond, 'drop', unTexte())
    await act(async () => {})
    await act(async () => {})
    expect(JSON.stringify(m.magasin.lire().elements)).toBe(elements)
    expect(survol.e.defaultPrevented).toBe(true)
    expect(survol.transfert.dropEffect).toBe('none')
    expect(depot.e.defaultPrevented).toBe(true)
  })

  it('un fichier lâché dans la page ne se pose pas sur la toile derrière, et le navigateur ne l’ouvre pas', async () => {
    const m = await monter()
    const elements = JSON.stringify(m.magasin.lire().elements)
    // L'éditeur cherche où tombe le fichier ; jsdom ne le dit pas.
    document.elementFromPoint = () => null
    const editeur = document.querySelector('.notak-document-fond [contenteditable="true"]')!
    glisser(editeur, 'dragover', unFichier())
    const depot = glisser(editeur, 'drop', unFichier())
    await act(async () => {})
    await act(async () => {})
    expect(JSON.stringify(m.magasin.lire().elements)).toBe(elements)
    expect(depot.e.defaultPrevented).toBe(true)
  })
})

type Genre = 'mouse' | 'touch'

function envoyer(cible: globalThis.Element, type: string, genre: Genre, detail = 1) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: /down/.test(type) ? 1 : 0, clientX: X, clientY: Y, detail })
  Object.defineProperties(e, { pointerType: { value: genre }, pointerId: { value: genre === 'touch' ? 7 : 1 }, isPrimary: { value: true } })
  act(() => void cible.dispatchEvent(e))
}

/** Un appui complet : chaque évènement va à ce qui est sous le pointeur à son instant, comme dans un navigateur. */
function appuyer(genre: Genre, detail: number, premier?: globalThis.Element) {
  const ici = () => premier ?? sousLePointeur(X, Y)
  envoyer(ici(), 'pointerdown', genre, detail)
  if (genre === 'mouse') envoyer(ici(), 'mousedown', genre, detail)
  envoyer(ici(), 'pointerup', genre, detail)
  if (genre === 'mouse') envoyer(ici(), 'mouseup', genre, detail)
  envoyer(ici(), 'click', genre, detail)
  if (detail === 2) envoyer(ici(), 'dblclick', genre, detail)
}

describe('la page fermée sous le pointeur', () => {
  it.each<Genre>(['mouse', 'touch'])('un double-clic sur son fond (%s) la ferme, sans choisir ni écrire la note dessous', async (genre) => {
    const m = await monter()
    appuyer(genre, 1)
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).toBeNull()
    appuyer(genre, 2)
    await act(async () => {})
    expect(m.noteSurLaToile().hasAttribute('data-choisie')).toBe(false)
    expect(m.noteSurLaToile().hasAttribute('data-edition')).toBe(false)
  })

  it('un double-clic sur « Retour » la ferme, et son second appui n’atteint pas la note dessous', async () => {
    const m = await monter()
    const retour = document.querySelector<HTMLElement>('.notak-document-fermer')!
    appuyer('mouse', 1, retour)
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).toBeNull()
    appuyer('mouse', 2)
    await act(async () => {})
    expect(m.noteSurLaToile().hasAttribute('data-choisie')).toBe(false)
    expect(m.noteSurLaToile().hasAttribute('data-edition')).toBe(false)
  })

  it('rend la place une fois le geste fini : un clic, une demi-seconde plus tard, atteint la note', async () => {
    const m = await monter()
    appuyer('mouse', 1)
    await act(async () => {})
    await act(() => new Promise((r) => setTimeout(r, DUREE_TENUE + 50)))
    appuyer('mouse', 1)
    expect(m.noteSurLaToile().hasAttribute('data-choisie')).toBe(true)
  })
})
