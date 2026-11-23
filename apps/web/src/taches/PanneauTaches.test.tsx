// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TacheDeLOutil } from '../api'
import '../langue'
import { ecrireMemoire } from './memoire'
import { PanneauTaches } from './PanneauTaches'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const OUTIL = 'https://silak.test'
const tache = (id: string, titre: string, champs: Partial<TacheDeLOutil> = {}): TacheDeLOutil => ({
  id,
  titre,
  fait: false,
  enRetard: false,
  echeance: null,
  recurrente: false,
  projet: null,
  personnes: [],
  lien: `${OUTIL}/taches/toutes?tache=${id}`,
  ...champs,
})

const PANNEAU = {
  disponible: true,
  outil: 'Silak',
  taches: [
    tache('t-dossier', 'Rendre le dossier', { enRetard: true }),
    tache('t-comite', 'Préparer le comité', { echeance: '2026-11-24', personnes: ['Samy Agher'], projet: 'Refonte' }),
    tache('t-usine', 'Visiter l’usine'),
  ],
  total: 3,
  complet: true,
  aujourdhui: '2026-11-23',
  ecrire: true,
  lien: `${OUTIL}/crm/societes/x`,
}

let racine: Root
let montage: HTMLDivElement
let reponses: Record<string, () => Response>
const appels: { chemin: string; methode: string; corps: Record<string, unknown> | null }[] = []
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status })

beforeEach(() => {
  localStorage.clear()
  montage = document.createElement('div')
  document.body.append(montage)
  racine = createRoot(montage)
  appels.length = 0
  reponses = { 'GET /api/tableaux/d1/taches': () => json(PANNEAU) }
  vi.stubGlobal('fetch', async (chemin: string, init?: RequestInit) => {
    const methode = init?.method ?? 'GET'
    appels.push({ chemin, methode, corps: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null })
    const r = reponses[`${methode} ${chemin}`]
    return r ? r() : json({ erreur: 'introuvable', code: 'introuvable' }, 404)
  })
})

afterEach(() => {
  act(() => racine.unmount())
  montage.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const attendre = async (ms = 0) => act(async () => new Promise((r) => setTimeout(r, ms)))
const monter = async () => {
  act(() => racine.render(<PanneauTaches dossier="d1" compte="u1" outil="Silak" />))
  await attendre()
}
const panneau = () => montage.querySelector<HTMLElement>('.taches-outil')
const lignes = () => [...montage.querySelectorAll('.taches-outil-ligne')].map((l) => l.querySelector('.taches-outil-nom')?.textContent)
const caseDe = (titre: string) => montage.querySelector<HTMLButtonElement>(`.notak-case[aria-label="${titre}"]`)!

describe('Le panneau des tâches d’un dossier de fiche', () => {
  it('montre les tâches de l’outil : le compte et les retards, les datées puis celles sans date, qui les fait, le projet', async () => {
    await monter()
    expect(panneau()?.getAttribute('aria-label')).toBe('Tâches de Silak')
    expect(montage.querySelector('.taches-outil-titre')?.textContent).toBe('Tâches31 en retard')
    expect(lignes()).toEqual(['Rendre le dossier', 'Préparer le comité', 'Visiter l’usine'])
    expect(montage.querySelector('.taches-outil-groupe')?.textContent).toBe('Sans date')
    expect(montage.querySelector('.taches-outil-personnes')?.textContent).toBe('SA')
    expect(montage.querySelector('.taches-outil-projet')?.textContent).toBe('Refonte')
    expect(montage.querySelector('.taches-outil-jour')?.textContent).toBe('Demain')
    expect(montage.querySelector('.taches-outil-outil')?.getAttribute('href')).toBe(`${OUTIL}/crm/societes/x`)
  })

  it('ne paraît pas quand l’outil ne l’ouvre pas à cette personne', async () => {
    reponses['GET /api/tableaux/d1/taches'] = () => json({ disponible: false })
    await monter()
    expect(panneau()).toBeNull()
  })

  it('coche une tâche chez l’outil, et la remet si l’outil n’a pas répondu', async () => {
    reponses['POST /api/tableaux/d1/taches/t-usine'] = () => json({ tache: tache('t-usine', 'Visiter l’usine', { fait: true }) })
    await monter()
    act(() => caseDe('Visiter l’usine').click())
    await attendre()
    const coche = appels.find((a) => a.methode === 'POST')!
    expect(coche.corps).toMatchObject({ fait: true })
    expect(String(coche.corps?.id)).toMatch(/^[0-9a-f-]{36}$/)
    expect(caseDe('Visiter l’usine').getAttribute('aria-checked')).toBe('true')
    expect(montage.querySelector('[role="status"]')?.textContent).toBe('« Visiter l’usine » est faite')

    reponses['POST /api/tableaux/d1/taches/t-dossier'] = () => json({ erreur: 'muet', code: 'injoignable' }, 502)
    act(() => caseDe('Rendre le dossier').click())
    await attendre()
    expect(caseDe('Rendre le dossier').getAttribute('aria-checked')).toBe('false')
    expect(montage.querySelector('[role="alert"]')?.textContent).toBe('Pas de réponse : rien n’a changé. Réessayez dans un instant.')
  })

  it('ajoute une tâche d’un titre et d’un jour, et la range où l’outil la range', async () => {
    reponses['POST /api/tableaux/d1/taches'] = () => json({ tache: tache('t-devis', 'Envoyer le devis', { echeance: '2026-11-25', personnes: ['Samy Agher'] }) })
    await monter()
    act(() => montage.querySelector<HTMLButtonElement>('.taches-outil-choix-jour')!.click())
    act(() => document.querySelector<HTMLButtonElement>('.taches-outil-calendrier [data-jour="2026-11-25"]')!.click())
    const champ = montage.querySelector<HTMLInputElement>('.taches-outil-champ')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, '  Envoyer   le devis ')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => champ.form!.requestSubmit())
    await attendre()
    const ajout = appels.find((a) => a.methode === 'POST')!
    expect(ajout.corps).toMatchObject({ titre: 'Envoyer le devis', echeance: '2026-11-25' })
    expect(lignes()).toEqual(['Rendre le dossier', 'Préparer le comité', 'Envoyer le devis', 'Visiter l’usine'])
    expect(champ.value).toBe('')
  })

  it('hors ligne, montre le dernier état connu et dit de quand il date ; il se relit quand le réseau revient', async () => {
    ecrireMemoire('u1', 'd1', { ...PANNEAU, taches: [tache('t-hier', 'Gardée hier')] } as never, Date.UTC(2026, 10, 22, 13, 30))
    reponses['GET /api/tableaux/d1/taches'] = () => json({ erreur: 'muet', code: 'injoignable' }, 502)
    await monter()
    expect(lignes()).toEqual(['Gardée hier'])
    expect(montage.querySelector('.taches-outil-bandeau')?.textContent).toMatch(/^Silak ne répond pas : état du 22 nov\. 2026/)
    expect(montage.querySelector('.taches-outil-ajout')).toBeNull()
    expect(caseDe('Gardée hier').getAttribute('aria-readonly')).toBe('true')

    reponses['GET /api/tableaux/d1/taches'] = () => json(PANNEAU)
    act(() => window.dispatchEvent(new Event('online')))
    await attendre()
    expect(lignes()).toEqual(['Rendre le dossier', 'Préparer le comité', 'Visiter l’usine'])
    expect(montage.querySelector('.taches-outil-bandeau')).toBeNull()
  })

  it('se relit au retour sur l’onglet, pas plus d’une fois en quelques secondes', async () => {
    await monter()
    const lectures = () => appels.filter((a) => a.methode === 'GET').length
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await attendre()
    expect(lectures()).toBe(1)
    const plusTard = Date.now() + 5000
    vi.spyOn(Date, 'now').mockReturnValue(plusTard)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await attendre()
    expect(lectures()).toBe(2)
  })

  it('au téléphone, se replie sous son titre, qui dit le compte et les retards', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    await monter()
    const bascule = montage.querySelector<HTMLButtonElement>('.taches-outil-bascule')!
    expect([bascule.textContent, bascule.getAttribute('aria-expanded')]).toEqual(['Tâches31 en retard', 'false'])
    expect(montage.querySelector<HTMLElement>('.taches-outil-corps')!.hidden).toBe(true)
    act(() => bascule.click())
    expect(montage.querySelector<HTMLElement>('.taches-outil-corps')!.hidden).toBe(false)
  })
})
