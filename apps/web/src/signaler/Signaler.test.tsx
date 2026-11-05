// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EVENEMENT_SIGNALER } from './geste'
import { FenetreSignaler, brancherSignaler, commandeDePhoto, octetsDePhotoMobile, oublierReception, recoitLesSignalements } from './Signaler'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** La fenêtre de signalement, au doigt sur un iPhone et à la souris : ce qu'elle montre, et ce qu'Entrée y fait. */

let racine: Root
let hote: HTMLDivElement
const largeur = window.innerWidth

function appareil(doigt: boolean, l: number) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: doigt && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: l, configurable: true })
}

function ouvrir() {
  const envoyer = vi.fn()
  const fermer = vi.fn()
  act(() => racine.render(<FenetreSignaler prise={{ etat: 'faite', image: null }} texteInitial="" sombre={false} envoyer={envoyer} fermer={fermer} />))
  return { envoyer, fermer, champ: hote.querySelector<HTMLTextAreaElement>('.notak-signaler-champ')! }
}

const entree = (cible: Element) => act(() => void cible.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
const boutons = () => [...hote.querySelectorAll('button')].map((b) => b.textContent?.trim() || b.getAttribute('aria-label'))

beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
})

describe('signaler un bug au doigt, sur un téléphone', () => {
  beforeEach(() => appareil(true, 390))

  it('est une feuille : Annuler et Envoyer en haut, les outils sous l’image', () => {
    const { envoyer, fermer } = ouvrir()
    expect(hote.querySelector('.notak-signaler')?.hasAttribute('data-telephone')).toBe(true)
    const entete = hote.querySelector('.notak-signaler-entete')!
    expect([...entete.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Annuler', 'Envoyer'])
    // Les outils viennent après l'image, pas dans l'en-tête, où ils débordaient de l'écran.
    expect(entete.querySelector('.notak-signaler-outils')).toBeNull()
    expect(hote.querySelector('.notak-signaler-capture + .notak-signaler-outils')).not.toBeNull()
    act(() => entete.querySelector<HTMLButtonElement>('.notak-signaler-envoyer')!.click())
    expect(envoyer).toHaveBeenCalledWith('', [])
    act(() => entete.querySelector<HTMLButtonElement>('.notak-signaler-annuler')!.click())
    expect(fermer).toHaveBeenCalled()
  })

  it('ne parle d’aucune touche, et propose d’ajouter une image et de défaire un trait', () => {
    ouvrir()
    const texte = hote.textContent ?? ''
    expect(texte).not.toMatch(/⌘|Ctrl|Entrée|Échap|↵/)
    expect(hote.querySelector('.notak-signaler-pied')).toBeNull()
    expect(boutons()).toContain('Ajouter une image')
    expect(boutons()).toContain('Annuler le dernier trait')
    const choix = hote.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(choix.accept).toBe('image/*')
  })

  it('va à la ligne sur Entrée au lieu d’envoyer, et ne sort pas le clavier d’office', () => {
    const { envoyer, champ } = ouvrir()
    expect(document.activeElement).not.toBe(champ)
    entree(champ)
    expect(envoyer).not.toHaveBeenCalled()
  })

  it('est persistante : un toucher à côté ne la ferme pas, même vide', () => {
    const { fermer } = ouvrir()
    act(() => void hote.querySelector('.notak-signaler')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(fermer).not.toHaveBeenCalled()
  })
})

describe('signaler un bug à la souris', () => {
  beforeEach(() => appareil(false, 1280))

  it('garde la fenêtre au milieu, ses raccourcis dits, et Entrée envoie', () => {
    const { envoyer, champ } = ouvrir()
    expect(hote.querySelector('.notak-signaler')?.hasAttribute('data-telephone')).toBe(false)
    expect(hote.querySelector('.notak-signaler-entete .notak-signaler-outils')).not.toBeNull()
    expect(hote.querySelector('.notak-signaler-pied')?.textContent).toContain('Entrée pour envoyer')
    expect(hote.querySelector('.notak-signaler-coller')?.textContent).toMatch(/⌘V|Ctrl\+V/)
    expect(boutons()).toContain('Effacer')
    expect(boutons()).not.toContain('Annuler le dernier trait')
    expect(document.activeElement).toBe(champ)
    entree(champ)
    expect(envoyer).toHaveBeenCalledTimes(1)
  })

  it('se ferme d’un clic à côté tant qu’on n’y a rien fait', () => {
    const { fermer } = ouvrir()
    act(() => void hote.querySelector('.notak-signaler')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(fermer).toHaveBeenCalled()
  })
})

describe('ouvrir d’une secousse ou d’une capture d’écran', () => {
  const instance = (corps: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => corps }) as Response)
  const ouverte = () => document.querySelector('.notak-signaler') !== null
  // La fenêtre paraît après la réponse du serveur et deux images peintes : on l'attend un peu, sans plus.
  const geste = async (par: string) => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent(EVENEMENT_SIGNALER, { detail: par }))
      for (let i = 0; i < 20 && !ouverte(); i++) await new Promise((r) => setTimeout(r, 10))
    })
  }

  beforeAll(() => brancherSignaler())
  beforeEach(() => {
    appareil(true, 390)
    oublierReception()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    // Annuler ferme la fenêtre ouverte par le geste, pour l'essai suivant.
    act(() => document.querySelector<HTMLButtonElement>('.notak-signaler-annuler')?.click())
    vi.restoreAllMocks()
  })

  it('demande au serveur s’il reçoit les signalements, une fois, et redemande si le réseau a manqué', async () => {
    vi.stubGlobal('fetch', instance({ signalements: true }))
    expect(await recoitLesSignalements()).toBe(true)
    expect(await recoitLesSignalements()).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    oublierReception()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('hors ligne'))))
    expect(await recoitLesSignalements()).toBe(false)
    vi.stubGlobal('fetch', instance({ signalements: true }))
    expect(await recoitLesSignalements()).toBe(true)
    oublierReception()
    vi.stubGlobal('fetch', instance({ nom: 'Notak' }))
    expect(await recoitLesSignalements()).toBe(false)
  })

  it('ouvre la fenêtre sur un serveur qui reçoit les signalements', async () => {
    vi.stubGlobal('fetch', instance({ signalements: true }))
    await geste('capture')
    expect(ouverte()).toBe(true)
  })

  it('n’ouvre rien sur un serveur qui ne les reçoit pas : une capture d’écran reste une capture d’écran', async () => {
    vi.stubGlobal('fetch', instance({ signalements: false }))
    await geste('capture')
    await geste('secousse')
    expect(ouverte()).toBe(false)
  })

  it('laisse la secousse au champ où l’on écrit', async () => {
    vi.stubGlobal('fetch', instance({ signalements: true }))
    const champ = document.createElement('input')
    document.body.append(champ)
    champ.focus()
    await geste('secousse')
    expect(ouverte()).toBe(false)
    champ.remove()
    await geste('secousse')
    expect(ouverte()).toBe(true)
  })
})

describe('la photo de la page par la coque', () => {
  it('passe par le plugin `appareil` sur iOS, par la coque elle-même sur macOS', () => {
    expect(commandeDePhoto(true)).toBe('plugin:appareil|capturer_fenetre')
    expect(commandeDePhoto(false)).toBe('capturer_fenetre')
  })

  it('lit le PNG en base64 que rend le plugin d’iOS', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff]
    const octets = octetsDePhotoMobile({ png: btoa(String.fromCharCode(...png)), echelle: 3 })
    expect([...octets]).toEqual(png)
    expect(() => octetsDePhotoMobile({ png: '' })).toThrow()
    expect(() => octetsDePhotoMobile(null)).toThrow()
  })
})
