// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { type Services, definirLangue, nouvelleNote } from '@notak/tableau'
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Ce que l'édition locale donne à la toile : on la prend au passage, la toile elle-même n'est pas ce qu'on essaie ici. Et les
 * copies : `jsdom` casse le zip de `fflate` (son `Uint8Array` n'est pas celui de `TextEncoder`), donc le fichier n'est qu'un
 * octet, qui désigne le contenu que `decoderNotak` rend (le vrai décodage a ses essais, `fichierEspace.test.ts`).
 */
const m = vi.hoisted(() => ({ services: null as Services | null, copies: new Map<number, unknown>() }))
vi.mock('@notak/tableau', async (origine) => ({
  ...(await origine<typeof import('@notak/tableau')>()),
  decoderNotak: (octets: Uint8Array) => m.copies.get(octets[0]!),
  EspaceNotak: ({ services }: { services: Services }) => {
    m.services = services
    return null
  },
  BullesDecouverte: () => null,
}))
vi.mock('../local/synchro', () => ({ initialiserSynchro: async () => {} }))

const attendre = (ms = 30) => act(async () => void (await new Promise((fin) => setTimeout(fin, ms))))

/** Une copie fabriquée chez quelqu'un d'autre : un tableau de tête, avec une note. */
function copieDe(tete: string): Uint8Array {
  const doc = new Y.Doc()
  doc.getMap('meta').set('titre', tete)
  doc.getMap('elements').set('n1', { ...nouvelleNote(0, 0), id: 'n1', plan: 'a0' })
  const n = m.copies.size + 1
  m.copies.set(n, { racine: tete, tableaux: [{ id: tete, titre: tete, etat: Y.encodeStateAsUpdate(doc) }], fichiers: [] })
  return new Uint8Array([n])
}

/**
 * L'édition locale, démarrée pour de bon sur `#racine` (le module se monte à son chargement). Rend l'espace qu'elle
 * ouvre (le même que celui des services) : ce que la personne y fait, et ce qu'elle y reçoit.
 */
async function demarrer() {
  vi.resetModules()
  m.services = null
  document.body.innerHTML = '<div id="racine"></div>'
  await act(async () => void (await import('./locale')))
  for (let i = 0; i < 40 && !m.services; i++) await attendre(25)
  expect(m.services, 'l’édition locale n’a pas donné ses services à la toile').not.toBeNull()
  const { espaceLocal } = await import('../local/espace')
  return { el: await espaceLocal(), services: m.services!, racine: document.getElementById('racine')! }
}

// Un espace où l'on a déjà travaillé : une copie rouverte s'y range, au lieu de devenir l'accueil (la page repartirait).
beforeAll(async () => {
  const { espaceLocal } = await import('../local/espace')
  const { espace, index } = await espaceLocal()
  espace.creerTableau('Voyage', index.racine())
  await new Promise((fin) => setTimeout(fin, 100))
})
beforeEach(() => {
  definirLangue('fr')
  localStorage.setItem('notak:local:accueilli', '1')
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  document.body.innerHTML = ''
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  vi.unstubAllGlobals()
})

// La promesse « une copie reçue ne charge rien d'un autre site sans votre accord » ne tient que par ce branchement : si l'une de
// ces lignes saute, tout le reste des essais (qui ont leurs propres faux hôtes) reste vert, et le lecteur d'une copie reçue se charge.
describe('l’édition locale : la barrière du contenu d’autres sites', () => {
  it('une copie reçue attend l’accord de la personne ; « tout afficher » le lui rend, et les toiles à l’écoute le savent', async () => {
    const { el, services } = await demarrer()
    const { rouvrirCopie } = await import('../local/copie')
    expect(services.contenuExterne?.('teteDeLea')).toBeUndefined()

    await rouvrirCopie(el, copieDe('teteDeLea'), el.index.racine())
    expect(services.contenuExterne?.('teteDeLea')).toBe('demander')
    // Les toiles qu'on a ouvertes sont prévenues quand la marque tombe.
    const prevenu = vi.fn()
    const arreter = services.ecouterContenuExterne!(prevenu)
    services.permettreContenuExterne!('teteDeLea')
    expect(services.contenuExterne?.('teteDeLea')).toBeUndefined()
    expect(prevenu).toHaveBeenCalled()
    arreter()
  })

  it('le bandeau « copie reçue » est monté sous la toile : il se voit, et « Tout afficher » lève la marque', async () => {
    const { el, services, racine } = await demarrer()
    expect(racine.querySelector('.bandeau-recu')).toBeNull()
    await act(async () => el.index.noterRecus([el.index.racine()]))
    const bandeau = racine.querySelector('.bandeau-recu')
    expect(bandeau?.textContent).toContain('copie reçue')
    expect(services.contenuExterne?.(el.index.racine())).toBe('demander')
    await act(async () => [...bandeau!.querySelectorAll('button')].find((b) => b.textContent === 'Tout afficher pour cette toile')!.click())
    expect(racine.querySelector('.bandeau-recu')).toBeNull()
    expect(el.index.recu(el.index.racine())).toBe(false)
  })

  it('un navigateur : une toile s’ouvre dans un onglet, pas de fichier à ouvrir « ailleurs »', async () => {
    const { services } = await demarrer()
    expect(services.ouvrirDansOnglet).toBeTypeOf('function')
    expect(services.ouvrirAilleurs).toBeUndefined()
  })
})

describe('l’édition locale dans l’app de bureau', () => {
  const dansLApp = (invoke: ReturnType<typeof vi.fn>) => {
    ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke, transformCallback: () => 1 }
  }

  it('un fichier qui ne s’ouvre pas ailleurs le dit, aux yeux et aux lecteurs d’écran', async () => {
    const invoke = vi.fn(async () => undefined)
    dansLApp(invoke)
    const { services, racine } = await demarrer()
    expect(services.ouvrirDansOnglet).toBeUndefined()
    // Une adresse que la page n'a pas à lire : refusée, et dite.
    services.ouvrirAilleurs!('https://exemple.fr/x.pdf', 'x.pdf')
    await attendre()
    expect(racine.querySelector('[role=alert]')?.textContent).toBe('Ce fichier n’a pas pu s’ouvrir. Réessayez, ou téléchargez-le.')
  })

  it('un double clic sur un .notak, pendant que la page est là : la copie se rouvre, et attend l’accord comme toute copie reçue', async () => {
    const octets = copieDe('teteDuDoubleClic')
    let enFile = [{ id: 'f1', nom: 'Plan.notak', taille: octets.length, confiee: false }]
    const invoke = vi.fn(async (commande: string) => {
      if (commande === 'fichiers_ouverts') return [...enFile]
      if (commande === 'lire_fichier_ouvert') {
        enFile = []
        return octets
      }
      if (commande === 'plugin:event|listen') return 1
    })
    dansLApp(invoke)
    const { services } = await demarrer()
    await vi.waitFor(() => expect(services.contenuExterne?.('teteDuDoubleClic')).toBe('demander'), { timeout: 3000 })
    expect(invoke.mock.calls.some((c) => c[0] === 'plugin:event|listen')).toBe(true)
  })
})
