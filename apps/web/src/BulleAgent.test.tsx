// @vitest-environment jsdom
import { creerEspace } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BulleAgent } from './BulleAgent'
import { allerA } from './chemin'
import './langue'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOUR = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee'

let racine: Root
let montage: HTMLDivElement
/** L'espace de la page affichée (la bibliothèque, la toile) : la bulle s'y range pour en prendre le thème. */
let espaceDeLaPage: HTMLDivElement
let disponible: boolean
let fini: boolean
/** Ce que l'agent veut montrer, rendu à la lecture du tour (le relais de la porte v2). */
let ouvrir: unknown
const appels: { chemin: string; methode: string }[] = []

beforeEach(() => {
  history.replaceState(null, '', '/t/t1')
  espaceDeLaPage = document.createElement('div')
  espaceDeLaPage.className = 'notak-espace'
  document.body.append(espaceDeLaPage)
  montage = document.createElement('div')
  document.body.append(montage)
  racine = createRoot(montage)
  disponible = true
  fini = false
  ouvrir = null
  appels.length = 0
  vi.stubGlobal('fetch', async (chemin: string, init?: RequestInit) => {
    const methode = init?.method ?? 'GET'
    appels.push({ chemin, methode })
    const corps = (() => {
      if (chemin.includes('/agent/pieces')) return { piece: 'p-1', nom: 'plan.pdf', taille: 3 }
      if (methode === 'POST') return { tour: TOUR, etat: 'queued' }
      if (chemin.includes('/tours/'))
        return fini ? { tour: TOUR, etat: 'done', fini: true, texte: 'C’est fait.', echec: null, cartes: [], ouvrir } : { tour: TOUR, etat: 'running', fini: false, texte: null, echec: null, cartes: [], ouvrir }
      return { agent: 'Fram', disponible, echanges: fini ? [{ qui: 'fram', texte: 'C’est fait.', quand: '2026-11-22T10:00:00Z' }] : [], tour: null }
    })()
    return new Response(JSON.stringify(corps), { status: 200 })
  })
})

afterEach(() => {
  act(() => racine.unmount())
  montage.remove()
  espaceDeLaPage.remove()
  vi.unstubAllGlobals()
})

const attendre = async (ms = 0) => act(async () => new Promise((r) => setTimeout(r, ms)))
const espace = () => creerEspace({ racine: 'r', tableaux: { r: { titre: '', elements: [] }, t1: { titre: 'Voyage', elements: [] } } })
const bulle = () => espaceDeLaPage.querySelector<HTMLButtonElement>('.bulle-agent-bouton')
const panneau = () => espaceDeLaPage.querySelector<HTMLElement>('.bulle-agent-panneau')
const annonce = () => espaceDeLaPage.querySelector('.bulle-agent [role="status"]')?.textContent

async function monter() {
  await act(async () => racine.render(<BulleAgent racine="r" espace={espace()} />))
  await attendre()
}

describe('la bulle de l’agent', () => {
  it('paraît dans l’espace de la page, au coin bas droit qu’elle réserve, si l’agent est là ; et seulement sur les vues', async () => {
    await monter()
    expect(bulle()?.getAttribute('aria-label')).toBe('Parler à Fram')
    expect(bulle()?.getAttribute('aria-expanded')).toBe('false')
    expect(document.documentElement.hasAttribute('data-bulle-agent')).toBe(true)
    // La note rapide, un partage : pas d'ici, pas de bulle, et le coin se libère.
    await act(async () => allerA('/rapide'))
    expect(bulle()).toBeNull()
    expect(document.documentElement.hasAttribute('data-bulle-agent')).toBe(false)
    await act(async () => allerA('/'))
    expect(bulle()).not.toBeNull()
  })

  it('ne paraît pas quand l’outil ne l’ouvre pas à cette personne', async () => {
    disponible = false
    await monter()
    expect(bulle()).toBeNull()
    expect(document.documentElement.hasAttribute('data-bulle-agent')).toBe(false)
  })

  it('ouvre un dialogue qui reste ouvert pendant qu’on choisit sur la toile ; Échap ou la croix le ferment et rendent la main à la bulle', async () => {
    await monter()
    await act(async () => bulle()!.click())
    expect(panneau()?.getAttribute('role')).toBe('dialog')
    expect(bulle()!.getAttribute('aria-expanded')).toBe('true')
    expect(bulle()!.getAttribute('aria-controls')).toBe(panneau()!.id)
    expect(panneau()!.querySelector('.bulle-agent-tete p')?.textContent).toBe('Sur la toile « Voyage »')
    // Un appui sur la toile, à côté : le panneau reste.
    act(() => {
      espaceDeLaPage.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      espaceDeLaPage.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(panneau()).not.toBeNull()
    const champ = panneau()!.querySelector('textarea')!
    act(() => void champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(panneau()).toBeNull()
    expect(document.activeElement).toBe(bulle())
    await act(async () => bulle()!.click())
    await act(async () => panneau()!.querySelector<HTMLButtonElement>('.bulle-agent-fermer')!.click())
    expect(panneau()).toBeNull()
  })

  it('suit la personne d’une vue à l’autre, le même fil ouvert, et dit d’où elle écrit', async () => {
    await monter()
    await act(async () => bulle()!.click())
    await act(async () => allerA('/?dossier=clients'))
    expect(panneau()?.querySelector('.bulle-agent-tete p')?.textContent).toBe('Dans ce dossier')
    await act(async () => allerA('/'))
    expect(panneau()?.querySelector('.bulle-agent-tete p')?.textContent).toBe('Depuis la bibliothèque')
    expect(panneau()?.querySelector('textarea')?.placeholder).toBe('Que doit faire Fram ?')
  })

  it('un anneau tant que l’agent travaille, une pastille quand il répond bulle fermée, et ces états se disent', async () => {
    await monter()
    await act(async () => bulle()!.click())
    const champ = panneau()!.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(champ, 'Range ce tableau.')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => panneau()!.querySelector<HTMLFormElement>('.agent-saisie')!.requestSubmit())
    await attendre()
    await act(async () => bulle()!.click())
    expect(panneau()).toBeNull()
    expect(espaceDeLaPage.querySelector('.bulle-agent')!.hasAttribute('data-travaille')).toBe(true)
    expect(annonce()).toBe('Fram travaille…')
    fini = true
    await attendre(1100)
    await attendre()
    expect(espaceDeLaPage.querySelector('.bulle-agent')!.hasAttribute('data-travaille')).toBe(false)
    expect(bulle()!.querySelector('.bulle-agent-pastille')).not.toBeNull()
    expect(annonce()).toBe('Fram a répondu.')
    // Ouvrir la bulle lit la réponse.
    await act(async () => bulle()!.click())
    expect(bulle()!.querySelector('.bulle-agent-pastille')).toBeNull()
    expect(panneau()!.querySelector('.agent-lui p')?.textContent).toBe('C’est fait.')
  })

  it('au téléphone, la conversation monte en feuille du bas', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
    await monter()
    await act(async () => bulle()!.click())
    expect(panneau()).toBeNull()
    const feuille = document.querySelector('.agent-feuille')
    expect(feuille).not.toBeNull()
    expect(feuille!.querySelector('.notak-tiroir-bas-titre .bulle-agent-ici')?.textContent).toBe('Sur la toile « Voyage »')
    expect(feuille!.querySelector('textarea')).not.toBeNull()
  })

  it('au téléphone, la feuille se range quand l’agent mène où il a créé, et la réponse attend sous la pastille', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
    ouvrir = { type: 'page', titre: 'Wilfried Robert', tableau: '01CLIENTS', element: '01PAGE', adresse: `${location.origin}/t/01CLIENTS/e/01PAGE` }
    await monter()
    await act(async () => bulle()!.click())
    const champ = document.querySelector<HTMLTextAreaElement>('.agent-feuille textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(champ, 'Crée une page pour Wilfried Robert, et ouvre-la.')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => document.querySelector<HTMLFormElement>('.agent-feuille .agent-saisie')!.requestSubmit())
    await attendre()
    fini = true
    await attendre(700)
    await attendre(400)
    expect(location.pathname).toBe('/t/01CLIENTS/e/01PAGE')
    expect(document.querySelector('.agent-feuille')).toBeNull()
    expect(bulle()!.querySelector('.bulle-agent-pastille')).not.toBeNull()
  })

  it('des fichiers déposés sur la bulle fermée l’ouvrent et s’y joignent, partis par le serveur de Notak', async () => {
    await monter()
    expect(panneau()).toBeNull()
    const f = new File([new Uint8Array(3)], 'plan.pdf', { type: 'application/pdf' })
    for (const genre of ['dragenter', 'dragover', 'drop']) {
      const e = new Event(genre, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'dataTransfer', { value: { files: [f], types: ['Files'], dropEffect: 'none' } })
      await act(async () => void bulle()!.dispatchEvent(e))
      if (genre === 'dragover') expect(bulle()!.hasAttribute('data-depot')).toBe(true)
      if (genre === 'drop') expect(e.defaultPrevented).toBe(true)
    }
    await attendre()
    expect(bulle()!.hasAttribute('data-depot')).toBe(false)
    expect(panneau()).not.toBeNull()
    expect(panneau()!.querySelector('.agent-piece-nom')?.textContent).toBe('plan.pdf')
    expect(panneau()!.querySelector('.agent-piece')?.getAttribute('data-etat')).toBe('prete')
    expect(appels.some((a) => a.chemin === `/api/tableaux/t1/agent/pieces?nom=plan.pdf` && a.methode === 'POST')).toBe(true)
  })

  it('pendant un tour, la ligne vivante et « Arrêter » sont dans le panneau ; le champ reste ouvert', async () => {
    await monter()
    await act(async () => bulle()!.click())
    const champ = panneau()!.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(champ, 'Range ce tableau.')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => panneau()!.querySelector<HTMLFormElement>('.agent-saisie')!.requestSubmit())
    await attendre()
    expect(panneau()!.querySelector('.agent-direct-ligne')).not.toBeNull()
    expect(panneau()!.querySelector('.agent-arreter')?.textContent).toBe('Arrêter')
    expect(panneau()!.querySelector('textarea')!.disabled).toBe(false)
    expect(annonce()).toBe('Fram travaille…')
  })
})
