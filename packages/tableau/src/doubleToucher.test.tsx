// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { nouvelleNote } from './coeur/tableau'
import './elements'
import { fermerMenus } from './menuUnique'
import { Toile, decalageClavier } from './Toile'

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
  document.elementsFromPoint ??= () => []
  // La toile prend le pointeur au premier toucher, pour tirer le fond.
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  HTMLElement.prototype.hasPointerCapture ??= () => false
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
})

/** Un évènement de doigt (jsdom n'a pas de PointerEvent : un MouseEvent qui en a les champs). */
function doigt(cible: Element, type: string, instant: number, x = 300, y = 200) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
  Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: 1 }, isPrimary: { value: true }, timeStamp: { value: instant } })
  act(() => void cible.dispatchEvent(e))
}

/** Un toucher du doigt, posé puis relevé sur place, à l'instant voulu. */
function toucher(cible: Element, instant: number, x = 300, y = 200) {
  doigt(cible, 'pointerdown', instant, x, y)
  doigt(cible, 'pointerup', instant + 50, x, y)
}

function monter() {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
  act(() => racine.render(<Toile magasin={magasin} />))
  return { magasin, toile: hote.querySelector('.notak-toile')! }
}

describe('deux touchers sur le vide', () => {
  it('rapprochés, ils posent une note comme un double-clic', () => {
    const { magasin, toile } = monter()
    toucher(toile, 1000)
    toucher(toile, 1200)
    expect(magasin.lire().elements).toHaveLength(1)
  })

  it('espacés dans le temps ou sur l’écran, ils ne posent rien', () => {
    const { magasin, toile } = monter()
    toucher(toile, 1000)
    toucher(toile, 1600)
    toucher(toile, 3000, 300, 200)
    toucher(toile, 3100, 400, 300)
    expect(magasin.lire().elements).toHaveLength(0)
  })

  it('le double-clic que la webview en tirerait ensuite ne pose pas une seconde note', () => {
    const { magasin, toile } = monter()
    toucher(toile, 1000)
    toucher(toile, 1200)
    const clic = new MouseEvent('dblclick', { bubbles: true, clientX: 300, clientY: 200 })
    Object.defineProperty(clic, 'timeStamp', { value: 1400 })
    act(() => void toile.dispatchEvent(clic))
    expect(magasin.lire().elements).toHaveLength(1)
  })
})

describe('un doigt sur un élément', () => {
  function monterAvecNote(vibrer = () => {}) {
    const note = nouvelleNote(0, 0, 'a')
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [note] })
    act(() => racine.render(<Toile magasin={magasin} services={{ vibrer }} />))
    const carte = hote.querySelector(`[data-id="${note.id}"]`)!
    return { magasin, note, carte, toile: hote.querySelector('.notak-toile')! }
  }
  const position = (m: ReturnType<typeof monterAvecNote>) => {
    const el = m.magasin.lire().elements.find((x) => x.id === m.note.id)!
    return [el.x, el.y]
  }

  it('un toucher le choisit, sans le déplacer', () => {
    const m = monterAvecNote()
    toucher(m.carte, 1000)
    expect(hote.querySelector(`[data-id="${m.note.id}"][data-choisie]`)).not.toBeNull()
    expect(position(m)).toEqual([0, 0])
  })

  it('glissé tout de suite, il tire le fond et laisse l’élément à sa place', () => {
    const m = monterAvecNote()
    doigt(m.carte, 'pointerdown', 1000)
    doigt(m.carte, 'pointermove', 1020, 360, 260)
    doigt(m.carte, 'pointerup', 1040, 360, 260)
    expect(position(m)).toEqual([0, 0])
  })

  it('après un appui long, il est décollé : un retour au doigt, et il suit le doigt', () => {
    vi.useFakeTimers()
    try {
      const vibrer = vi.fn()
      const m = monterAvecNote(vibrer)
      doigt(m.carte, 'pointerdown', 1000)
      act(() => void vi.advanceTimersByTime(600))
      expect(vibrer).toHaveBeenCalledTimes(1)
      doigt(m.carte, 'pointermove', 1700, 420, 320)
      doigt(m.carte, 'pointerup', 1720, 420, 320)
      act(() => void vi.advanceTimersByTime(1000))
      expect(position(m)).not.toEqual([0, 0])
    } finally {
      vi.useRealTimers()
    }
  })

  it('après un appui long, relâché sur place, son menu s’ouvre et reste ouvert', () => {
    vi.useFakeTimers()
    try {
      const m = monterAvecNote()
      doigt(m.carte, 'pointerdown', 1000)
      act(() => void vi.advanceTimersByTime(600))
      doigt(m.carte, 'pointerup', 1650)
      act(() => void vi.advanceTimersByTime(400))
      expect(document.querySelector('.notak-menu-ctx')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('décollé par un appui long, il prend le pointeur : le doigt ne le perd pas si sa carte change sous lui', () => {
    vi.useFakeTimers()
    const capture = vi.spyOn(HTMLElement.prototype, 'setPointerCapture')
    try {
      const m = monterAvecNote()
      capture.mockClear()
      doigt(m.carte, 'pointerdown', 1000)
      act(() => void vi.advanceTimersByTime(600))
      expect(capture).toHaveBeenCalledWith(1)
    } finally {
      capture.mockRestore()
      vi.useRealTimers()
    }
  })
})

describe('un doigt relevé hors de la toile', () => {
  /** Un doigt numéroté : le premier posé sur l'écran est `isPrimary`. */
  function doigtN(cible: EventTarget, type: string, id: number, primaire: boolean, x: number, y: number) {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
    Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: id }, isPrimary: { value: primaire } })
    act(() => void cible.dispatchEvent(e))
  }
  const echelle = () => (hote.querySelector('.notak-plan') as HTMLElement).style.transform

  it('est oublié : un seul doigt, ensuite, tire la toile sans la zoomer', () => {
    const { toile } = monter()
    const avant = echelle()
    // Le doigt posé sur la toile se relève sur autre chose (une feuille portée hors d'elle).
    doigtN(toile, 'pointerdown', 1, true, 100, 100)
    doigtN(document.body, 'pointerup', 1, true, 100, 100)
    doigtN(toile, 'pointerdown', 2, true, 300, 300)
    doigtN(toile, 'pointermove', 2, true, 300, 420)
    doigtN(toile, 'pointerup', 2, true, 300, 420)
    expect(echelle()).toBe(avant)
  })

  it('même jamais entendu, il ne fait pas d’un doigt premier un pincement', () => {
    const { toile } = monter()
    const avant = echelle()
    doigtN(toile, 'pointerdown', 1, true, 100, 100)
    // Son relâchement n'arrive nulle part ; le doigt suivant est le premier sur l'écran.
    doigtN(toile, 'pointerdown', 2, true, 300, 300)
    doigtN(toile, 'pointermove', 2, true, 300, 420)
    doigtN(toile, 'pointerup', 2, true, 300, 420)
    expect(echelle()).toBe(avant)
  })
})

describe('tirer la toile au doigt', () => {
  it('le calque suit le doigt aussitôt, et la toile reste où on la lâche', () => {
    const { toile } = monter()
    const glisse = () => (hote.querySelector('.notak-glisse') as HTMLElement).style.transform
    const avant = glisse()
    doigt(toile, 'pointerdown', 1000, 300, 300)
    doigt(toile, 'pointermove', 1016, 300, 360)
    const pendant = glisse()
    expect(pendant).not.toBe(avant)
    doigt(toile, 'pointermove', 1032, 300, 420)
    doigt(toile, 'pointerup', 1048, 300, 420)
    const apres = glisse()
    expect(apres).not.toBe(pendant)
    expect(apres).toMatch(/translate/)
  })
})

describe('le clavier sur la toile', () => {
  it('la note qu’on écrit, couverte par le clavier, remonte juste au-dessus de sa barre', () => {
    // Écran de 844, clavier de 336 : la barre du clavier commence à 444.
    expect(decalageClavier({ top: 640, bottom: 720 }, 844, 336, 112)).toBe(444 - 720)
  })

  it('sans que son haut passe sous la barre du haut, ni bouger ce qui se voit déjà', () => {
    expect(decalageClavier({ top: 200, bottom: 720 }, 844, 336, 112)).toBe(120 - 200)
    expect(decalageClavier({ top: 200, bottom: 400 }, 844, 336, 112)).toBe(0)
    expect(decalageClavier({ top: 640, bottom: 720 }, 844, 0, 112)).toBe(0)
  })
})

