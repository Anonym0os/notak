// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DepotFichiers, creerEspace } from '@notak/tableau'
import type { Moi } from './api'
import { PlusTelephone } from './PlusTelephone'
import { CompteTelephone } from './Compte'

const api = vi.hoisted(() => ({ definirFavori: vi.fn(async () => {}) }))
vi.mock('./api', async (origine) => ({
  ...(await origine<typeof import('./api')>()),
  listerFavoris: async () => [],
  definirFavori: api.definirFavori,
  noterVu: async () => {},
  lireActivite: async () => ({ groupes: [], evenements: [], dernier: 0 }),
  listerAcces: async () => [{ utilisateur: 'moi', email: 'moi@x.fr', role: 'proprietaire', enAttente: false }],
  listerLiens: async () => [],
  listerBlocages: async () => [],
  listerEspaces: async () => [],
  etatVerrou: async () => ({ protege: false, verrouille: false }),
  listerNotifications: async () => ({
    nonLues: 2,
    notifications: [
      { id: 1, genre: 'commentaire', auteur: { id: 'a', nom: 'Ada', couleur: '#f00' }, tableau: 't2', titreTableau: 'Plans', instant: Date.now(), lu: false },
      { id: 2, genre: 'mention', auteur: { id: 'b', nom: 'Bob', couleur: '#00f' }, tableau: 't3', titreTableau: 'Idées', instant: Date.now(), lu: false },
    ],
  }),
  marquerLues: async () => {},
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
}

/** La barre d'une toile au téléphone, dans l'édition serveur : « ••• » et sa feuille, le compte et ses notifications. */

const MOI: Moi = { id: 'moi', email: 'moi@x.fr', nom: 'Moi', couleur: '#000000', racine: 'r', photo: null }
const fichiers = {} as DepotFichiers
const largeur = window.innerWidth

let racine: Root
let hote: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
})

const espace = () => creerEspace({ racine: 'r', tableaux: { r: { titre: '', elements: [] }, t: { titre: 'Voyage', elements: [] } } })
const lignes = () => [...document.querySelectorAll('.notak-actions-ligne')].map((b) => b.textContent)
const ligne = (texte: string) => [...document.querySelectorAll<HTMLButtonElement>('.notak-actions-ligne')].find((b) => b.textContent === texte)!

async function ouvrirPlus(reglages = vi.fn()) {
  await act(async () => racine.render(<PlusTelephone espace={espace()} tableau="t" moi={MOI} ouvrir={() => {}} fichiers={fichiers} reglages={reglages} />))
  act(() => hote.querySelector<HTMLButtonElement>('[aria-label="Plus d’actions"]')!.click())
  return reglages
}

describe('« ••• » au téléphone', () => {
  it('ouvre une feuille, titrée du nom de la toile, qui range ce que le bureau met en boutons', async () => {
    await ouvrirPlus()
    expect(document.querySelector('.notak-tiroir-bas-titre')?.textContent).toBe('Voyage')
    expect(lignes()).toEqual([
      'Partager',
      'Exporter ou télécharger',
      'Mettre en favori',
      'Activité',
      'Importer',
      'Mot de passe de la toile',
      'Signaler un bug',
      'Réglages',
    ])
  })

  it('« Partager » ferme la feuille et ouvre le partage en fenêtre', async () => {
    await ouvrirPlus()
    await act(async () => ligne('Partager').click())
    expect(document.querySelector('.notak-actions')).toBeNull()
    expect(hote.querySelector<HTMLDialogElement>('dialog.partage-fenetre')?.open).toBe(true)
  })

  it('« Mot de passe de la toile » ouvre le partage sur sa protection, dépliée', async () => {
    await ouvrirPlus()
    await act(async () => ligne('Mot de passe de la toile').click())
    expect(hote.querySelector<HTMLDetailsElement>('dialog.partage-fenetre details.partage-avance')?.open).toBe(true)
  })

  it('le favori se met d’un toucher, et « Réglages » ouvre ceux de la toile', async () => {
    const reglages = await ouvrirPlus()
    await act(async () => ligne('Mettre en favori').click())
    expect(api.definirFavori).toHaveBeenCalledWith('t', true)
    act(() => hote.querySelector<HTMLButtonElement>('[aria-label="Plus d’actions"]')!.click())
    act(() => ligne('Réglages').click())
    expect(reglages).toHaveBeenCalled()
    expect(document.querySelector('.notak-actions')).toBeNull()
  })

  it('« Activité » remplace la feuille par celle de l’activité', async () => {
    await ouvrirPlus()
    await act(async () => ligne('Activité').click())
    expect(document.querySelector('.activite-feuille')).not.toBeNull()
    expect(document.querySelector('.notak-actions')).toBeNull()
  })
})

describe('le compte au téléphone', () => {
  it('une pastille sur l’avatar dit le non-lu ; la feuille du compte a une ligne « Notifications » qui ouvre la liste', async () => {
    const ouvrir = vi.fn()
    await act(async () => racine.render(<CompteTelephone moi={MOI} deconnexion={() => {}} aide={() => {}} ouvrir={ouvrir} />))
    const avatar = hote.querySelector<HTMLButtonElement>('.compte-nom')!
    expect(avatar.querySelector('.compte-non-lu')).not.toBeNull()
    expect(avatar.getAttribute('aria-label')).toBe('Moi, 2 notifications non lues')

    act(() => avatar.click())
    const rangees = [...document.querySelectorAll('.compte-feuille .app-menu-ligne')].map((l) => l.querySelector('.app-menu-texte > span')?.textContent)
    expect(rangees[0]).toBe('Notifications')
    expect(rangees.at(-1)).toBe('Se déconnecter')

    await act(async () => document.querySelector<HTMLButtonElement>('.compte-feuille .app-menu-ligne')!.click())
    expect(document.querySelector('.compte-feuille')).toBeNull()
    const notifications = [...document.querySelectorAll<HTMLButtonElement>('.cloche-feuille .cloche-liste button')]
    expect(notifications).toHaveLength(2)

    await act(async () => notifications[0]!.click())
    expect(ouvrir).toHaveBeenCalledWith('t2')
    expect(document.querySelector('.cloche-feuille')).toBeNull()
  })
})
