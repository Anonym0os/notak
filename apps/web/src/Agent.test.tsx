// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Agent, TexteAgent } from './Agent'
import './langue'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOUR = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee'
const VU = { qui: 'personne', texte: 'Résume ce tableau.', quand: '2026-11-21T12:00:00Z' }
const REPONSE = { qui: 'fram', texte: 'Trois décisions : …', quand: '2026-11-21T12:00:05Z' }

let racine: Root
let hote: HTMLDivElement
let reponses: ((chemin: string, init?: RequestInit) => unknown)[]
const appels: { chemin: string; corps: unknown }[] = []

beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  appels.length = 0
  vi.stubGlobal('fetch', async (chemin: string, init?: RequestInit) => {
    appels.push({ chemin, corps: init?.body ? JSON.parse(String(init.body)) : undefined })
    const suivante = reponses.length > 1 ? reponses.shift()! : reponses[0]!
    return new Response(JSON.stringify(suivante(chemin, init)), { status: 200 })
  })
})

afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
})

const attendre = async (ms = 0) => act(async () => new Promise((r) => setTimeout(r, ms)))

describe('Le panneau de l’agent', () => {
  it('ne paraît pas quand l’agent n’est pas là pour cette personne', async () => {
    reponses = [() => ({ agent: 'Fram', disponible: false })]
    await act(async () => racine.render(<Agent tableau="t1" />))
    await attendre()
    expect(hote.innerHTML).toBe('')
  })

  it('montre le fil, envoie la demande, dit qu’il travaille, puis sa réponse', async () => {
    let fini = false
    reponses = [
      (chemin, init) => {
        if (init?.method === 'POST') return { tour: TOUR, etat: 'queued' }
        if (chemin.includes('/tours/')) {
          fini = true
          return { tour: TOUR, etat: 'done', fini: true, texte: REPONSE.texte, echec: null, cartes: [] }
        }
        return { agent: 'Fram', disponible: true, echanges: fini ? [VU, REPONSE] : [], tour: null }
      },
    ]
    await act(async () => racine.render(<Agent tableau="t1" />))
    await attendre()
    const bouton = hote.querySelector<HTMLButtonElement>('.agent > button')!
    expect(bouton.textContent).toBe('Fram')
    await act(async () => bouton.click())
    await attendre()
    expect(hote.querySelector('.agent-vide')?.textContent).toContain('Demandez à Fram')

    const champ = hote.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(champ, 'Résume ce tableau.')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => hote.querySelector<HTMLFormElement>('.agent-saisie')!.requestSubmit())
    await attendre()
    expect(appels.find((a) => a.corps)).toEqual({ chemin: '/api/tableaux/t1/agent', corps: { message: 'Résume ce tableau.' } })
    expect(hote.querySelector('.agent-travaille')?.textContent).toBe('Fram travaille…')
    expect(hote.querySelector('.agent-moi p')?.textContent).toBe('Résume ce tableau.')

    await attendre(700)
    await attendre()
    expect(hote.querySelector('.agent-travaille')).toBeNull()
    expect([...hote.querySelectorAll('.agent-echange p')].map((p) => p.textContent)).toEqual([VU.texte, REPONSE.texte])
  })

  it('rend le Markdown de la réponse sans jamais en faire du HTML', async () => {
    const texte = '## Décisions\nTrois **points** et `un code`.\n\n- Relancer *lundi*\n- Envoyer <b>le devis</b>\n\n1. Un\n2. Deux'
    await act(async () => racine.render(<TexteAgent texte={texte} />))
    expect(hote.querySelector('p strong')?.textContent).toBe('Décisions')
    expect([...hote.querySelectorAll('strong')].map((e) => e.textContent)).toEqual(['Décisions', 'points'])
    expect(hote.querySelector('code')?.textContent).toBe('un code')
    expect([...hote.querySelectorAll('ul li')].map((e) => e.textContent)).toEqual(['Relancer lundi', 'Envoyer <b>le devis</b>'])
    expect(hote.querySelector('ul em')?.textContent).toBe('lundi')
    expect(hote.querySelectorAll('ol li')).toHaveLength(2)
    expect(hote.querySelector('b')).toBeNull()
  })
})
