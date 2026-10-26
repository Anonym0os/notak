// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Moi } from '../api'
import { BandeauAdmin } from './BandeauAdmin'
import { COMMANDE_MISE_A_JOUR, adresseSure, lireDisponible, lireNotes, oublierMiseAJourServeur, versionEcartee } from './miseAJourServeur'
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
  vi.useRealTimers()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
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
    // Un repère nommé, pas une région `status` : elle serait relue en entier à chaque copie et à chaque ouverture des notes.
    expect(bandeau.getAttribute('role')).toBeNull()
    expect(bandeau.getAttribute('aria-label')).toBe('Mise à jour du serveur')
    expect(bandeau.textContent).toContain('Notak 1.2.0 est disponible (ce serveur : 1.0.0).')
    const lien = hote.querySelector<HTMLAnchorElement>('a')!
    expect(lien.textContent).toBe('Nouveautés')
    expect(lien.href).toBe('https://github.com/Anonym0os/notak/releases/tag/v1.2.0')
    expect(lien.target).toBe('_blank')
    expect(lien.rel).toBe('noopener noreferrer')
  })

  it('la commande est toujours là, avec où la lancer : sur le serveur, dans le dossier du compose.yaml', async () => {
    await monter(moi(true))
    const commande = hote.querySelector('.bandeau-admin-commande')!
    expect(commande.querySelector('code')?.textContent).toBe('docker compose pull && docker compose up -d')
    expect(commande.textContent).toContain('À lancer sur le serveur, dans le dossier de Notak (celui du compose.yaml)')
    // Pas seulement une infobulle : elle n'existe ni au tactile, ni au lecteur d'écran.
    expect(bouton(/Copier la commande/).hasAttribute('title')).toBe(false)
  })

  // Le serveur écrit la même commande dans son journal (`apps/serveur/src/misesAJour.ts`) : qu'une change seule, et l'admin lit deux consignes.
  it('la commande est celle que le serveur écrit dans son journal', () => {
    const serveur = readFileSync(join(import.meta.dirname, '../../../serveur/src/misesAJour.ts'), 'utf8')
    expect(serveur).toContain(COMMANDE_MISE_A_JOUR)
  })

  it('« Copier la commande » met la commande dans le presse-papiers, et dit où la lancer', async () => {
    await monter(moi(true))
    await act(async () => bouton(/Copier la commande/).click())
    expect(ecrit).toHaveBeenCalledExactlyOnceWith(COMMANDE_MISE_A_JOUR)
    expect(bouton(/Copiée/).textContent).toBe('Copiée : à lancer sur le serveur')
    // Seul ce résultat s'annonce, dans une région toujours là dont le texte change : pas tout le bandeau.
    const statut = hote.querySelector('[role=status]')!
    expect(statut.className).toContain('sr-seulement')
    expect(statut.textContent).toBe('Copiée : à lancer sur le serveur')
    expect(hote.querySelectorAll('[role=status]')).toHaveLength(1)
  })

  it('le libellé revient au bout de deux secondes et demie, et la région se vide', async () => {
    vi.useFakeTimers()
    await monter(moi(true))
    await act(async () => bouton(/Copier la commande/).click())
    expect(hote.querySelector('[role=status]')?.textContent).not.toBe('')
    await act(async () => void (await vi.advanceTimersByTimeAsync(2500)))
    expect(bouton(/Copier la commande/)).toBeTruthy()
    expect(hote.querySelector('[role=status]')?.textContent).toBe('')
  })

  it('un presse-papiers refusé le dit (une alerte), la commande restant là, à copier à la main', async () => {
    ecrit.mockRejectedValue(new Error('refusé'))
    await monter(moi(true))
    expect(hote.querySelector('[role=alert]')).toBeNull()
    await act(async () => bouton(/Copier la commande/).click())
    expect(hote.querySelector('[role=alert]')?.textContent).toBe('La copie a échoué : copiez la commande à la main.')
    expect(hote.querySelector('code')?.textContent).toBe('docker compose pull && docker compose up -d')
    expect(bouton(/Copier la commande/)).toBeTruthy()
  })

  it('les notes de version sont du texte : jamais du HTML', async () => {
    reponse = () => neuf({ notes: '<img src=x onerror="alert(1)"> **gras** <script>alert(2)</script>' })
    await monter(moi(true))
    const notes = hote.querySelector('details')!
    expect(notes.querySelector('summary')?.textContent).toBe('Notes de version')
    // Les marques du Markdown s'effacent ; le balisage venu du réseau reste du texte.
    expect(notes.querySelector('.bandeau-admin-notes-corps')?.textContent).toBe('<img src=x onerror="alert(1)"> gras <script>alert(2)</script>')
    expect(hote.querySelector('img, script')).toBeNull()
  })

  it('les notes en Markdown se lisent : des puces en liste, du gras et du code sans leurs marques', async () => {
    reponse = () =>
      neuf({
        notes: '- **Les cartes** se déplacent mieux : `Cmd+D`, et [un lien](https://exemple.fr/x).\n  Sur deux lignes.\n- Une autre puce.\n\nUn mot de la fin.',
      })
    await monter(moi(true))
    const corps = hote.querySelector('.bandeau-admin-notes-corps')!
    expect([...corps.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Les cartes se déplacent mieux : Cmd+D, et un lien. Sur deux lignes.',
      'Une autre puce.',
    ])
    expect(corps.querySelector('p')?.textContent).toBe('Un mot de la fin.')
    expect(corps.textContent).not.toMatch(/\*\*|`|\]\(/)
    // Le lien d'une note n'en est pas un : l'adresse n'est pas montrée, et la page de la version est déjà là.
    expect(corps.querySelector('a')).toBeNull()
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
    expect(versionEcartee()).toBe('1.2.0')

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

  it('« Plus tard » tient sept jours : le bandeau revient ensuite, pour la même version', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 26, 12) })
    await monter(moi(true))
    await act(async () => bouton(/Plus tard/).click())
    expect(hote.querySelector('.bandeau')).toBeNull()

    // Six jours après : toujours tu.
    vi.setSystemTime(Date.UTC(2026, 9, 26, 12) + 6 * 24 * 3600_000)
    await demonter()
    oublierMiseAJourServeur()
    await monter(moi(true))
    expect(hote.querySelector('.bandeau')).toBeNull()

    // Huit jours après : le rappel est venu.
    vi.setSystemTime(Date.UTC(2026, 9, 26, 12) + 8 * 24 * 3600_000)
    await demonter()
    oublierMiseAJourServeur()
    await monter(moi(true))
    expect(hote.textContent).toContain('Notak 1.2.0 est disponible')
  })

  it('un « plus tard » abîmé ou d’avant l’échéance n’éteint rien : le bandeau revient', () => {
    for (const brut of ['1.2.0', '{"version":"1.2.0"}', '{"jusqu":1}', 'null', '[]', '{"version":12,"jusqu":99999999999999}']) {
      localStorage.setItem('notak:serveur:maj-ecartee', brut)
      expect(versionEcartee(), brut).toBeNull()
    }
    localStorage.setItem('notak:serveur:maj-ecartee', JSON.stringify({ version: '1.2.0', jusqu: 10_000 }))
    expect(versionEcartee(9_999)).toBe('1.2.0')
    expect(versionEcartee(10_000)).toBeNull()
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

describe('les notes de version, lues comme du Markdown simple', () => {
  it('des puces en liste, leurs lignes en retrait recollées, des paragraphes à part', () => {
    expect(lireNotes('Intro.\n\n- Une.\n  Suite.\n- Deux.\n\nFin.')).toEqual([
      { type: 'texte', texte: 'Intro.' },
      { type: 'liste', puces: ['Une. Suite.', 'Deux.'] },
      { type: 'texte', texte: 'Fin.' },
    ])
  })

  it('efface le gras, le code, les liens et les titres, rien de plus', () => {
    expect(lireNotes('## Nouveautés\n- **Gras** et `code` et [lien](https://exemple.fr) et ![image](x.png)\n* Étoile\n+ Plus')).toEqual([
      { type: 'texte', texte: 'Nouveautés' },
      { type: 'liste', puces: ['Gras et code et lien et image', 'Étoile', 'Plus'] },
    ])
    // Un soulignement de nom (NOTAK_ORIGINE) ou une étoile seule n'est pas du Markdown à effacer.
    expect(lireNotes('- Réglez NOTAK_ORIGINE et __init__ et 2 * 3')).toEqual([{ type: 'liste', puces: ['Réglez NOTAK_ORIGINE et __init__ et 2 * 3'] }])
  })

  it('ne garde ni les puces vides ni les lignes blanches ; du texte brut reste un paragraphe', () => {
    expect(lireNotes('-\n- \n\n\n')).toEqual([])
    expect(lireNotes('Une ligne\nen deux morceaux.')).toEqual([{ type: 'texte', texte: 'Une ligne en deux morceaux.' }])
    expect(lireNotes('Fin de ligne\r\n- Windows\r\n')).toEqual([
      { type: 'texte', texte: 'Fin de ligne' },
      { type: 'liste', puces: ['Windows'] },
    ])
  })
})
