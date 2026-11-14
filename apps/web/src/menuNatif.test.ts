// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brancherMenuNatif, ecritIci } from './menuNatif'

const poser = (html: string) => {
  document.body.innerHTML = html
  return document.body.firstElementChild!
}

describe('ecritIci', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('un champ de texte et une zone qu’on écrit, jusque dans leurs enfants', () => {
    expect(ecritIci(poser('<input type="text">'))).toBe(true)
    expect(ecritIci(poser('<input type="search">'))).toBe(true)
    expect(ecritIci(poser('<textarea></textarea>'))).toBe(true)
    expect(ecritIci(poser('<div contenteditable="true"><p><strong>gras</strong></p></div>').querySelector('strong'))).toBe(true)
    expect(ecritIci(poser('<div contenteditable=""></div>'))).toBe(true)
  })

  it('pas une case, un bouton, une page en lecture seule ou l’interface', () => {
    expect(ecritIci(poser('<input type="checkbox">'))).toBe(false)
    expect(ecritIci(poser('<input type="range">'))).toBe(false)
    expect(ecritIci(poser('<button>Partager</button>'))).toBe(false)
    expect(ecritIci(poser('<div contenteditable="false"><p>lu</p></div>').querySelector('p'))).toBe(false)
    expect(ecritIci(poser('<nav><span>Silak</span></nav>').querySelector('span'))).toBe(false)
    expect(ecritIci(null)).toBe(false)
  })
})

describe('brancherMenuNatif', () => {
  let debrancher = () => {}
  afterEach(() => {
    debrancher()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  /** Un clic droit à la souris : l'appui, puis le menu, sur la même cible. */
  const clicDroit = (cible: Element, o: MouseEventInit = {}) => {
    cible.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, bubbles: true, cancelable: true, ...o }))
    const e = new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true, ...o })
    cible.dispatchEvent(e)
    return e
  }

  it('hors de ce qu’on écrit, le menu du système ne paraît pas', () => {
    debrancher = brancherMenuNatif(window, { inspecter: false })
    const barre = poser('<header><nav><button>Silak</button></nav></header>')
    expect(clicDroit(barre.querySelector('button')!).defaultPrevented).toBe(true)
    expect(clicDroit(barre).defaultPrevented).toBe(true)
  })

  it('dans un champ, une note ou une page qu’on écrit, il reste : orthographe et presse-papiers', () => {
    debrancher = brancherMenuNatif(window, { inspecter: false })
    expect(clicDroit(poser('<input type="text">')).defaultPrevented).toBe(false)
    expect(clicDroit(poser('<div contenteditable="true"><p>texte</p></div>').querySelector('p')!).defaultPrevented).toBe(false)
  })

  it('le menu de Notak s’ouvre comme avant : rien n’arrête le clic droit', () => {
    debrancher = brancherMenuNatif(window, { inspecter: false })
    const tuile = poser('<div class="tuile"></div>')
    const ouvrir = vi.fn((e: Event) => e.preventDefault())
    tuile.addEventListener('contextmenu', ouvrir)
    expect(clicDroit(tuile).defaultPrevented).toBe(true)
    expect(ouvrir).toHaveBeenCalledOnce()
  })

  it('Ctrl et un clic, le clic droit du Mac, suivent la même règle', () => {
    debrancher = brancherMenuNatif(window, { inspecter: false })
    const bouton = poser('<button>Clients</button>')
    expect(clicDroit(bouton, { button: 0, buttons: 1, ctrlKey: true }).defaultPrevented).toBe(true)
  })

  it('un texte qu’on avait choisi pour le copier garde son menu ; le mot que le clic droit choisit de lui-même, non', () => {
    debrancher = brancherMenuNatif(window, { inspecter: false })
    const message = poser('<p role="alert">Le serveur ne répond pas</p>')
    const choisi = { isCollapsed: false, rangeCount: 1, getRangeAt: () => ({ getClientRects: () => [{ left: 0, right: 100, top: 0, bottom: 20 }] }), removeAllRanges: vi.fn() }
    const rien = { isCollapsed: true, rangeCount: 0, getRangeAt: () => null, removeAllRanges: vi.fn() }
    const lire = vi.spyOn(window, 'getSelection')

    lire.mockReturnValue(choisi as unknown as Selection)
    expect(clicDroit(message, { clientX: 10, clientY: 10 }).defaultPrevented).toBe(false)
    // Ailleurs que sur ce texte choisi, l'interface reste l'interface.
    expect(clicDroit(message, { clientX: 300, clientY: 300 }).defaultPrevented).toBe(true)

    // Rien de choisi à l'appui : le navigateur choisit le mot, le menu n'est pas pour lui, et le mot ne reste pas surligné.
    lire.mockReturnValue(rien as unknown as Selection)
    message.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, bubbles: true, clientX: 10, clientY: 10 }))
    lire.mockReturnValue(choisi as unknown as Selection)
    const menu = new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    message.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    expect(choisi.removeAllRanges).toHaveBeenCalledOnce()
  })

  it('au clavier (touche Menu), un texte choisi garde son menu', () => {
    debrancher = brancherMenuNatif(window, { inspecter: false })
    const choisi = { isCollapsed: false, rangeCount: 1, getRangeAt: () => ({ getClientRects: () => [] }), removeAllRanges: vi.fn() }
    vi.spyOn(window, 'getSelection').mockReturnValue(choisi as unknown as Selection)
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    poser('<p>texte</p>').dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })

  it('en développement, ⇧ et le clic droit le gardent, pour inspecter', () => {
    debrancher = brancherMenuNatif(window, { inspecter: true })
    const bouton = poser('<button>Partager</button>')
    expect(clicDroit(bouton, { shiftKey: true }).defaultPrevented).toBe(false)
    expect(clicDroit(bouton).defaultPrevented).toBe(true)
  })
})
