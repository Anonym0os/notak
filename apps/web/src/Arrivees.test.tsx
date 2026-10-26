// @vitest-environment jsdom
import { type DepotFichiers, type EspaceDistant, definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PagePartage } from './Arrivees'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m = vi.hoisted(() => ({ deposer: vi.fn(), lire: vi.fn(), oublier: vi.fn() }))
vi.mock('./deposer', async (origine) => ({ ...(await origine<typeof import('./deposer')>()), deposerDansAccueil: m.deposer }))
vi.mock('./recuDuPartage', async (origine) => ({ ...(await origine<typeof import('./recuDuPartage')>()), lireArrivee: m.lire, oublierArrivee: m.oublier }))

const ID = '123e4567-e89b-12d3-a456-426614174000'
const espace = {} as EspaceDistant
const fichiers = {} as DepotFichiers

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  m.deposer.mockReset().mockResolvedValue({ etat: 'local', ajoutes: 1, ignores: 0 })
  m.lire.mockReset()
  m.oublier.mockReset().mockResolvedValue(undefined)
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent === texte)
async function ouvrir(recherche: string) {
  history.replaceState(null, '', `/partage${recherche}`)
  await act(async () => {
    racine.render(<PagePartage espace={espace} fichiers={fichiers} />)
  })
}

describe('la page de partage, quand le contenu arrive par l’adresse', () => {
  const arrivee = { titre: 'Une page', texte: 'Un passage\nsur deux lignes', adresse: 'https://exemple.org/a?b=1' }
  beforeEach(() => m.lire.mockResolvedValue(arrivee))

  it('montre le titre, un extrait et l’adresse, et ne pose rien tant qu’on n’a pas accepté', async () => {
    await ouvrir('?titre=Une+page&texte=x&adresse=y')
    expect(m.deposer).not.toHaveBeenCalled()
    expect(hote.querySelector('h2')?.textContent).toBe('Ajouter ceci à vos toiles ?')
    expect([...hote.querySelectorAll('dt')].map((e) => e.textContent)).toEqual(['Titre', 'Texte', 'Adresse'])
    expect([...hote.querySelectorAll('dd')].map((e) => e.textContent)).toEqual(['Une page', 'Un passage sur deux lignes', 'https://exemple.org/a?b=1'])
    expect(bouton('Ajouter à mes toiles')).toBeTruthy()
    expect(bouton('Annuler')).toBeTruthy()
  })

  it('l’adresse n’est qu’un texte : aucun lien, aucun balisage venu du lien n’est interprété', async () => {
    m.lire.mockResolvedValue({ titre: '<img src=x onerror=alert(1)>', adresse: 'javascript:alert(1)' })
    await ouvrir('?titre=x')
    expect(hote.querySelector('dl a')).toBeNull()
    expect(hote.querySelector('dl img')).toBeNull()
    expect(hote.querySelector('dd')?.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('le focus va à la question, pas à un bouton', async () => {
    await ouvrir('?titre=x')
    expect(document.activeElement).toBe(hote.querySelector('h2'))
  })

  it('« Ajouter à mes toiles » pose l’arrivée, une seule fois même si on insiste', async () => {
    await ouvrir('?titre=x')
    await act(async () => {
      bouton('Ajouter à mes toiles')!.click()
    })
    expect(m.deposer).toHaveBeenCalledExactlyOnceWith(espace, arrivee, fichiers)
    expect(hote.querySelector('[role="status"]')?.textContent).toContain('Notak')
    expect(hote.querySelector('dl')).toBeNull()
    expect(bouton('Ajouter à mes toiles')).toBeUndefined()
  })

  it('« Annuler » ne pose rien et laisse aller à Notak', async () => {
    await ouvrir('?titre=x')
    await act(async () => {
      bouton('Annuler')!.click()
    })
    expect(m.deposer).not.toHaveBeenCalled()
    expect(hote.querySelector('[role="status"]')?.textContent).toContain('Rien n’a été ajouté.')
    const lien = hote.querySelector<HTMLAnchorElement>('a[href="/"]')
    expect(lien?.textContent).toBe('Ouvrir Notak')
    expect(document.activeElement).toBe(lien)
  })

  describe('« Annuler »', () => {
    const poser = (opener: unknown) => Object.defineProperty(window, 'opener', { value: opener, configurable: true, writable: true })
    afterEach(() => Reflect.deleteProperty(window, 'opener'))

    it('referme la fenêtre qu’un favori a ouverte', async () => {
      const fermer = vi.spyOn(window, 'close').mockImplementation(() => {})
      poser({})
      await ouvrir('?titre=x')
      await act(async () => {
        bouton('Annuler')!.click()
      })
      expect(fermer).toHaveBeenCalledOnce()
    })

    it('laisse un onglet ordinaire ouvert', async () => {
      const fermer = vi.spyOn(window, 'close').mockImplementation(() => {})
      poser(null)
      await ouvrir('?titre=x')
      await act(async () => {
        bouton('Annuler')!.click()
      })
      expect(fermer).not.toHaveBeenCalled()
    })
  })

  it('un partage dont rien ne se montre est dit vide, sans question', async () => {
    m.lire.mockResolvedValue({ texte: ' \n ' })
    await ouvrir('?texte=%20')
    expect(m.deposer).not.toHaveBeenCalled()
    expect(hote.querySelector('form')).toBeNull()
    expect(hote.textContent).toContain('Rien à ajouter')
  })

  it('rien à lire dans l’adresse : « rien à ajouter », sans question', async () => {
    m.lire.mockResolvedValue(null)
    await ouvrir('')
    expect(hote.querySelector('form')).toBeNull()
    expect(hote.textContent).toContain('Rien à ajouter')
  })

  it('un dépôt qui échoue se dit, et l’on peut réessayer en rouvrant la page', async () => {
    m.deposer.mockRejectedValue(new Error('réseau'))
    await ouvrir('?titre=x')
    await act(async () => {
      bouton('Ajouter à mes toiles')!.click()
    })
    expect(hote.querySelector('[role="status"]')?.textContent).toContain('n’a pas pu être posé')
  })
})

describe('la page de partage, quand le système a partagé vers Notak', () => {
  it('pose tout de suite, sans question : le service worker a rangé ce contenu lui-même', async () => {
    const arrivee = { titre: 'Une page', fichiers: [new File(['x'], 'a.png', { type: 'image/png' })] }
    m.lire.mockResolvedValue(arrivee)
    await ouvrir(`?recu=${ID}`)
    expect(m.deposer).toHaveBeenCalledExactlyOnceWith(espace, arrivee, fichiers)
    expect(m.oublier).toHaveBeenCalledOnce()
    expect(hote.querySelector('form')).toBeNull()
    expect(hote.querySelector('[role="status"]')).not.toBeNull()
  })

  it('un numéro mal formé ne contourne pas la question : c’est un partage de l’adresse', async () => {
    m.lire.mockResolvedValue({ texte: 'venu d’un lien' })
    await ouvrir('?recu=../../x&texte=venu')
    expect(m.deposer).not.toHaveBeenCalled()
    expect(hote.querySelector('form')).not.toBeNull()
  })
})
