// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { texteOuvrirAilleurs } from '../bureau/ailleurs'
import { AnnoncesServeur, annoncerBureau } from './annonces'
import { servicesDeLaFenetre } from './ouvrirAilleurs'

const m = vi.hoisted(() => ({ ouvrirAilleurs: vi.fn() }))
vi.mock('../bureau', async (origine) => ({ ...(await origine<typeof import('../bureau')>()), ouvrirAilleurs: m.ouvrirAilleurs }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  m.ouvrirAilleurs.mockReset().mockResolvedValue('ouvert')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.useRealTimers()
})

/** Laisse la promesse de `ouvrirAilleurs` se régler, puis ce qui en découle. */
const regler = () => act(async () => void (await Promise.resolve()))

/** `Services.ouvrirAilleurs` de l'app de bureau, tel que la toile l'appelle ; l'avis d'échec se dit par `annoncer`. */
const ouvrirAilleurs = (annoncer: (texte: string) => void = vi.fn()) => servicesDeLaFenetre(true, annoncer).ouvrirAilleurs!

describe('Services.ouvrirAilleurs dans l’app de bureau', () => {
  it('passe l’adresse et le nom à la coque, et ne dit rien quand tout va bien', async () => {
    const annoncer = vi.fn()
    ouvrirAilleurs(annoncer)('blob:http://localhost:3000/1', 'Rapport.pdf')
    await regler()
    expect(m.ouvrirAilleurs).toHaveBeenCalledExactlyOnceWith('blob:http://localhost:3000/1', 'Rapport.pdf')
    expect(annoncer).not.toHaveBeenCalled()
  })

  it('« enregistré » ou « annulé » ne sont pas des échecs', async () => {
    const annoncer = vi.fn()
    for (const issue of ['enregistre', 'annule']) {
      m.ouvrirAilleurs.mockResolvedValue(issue)
      ouvrirAilleurs(annoncer)('blob:x')
    }
    await regler()
    expect(annoncer).not.toHaveBeenCalled()
  })

  // Les mots sont ceux de l'édition locale (`bureau/ailleurs.ts`) : une seule façon de dire la même panne, dans les deux éditions.
  it('trop de fichiers d’un coup, un fichier trop gros, tout autre échec : les mêmes mots que l’édition locale, avec quoi faire', async () => {
    const annoncer = vi.fn()
    const cas: [unknown, string][] = [
      [{ code: 'trop_vite' }, 'Trop de fichiers ouverts d’un coup : réessayez dans un instant.'],
      [{ code: 'trop_gros' }, 'Ce fichier est trop volumineux pour s’ouvrir ainsi : téléchargez-le, puis ouvrez-le depuis votre ordinateur.'],
      [{ code: 'echec', message: 'disque plein' }, 'Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.'],
      [{ code: 'type_refuse' }, 'Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.'],
      [new Error('adresse refusée'), 'Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.'],
      ['texte', 'Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.'],
    ]
    for (const [e] of cas) {
      m.ouvrirAilleurs.mockRejectedValue(e)
      ouvrirAilleurs(annoncer)('blob:x', 'a.pdf')
    }
    await regler()
    expect(annoncer.mock.calls.map((a) => a[0])).toEqual(cas.map(([, texte]) => texte))
    for (const [e, texte] of cas) expect(texteOuvrirAilleurs(e)).toBe(texte)
  })

  it('les mots suivent la langue', async () => {
    definirLangue('en')
    const annoncer = vi.fn()
    m.ouvrirAilleurs.mockRejectedValue({ code: 'trop_gros' })
    ouvrirAilleurs(annoncer)('blob:x')
    await regler()
    expect(annoncer).toHaveBeenCalledExactlyOnceWith('This file is too large to open this way: download it, then open it from your computer.')
  })

  it('l’annonce par défaut se montre en bas de la page, comme une alerte, puis part seule', async () => {
    vi.useFakeTimers()
    await act(async () => racine.render(<AnnoncesServeur />))
    expect(hote.querySelector('.bandeau')).toBeNull()
    m.ouvrirAilleurs.mockRejectedValue({ code: 'trop_vite' })
    servicesDeLaFenetre(true).ouvrirAilleurs!('blob:x')
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
    // Un échec du geste qu'on vient de faire : une alerte, seule fiable quand le bandeau s'insère avec son texte.
    expect(hote.querySelector('.bandeau')?.getAttribute('role')).toBe('alert')
    expect(hote.textContent).toContain('Trop de fichiers ouverts d’un coup')
    await act(async () => void (await vi.advanceTimersByTimeAsync(6000)))
    expect(hote.querySelector('.bandeau')).toBeNull()
  })

  it('une annonce en remplace une autre, et se ferme à la main', async () => {
    await act(async () => racine.render(<AnnoncesServeur />))
    act(() => annoncerBureau('Une'))
    act(() => annoncerBureau('Deux'))
    expect(hote.querySelectorAll('.bandeau')).toHaveLength(1)
    expect(hote.textContent).toContain('Deux')
    await act(async () => hote.querySelector('button')!.click())
    expect(hote.querySelector('.bandeau')).toBeNull()
  })
})

describe('ce que la fenêtre donne à la toile', () => {
  it('dans un navigateur : ouvrir une toile dans un onglet, rien pour ouvrir un fichier ailleurs', () => {
    const ouvrir = vi.spyOn(window, 'open').mockReturnValue(null)
    const services = servicesDeLaFenetre(false)
    expect(services.ouvrirAilleurs).toBeUndefined()
    services.ouvrirDansOnglet!('a/b')
    expect(ouvrir).toHaveBeenCalledExactlyOnceWith('/t/a%2Fb', '_blank')
    ouvrir.mockRestore()
  })

  it('dans l’app de bureau : pas d’onglet (le menu n’en propose plus), un fichier qui s’ouvre dans l’application du système', async () => {
    const services = servicesDeLaFenetre(true, vi.fn())
    expect(services.ouvrirDansOnglet).toBeUndefined()
    services.ouvrirAilleurs!('blob:x', 'Plan.pdf')
    await regler()
    expect(m.ouvrirAilleurs).toHaveBeenCalledExactlyOnceWith('blob:x', 'Plan.pdf')
  })
})
