// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageRelier, ficheDeLAdresse } from './Relier'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let routes: Record<string, () => Response | Promise<Response>>
let appels: { cle: string; corps: unknown }[]

const CHEMIN = '/api/rattachements/crm/societe%3A42'
const ADRESSE = '/relier?source=crm&cle=societe:42&titre=Dupont%20SARL&retour=https://crm.exemple.fr/societes/42'
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut })
const absent = () => json({ etat: 'absent', source: 'Mon CRM', dossier: 'Clients' })

beforeEach(() => {
  definirLangue('fr')
  appels = []
  routes = { [`GET ${CHEMIN}`]: absent }
  vi.stubGlobal('fetch', async (chemin: string, init?: RequestInit) => {
    const cle = `${init?.method ?? 'GET'} ${chemin}`
    appels.push({ cle, corps: init?.body ? JSON.parse(String(init.body)) : undefined })
    const r = routes[cle]
    if (!r) throw new Error(`appel imprévu : ${cle}`)
    return r()
  })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
  history.replaceState(null, '', '/')
})

const monter = async (adresse = ADRESSE) => {
  history.replaceState(null, '', adresse)
  await act(async () => racine.render(<PageRelier />))
}
const bouton = (texte: RegExp) => [...hote.querySelectorAll('button')].find((b) => texte.test(b.textContent ?? ''))
const titre = () => hote.querySelector('h2')?.textContent

describe('ficheDeLAdresse', () => {
  it('l’outil, la fiche, le titre (à défaut la clé) et le retour', () => {
    expect(ficheDeLAdresse('?source=crm&cle=societe:42&titre=%20Dupont%20&retour=https://crm.exemple.fr/s/42')).toEqual({
      source: 'crm',
      cle: 'societe:42',
      titre: 'Dupont',
      retour: 'https://crm.exemple.fr/s/42',
    })
    expect(ficheDeLAdresse('?source=crm&cle=societe:42')).toEqual({ source: 'crm', cle: 'societe:42', titre: 'societe:42' })
    expect(ficheDeLAdresse('?source=crm')).toBeNull()
    expect(ficheDeLAdresse('?cle=societe:42')).toBeNull()
  })
})

describe('la page /relier', () => {
  it('un dossier qui existe : la bibliothèque s’ouvre dessus, sans rien créer', async () => {
    routes[`GET ${CHEMIN}`] = () => json({ etat: 'present', tableau: 'd42', titre: 'Dupont SARL', source: 'Mon CRM', dossier: 'Clients' })
    await monter()
    expect(location.pathname + location.search).toBe('/?dossier=d42')
    expect(appels.map((a) => a.cle)).toEqual([`GET ${CHEMIN}`])
  })

  it('pas encore de dossier : elle le propose, et ne crée rien avant le clic', async () => {
    await monter()
    expect(titre()).toBe('« Dupont SARL » n’a pas encore de dossier')
    expect(hote.textContent).toContain('Il sera rangé dans « Clients », avec ceux des autres fiches de Mon CRM.')
    expect(appels.map((a) => a.cle)).toEqual([`GET ${CHEMIN}`])

    routes[`POST ${CHEMIN}`] = () => json({ etat: 'present', tableau: 'neuf', titre: 'Dupont SARL', source: 'Mon CRM', dossier: 'Clients' }, 201)
    await act(async () => bouton(/Créer le dossier/)!.click())
    expect(appels.at(-1)).toEqual({ cle: `POST ${CHEMIN}`, corps: { titre: 'Dupont SARL', adresse: 'https://crm.exemple.fr/societes/42' } })
    expect(location.pathname + location.search).toBe('/?dossier=neuf')
  })

  it('un refus du serveur se lit, et le bouton se retire', async () => {
    await monter()
    routes[`POST ${CHEMIN}`] = () => json({ erreur: 'adresse hors de l’outil', code: 'adresse_refusee' }, 400)
    await act(async () => bouton(/Créer le dossier/)!.click())
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('Le lien de retour ne mène pas à l’outil déclaré : le dossier n’a pas été créé.')
    expect(bouton(/Créer le dossier/)).toBeUndefined()
  })

  it('le réseau qui manque laisse réessayer', async () => {
    await monter()
    routes[`POST ${CHEMIN}`] = () => {
      throw new TypeError('Failed to fetch')
    }
    await act(async () => bouton(/Créer le dossier/)!.click())
    expect(hote.querySelector('[role=alert]')?.textContent).toBeTruthy()
    expect(bouton(/Créer le dossier/)?.disabled).toBe(false)
  })

  it('un dossier qu’on ne voit pas : elle le dit, sans proposer d’en faire un autre', async () => {
    routes[`GET ${CHEMIN}`] = () => json({ etat: 'cache', source: 'Mon CRM', dossier: 'Clients' })
    await monter()
    expect(titre()).toBe('Ce dossier existe déjà')
    expect(bouton(/Créer/)).toBeUndefined()
  })

  it('un outil que le serveur ne connaît pas, ou une adresse incomplète', async () => {
    routes[`GET ${CHEMIN}`] = () => json({ erreur: 'source inconnue', code: 'source_inconnue' }, 404)
    await monter()
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('Ce serveur Notak ne connaît pas l’outil d’où vient ce lien.')

    act(() => racine.unmount())
    racine = createRoot(hote)
    appels = []
    await monter('/relier?source=crm')
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('Cette adresse ne dit pas quelle fiche ouvrir.')
    expect(appels).toEqual([])
  })
})
