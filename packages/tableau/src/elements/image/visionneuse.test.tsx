// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Image } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { Visionneuse, imageOuverte, ouvrirImage } from './visionneuse'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Les trois outils de la barre : on note ce qu'on leur demande, sans les monter.
type Depuis = { retour?: () => void } | undefined
const outils = vi.hoisted(() => ({ appels: [] as { outil: string; id: string | null; depuis: Depuis }[] }))
vi.mock('./modeAnnotation', async (original) => ({
  ...(await original<typeof import('./modeAnnotation')>()),
  annoter: (id: string | null, depuis: Depuis) => void outils.appels.push({ outil: 'dessin', id, depuis }),
}))
vi.mock('./Recadreur', async (original) => ({
  ...(await original<typeof import('./Recadreur')>()),
  recadrer: (id: string | null, depuis: Depuis) => void outils.appels.push({ outil: 'recadrage', id, depuis }),
}))
vi.mock('./Detoureur', async (original) => ({
  ...(await original<typeof import('./Detoureur')>()),
  detourerImage: (id: string | null, depuis: Depuis) => void outils.appels.push({ outil: 'detourage', id, depuis }),
}))

let racine: Root
let hote: HTMLElement
let onglet: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  onglet = vi.spyOn(window, 'open').mockReturnValue(null)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.restoreAllMocks()
})

const element: Element<Image> = { id: 'i1', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 200, typeMime: 'image/png' } }

async function rendre(ouvrirAilleurs?: (adresse: string, nom?: string) => void) {
  const contexte = {
    magasin: creerMagasin({ titre: '', etiquettes: [], elements: [element] }),
    services: { lectureSeule: true, ouvrirAilleurs },
    choisir: () => {},
  } as unknown as ContexteToile
  await act(async () => {
    racine.render(<Visionneuse element={element} adresse="/api/fichiers/ab" contexte={contexte} />)
  })
}
const boutonOuvrir = () => document.querySelector<HTMLButtonElement>('.notak-visionneuse-barre button[aria-label^="Ouvrir"]')

describe('la légende dans la visionneuse', () => {
  const avecLegende: Element<Image> = { ...element, contenu: { ...element.contenu, legende: 'Un port au matin', rotation: 90 } }
  async function ouvrir(surDoubleClic = vi.fn()) {
    const contexte = {
      magasin: creerMagasin({ titre: '', etiquettes: [], elements: [avecLegende] }),
      services: { lectureSeule: true },
      choisir: () => {},
    } as unknown as ContexteToile
    // La toile porte les couleurs du thème ; la visionneuse, posée sous `body`, les reprend.
    await act(async () => {
      racine.render(
        <div className="notak-toile" style={{ ['--notak-carte' as string]: '#24201c', ['--notak-texte' as string]: '#f5f2ee' }} onDoubleClick={surDoubleClic}>
          <Visionneuse element={avecLegende} adresse="/api/fichiers/ab" contexte={contexte} />
        </div>,
      )
    })
  }

  it('se pose sous l’image, de sa largeur, sur les couleurs des cartes de la toile', async () => {
    await ouvrir()
    const legende = document.querySelector<HTMLElement>('.notak-visionneuse-legende')!
    const cadre = document.querySelector<HTMLElement>('.notak-visionneuse-image')!
    expect(legende.textContent).toBe('Un port au matin')
    expect(legende.style.width).toBe(cadre.style.width)
    const fond = document.querySelector<HTMLElement>('.notak-visionneuse')!
    expect(fond.style.getPropertyValue('--notak-carte')).toBe('#24201c')
    expect(fond.style.getPropertyValue('--notak-texte')).toBe('#f5f2ee')
  })

  it('montre l’image comme la toile : son quart de tour est dans le cadre', async () => {
    await ouvrir()
    expect(document.querySelector<HTMLElement>('.notak-visionneuse-image .notak-image-plan')!.style.transform).toContain('rotate(90deg)')
  })

  it('ce qu’on y fait ne remonte pas à la toile (un double-clic n’y poserait pas de note)', async () => {
    const surDoubleClic = vi.fn()
    await ouvrir(surDoubleClic)
    act(() => {
      document.querySelector('.notak-visionneuse-legende')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(surDoubleClic).not.toHaveBeenCalled()
  })
})

describe('les outils de la barre', () => {
  const photo: Element<Image> = { ...element, contenu: { ...element.contenu, typeMime: 'image/jpeg' } }
  it.each([
    ['Dessiner', 'dessin'],
    ['Modifier', 'recadrage'],
    ['Fond', 'detourage'],
  ])('« %s » ouvre son outil sur l’image, et le terminer soi-même rend la visionneuse', async (libelle, outil) => {
    outils.appels = []
    const choisir = vi.fn()
    const contexte = {
      magasin: creerMagasin({ titre: '', etiquettes: [], elements: [photo] }),
      services: { fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } },
      choisir,
    } as unknown as ContexteToile
    ouvrirImage(photo.id)
    await act(async () => {
      racine.render(<Visionneuse element={photo} adresse="/api/fichiers/ab" contexte={contexte} />)
    })
    const bouton = [...document.querySelectorAll<HTMLButtonElement>('.notak-visionneuse-texte')].find((b) => b.textContent === libelle)!
    act(() => bouton.click())
    expect(imageOuverte()).toBeNull()
    expect(choisir).toHaveBeenCalledWith([photo.id])
    const [appel] = outils.appels
    expect([appel!.outil, appel!.id]).toEqual([outil, photo.id])
    appel!.depuis?.retour?.()
    expect(imageOuverte()).toBe(photo.id)
    ouvrirImage(null)
  })
})

describe('« Ouvrir » de la visionneuse', () => {
  it('l’hôte, s’il sait ouvrir ailleurs, reçoit l’adresse et le nom de l’image ; aucun onglet', async () => {
    const ailleurs = vi.fn()
    await rendre(ailleurs)
    expect(boutonOuvrir()!.getAttribute('aria-label')).toBe('Ouvrir avec une autre application')
    act(() => boutonOuvrir()!.click())
    expect(ailleurs).toHaveBeenCalledExactlyOnceWith('/api/fichiers/ab', 'image.png')
    expect(onglet).not.toHaveBeenCalled()
  })

  it('sans hôte pour cela, un nouvel onglet, détaché de la page', async () => {
    await rendre()
    expect(boutonOuvrir()!.getAttribute('aria-label')).toBe('Ouvrir dans un nouvel onglet')
    act(() => boutonOuvrir()!.click())
    expect(onglet).toHaveBeenCalledExactlyOnceWith('/api/fichiers/ab', '_blank', 'noopener,noreferrer')
  })
})
