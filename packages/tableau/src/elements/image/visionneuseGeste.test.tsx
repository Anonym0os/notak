// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import { type Element, nouvelId, nouvelleNote } from '../../coeur/tableau'
import '..'
import { fermerMenus } from '../../menuUnique'
import { Toile } from '../../Toile'
import { imageOuverte, ouvrirImage } from './visionneuse'
import { recadrer, useRecadrageOuvert } from './Recadreur'
import { DUREE_TENUE } from '../enGrand'

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
    recadrer(null)
  })
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  for (const n of document.body.querySelectorAll(':scope > [aria-hidden="true"]')) n.remove()
  document.elementFromPoint = avant.un
  document.elementsFromPoint = avant.tous
})

const image: Element = { id: nouvelId(), x: 40, y: 2, largeur: 10, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 900, typeMime: 'image/png' } }
const note: Element = { ...nouvelleNote(2, 40), contenu: { type: 'note', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sous la barre' }] }] } } }

/** Où l'on presse : sur « Modifier », au bas de la fenêtre, là où la note est posée sur la toile. */
const X = 580
const Y = 776

/**
 * Ce que le navigateur trouve sous le pointeur, que jsdom ne calcule pas : la visionneuse ouverte couvre tout ; sinon,
 * ce qui est posé sur la page à cet endroit (une boîte fixe sous `body`, la dernière posée au-dessus), sinon la note.
 */
function sousLePointeur(x: number, y: number): globalThis.Element {
  const visionneuse = document.querySelector('.notak-visionneuse')
  if (visionneuse) return visionneuse.querySelector('.notak-visionneuse-zone')!
  const poses = [...document.body.children].filter((n): n is HTMLElement => n instanceof HTMLElement && n !== hote && n.style.position === 'fixed')
  for (const n of poses.reverse()) {
    const [l, t, w, h] = [n.style.left, n.style.top, n.style.width, n.style.height].map((v) => Number.parseFloat(v))
    if (x >= l! && x <= l! + w! && y >= t! && y <= t! + h!) return n
  }
  return hote.querySelector(`.notak-carte[data-id="${note.id}"] .notak-note`) ?? hote.querySelector(`.notak-carte[data-id="${note.id}"]`)!
}

type Genre = 'mouse' | 'touch'

/** Un évènement de pointeur (jsdom n'a pas de PointerEvent : un MouseEvent qui en a les champs). */
function envoyer(cible: globalThis.Element, type: string, genre: Genre, detail = 1) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: /down/.test(type) ? 1 : 0, clientX: X, clientY: Y, detail })
  Object.defineProperties(e, { pointerType: { value: genre }, pointerId: { value: genre === 'touch' ? 7 : 1 }, isPrimary: { value: true } })
  act(() => void cible.dispatchEvent(e))
}

/** Un appui complet là : chaque évènement va à ce qui est sous le pointeur à son instant, comme dans un navigateur. */
function appuyer(genre: Genre, detail: number, premier?: globalThis.Element) {
  const ici = () => premier ?? sousLePointeur(X, Y)
  envoyer(ici(), 'pointerdown', genre, detail)
  if (genre === 'mouse') envoyer(ici(), 'mousedown', genre, detail)
  envoyer(ici(), 'pointerup', genre, detail)
  if (genre === 'mouse') envoyer(ici(), 'mouseup', genre, detail)
  envoyer(ici(), 'click', genre, detail)
  if (detail === 2) envoyer(ici(), 'dblclick', genre, detail)
}

function RecadrageOuvert({ vu }: { vu: { id: string | null } }) {
  vu.id = useRecadrageOuvert()
  return null
}

async function ouvrir() {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [image, note] })
  const services = { fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } }
  const vu = { id: null as string | null }
  act(() =>
    racine.render(
      <>
        <Toile magasin={magasin} services={services} />
        <RecadrageOuvert vu={vu} />
      </>,
    ),
  )
  await act(async () => {})
  // L'image, ouverte d'un double-clic sur sa carte.
  const carte = hote.querySelector(`.notak-carte[data-id="${image.id}"]`)!
  document.elementFromPoint = () => carte
  act(() => void carte.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 700, clientY: 100 })))
  await act(async () => {})
  expect(imageOuverte()).toBe(image.id)
  // Ensuite, le pointeur est au bas de la fenêtre, sur « Modifier » et la note dessous.
  document.elementFromPoint = (x, y) => sousLePointeur(x, y)
  document.elementsFromPoint = (x, y) => [sousLePointeur(x, y)]
  const toile = hote.querySelector<HTMLElement>('.notak-toile')!
  const noteSurLaToile = () => hote.querySelector<HTMLElement>(`.notak-carte[data-id="${note.id}"]`)!
  return { vu, toile, noteSurLaToile }
}

describe('la visionneuse fermée sous le pointeur', () => {
  it.each<Genre>(['mouse', 'touch'])('un double-clic sur « Modifier » (%s) ouvre le recadrage, et son second appui n’atteint pas la note dessous', async (genre) => {
    const { vu, noteSurLaToile } = await ouvrir()
    const modifier = [...document.querySelectorAll<HTMLButtonElement>('.notak-visionneuse-barre button')].find((b) => b.textContent === 'Modifier')!
    appuyer(genre, 1, modifier)
    expect(imageOuverte()).toBeNull()
    expect(vu.id).toBe(image.id)
    // Le second appui, tombé où était le bouton : la visionneuse n'y est plus.
    appuyer(genre, 2)
    await act(async () => {})
    expect(vu.id).toBe(image.id)
    expect(noteSurLaToile().hasAttribute('data-choisie')).toBe(false)
    expect(noteSurLaToile().hasAttribute('data-edition')).toBe(false)
    expect(imageOuverte()).toBeNull()
  })

  it.each<Genre>(['mouse', 'touch'])('un double-clic sur le fond (%s) la ferme, sans choisir ni écrire la note dessous', async (genre) => {
    const { noteSurLaToile } = await ouvrir()
    appuyer(genre, 1)
    expect(imageOuverte()).toBeNull()
    appuyer(genre, 2)
    await act(async () => {})
    expect(noteSurLaToile().hasAttribute('data-choisie')).toBe(false)
    expect(noteSurLaToile().hasAttribute('data-edition')).toBe(false)
  })

  it('rend la place une fois le geste fini : un clic, une demi-seconde plus tard, atteint la note', async () => {
    const { noteSurLaToile } = await ouvrir()
    appuyer('mouse', 1)
    expect(imageOuverte()).toBeNull()
    await act(() => new Promise((r) => setTimeout(r, DUREE_TENUE + 50)))
    appuyer('mouse', 1)
    expect(noteSurLaToile().hasAttribute('data-choisie')).toBe(true)
  })
})
