// @vitest-environment jsdom
import type { EspaceNavigable } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  type EchangeAgent,
  FilAgent,
  PIECE_MAX,
  TexteAgent,
  creesLus,
  extraitDe,
  messagesLocaux,
  nomDePiece,
  ouvertureLue,
  piecesParEchange,
  apresParEchange,
  selectionDe,
  trierFichiers,
  useAgent,
} from './Agent'
import { type EvenementAgent, appliquer, directVide, duree, reponseDe } from './agentDirect'
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
    appels.push({ chemin, methode: init?.method ?? 'GET', corps: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
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
    // Le tour se suit en direct dès l'envoi : son journal se lit tout de suite.
    expect(appels.some((a) => a.chemin === `/api/tableaux/t1/agent/tours/${TOUR}/journal`)).toBe(true)
    expect(hote.querySelector('.agent-moi p')?.textContent).toBe('Résume ce tableau.')

    await attendre(1100)
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
    // L'accord vaut pour toute la conversation, qui suit la personne d'un tableau à l'autre.
    const toujours = [...cartes[0]!.querySelectorAll('button')].find((b) => b.textContent === 'Toujours dans cette conversation')!
    await act(async () => toujours.click())
    await attendre()
    expect(appels.find((a) => a.chemin.endsWith('/cartes'))).toEqual({
      chemin: `/api/tableaux/t1/agent/tours/${TOUR}/cartes`,
      methode: 'POST',
      corps: { cartes: [{ id: 'call-1', accord: true, toujours: true }] },
    })
    expect(hote.querySelector('.agent-carte')).toBeNull()
  })

  describe('ce que l’agent a créé, et ce qu’il veut montrer (relais de la porte v2)', () => {
    const PAGE = { type: 'page', titre: 'Wilfried Robert', tableau: '01CLIENTS', element: '01PAGE', adresse: '' }
    const FAIT = 'C’est fait : la page **Wilfried Robert** est créée.'

    /** Un relais simulé : un tour qui travaille `lectures` fois, puis finit sur `FAIT` avec ce qu'il a créé. */
    const relais = ({ lectures = 1, ouvrir = null as unknown, crees = [] as unknown[], enCours = false } = {}) => {
      let lus = 0
      let fini = false
      return (chemin: string, init?: RequestInit) => {
        if (init?.method === 'POST') return { tour: TOUR, etat: 'queued' }
        if (chemin.includes('/tours/')) {
          lus++
          fini = lus > lectures
          return { tour: TOUR, etat: fini ? 'done' : 'running', fini, texte: fini ? FAIT : null, echec: null, cartes: [], ...(ouvrir ? { ouvrir } : {}), ...(fini ? { crees } : {}) }
        }
        return { agent: 'Fram', disponible: true, echanges: fini ? [VU, { qui: 'fram', texte: FAIT, quand: '2026-11-22T10:00:00Z' }] : [], tour: enCours && !fini ? { id: TOUR, etat: 'running' } : null }
      }
    }
    const allers: string[] = []
    const noter = () => allers.push(location.pathname)
    beforeEach(() => {
      history.replaceState(null, '', '/t/t1')
      allers.length = 0
      window.addEventListener('notak:chemin', noter)
    })
    afterEach(() => window.removeEventListener('notak:chemin', noter))

    it('sous la réponse, une puce « Ouvrir « … » » par création ; un clic y mène sans quitter l’application', async () => {
      const crees = [
        { ...PAGE, adresse: `${location.origin}/t/01CLIENTS/e/01PAGE` },
        // Une adresse que l'application ne sait pas ouvrir : la puce prend celle de l'élément.
        { type: 'carte_mentale', titre: '', tableau: '01VOYAGE', element: '01CARTE', adresse: 'https://ailleurs.test/carte' },
      ]
      reponses = [relais({ crees })]
      await act(async () => racine.render(<Harnais ici={SUR_T1} />))
      await attendre()
      await ecrire('Crée une page pour Wilfried Robert.')
      await attendre(700)
      await attendre(1600)
      await attendre()
      const puces = [...hote.querySelectorAll<HTMLAnchorElement>('.agent-lui .agent-puce')]
      expect(puces.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
        ['Ouvrir « Wilfried Robert »', '/t/01CLIENTS/e/01PAGE'],
        ['Ouvrir « Sans titre »', '/t/01VOYAGE/e/01CARTE'],
      ])
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      act(() => void puces[0]!.dispatchEvent(e))
      expect(e.defaultPrevented).toBe(true)
      expect(location.pathname).toBe('/t/01CLIENTS/e/01PAGE')
      expect(history.state).toEqual({ element: '01PAGE' })
    })

    it('l’intention d’ouvrir se suit une seule fois, dans l’onglet qui a envoyé la demande', async () => {
      // Comme le relais le rend : ce que la personne lit, avec le titre, le genre et l'adresse refaits par Notak.
      const ouvrir = { ...PAGE, adresse: `${location.origin}/t/01CLIENTS/e/01PAGE` }
      reponses = [relais({ lectures: 2, ouvrir, crees: [ouvrir] })]
      await act(async () => racine.render(<Harnais ici={SUR_T1} />))
      await attendre()
      await ecrire('Crée une page pour Wilfried Robert, et ouvre-la.')
      await attendre(700)
      expect(allers).toEqual(['/t/01CLIENTS/e/01PAGE'])
      // La personne revient sur sa toile : l'agent, qui le redit à chaque lecture, ne l'y ramène pas.
      history.replaceState(null, '', '/t/t1')
      await attendre(1600)
      await attendre(1600)
      await attendre()
      expect(allers).toEqual(['/t/01CLIENTS/e/01PAGE'])
      expect(location.pathname).toBe('/t/t1')
      expect(hote.querySelector('.agent-lui .agent-puce')?.getAttribute('href')).toBe('/t/01CLIENTS/e/01PAGE')
    })

    it('un tour retrouvé dans le fil (un autre onglet, une page rechargée) ne mène nulle part ; ses puces paraissent', async () => {
      reponses = [relais({ enCours: true, ouvrir: { tableau: '01CLIENTS', element: '01PAGE' }, crees: [{ ...PAGE, adresse: '/t/01CLIENTS/e/01PAGE' }] })]
      await act(async () => racine.render(<Harnais ici={SUR_T1} />))
      await attendre()
      await attendre(700)
      await attendre(1600)
      await attendre()
      expect(allers).toEqual([])
      expect(location.pathname).toBe('/t/t1')
      expect(hote.querySelector('.agent-lui .agent-puce')?.textContent).toBe('Ouvrir « Wilfried Robert »')
    })

    it('relit ces champs sans leur faire confiance, et s’en passe quand le relais ne les donne pas', () => {
      expect(creesLus(undefined)).toEqual([])
      expect(creesLus([{ tableau: '../etc' }, { tableau: '01A', element: 'x y', titre: 7, adresse: 'javascript:alert(1)' }, 'rien'])).toEqual([
        { type: '', titre: '', tableau: '01A', element: null, chemin: '/t/01A' },
      ])
      expect(creesLus([{ type: 'dossier', titre: '  Clients\n', tableau: '01D', adresse: `${location.origin}/?dossier=01D` }])).toEqual([
        { type: 'dossier', titre: 'Clients', tableau: '01D', element: null, chemin: '/?dossier=01D' },
      ])
      expect(ouvertureLue(null)).toBeNull()
      expect(ouvertureLue({ element: '01PAGE' })).toBeNull()
      expect(ouvertureLue({ tableau: '01T', element: '<script>' })).toEqual({ tableau: '01T', element: null, chemin: null })
      // L'adresse que le relais donne : un dossier s'ouvre dans la bibliothèque, pas en toile.
      expect(ouvertureLue({ tableau: '01D', type: 'dossier', adresse: `${location.origin}/?dossier=01D` })).toEqual({ tableau: '01D', element: null, chemin: '/?dossier=01D' })
    })

    it('range les puces sous la réponse de leur tour, sinon sous la dernière, sans doublon', () => {
      const pucesDe = (e: EchangeAgent[], crees: { reponse: string; crees: ReturnType<typeof creesLus> }[]) =>
        new Map([...apresParEchange(e, crees.map((c) => ({ ...c, etapes: [], duree: 0, arrete: false })))].map(([i, a]) => [i, a.crees]))
      const echanges = [VU, { qui: 'fram', texte: 'Première  réponse', quand: 'a' }, VU, { qui: 'fram', texte: 'Seconde', quand: 'b' }] as EchangeAgent[]
      const c = (tableau: string) => ({ type: 'page', titre: tableau, tableau, element: null, chemin: `/t/${tableau}` })
      const puces = pucesDe(echanges, [
        { reponse: 'Première réponse', crees: [c('01A')] },
        { reponse: 'Dite autrement', crees: [c('01B'), c('01B')] },
      ])
      expect([...puces.entries()].sort(([a], [b]) => a - b).map(([i, l]) => [i, l.map((x) => x.tableau)])).toEqual([
        [1, ['01A']],
        [3, ['01B']],
      ])
      // Deux réponses dites pareil : chacune garde ce que son tour a laissé.
      const pareil = [VU, { qui: 'fram', texte: 'Fait.', quand: 'a' }, VU, { qui: 'fram', texte: 'Fait.', quand: 'b' }] as EchangeAgent[]
      const deux = pucesDe(pareil, [
        { reponse: 'Fait.', crees: [c('01A')] },
        { reponse: 'Fait.', crees: [c('01B')] },
      ])
      expect([...deux.entries()].sort(([a], [b]) => a - b).map(([i, l]) => [i, l.map((x) => x.tableau)])).toEqual([
        [1, ['01A']],
        [3, ['01B']],
      ])
    })
  })
})

describe('le direct d’un tour (23/11/2026)', () => {
  const TOUR2 = '0190aaaa-bbbb-7ccc-8ddd-ffffffffffff'
  const avancer = async (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
  const texte = (sel: string) => hote.querySelector(sel)?.textContent ?? null
  const textes = (sel: string) => [...hote.querySelectorAll(sel)].map((e) => e.textContent)
  const journaux = (tour = TOUR) => appels.filter((a) => a.chemin.includes(`/tours/${tour}/journal`))

  /** Un journal simulé : à chaque lecture, l'étape suivante du scénario (la dernière se répète). */
  const scenario = (etapes: Record<string, unknown>[]) => {
    let i = 0
    return () => {
      const e = etapes[Math.min(i, etapes.length - 1)]!
      i++
      return { tour: TOUR, etat: 'running', fini: false, encore: false, evenements: [], crees: [], ouvrir: null, texte: null, echec: null, cartes: [], ...e }
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    history.replaceState(null, '', '/t/t1')
  })
  afterEach(() => vi.useRealTimers())

  it('suit le journal chaque seconde : la ligne vivante change à chaque événement, le fil se forme, la réponse s’écrit, sans coupure ; puis le fil se replie sous la réponse', async () => {
    let fini = false
    const CARTE = { type: 'carte_mentale', titre: 'Voyage', tableau: 't1', element: '01CARTE', adresse: '/t/t1/e/01CARTE' }
    const journal = scenario([
      { evenements: [{ seq: 1, genre: 'etat', etat: 'running' }, { seq: 2, genre: 'geste', id: 'g1', statut: 'en_cours', phrase: 'Je lis le tableau « Voyage »…' }], suite: 2 },
      { evenements: [{ seq: 3, genre: 'geste', id: 'g1', statut: 'fait', phrase: 'J’ai lu le tableau « Voyage ».' }, { seq: 4, genre: 'pensee', titre: 'Trois sujets se dégagent' }], suite: 4, crees: [CARTE] },
      {
        evenements: [
          { seq: 5, genre: 'plan', etapes: [{ titre: 'Lire', statut: 'fait' }, { titre: 'Dessiner la carte', statut: 'en_cours' }] },
          { seq: 6, genre: 'texte', bloc: 'n1', ajout: 'Je regarde les dates.', etape: true },
          { seq: 7, genre: 'geste', id: 'g2', statut: 'en_cours', phrase: 'Je dessine la carte…' },
        ],
        suite: 7,
        crees: [CARTE],
      },
      { evenements: [{ seq: 8, genre: 'texte', bloc: 'r1', ajout: 'La carte ', etape: false }, { seq: 9, genre: 'texte', bloc: 'r1', ajout: 'est prête.', etape: false }], suite: 9, crees: [CARTE] },
      { evenements: [], suite: 9, crees: [CARTE] },
    ])
    reponses = [
      (chemin, init) => {
        if (init?.method === 'POST') return { tour: TOUR, etat: 'queued' }
        if (chemin.includes('/journal')) {
          if (!fini) return journal()
          return { tour: TOUR, etat: 'done', fini: true, encore: false, suite: 11, evenements: [{ seq: 10, genre: 'geste', id: 'g2', statut: 'fait', phrase: 'J’ai dessiné la carte.' }, { seq: 11, genre: 'fin' }], crees: [CARTE], ouvrir: null, texte: 'La carte est prête.', echec: null, cartes: [] }
        }
        return { agent: 'Fram', disponible: true, echanges: fini ? [VU, { qui: 'fram', texte: 'La carte est prête.', quand: '2026-11-23T10:00:00Z' }] : [], tour: null }
      },
    ]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await avancer(0)
    await ecrire('Résume ce tableau.')
    await avancer(0)
    expect(texte('.agent-direct-phrase')).toBe('Je lis le tableau « Voyage »…')
    expect(texte('.agent-chrono')).toBe('0 s')
    expect(journaux()[0]!.chemin).toBe(`/api/tableaux/t1/agent/tours/${TOUR}/journal`)

    await avancer(1000)
    expect(journaux()[1]!.chemin).toBe(`/api/tableaux/t1/agent/tours/${TOUR}/journal?depuis=2`)
    expect(texte('.agent-direct-phrase')).toBe('Trois sujets se dégagent')
    // Un geste de même id remplace le précédent : au passé, une fois fait.
    expect(textes('.agent-direct .agent-etape')).toEqual(['J’ai lu le tableau « Voyage ».', 'Trois sujets se dégagent'])
    // Ce qui est créé paraît dès qu'il est écrit.
    expect(textes('.agent-direct .agent-puce')).toEqual(['Ouvrir « Voyage »'])

    await avancer(1000)
    expect(texte('.agent-direct-phrase')).toBe('Je dessine la carte…')
    expect(textes('.agent-plan li')).toEqual(['Lire', 'Dessiner la carte'])
    expect(hote.querySelector('.agent-plan li[data-statut="en_cours"]')?.textContent).toBe('Dessiner la carte')
    expect(textes('.agent-direct .agent-etape')).toEqual(['J’ai lu le tableau « Voyage ».', 'Trois sujets se dégagent', 'Je regarde les dates.', 'Je dessine la carte…'])

    await avancer(1000)
    expect(texte('.agent-direct-phrase')).toBe('Fram écrit sa réponse…')
    expect(texte('.agent-direct .agent-ecrit')).toBe('La carte est prête.')

    // Vingt minutes sans fin : le tour se suit toujours, la ligne garde l'heure, rien ne coupe.
    const lus = journaux().length
    await avancer(20 * 60_000)
    expect(journaux().length).toBeGreaterThan(lus + 1000)
    expect(hote.querySelector('.agent-direct')).not.toBeNull()
    expect(texte('.agent-chrono')).toMatch(/^20 min 0\d$/)
    expect(hote.querySelector('.agent-erreur')).toBeNull()

    fini = true
    await avancer(1000)
    await avancer(0)
    expect(hote.querySelector('.agent-direct')).toBeNull()
    expect(textes('.agent-lui > .agent-texte p')).toEqual(['La carte est prête.'])
    expect(texte('.agent-lui .agent-repli summary')).toMatch(/^4 étapes · 20 min 0\d$/)
    expect(textes('.agent-lui .agent-repli .agent-etape').at(-1)).toBe('J’ai dessiné la carte.')
    expect(textes('.agent-lui .agent-puce')).toEqual(['Ouvrir « Voyage »'])
  })

  it('relit tout de suite quand le journal dit qu’il y a encore, et ne rejoue pas un événement déjà vu', async () => {
    const journal = scenario([
      { evenements: [{ seq: 1, genre: 'texte', bloc: 'r', ajout: 'Bonjour', etape: false }], suite: 1, encore: true },
      { evenements: [{ seq: 1, genre: 'texte', bloc: 'r', ajout: 'Bonjour', etape: false }, { seq: 2, genre: 'texte', bloc: 'r', ajout: ' Samy', etape: false }], suite: 2 },
    ])
    reponses = [(chemin) => (chemin.includes('/journal') ? journal() : { agent: 'Fram', disponible: true, echanges: [], tour: { id: TOUR, etat: 'running' } })]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await avancer(50)
    await avancer(50)
    expect(journaux()).toHaveLength(2)
    expect(texte('.agent-ecrit')).toBe('Bonjour Samy')
  })

  it('« Arrêter » arrête le tour ; la réponse dit qu’il s’est arrêté', async () => {
    let arrete = false
    reponses = [
      (chemin, init) => {
        if (chemin.endsWith('/arreter')) {
          arrete = true
          return { tour: TOUR, etat: 'cancelling' }
        }
        if (chemin.includes('/journal'))
          return arrete
            ? { tour: TOUR, etat: 'cancelled', fini: true, suite: 3, evenements: [{ seq: 3, genre: 'etat', etat: 'cancelled' }, { seq: 4, genre: 'fin' }], crees: [], ouvrir: null, texte: 'Je me suis arrêté là.', echec: null, cartes: [] }
            : { tour: TOUR, etat: 'running', fini: false, suite: 2, evenements: [{ seq: 2, genre: 'geste', id: 'g', statut: 'en_cours', phrase: 'Je range les notes…' }], crees: [], ouvrir: null, texte: null, echec: null, cartes: [] }
        if (init?.method === 'POST') return { tour: TOUR, etat: 'queued' }
        // L'outil peut encore dire le tour en cours juste après sa fin : il n'est pas suivi une seconde fois.
        return { agent: 'Fram', disponible: true, echanges: arrete ? [{ qui: 'fram', texte: 'Je me suis arrêté là.', quand: 'z' }] : [], tour: { id: TOUR, etat: 'running' } }
      },
    ]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await avancer(0)
    await avancer(0)
    const bouton = hote.querySelector<HTMLButtonElement>('.agent-arreter')!
    expect(bouton.textContent).toBe('Arrêter')
    await act(async () => bouton.click())
    expect(appels.find((a) => a.chemin.endsWith('/arreter'))).toEqual({ chemin: `/api/tableaux/t1/agent/tours/${TOUR}/arreter`, methode: 'POST', corps: {} })
    expect(texte('.agent-direct-phrase')).toBe('Fram s’arrête…')
    expect(hote.querySelector<HTMLButtonElement>('.agent-arreter')!.disabled).toBe(true)
    await avancer(1000)
    await avancer(0)
    expect(hote.querySelector('.agent-direct')).toBeNull()
    expect(texte('.agent-lui .agent-arrete')).toBe('Arrêté')
  })

  it('pendant un tour, le champ reste ouvert ; un message envoyé attend « en attente », puis part à la fin du tour', async () => {
    let premierFini = false
    reponses = [
      (chemin, init) => {
        if (init?.method === 'POST') return { tour: TOUR2, fil: 'f1', etat: 'waiting' }
        if (chemin.includes(`/tours/${TOUR}/journal`))
          return premierFini
            ? { tour: TOUR, etat: 'done', fini: true, suite: 9, evenements: [], crees: [], ouvrir: null, texte: REPONSE.texte, echec: null, cartes: [] }
            : { tour: TOUR, etat: 'running', fini: false, suite: 1, evenements: [{ seq: 1, genre: 'geste', id: 'g', statut: 'en_cours', phrase: 'Je lis…' }], crees: [], ouvrir: null, texte: null, echec: null, cartes: [] }
        if (chemin.includes(`/tours/${TOUR2}/journal`))
          return { tour: TOUR2, etat: 'running', fini: false, suite: 1, evenements: [{ seq: 1, genre: 'geste', id: 'h', statut: 'en_cours', phrase: 'Je regarde la photo…' }], crees: [], ouvrir: null, texte: null, echec: null, cartes: [] }
        return { agent: 'Fram', disponible: true, echanges: premierFini ? [VU, REPONSE] : [VU], tour: premierFini ? { id: TOUR2, etat: 'running' } : { id: TOUR, etat: 'running' } }
      },
    ]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await avancer(0)
    await avancer(0)
    const champ = hote.querySelector('textarea')!
    expect(champ.disabled).toBe(false)
    expect(champ.placeholder).toBe('Votre message partira après ce tour')
    await ecrire('Et ajoute les dates.')
    await avancer(0)
    expect(appels.find((a) => a.methode === 'POST')?.corps).toEqual({ message: 'Et ajoute les dates.' })
    const attente = hote.querySelector('.agent-moi[data-attente]')!
    expect(attente.querySelector('strong')?.textContent).toBe('En attente, partira à la fin du tour')
    expect(attente.querySelector('p')?.textContent).toBe('Et ajoute les dates.')
    // Le message en file vient après le tour en cours.
    expect(hote.querySelector('.agent-direct + .agent-moi[data-attente]')).not.toBeNull()

    premierFini = true
    await avancer(1000)
    await avancer(0)
    await avancer(0)
    expect(journaux(TOUR2).length).toBeGreaterThanOrEqual(1)
    expect(hote.querySelector('.agent-moi[data-attente]')).toBeNull()
    expect(texte('.agent-direct-phrase')).toBe('Je regarde la photo…')
    expect(textes('.agent-echange > p, .agent-echange .agent-texte p')).toEqual([VU.texte, REPONSE.texte, 'Et ajoute les dates.'])
  })

  it('« Plus tôt » déplie les parties précédentes de la conversation, avec leur résumé, de la plus ancienne à la dernière', async () => {
    const parties = [
      { id: 'p2', debut: '2026-11-22T09:00:00Z', fin: '2026-11-22T09:40:00Z', resume: 'La carte des **invités**.' },
      { id: 'p1', debut: '2026-11-21T14:00:00Z', fin: '2026-11-21T15:00:00Z', resume: '' },
    ]
    reponses = [() => ({ agent: 'Fram', disponible: true, echanges: [VU], tour: null, parties })]
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await avancer(0)
    const bouton = hote.querySelector<HTMLButtonElement>('.agent-plus-tot-bouton')!
    expect(bouton.textContent).toBe('Plus tôt : 2 parties')
    expect(bouton.getAttribute('aria-expanded')).toBe('false')
    expect(hote.querySelector('.agent-partie')).toBeNull()
    await act(async () => bouton.click())
    expect(textes('.agent-partie .agent-texte')).toEqual(['Pas de résumé pour cette partie.', 'La carte des invités.'])
    expect(hote.querySelector('.agent-partie strong')?.textContent).toBe('invités')
    expect(hote.querySelector('.agent-partie small')?.textContent).toMatch(/21 nov/)
    await act(async () => bouton.click())
    expect(hote.querySelector('.agent-partie')).toBeNull()
  })
})

describe('les pièces jointes', () => {
  /** Un collage ou un dépôt comme le navigateur les fait : des fichiers, et les genres de ce qu'on porte. */
  const coller = async (cible: Element, fichiers: File[], o: { texte?: string; html?: boolean } = {}) => {
    const e = new Event('paste', { bubbles: true, cancelable: true })
    const types = [...(o.texte ? ['text/plain'] : []), ...(o.html ? ['text/html'] : []), ...(fichiers.length ? ['Files'] : [])]
    Object.defineProperty(e, 'clipboardData', { value: { files: fichiers, types, getData: (t: string) => (t === 'text/plain' ? (o.texte ?? '') : '') } })
    await act(async () => void cible.dispatchEvent(e))
    return e.defaultPrevented
  }
  const deposer = async (cible: Element, fichiers: File[]) => {
    for (const genre of ['dragenter', 'dragover']) {
      const e = new Event(genre, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'dataTransfer', { value: { files: fichiers, types: ['Files'], dropEffect: 'none' } })
      await act(async () => void cible.dispatchEvent(e))
    }
    const lache = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(lache, 'dataTransfer', { value: { files: fichiers, types: ['Files'] } })
    await act(async () => void cible.dispatchEvent(lache))
    return lache.defaultPrevented
  }
  const fichier = (nom: string, type: string, taille = 4) => {
    const f = new File([new Uint8Array(4)], nom, { type })
    if (taille !== 4) Object.defineProperty(f, 'size', { value: taille })
    return f
  }
  const pieces = () => [...hote.querySelectorAll('.agent-saisie .agent-piece')]
  let numero = 0
  let refuser: string | null = null

  beforeEach(() => {
    numero = 0
    refuser = null
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:apercu', revokeObjectURL: () => {} }))
    reponses = [
      (chemin, init) => {
        if (chemin.includes('/agent/pieces')) {
          const nom = decodeURIComponent(new URL(chemin, 'https://notak.test').searchParams.get('nom') ?? '')
          if (refuser && nom === refuser) return new Response(JSON.stringify({ erreur: 'Fram ne lit pas les vidéos.', code: 'piece_refusee' }), { status: 422 })
          return { piece: `p-${++numero}`, nom, taille: (init?.body as File).size }
        }
        if (init?.method === 'POST') return { tour: TOUR, etat: 'queued' }
        if (chemin.includes('/journal')) return { tour: TOUR, etat: 'running', fini: false, suite: 0, evenements: [], crees: [], ouvrir: null, texte: null, echec: null, cartes: [] }
        return { agent: 'Fram', disponible: true, echanges: [], tour: null }
      },
    ]
  })

  it('⌘V d’images les joint, une vignette chacune, et les envoie aussitôt par le serveur de Notak', async () => {
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await attendre()
    const champ = hote.querySelector('textarea')!
    expect(await coller(champ, [fichier('image.png', 'image/png'), fichier('image.png', 'image/png')])).toBe(true)
    await attendre()
    expect(pieces().map((p) => p.querySelector('.agent-piece-nom')?.textContent)).toEqual(['Image collée 1.png', 'Image collée 2.png'])
    expect(pieces().every((p) => p.querySelector('img')?.getAttribute('src') === 'blob:apercu')).toBe(true)
    expect(pieces().map((p) => p.getAttribute('data-etat'))).toEqual(['prete', 'prete'])
    expect(pieces()[0]!.querySelector('small')?.textContent).toBe('4 B')
    const envois = appels.filter((a) => a.chemin.includes('/agent/pieces'))
    expect(envois.map((a) => [a.chemin, a.methode])).toEqual([
      [`/api/tableaux/t1/agent/pieces?nom=${encodeURIComponent('Image collée 1.png')}`, 'POST'],
      [`/api/tableaux/t1/agent/pieces?nom=${encodeURIComponent('Image collée 2.png')}`, 'POST'],
    ])
    expect(envois[0]!.corps).toBeInstanceOf(File)

    // On retire la seconde ; le message part avec la première, et sans texte : une image seule est un message.
    await act(async () => pieces()[1]!.querySelector<HTMLButtonElement>('.agent-piece-retirer')!.click())
    expect(pieces()).toHaveLength(1)
    await act(async () => hote.querySelector<HTMLFormElement>('.agent-saisie')!.requestSubmit())
    await attendre()
    expect(appels.find((a) => a.chemin === '/api/tableaux/t1/agent' && a.methode === 'POST')?.corps).toEqual({ message: '', pieces: ['p-1'] })
    expect(pieces()).toHaveLength(0)
    // Le message envoyé montre sa pièce.
    expect(hote.querySelector('.agent-moi .agent-piece-nom')?.textContent).toBe('Image collée 1.png')
  })

  it('du texte collé d’un tableur garde son texte, même s’il porte une image de lui-même', async () => {
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await attendre()
    expect(await coller(hote.querySelector('textarea')!, [fichier('image.png', 'image/png')], { texte: 'A1	B1', html: true })).toBe(false)
    expect(pieces()).toHaveLength(0)
  })

  it('un dépôt de fichiers de tout genre, n’importe où sur la conversation, les joint ; la toile dessous n’en reçoit rien', async () => {
    const dessous = vi.fn()
    document.addEventListener('drop', dessous)
    onTestFinished(() => document.removeEventListener('drop', dessous))
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await attendre()
    expect(await deposer(hote.querySelector('.agent-fil')!, [fichier('devis.pdf', 'application/pdf'), fichier('notes.md', '')])).toBe(true)
    await attendre()
    expect(dessous).not.toHaveBeenCalled()
    expect(pieces().map((p) => p.querySelector('.agent-piece-nom')?.textContent)).toEqual(['devis.pdf', 'notes.md'])
    expect(pieces().every((p) => p.querySelector('.agent-piece-icone'))).toBe(true)
    expect(hote.querySelector('.agent-depot')).toBeNull()
    // Le trombone ouvre le choix des fichiers, plusieurs à la fois.
    const choix = hote.querySelector<HTMLInputElement>('.agent-saisie input[type="file"]')!
    expect(choix.multiple).toBe(true)
    expect(hote.querySelector('.agent-joindre')?.getAttribute('title')).toBe('Joindre des fichiers : 10 au plus par message, 25 Mo chacun')
  })

  it('dit les limites avant d’envoyer : 25 Mo par fichier, dix par message ; un refus de l’outil se lit sur la pièce et retient le message', async () => {
    refuser = 'film.mov'
    await act(async () => racine.render(<Harnais ici={SUR_T1} />))
    await attendre()
    const conversation = hote.querySelector('.agent-conversation')!
    await deposer(conversation, [fichier('gros.mov', 'video/quicktime', PIECE_MAX + 1)])
    expect(texte('.agent-avis')).toBe('« gros.mov » dépasse 25 Mo : il ne part pas.')
    expect(pieces()).toHaveLength(0)
    expect(appels.some((a) => a.chemin.includes('/agent/pieces'))).toBe(false)

    await deposer(conversation, Array.from({ length: 12 }, (_, i) => fichier(`photo-${i}.jpg`, 'image/jpeg')))
    await attendre()
    expect(pieces()).toHaveLength(10)
    expect(texte('.agent-avis')).toBe('Un message joint 10 fichiers au plus : les suivants ne partent pas.')
    expect(hote.querySelector<HTMLButtonElement>('.agent-joindre')!.disabled).toBe(true)
    for (let i = 0; i < 9; i++) await act(async () => pieces()[0]!.querySelector<HTMLButtonElement>('.agent-piece-retirer')!.click())

    await deposer(conversation, [fichier('film.mov', 'video/quicktime')])
    await attendre()
    const refusee = pieces().find((p) => p.getAttribute('data-etat') === 'refusee')!
    expect(refusee.querySelector('small')?.textContent).toBe('Fram ne lit pas les vidéos.')
    await ecrire('Regarde.')
    await attendre()
    expect(texte('.agent-avis')).toBe('Retirez les pièces refusées pour envoyer le message.')
    expect(appels.some((a) => a.chemin === '/api/tableaux/t1/agent' && a.methode === 'POST')).toBe(false)
  })

  function texte(sel: string) {
    return hote.querySelector(sel)?.textContent ?? null
  }
})

describe('ce que le direct fait du journal, et le reste, sans écran', () => {
  const ev = (e: Record<string, unknown>) => e as unknown as EvenementAgent

  it('replie les événements dans l’ordre, une fois chacun', () => {
    let d = directVide('Fram')
    expect(d.ligne).toBe('Fram s’y met…')
    d = appliquer(d, [ev({ seq: 2, genre: 'geste', id: 'a', statut: 'en_cours', phrase: 'Je lis…' }), ev({ seq: 1, genre: 'etat', etat: 'running' })], 'Fram')
    expect(d.ligne).toBe('Je lis…')
    expect(d.etat).toBe('running')
    d = appliquer(d, [ev({ seq: 2, genre: 'geste', id: 'a', statut: 'en_cours', phrase: 'rejoué' }), ev({ seq: 3, genre: 'geste', id: 'a', statut: 'fait', phrase: 'J’ai lu.' })], 'Fram')
    expect(d.etapes).toEqual([{ genre: 'geste', cle: 'g:a', statut: 'fait', phrase: 'J’ai lu.' }])
    d = appliquer(d, [ev({ seq: 4, genre: 'texte', bloc: 'x', ajout: '## Étape\n- Je compare **les** dates', etape: true })], 'Fram')
    expect(d.ligne).toBe('Je compare les dates')
    d = appliquer(d, [ev({ seq: 5, genre: 'texte', bloc: 'r1', ajout: 'Un.', etape: false }), ev({ seq: 6, genre: 'texte', bloc: 'r2', ajout: 'Deux.', etape: false })], 'Fram')
    expect(reponseDe(d)).toBe('Un.\n\nDeux.')
    d = appliquer(d, [ev({ seq: 7, genre: 'plan', etapes: [{ titre: 'A', statut: 'fait' }, { titre: 'B', statut: 'a_faire' }] })], 'Fram')
    expect(d.ligne).toBe('B')
    d = appliquer(d, [ev({ seq: 8, genre: 'echec', message: '' }), ev({ seq: 9, genre: 'fin' })], 'Fram')
    expect(d.echec).toBe('La demande n’a pas abouti. Réessayez dans un instant.')
    expect(d.fin).toBe(true)
    expect(appliquer(d, [], 'Fram')).toBe(d)
  })

  it('dit les durées à la seconde', () => {
    expect([duree(8_400), duree(65_000), duree(3_725_000)]).toEqual(['8 s', '1 min 05', '1 h 02'])
  })

  it('trie les fichiers à joindre, et nomme une image collée', () => {
    const f = (nom: string, taille: number) => Object.defineProperty(new File([''], nom), 'size', { value: taille }) as File
    expect(trierFichiers(9, [f('a', 1), f('b', 1), f('vide', 0), f('gros', PIECE_MAX + 1)])).toEqual({
      acceptes: [expect.objectContaining({ name: 'a' })],
      avis: '« vide » est vide : il ne part pas. « gros » dépasse 25 Mo : il ne part pas. Un message joint 10 fichiers au plus : les suivants ne partent pas.',
    })
    expect(trierFichiers(0, [f('a', PIECE_MAX)]).avis).toBeNull()
    expect(nomDePiece(new File([''], 'image.png', { type: 'image/png' }), 3)).toBe('Image collée 3.png')
    expect(nomDePiece(new File([''], '', { type: 'image/jpeg' }), 1)).toBe('Image collée 1.jpeg')
    expect(nomDePiece(new File([''], 'Devis Rœderer.pdf'), 1)).toBe('Devis Rœderer.pdf')
  })

  it('ne montre pas deux fois un message que le fil relu porte déjà, et range les pièces sous leur message', () => {
    const fil = [VU, REPONSE, { qui: 'personne', texte: 'Et  les dates ?', quand: 'c' }] as EchangeAgent[]
    const locaux = [{ texte: 'Et les dates ?' }, { texte: 'Et les dates ?' }, { texte: 'Autre' }]
    expect(messagesLocaux(fil, locaux)).toEqual([{ texte: 'Et les dates ?' }, { texte: 'Autre' }])
    expect(messagesLocaux([REPONSE] as EchangeAgent[], [{ texte: 'x' }])).toEqual([{ texte: 'x' }])
    const piece = { cle: 'k', nom: 'a.png', taille: 1, type: 'image/png', apercu: null, etat: 'prete' as const, id: 'p', erreur: null }
    expect([...piecesParEchange(fil, [{ texte: 'Et les dates ?', pieces: [piece] }, { texte: 'rien', pieces: [] }]).keys()]).toEqual([2])
  })
})
