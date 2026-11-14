// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Fichier } from '../../../coeur/tableau'
import type { ContexteToile } from '../../types'
import { ModaleFichier } from '../ModaleFichier'
import { etatFaux as faux, mesuresFausses } from './fauxPdf'

// pdf.js ne tourne pas sous jsdom : un faux moteur rend trois pages A4, chacune avec une ligne de texte.
vi.mock('../apercuPdf', async () => (await import('./fauxPdf')).moduleFaux)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let rendre: () => void
beforeAll(() => {
  rendre = mesuresFausses()
})
afterAll(() => rendre())

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  faux.detruits = 0
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([37, 80, 68, 70])))
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const pdf: Fichier = { type: 'fichier', fichier: 'f1', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 1000 }
const attendre = (ms = 0) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

async function ouvrir(services: Partial<ContexteToile['services']> = {}, fermer = vi.fn()) {
  const contexte = { services } as unknown as ContexteToile
  await act(async () => racine.render(<ModaleFichier contenu={pdf} adresse="/api/fichiers/f1" fermer={fermer} contexte={contexte} />))
  await attendre()
  await attendre()
  return fermer
}

const visionneuse = () => document.querySelector<HTMLElement>('.notak-pdf')!
const bouton = (nom: string) => document.querySelector<HTMLButtonElement>(`.notak-pdf [aria-label="${nom}"]`)!
const touche = (key: string, plus: KeyboardEventInit = {}) =>
  act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...plus })))

describe('la visionneuse PDF', () => {
  it('remplace le lecteur du navigateur : nos pages, notre barre, le nom du fichier', async () => {
    await ouvrir()
    expect(document.querySelector('iframe')).toBeNull()
    expect(visionneuse().getAttribute('aria-label')).toBe('devis.pdf')
    expect(document.querySelector('.notak-pdf-titre')?.textContent).toBe('devis.pdf')
    expect(document.querySelector<HTMLInputElement>('.notak-pdf-numero')?.value).toBe('1')
    expect(document.querySelector('.notak-pdf-total')?.textContent).toBe('sur 3')
    // La vue fait 800 px : la première page (1122 px à 100 %) la remplit ; la suivante se prépare, pas la troisième.
    expect([...document.querySelectorAll<HTMLElement>('.notak-pdf-page')].map((p) => p.dataset.page)).toEqual(['1', '2'])
    // Le texte de la page est là, sélectionnable.
    expect(document.querySelector('.notak-pdf-texte span')?.textContent).toBe('Page 1 hippopotame')
  })

  it('chaque bouton dit ce qu’il fait', async () => {
    await ouvrir()
    for (const nom of ['Zoom arrière (⌘−)', 'Zoom avant (⌘+)', 'Ajuster à la largeur (⌘0)', 'Rechercher dans le PDF (⌘F)', 'Fermer (Échap)']) {
      expect(bouton(nom), nom).not.toBeNull()
      expect(bouton(nom).title).toBe(nom)
    }
    const telecharger = bouton('Télécharger le PDF d’origine') as unknown as HTMLAnchorElement
    expect(telecharger.getAttribute('href')).toBe('/api/fichiers/f1')
    expect(telecharger.getAttribute('download')).toBe('devis.pdf')
    expect(telecharger.textContent).toBe('Télécharger')
  })

  it('le zoom : 100 % à l’ouverture sur un grand écran, ses crans, puis ajusté à la largeur', async () => {
    await ouvrir()
    const pourcent = () => document.querySelector('.notak-pdf-pourcent')?.textContent
    expect(pourcent()).toBe('100 %')
    act(() => bouton('Zoom avant (⌘+)').click())
    expect(pourcent()).toBe('110 %')
    await touche('-', { metaKey: true })
    await touche('-', { metaKey: true })
    expect(pourcent()).toBe('90 %')
    await touche('0', { metaKey: true })
    // (1000 − 2 × 24) / (595 × 4/3) = 120 %.
    expect(pourcent()).toBe('120 %')
    expect(bouton('Ajuster à la largeur (⌘0)').getAttribute('aria-pressed')).toBe('true')
  })

  it('dans un navigateur, « Nouvel onglet » ouvre le PDF à côté', async () => {
    const onglet = vi.spyOn(window, 'open').mockReturnValue(null)
    await ouvrir()
    act(() => bouton('Ouvrir dans un nouvel onglet du navigateur').click())
    expect(onglet).toHaveBeenCalledWith('/api/fichiers/f1', '_blank', 'noopener,noreferrer')
  })

  it('dans Notak de bureau, il s’ouvre avec l’app par défaut', async () => {
    const ailleurs = vi.fn()
    await ouvrir({ ouvrirAilleurs: ailleurs })
    act(() => bouton('Ouvrir avec l’app par défaut').click())
    expect(ailleurs).toHaveBeenCalledExactlyOnceWith('/api/fichiers/f1', 'devis.pdf')
  })

  it('⌘F cherche dans le texte de toutes les pages, sans tenir aux majuscules', async () => {
    await ouvrir()
    await touche('f', { metaKey: true })
    const champ = document.querySelector<HTMLInputElement>('.notak-pdf-recherche-champ')!
    expect(champ).not.toBeNull()
    act(() => {
      const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      poser.call(champ, 'HIPPO')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await attendre(250)
    await attendre()
    expect(document.querySelector('.notak-pdf-recherche-compte')?.textContent).toBe('1 sur 3')
    expect(document.querySelector('.notak-pdf-trouve-courant')?.textContent).toBe('hippo')
    // Échap ferme la recherche, puis la visionneuse.
    await touche('Escape')
    expect(document.querySelector('.notak-pdf-recherche')).toBeNull()
  })

  it('Échap et la croix ferment ; le document est relâché en partant', async () => {
    const fermer = await ouvrir()
    await touche('Escape')
    expect(fermer).toHaveBeenCalledTimes(1)
    act(() => bouton('Fermer (Échap)').click())
    expect(fermer).toHaveBeenCalledTimes(2)
    act(() => racine.render(<></>))
    await attendre()
    expect(faux.detruits).toBe(1)
  })

  it('ce qu’on fait dans la visionneuse ne remonte pas à la toile', async () => {
    const dessous = vi.fn()
    hote.addEventListener('pointerdown', dessous)
    hote.addEventListener('keydown', dessous)
    await ouvrir()
    const surCarte = vi.fn()
    // La visionneuse est rendue dans la carte (React) : ses événements ne doivent pas atteindre la carte.
    await act(async () =>
      racine.render(
        <div onPointerDown={surCarte} onKeyDown={surCarte}>
          <ModaleFichier contenu={pdf} adresse="/api/fichiers/f1" fermer={() => {}} />
        </div>,
      ),
    )
    await attendre()
    act(() => void visionneuse().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    await touche('ArrowDown')
    expect(surCarte).not.toHaveBeenCalled()
  })
})
