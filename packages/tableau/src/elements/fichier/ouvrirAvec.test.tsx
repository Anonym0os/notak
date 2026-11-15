// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { definirLangue } from '../../langue'
import type { ApplicationOuverture, Services } from '../types'
import { applicationDe, libelleOuvrir, sorteDe, useOuvrirAvec } from './ouvrirAvec'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  definirLangue('fr')
})

const ouvrir = () => {}

describe('le libellé du bouton qui ouvre un fichier hors de Notak', () => {
  it('dans un navigateur, un nouvel onglet', () => {
    expect(libelleOuvrir({})).toEqual({ libelle: 'Ouvrir dans un nouvel onglet du navigateur', court: 'Nouvel onglet' })
  })

  it('dans l’app d’un Mac, l’application que le système a nommée', () => {
    expect(libelleOuvrir({ ouvrirAilleurs: ouvrir }, { sorte: 'application', nom: 'Aperçu' })).toEqual({ libelle: 'Ouvrir dans Aperçu', court: 'Ouvrir dans Aperçu' })
    definirLangue('en')
    expect(libelleOuvrir({ ouvrirAilleurs: ouvrir }, { sorte: 'application', nom: 'Preview' })).toEqual({ libelle: 'Open in Preview', court: 'Open in Preview' })
  })

  it('aucune application pour cette sorte : pas de bouton', () => {
    expect(libelleOuvrir({ ouvrirAilleurs: ouvrir }, { sorte: 'aucune' })).toBeNull()
  })

  it('sur un iPhone ou un iPad, la feuille de partage : « Ouvrir dans… », jamais « l’app »', () => {
    expect(libelleOuvrir({ ouvrirAilleurs: ouvrir }, { sorte: 'partage' })).toEqual({ libelle: 'Ouvrir dans une autre app…', court: 'Ouvrir dans…' })
  })

  it('sans réponse, ou une qu’on ne connaît pas (Windows, une app d’avant la question) : « Ouvrir sur l’ordinateur »', () => {
    const generique = { libelle: 'Ouvrir sur l’ordinateur', court: 'Ouvrir sur l’ordinateur' }
    expect(libelleOuvrir({ ouvrirAilleurs: ouvrir })).toEqual(generique)
    expect(libelleOuvrir({ ouvrirAilleurs: ouvrir }, { sorte: 'inconnue' })).toEqual(generique)
    expect(libelleOuvrir({ ouvrirAilleurs: ouvrir }, { sorte: 'demain' } as unknown as ApplicationOuverture)).toEqual(generique)
  })
})

describe('la question à l’hôte', () => {
  it('se pose une fois par extension, quelle que soit la casse', async () => {
    const demander = vi.fn(async () => ({ sorte: 'application', nom: 'Aperçu' }) as const)
    expect(await applicationDe(demander, 'devis.pdf')).toEqual({ sorte: 'application', nom: 'Aperçu' })
    expect(await applicationDe(demander, 'Plan.PDF')).toEqual({ sorte: 'application', nom: 'Aperçu' })
    expect(demander).toHaveBeenCalledOnce()
    expect(sorteDe('archive.tar.GZ')).toBe('gz')
  })

  it('une coque d’avant la commande la refuse : on ne sait pas, sans la redemander', async () => {
    const demander = vi.fn(async (): Promise<ApplicationOuverture> => Promise.reject(new Error('Command application_par_defaut not found')))
    expect(await applicationDe(demander, 'a.pdf')).toEqual({ sorte: 'inconnue' })
    expect(await applicationDe(demander, 'b.pdf')).toEqual({ sorte: 'inconnue' })
    expect(demander).toHaveBeenCalledOnce()
  })
})

function Bouton({ services, nom }: { services: Pick<Services, 'ouvrirAilleurs' | 'applicationPour'>; nom: string }) {
  const l = useOuvrirAvec(services, nom)
  return l ? <button type="button" aria-label={l.libelle} /> : null
}
const libelle = () => hote.querySelector('button')?.getAttribute('aria-label') ?? null

describe('useOuvrirAvec', () => {
  it('dit « sur l’ordinateur » le temps que l’hôte réponde, puis le nom ; la fois suivante, le nom tout de suite', async () => {
    let repondre!: (r: ApplicationOuverture) => void
    const demander = vi.fn(() => new Promise<ApplicationOuverture>((fin) => (repondre = fin)))
    const services = { ouvrirAilleurs: ouvrir, applicationPour: demander }
    act(() => racine.render(<Bouton services={services} nom="devis.pdf" />))
    expect(libelle()).toBe('Ouvrir sur l’ordinateur')
    await act(async () => repondre({ sorte: 'application', nom: 'Adobe Acrobat' }))
    expect(libelle()).toBe('Ouvrir dans Adobe Acrobat')
    act(() => racine.render(<></>))
    act(() => racine.render(<Bouton services={services} nom="autre.pdf" />))
    expect(libelle()).toBe('Ouvrir dans Adobe Acrobat')
    expect(demander).toHaveBeenCalledOnce()
  })

  it('suit le fichier montré : passer d’une image à un PDF repose la question pour le PDF', async () => {
    const demander = vi.fn(async (nom: string): Promise<ApplicationOuverture> => (nom.endsWith('.pdf') ? { sorte: 'application', nom: 'Aperçu' } : { sorte: 'aucune' }))
    const services = { ouvrirAilleurs: ouvrir, applicationPour: demander }
    await act(async () => racine.render(<Bouton services={services} nom="dessin.svg" />))
    expect(libelle()).toBeNull()
    await act(async () => racine.render(<Bouton services={services} nom="devis.pdf" />))
    expect(libelle()).toBe('Ouvrir dans Aperçu')
  })

  it('sans `ouvrirAilleurs`, ne demande rien : un nouvel onglet', async () => {
    const demander = vi.fn(async (): Promise<ApplicationOuverture> => ({ sorte: 'partage' }))
    await act(async () => racine.render(<Bouton services={{ applicationPour: demander }} nom="devis.pdf" />))
    expect(libelle()).toBe('Ouvrir dans un nouvel onglet du navigateur')
    expect(demander).not.toHaveBeenCalled()
  })
})
