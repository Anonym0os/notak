// @vitest-environment jsdom
import type { EspaceNavigable } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilAgent, TexteAgent, extraitDe, selectionDe, useAgent } from './Agent'
import type { Ici } from './ici'
import './langue'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOUR = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee'
const VU = { qui: 'personne', texte: 'Résume ce tableau.', quand: '2026-11-21T12:00:00Z' }
const REPONSE = { qui: 'fram', texte: 'Trois décisions : …', quand: '2026-11-21T12:00:05Z' }
const SUR_T1: Ici = { tableau: 't1', element: null, vue: 'toile' }

let racine: Root
let hote: HTMLDivElement
let reponses: ((chemin: string, init?: RequestInit) => unknown)[]
const appels: { chemin: string; methode: string; corps: unknown }[] = []

beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  appels.length = 0
  vi.stubGlobal('fetch', async (chemin: string, init?: RequestInit) => {
    appels.push({ chemin, methode: init?.method ?? 'GET', corps: init?.body ? JSON.parse(String(init.body)) : undefined })
    const suivante = reponses.length > 1 ? reponses.shift()! : reponses[0]!
    const corps = suivante(chemin, init)
    return corps instanceof Response ? corps : new Response(JSON.stringify(corps), { status: 200 })
  })
})

afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
})

const attendre = async (ms = 0) => act(async () => new Promise((r) => setTimeout(r, ms)))

/** Ce que la bulle fait de l'agent : son fil, quand il est là. */
function Harnais({ ici, espace }: { ici: Ici | null; espace?: EspaceNavigable }) {
  const agent = useAgent(ici, espace)
  return agent.disponible ? <FilAgent agent={agent} /> : null
}

const ecrire = async (texte: string) => {
  const champ = hote.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(champ, texte)
    champ.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => hote.querySelector<HTMLFormElement>('.agent-saisie')!.requestSubmit())
}

describe('L’agent, pour cette personne', () => {
  it('ne paraît pas quand l’agent n’est pas là pour cette personne', async () => {
    reponses = [() => ({ agent: 'Fram', disponible: false })]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
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
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await attendre()
    expect(hote.querySelector('.agent-vide')?.textContent).toContain('Demandez à Fram')
    expect(hote.querySelector('textarea')!.placeholder).toBe('Que doit faire Fram sur ce tableau ?')

    await ecrire('Résume ce tableau.')
    await attendre()
    expect(appels.find((a) => a.corps)).toEqual({ chemin: '/api/tableaux/t1/agent', methode: 'POST', corps: { message: 'Résume ce tableau.' } })
    expect(hote.querySelector('.agent-travaille')?.textContent).toBe('Fram travaille…')
    expect(hote.querySelector('.agent-moi p')?.textContent).toBe('Résume ce tableau.')

    await attendre(700)
    await attendre()
    expect(hote.querySelector('.agent-travaille')).toBeNull()
    expect([...hote.querySelectorAll('.agent-echange p')].map((p) => p.textContent)).toEqual([VU.texte, REPONSE.texte])
  })

  it('suit le tour depuis le tableau d’où il est parti quand on écrit ensuite d’ailleurs, et garde le fil à l’écran', async () => {
    // L'agent mène la personne ailleurs pendant qu'il travaille : la bulle la suit, le tour ne se perd pas.
    let fini = false
    reponses = [
      (chemin, init) => {
        if (init?.method === 'POST') return { tour: TOUR, etat: 'queued' }
        if (chemin.includes('/tours/')) {
          if (!fini && appels.filter((a) => a.chemin.includes('/tours/')).length < 2) return { tour: TOUR, etat: 'running', fini: false, texte: null, echec: null, cartes: [] }
          fini = true
          return { tour: TOUR, etat: 'done', fini: true, texte: REPONSE.texte, echec: null, cartes: [] }
        }
        return { agent: 'Fram', disponible: true, echanges: fini ? [VU, REPONSE] : [], tour: null }
      },
    ]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await attendre()
    await ecrire('Résume ce tableau.')
    await attendre()
    await act(async () => racine.render(<Harnais ici={{ tableau: 't2', element: null, vue: 'toile' }} />))
    expect(hote.querySelector('.agent-moi p')?.textContent).toBe('Résume ce tableau.')
    await attendre(700)
    await attendre(1600)
    await attendre()
    const tours = appels.filter((a) => a.chemin.includes('/tours/')).map((a) => a.chemin)
    expect(tours.length).toBeGreaterThanOrEqual(2)
    expect(tours.every((c) => c.startsWith('/api/tableaux/t1/agent/tours/'))).toBe(true)
    // Le fil se relit d'où le tour est parti ; l'agent étant connu, la nouvelle vue ne le redemande pas.
    expect(appels.some((a) => a.chemin === '/api/tableaux/t2/agent')).toBe(false)
    expect([...hote.querySelectorAll('.agent-echange p')].map((p) => p.textContent)).toEqual([VU.texte, REPONSE.texte])
  })

  it('tant qu’on ne sait pas si l’agent est là, chaque vue neuve le demande ; une fois su, plus rien', async () => {
    reponses = [() => new Response(JSON.stringify({ erreur: 'interdit' }), { status: 403 }), () => ({ agent: 'Fram', disponible: true, echanges: [], tour: null })]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await attendre()
    expect(hote.innerHTML).toBe('')
    await act(async () => racine.render(<Harnais ici={{ tableau: 'r', element: null, vue: 'bibliotheque' }} />))
    await attendre()
    expect(hote.querySelector('textarea')!.placeholder).toBe('Que doit faire Fram ?')
    expect(hote.querySelector('.agent-vide')?.textContent).toContain('retrouver une toile')
    const lus = appels.length
    await act(async () => racine.render(<Harnais ici={{ tableau: 'd1', element: null, vue: 'dossier' }} />))
    await attendre()
    // Le fil se relit à l'ouverture (FilAgent monté) ; changer de vue n'appelle plus l'outil.
    expect(appels.slice(lus).filter((a) => a.methode === 'GET')).toEqual([])
  })

  it('une page ouverte en grand part avec la demande ; depuis un dossier, aucune sélection ne se lit', async () => {
    reponses = [(_chemin, init) => (init?.method === 'POST' ? { tour: TOUR, etat: 'queued' } : { agent: 'Fram', disponible: true, echanges: [], tour: null })]
    const presence = vi.fn(() => ({ canal: () => ({ getLocalState: () => ({ selection: ['p1'] }) }) }))
    const espace = {
      presence,
      tableau: (id: string) => (id === 't1' ? { titre: 'Clients', elements: [{ id: 'p1', contenu: { type: 'document', titre: 'Wilfried Robert' } }] } : null),
    } as unknown as EspaceNavigable
    await act(async () => racine.render(<Harnais ici={{ tableau: 't1', element: 'p1', vue: 'element' }} espace={espace} />))
    await attendre()
    expect(hote.querySelector('textarea')!.placeholder).toBe('Que doit faire Fram sur cette page ?')
    await ecrire('Complète cette page.')
    await attendre()
    expect(appels.find((a) => a.methode === 'POST')?.corps).toEqual({ message: 'Complète cette page.', selection: [{ id: 'p1', texte: 'Wilfried Robert' }], ouvert: 'p1' })

    act(() => racine.unmount())
    racine = createRoot(hote)
    appels.length = 0
    presence.mockClear()
    await act(async () => racine.render(<Harnais ici={{ tableau: 't1', element: null, vue: 'dossier' }} espace={espace} />))
    await attendre()
    await ecrire('Range ce dossier.')
    await attendre()
    expect(appels.find((a) => a.methode === 'POST')?.corps).toEqual({ message: 'Range ce dossier.' })
    expect(presence).not.toHaveBeenCalled()
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

  it('rend un lien de la réponse en lien, seulement vers http ou https', async () => {
    await act(async () => racine.render(<TexteAgent texte={'La carte [Rœderer](https://notak.test/t/01) et [ceci](javascript:alert(1)).'} />))
    const liens = [...hote.querySelectorAll('a')]
    expect(liens.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('rel')])).toEqual([['Rœderer', 'https://notak.test/t/01', 'noopener noreferrer']])
    expect(hote.textContent).toContain('[ceci](javascript:alert(1))')
  })

  it('un lien vers Notak mène dans l’application, sans onglet ; un lien vers un autre site garde le sien', async () => {
    history.replaceState(null, '', '/t/ici')
    const texte = `La page [Wilfried Robert](${location.origin}/t/clients/e/wilfried), le dossier [Clients](/?dossier=clients) et [la fiche](https://silak.test/societes/42).`
    await act(async () => racine.render(<TexteAgent texte={texte} />))
    const [page, dossier, fiche] = [...hote.querySelectorAll('a')]
    const cliquer = (a: Element) => {
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      a.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(cliquer(page!)).toBe(true)
    expect(location.pathname).toBe('/t/clients/e/wilfried')
    expect(cliquer(dossier!)).toBe(true)
    expect(location.pathname + location.search).toBe('/?dossier=clients')
    // Un autre site : le navigateur l'ouvre dans un onglet, comme avant.
    expect(cliquer(fiche!)).toBe(false)
    expect(location.search).toBe('?dossier=clients')
  })

  it('lit la sélection dans la présence du tableau, avec un extrait de chaque élément', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Relancer  Rœderer' }, { type: 'text', text: 'lundi' }] }] }
    const espace = {
      presence: () => ({ canal: () => ({ getLocalState: () => ({ selection: ['e1', 'e2', 'e3', 7] }) }) }),
      tableau: () => ({ elements: [{ id: 'e1', contenu: { type: 'note', doc } }, { id: 'e2', contenu: { type: 'image', fichier: 'x.png' } }] }),
    } as unknown as Parameters<typeof selectionDe>[0]
    expect(selectionDe(espace, 't1')).toEqual([
      { id: 'e1', texte: 'Relancer Rœderer lundi' },
      { id: 'e2', texte: 'image' },
      { id: 'e3', texte: 'élément' },
    ])
    expect(selectionDe(undefined, 't1')).toEqual([])
    expect(extraitDe({ titre: 'x'.repeat(200) })).toHaveLength(120)
  })

  it('montre les cartes d’un tour arrêté sur elles, et y répond depuis le fil', async () => {
    let decide = false
    reponses = [
      (chemin, init) => {
        if (chemin.endsWith('/cartes')) {
          decide = true
          return { tour: TOUR, etat: 'queued' }
        }
        if (init?.method === 'POST') return { tour: TOUR, etat: 'queued' }
        if (chemin.includes('/tours/')) {
          return decide
            ? { tour: TOUR, etat: 'running', fini: false, texte: null, echec: null, cartes: [] }
            : { tour: TOUR, etat: 'awaiting_approval', fini: false, texte: null, echec: null, cartes: [{ id: 'call-1', resume: 'Créer la carte mentale « Rœderer »', definitif: false }, { id: 'call-2', resume: 'Jeter 2 éléments', definitif: true }] }
        }
        return { agent: 'Fram', disponible: true, echanges: [], tour: { id: TOUR, etat: 'awaiting_approval' } }
      },
    ]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await attendre()
    await attendre(700)
    await attendre()
    const cartes = [...hote.querySelectorAll('.agent-carte')]
    expect(cartes.map((c) => c.querySelector('p')?.textContent)).toEqual(['Créer la carte mentale « Rœderer »', 'Jeter 2 élémentsDéfinitif'])
    // Une carte définitive ne s’autorise pas « toujours ».
    expect([...cartes[1]!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Autoriser', 'Refuser'])
    const toujours = [...cartes[0]!.querySelectorAll('button')].find((b) => b.textContent === 'Toujours sur ce tableau')!
    await act(async () => toujours.click())
    await attendre()
    expect(appels.find((a) => a.chemin.endsWith('/cartes'))).toEqual({
      chemin: `/api/tableaux/t1/agent/tours/${TOUR}/cartes`,
      methode: 'POST',
      corps: { cartes: [{ id: 'call-1', accord: true, toujours: true }] },
    })
    expect(hote.querySelector('.agent-carte')).toBeNull()
  })
})
