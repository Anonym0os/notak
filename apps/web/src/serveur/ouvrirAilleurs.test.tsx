// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnnoncesServeur, annoncerBureau } from './annonces'
import { messageOuverture, ouvrirAilleursDeBureau, servicesDeLaFenetre } from './ouvrirAilleurs'

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

describe('Services.ouvrirAilleurs dans l’app de bureau', () => {
  it('passe l’adresse et le nom à la coque, et ne dit rien quand tout va bien', async () => {
    const annoncer = vi.fn()
    ouvrirAilleursDeBureau(annoncer)('blob:http://localhost:3000/1', 'Rapport.pdf')
    await regler()
    expect(m.ouvrirAilleurs).toHaveBeenCalledExactlyOnceWith('blob:http://localhost:3000/1', 'Rapport.pdf')
    expect(annoncer).not.toHaveBeenCalled()
  })

  it('« enregistré » ou « annulé » ne sont pas des échecs', async () => {
    const annoncer = vi.fn()
    for (const issue of ['enregistre', 'annule']) {
      m.ouvrirAilleurs.mockResolvedValue(issue)
      ouvrirAilleursDeBureau(annoncer)('blob:x')
    }
    await regler()
    expect(annoncer).not.toHaveBeenCalled()
  })

  it('trop de fichiers d’un coup (trop_vite) se dit en mots', async () => {
    const annoncer = vi.fn()
    m.ouvrirAilleurs.mockRejectedValue({ code: 'trop_vite' })
    ouvrirAilleursDeBureau(annoncer)('blob:x', 'a.pdf')
    await regler()
    expect(annoncer).toHaveBeenCalledExactlyOnceWith('Trop de fichiers ouverts d’un coup : patientez un instant.')
  })

  it('tout autre échec aussi, sans promesse non gérée', async () => {
    const annoncer = vi.fn()
    for (const e of [{ code: 'echec', message: 'disque plein' }, { code: 'type_refuse' }, new Error('adresse refusée'), 'texte']) {
      m.ouvrirAilleurs.mockRejectedValue(e)
      ouvrirAilleursDeBureau(annoncer)('blob:x')
    }
    await regler()
    expect(annoncer.mock.calls.map((a) => a[0])).toEqual(Array(4).fill('Ce fichier n’a pas pu s’ouvrir.'))
  })

  it('les mots suivent la langue', () => {
    definirLangue('en')
    expect(messageOuverture({ code: 'trop_vite' })).toBe('Too many files opened at once: wait a moment.')
    expect(messageOuverture({ code: 'echec', message: 'x' })).toBe('This file couldn’t be opened.')
  })

  it('l’annonce par défaut se montre en bas de la page, puis part seule', async () => {
    vi.useFakeTimers()
    await act(async () => racine.render(<AnnoncesServeur />))
    expect(hote.querySelector('.bandeau')).toBeNull()
    m.ouvrirAilleurs.mockRejectedValue({ code: 'trop_vite' })
    ouvrirAilleursDeBureau()('blob:x')
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
    expect(hote.querySelector('.bandeau')?.getAttribute('role')).toBe('status')
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
    const services = servicesDeLaFenetre(true)
    expect(services.ouvrirDansOnglet).toBeUndefined()
    services.ouvrirAilleurs!('blob:x', 'Plan.pdf')
    await regler()
    expect(m.ouvrirAilleurs).toHaveBeenCalledExactlyOnceWith('blob:x', 'Plan.pdf')
  })
})
