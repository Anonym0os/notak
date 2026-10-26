// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Moi } from '../api'
import { BandeauAdmin } from './BandeauAdmin'
import { COMMANDE_MISE_A_JOUR, adresseSure, lireDisponible, oublierMiseAJourServeur } from './miseAJourServeur'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let appels: string[]
let reponse: () => Response
let ecrit: ReturnType<typeof vi.fn>

const moi = (admin?: boolean): Moi => ({ id: 'u1', email: 'ana@exemple.fr', nom: 'Ana', couleur: '#000000', racine: 'r', photo: null, ...(admin === undefined ? {} : { admin }) })
const neuf = (extra: Record<string, unknown> = {}) =>
  Response.json({
    actuelle: '1.0.0',
    active: true,
    nouvelle: { version: '1.2.0', notes: 'Les cartes se déplacent mieux.', date: '2026-10-20', adresse: 'https://github.com/Anonym0os/notak/releases/tag/v1.2.0', ...extra },
  })

beforeEach(() => {
  definirLangue('fr')
  oublierMiseAJourServeur()
  appels = []
  reponse = neuf
  ecrit = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('fetch', async (chemin: string) => {
    appels.push(chemin)
    return reponse()
  })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrit }, configurable: true })
  localStorage.clear()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
})

const monter = async (m: Moi) => {
  await act(async () => racine.render(<BandeauAdmin moi={m} />))
}
/** Une autre page de l'application : le bandeau se démonte, et se remonte avec son propre état. */
const demonter = () => act(async () => racine.render(null))
const bouton = (texte: RegExp) => [...hote.querySelectorAll('button')].find((b) => texte.test(b.textContent ?? ''))!

describe('le bandeau d’une nouvelle version du serveur', () => {
  it('n’est pas pour qui n’administre pas ce serveur, et ne demande rien', async () => {
    await monter(moi())
    await monter(moi(false))
    expect(hote.querySelector('.bandeau')).toBeNull()
    expect(appels).toEqual([])
  })

  it('dit les deux versions à l’admin, avec de quoi copier la commande et lire les nouveautés', async () => {
    await monter(moi(true))
    expect(appels).toEqual(['/api/instance/mise-a-jour'])
    const bandeau = hote.querySelector('.bandeau')!
    expect(bandeau.getAttribute('role')).toBe('status')
    expect(bandeau.textContent).toContain('Notak 1.2.0 est disponible (ce serveur : 1.0.0).')
    const lien = hote.querySelector<HTMLAnchorElement>('a')!
    expect(lien.textContent).toBe('Nouveautés')
    expect(lien.href).toBe('https://github.com/Anonym0os/notak/releases/tag/v1.2.0')
    expect(lien.target).toBe('_blank')
    expect(lien.rel).toBe('noopener noreferrer')
  })

  it('« Copier la commande » met la commande dans le presse-papiers et le dit', async () => {
    await monter(moi(true))
    expect(bouton(/Copier la commande/).title).toBe('docker compose pull && docker compose up -d')
    await act(async () => bouton(/Copier la commande/).click())
    expect(ecrit).toHaveBeenCalledExactlyOnceWith(COMMANDE_MISE_A_JOUR)
    expect(hote.textContent).toContain('Commande copiée')
  })

  it('un presse-papiers refusé montre la commande, à copier à la main', async () => {
    ecrit.mockRejectedValue(new Error('refusé'))
    await monter(moi(true))
    await act(async () => bouton(/Copier la commande/).click())
    expect(hote.querySelector('code')?.textContent).toBe('docker compose pull && docker compose up -d')
  })

  it('les notes de version sont du texte : jamais du HTML', async () => {
    reponse = () => neuf({ notes: '<img src=x onerror="alert(1)"> **gras** <script>alert(2)</script>' })
    await monter(moi(true))
    const notes = hote.querySelector('details')!
    expect(notes.querySelector('summary')?.textContent).toBe('Notes de version')
    expect(notes.querySelector('pre')?.textContent).toBe('<img src=x onerror="alert(1)"> **gras** <script>alert(2)</script>')
    expect(hote.querySelector('img, script')).toBeNull()
  })

  it('une adresse de nouveautés qui n’est pas du web sécurisé n’est pas un lien', async () => {
    for (const adresse of ['javascript:alert(1)', 'http://exemple.fr/nouveautes', 'https://moi:mdp@exemple.fr/', 'data:text/html,<b>x</b>', 'pas une adresse', 42]) {
      reponse = () => neuf({ adresse })
      oublierMiseAJourServeur()
      await demonter()
      await monter(moi(true))
      expect(hote.querySelector('a'), String(adresse)).toBeNull()
      // Le bandeau reste : la version est dite, seul le lien manque.
      expect(hote.textContent).toContain('1.2.0')
    }
  })

  it('« Plus tard » le tait pour cette version, même rouvert, pas pour la suivante', async () => {
    await monter(moi(true))
    await act(async () => bouton(/Plus tard/).click())
    expect(hote.querySelector('.bandeau')).toBeNull()
    expect(localStorage.getItem('notak:serveur:maj-ecartee')).toBe('1.2.0')

    // Une autre page de l'application, plus tard : le bandeau reste tu.
    await demonter()
    oublierMiseAJourServeur()
    await monter(moi(true))
    expect(hote.querySelector('.bandeau')).toBeNull()

    // Une version plus récente le ramène.
    reponse = () => neuf({ version: '1.3.0' })
    oublierMiseAJourServeur()
    await demonter()
    await monter(moi(true))
    expect(hote.textContent).toContain('Notak 1.3.0 est disponible')
  })

  it('rien de neuf, un serveur qui ne sait pas, ou une réponse bizarre : pas de bandeau', async () => {
    for (const r of [
      () => Response.json({ actuelle: '1.0.0', active: true }),
      () => Response.json({ actuelle: '1.0.0', active: false }),
      () => new Response(JSON.stringify({ code: 'interdit' }), { status: 403 }),
      () => new Response('', { status: 500 }),
      () => Response.json({ actuelle: '1.0.0', nouvelle: { version: 12 } }),
      () => Response.json({ nouvelle: { version: '1.2.0' } }),
      () => Response.json(null),
    ]) {
      reponse = r
      oublierMiseAJourServeur()
      await demonter()
      await monter(moi(true))
      expect(hote.querySelector('.bandeau')).toBeNull()
    }
  })

  it('la même question une fois par demi-heure, d’une page à l’autre', async () => {
    await demonter()
    await monter(moi(true))
    await demonter()
    await monter(moi(true))
    expect(appels).toHaveLength(1)
  })
})

describe('ce que le serveur dit d’une nouvelle version', () => {
  it('se relit : bornes, types, adresse', () => {
    expect(lireDisponible({ actuelle: '1.0.0', nouvelle: { version: '1.2.0', notes: 'x'.repeat(9000), adresse: 'https://exemple.fr/v' } })).toEqual({
      version: '1.2.0',
      actuelle: '1.0.0',
      notes: 'x'.repeat(4000),
      adresse: 'https://exemple.fr/v',
    })
    expect(lireDisponible({ actuelle: '1.0.0', nouvelle: { version: '1.2.0', notes: '  ', adresse: null } })).toEqual({
      version: '1.2.0',
      actuelle: '1.0.0',
      notes: null,
      adresse: null,
    })
    expect(lireDisponible({ actuelle: '1.0.0', nouvelle: null })).toBeNull()
    expect(lireDisponible('texte')).toBeNull()
  })

  it('une adresse n’est offerte qu’en https, sans identifiants', () => {
    expect(adresseSure('https://exemple.fr/a?b=1')).toBe('https://exemple.fr/a?b=1')
    expect(adresseSure('http://exemple.fr')).toBeNull()
    expect(adresseSure('javascript:alert(1)')).toBeNull()
    expect(adresseSure('https://u:p@exemple.fr')).toBeNull()
    expect(adresseSure('')).toBeNull()
    expect(adresseSure(undefined)).toBeNull()
  })
})
