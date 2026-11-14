// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act, useSyncExternalStore } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Image } from '../../coeur/tableau'
import { commencerEnvoi } from '../envois'
import type { ContexteToile, DepotFichiers } from '../types'
import { DELAI_VISIBLE, type IndicesChargement, etatChargement, voileDe } from './chargement'
import { RenduImage } from './Image'
import { Visionneuse } from './visionneuse'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('l’état de chargement d’une image', () => {
  const indices = (plus: Partial<IndicesChargement>): IndicesChargement => ({
    adresse: '/api/fichiers/f?l=800',
    enRoute: false,
    progression: null,
    apercu: false,
    balise: 'prete',
    ...plus,
  })

  it('en attente : le fichier part d’un autre appareil, ou son adresse se cherche', () => {
    expect(etatChargement(indices({ adresse: undefined, enRoute: true }))).toEqual({ etape: 'attente' })
    expect(etatChargement(indices({ adresse: undefined }))).toEqual({ etape: 'attente' })
  })

  it('en envoi : la part envoyée quand on la connaît, même avant que l’aperçu soit prêt', () => {
    expect(etatChargement(indices({ adresse: undefined, enRoute: true, progression: -1 }))).toEqual({ etape: 'envoi' })
    expect(etatChargement(indices({ adresse: 'blob:a', enRoute: true, progression: 0.4, apercu: true }))).toEqual({ etape: 'envoi', part: 0.4 })
  })

  it('en conversion : reçu, la carte peint encore l’aperçu, ou sa copie n’est pas encore entière dans la balise', () => {
    expect(etatChargement(indices({ adresse: 'blob:a', apercu: true }))).toEqual({ etape: 'conversion' })
    expect(etatChargement(indices({ balise: 'charge' }))).toEqual({ etape: 'conversion' })
  })

  it('prête : la copie du serveur est peinte', () => {
    expect(etatChargement(indices({}))).toEqual({ etape: 'prete' })
  })

  it('en échec : introuvable, ou illisible', () => {
    expect(etatChargement(indices({ adresse: null }))).toEqual({ etape: 'echec' })
    expect(etatChargement(indices({ balise: 'erreur' }))).toEqual({ etape: 'echec' })
  })

  it('ses règles ne touchent qu’elle : le panneau d’envoi (`notak-banque notak-envoi`) n’en hérite plus rien', () => {
    // Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
    const fichier = './image.css'
    const css = readFileSync(new URL(fichier, import.meta.url), 'utf8')
    // L'ancienne roue de l'envoi, `.notak-envoi`, rendait le panneau d'envoi transparent au clic (`pointer-events: none`).
    expect(css).not.toMatch(/\.notak-envoi\b/)
    expect(css).toMatch(/\.notak-image-charge \{[^}]*pointer-events: none;/)
  })

  it('l’image qui charge est cachée tant que sa balise n’a rien d’entier, passée tant qu’elle ne peint que l’aperçu', () => {
    expect(voileDe({ etape: 'conversion' }, 'charge')).toBe('cachee')
    expect(voileDe({ etape: 'envoi', part: 0.5 }, 'prete')).toBe('passee')
    expect(voileDe({ etape: 'prete' }, 'prete')).toBeUndefined()
    expect(voileDe({ etape: 'echec' }, 'erreur')).toBeUndefined()
  })
})

// — Sur la toile et dans la visionneuse —

/** Les décodages demandés, qu'on termine à la main. */
let decodages: { src: string; finir(): void }[]
/** Les adresses `blob:` faites et rendues au navigateur. */
let rendues: string[]
let racine: Root
let hote: HTMLElement

beforeEach(() => {
  vi.useFakeTimers()
  decodages = []
  ;(HTMLImageElement.prototype as { decode?: () => Promise<void> }).decode = function (this: HTMLImageElement) {
    return new Promise<void>((finir) => void decodages.push({ src: this.src, finir }))
  }
  rendues = []
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:essai-${++n}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((a) => void rendues.push(a))
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const attendre = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const img = () => hote.querySelector<HTMLImageElement>('img.notak-image')
const anneau = () => document.querySelector('.notak-image-charge')
/** Le navigateur a l'image entière (jsdom ne charge rien : on le dit pour lui). */
const chargee = (balise: HTMLImageElement) => act(() => void balise.dispatchEvent(new Event('load')))

/** Une photo de 4000 × 3000 sur 20 UG ; la carte suit l'élément du magasin, comme sur la toile. */
function poser(fichier: string, depot: DepotFichiers) {
  const element: Element<Image> = { id: 'i1', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier, largeurOrigine: 4000, hauteurOrigine: 3000, typeMime: 'image/jpeg' } }
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [element] })
  const contexte = { magasin, camera: { x: 0, y: 0, echelle: 1 }, services: { fichiers: depot }, finirEdition: () => {}, commencerEdition: () => {} } as unknown as ContexteToile
  function Carte() {
    const e = useSyncExternalStore(magasin.ecouter, () => magasin.lire().elements[0]) as Element<Image>
    return <RenduImage element={e} choisie={false} enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />
  }
  return { magasin, rendre: () => act(async () => racine.render(<Carte />)) }
}

const depotServeur = (plus: Partial<DepotFichiers> = {}): DepotFichiers => ({ enregistrer: async () => 'x', adresse: async (id) => `/api/fichiers/${id}`, ...plus })

describe('la carte d’une image qui charge', () => {
  it('déposée d’ici : l’aperçu passé et la part envoyée, puis l’aperçu jusqu’à la copie du serveur décodée, et le fondu', async () => {
    let dire: (envoyes: number, total: number) => void = () => {}
    let finir: (id: string) => void = () => {}
    const depot = depotServeur({
      enregistrer: (_f, progression) => {
        dire = progression ?? dire
        return new Promise((fin) => (finir = fin))
      },
    })
    const envoi = commencerEnvoi(new Blob(['photo'], { type: 'image/jpeg' }), depot)
    const { magasin, rendre } = poser(envoi, depot)
    await rendre()
    const apercu = img()!.getAttribute('src')!
    expect(apercu).toMatch(/^blob:/)
    // Un envoi qui ne traîne pas ne se dit pas : l'anneau attend.
    expect(anneau()).toBeNull()
    chargee(img()!)
    expect(img()!.dataset.chargement).toBe('passee')
    await attendre(DELAI_VISIBLE)
    expect(anneau()!.getAttribute('aria-label')).toBe('Envoi en cours')
    expect(anneau()!.querySelector('.notak-roue')).not.toBeNull()
    act(() => dire(1, 4))
    expect(anneau()!.getAttribute('aria-valuenow')).toBe('25')

    // Reçu : la carte garde l'aperçu pendant que la copie du serveur se fabrique et se décode, à part.
    await act(async () => finir('recu'))
    expect((magasin.lire().elements[0]!.contenu as Image).fichier).toBe('recu')
    expect(decodages.map((d) => d.src)).toEqual([expect.stringMatching(/\/api\/fichiers\/recu\?l=400$/)])
    expect(img()!.getAttribute('src')).toBe(apercu)
    expect(img()!.dataset.chargement).toBe('passee')
    expect(anneau()!.getAttribute('aria-label')).toBe('Chargement de l’image')
    expect(rendues).toEqual([])

    // Décodée, elle prend la place de l'aperçu d'un coup, en fondu, et l'aperçu est rendu au navigateur.
    await act(async () => decodages[0]!.finir())
    expect(img()!.getAttribute('src')).toBe('/api/fichiers/recu?l=400')
    expect(img()!.dataset.chargement).toBeUndefined()
    expect(img()!.hasAttribute('data-fondu')).toBe(true)
    expect(anneau()).toBeNull()
    expect(rendues).toEqual([apercu])
  })

  it('l’adresse du serveur connue avant que l’élément prenne son vrai fichier (la toile peut grouper les deux) : l’aperçu reste', async () => {
    let finir: (id: string) => void = () => {}
    const depot = depotServeur({ enregistrer: () => new Promise((fin) => (finir = fin)) })
    const envoi = commencerEnvoi(new Blob(['photo'], { type: 'image/jpeg' }), depot)
    const element: Element<Image> = { id: 'i1', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: envoi, largeurOrigine: 4000, hauteurOrigine: 3000, typeMime: 'image/jpeg' } }
    // La carte corrige l'élément dans son magasin, mais ne le relit que quand on la redessine.
    const contexte = { magasin: creerMagasin({ titre: '', etiquettes: [], elements: [element] }), camera: { x: 0, y: 0, echelle: 1 }, services: { fichiers: depot }, finirEdition: () => {}, commencerEdition: () => {} } as unknown as ContexteToile
    const dessiner = (fichier: string) =>
      act(async () => racine.render(<RenduImage element={{ ...element, contenu: { ...element.contenu, fichier } }} choisie={false} enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />))
    await dessiner(envoi)
    const apercu = img()!.getAttribute('src')!
    await act(async () => finir('recu'))
    await dessiner('recu')
    // Sans quoi la copie du serveur, pas encore décodée, se peindrait pavé par pavé à la place de l'aperçu.
    expect(img()!.getAttribute('src')).toBe(apercu)
    expect(decodages.map((d) => d.src)).toEqual([expect.stringMatching(/\/api\/fichiers\/recu\?l=400$/)])
    await act(async () => decodages[0]!.finir())
    expect(img()!.getAttribute('src')).toBe('/api/fichiers/recu?l=400')
    expect(img()!.dataset.chargement).toBeUndefined()
  })

  it('vue d’ailleurs : l’anneau pendant l’envoi, puis la copie cachée tant qu’elle n’est pas entière, et le fondu', async () => {
    const { magasin, rendre } = poser('envoi-d-un-autre-appareil', depotServeur())
    await rendre()
    expect(img()).toBeNull()
    await attendre(DELAI_VISIBLE)
    expect(anneau()!.getAttribute('aria-label')).toBe('L’image arrive')

    // L'autre appareil a fini : l'élément prend son vrai fichier, la copie du serveur arrive (un JPEG progressif).
    const avant = magasin.lire().elements[0]!
    await act(async () => magasin.corriger([{ type: 'contenu', id: 'i1', avant: avant.contenu, apres: { ...avant.contenu, fichier: 'f-recu' } as Image }]))
    expect(img()!.getAttribute('src')).toBe('/api/fichiers/f-recu?l=400')
    expect(img()!.dataset.chargement).toBe('cachee')
    expect(hote.querySelector('.notak-image-cadre')!.getAttribute('data-chargement')).toBe('cachee')
    expect(anneau()!.getAttribute('aria-label')).toBe('Chargement de l’image')

    // Entière, elle se décode avant de paraître : le fondu part d'une image complète.
    chargee(img()!)
    expect(decodages.map((d) => d.src)).toEqual([expect.stringMatching(/\/api\/fichiers\/f-recu\?l=400$/)])
    expect(img()!.dataset.chargement).toBe('cachee')
    await act(async () => decodages[0]!.finir())
    expect(img()!.dataset.chargement).toBeUndefined()
    expect(img()!.hasAttribute('data-fondu')).toBe(true)
    expect(anneau()).toBeNull()
  })

  it('une image du cache se montre telle quelle : ni voile, ni anneau, ni fondu', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    await poser('f1', depotServeur()).rendre()
    expect(img()!.getAttribute('src')).toBe('/api/fichiers/f1?l=400')
    expect(img()!.dataset.chargement).toBeUndefined()
    expect(hote.querySelector('.notak-image-cadre')!.hasAttribute('data-chargement')).toBe(false)
    await attendre(DELAI_VISIBLE * 4)
    expect(anneau()).toBeNull()
    expect(img()!.hasAttribute('data-fondu')).toBe(false)
  })

  it('une image qui arrive vite paraît sans anneau ni fondu, sans attendre de décodage', async () => {
    await poser('f1', depotServeur()).rendre()
    expect(img()!.dataset.chargement).toBe('cachee')
    await attendre(DELAI_VISIBLE / 2)
    chargee(img()!)
    expect(decodages).toEqual([])
    expect(img()!.dataset.chargement).toBeUndefined()
    await attendre(DELAI_VISIBLE * 4)
    expect(anneau()).toBeNull()
    expect(img()!.hasAttribute('data-fondu')).toBe(false)
  })

  it('introuvable, ou illisible : l’image cassée, sans anneau qui tournerait pour rien', async () => {
    await poser('f1', depotServeur({ adresse: async () => Promise.reject(new Error('404')) })).rendre()
    expect(hote.querySelector('[aria-label="Image introuvable"]')).not.toBeNull()
    await attendre(DELAI_VISIBLE * 4)
    expect(anneau()).toBeNull()

    act(() => racine.unmount())
    racine = createRoot(hote)
    await poser('f2', depotServeur()).rendre()
    await attendre(DELAI_VISIBLE)
    expect(anneau()).not.toBeNull()
    act(() => void img()!.dispatchEvent(new Event('error')))
    expect(anneau()).toBeNull()
    expect(img()!.dataset.chargement).toBeUndefined()
  })
})

describe('la visionneuse d’une image dont la grande copie n’est pas encore là', () => {
  const photo: Element<Image> = { id: 'i1', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 8064, hauteurOrigine: 6048, typeMime: 'image/jpeg' } }
  async function ouvrir(apercu?: string) {
    // Une fenêtre de 1200 × 900 px sur un écran Retina : la copie de 2400 px.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('notak-visionneuse-zone') ? 1200 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('notak-visionneuse-zone') ? 900 : 0
    })
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    const contexte = { magasin: creerMagasin({ titre: '', etiquettes: [], elements: [photo] }), services: { lectureSeule: true }, choisir: () => {} } as unknown as ContexteToile
    await act(async () => racine.render(<Visionneuse element={photo} adresse="/api/fichiers/f1" apercu={apercu} contexte={contexte} />))
  }
  const peinte = () => document.querySelector<HTMLImageElement>('.notak-visionneuse-image img')!

  it('s’ouvre sur la copie de sa carte, avec l’anneau, jusqu’à ce que la grande soit décodée', async () => {
    await ouvrir('/api/fichiers/f1?l=400')
    expect(peinte().getAttribute('src')).toBe('/api/fichiers/f1?l=400')
    expect(peinte().dataset.chargement).toBeUndefined()
    expect(decodages.map((d) => d.src)).toEqual([expect.stringMatching(/\/api\/fichiers\/f1\?l=2400$/)])
    await attendre(DELAI_VISIBLE)
    expect(anneau()!.getAttribute('aria-label')).toBe('Chargement de l’image')
    await act(async () => decodages[0]!.finir())
    expect(peinte().getAttribute('src')).toBe('/api/fichiers/f1?l=2400')
    expect(anneau()).toBeNull()
  })

  it('sans copie à montrer d’abord, la grande reste cachée tant qu’elle n’est pas entière, puis paraît en fondu', async () => {
    await ouvrir()
    expect(peinte().getAttribute('src')).toBe('/api/fichiers/f1?l=2400')
    expect(peinte().dataset.chargement).toBe('cachee')
    await attendre(DELAI_VISIBLE)
    expect(anneau()).not.toBeNull()
    chargee(peinte())
    await act(async () => decodages.at(-1)!.finir())
    expect(peinte().dataset.chargement).toBeUndefined()
    expect(peinte().hasAttribute('data-fondu')).toBe(true)
    expect(anneau()).toBeNull()
  })
})
