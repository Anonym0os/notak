// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Moi, type PersonneProposee, etatVerrou, poserMotDePasse } from './api'
import { PartageEnFenetre } from './Partage'

const CLEO: PersonneProposee = { id: 'cleo', nom: 'Cléo', email: 'cleo@x.fr', couleur: '#3366ff', photo: null, espace: 'Silak', invite: false, acces: null }
const faux = vi.hoisted(() => ({
  proposerPersonnes: vi.fn(async (_tableau: string, _q: string): Promise<unknown[]> => []),
  partager: vi.fn(async () => ({ enAttente: false, expire: null })),
}))

vi.mock('./api', async (origine) => ({
  ...(await origine<typeof import('./api')>()),
  listerAcces: async () => [{ utilisateur: 'moi', email: 'moi@x.fr', role: 'proprietaire', enAttente: false }],
  listerLiens: async () => [],
  listerBlocages: async () => [],
  listerEspaces: async () => [],
  etatVerrou: vi.fn(async () => ({ protege: false })),
  poserMotDePasse: vi.fn(async () => {}),
  proposerPersonnes: faux.proposerPersonnes,
  partager: faux.partager,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ne fait pas de dialogue modal : `open` suffit pour ce qu'on vérifie.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
}

const MOI: Moi = { id: 'moi', email: 'moi@x.fr', nom: 'Moi', couleur: '#000000', racine: 'r', photo: null }

let racine: Root
let hote: HTMLDivElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const ouvrir = async (fermer: () => void) => {
  await act(async () => racine.render(<PartageEnFenetre tableau="t" moi={MOI} fermer={fermer} />))
  return hote.querySelector('dialog')!
}
const appuyer = (cible: Element) => cible.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
const cliquer = (cible: Element) => cible.dispatchEvent(new MouseEvent('click', { bubbles: true }))

describe('PartageEnFenetre', () => {
  it('ne se ferme pas quand un appui dans un champ se relâche sur le fond', async () => {
    const fermer = vi.fn()
    const boite = await ouvrir(fermer)
    const champ = boite.querySelector('input')!
    expect(champ).not.toBeNull()
    act(() => {
      appuyer(champ)
      cliquer(boite)
    })
    expect(fermer).not.toHaveBeenCalled()
  })

  it('se ferme quand l’appui et le clic sont sur le fond', async () => {
    const fermer = vi.fn()
    const boite = await ouvrir(fermer)
    act(() => {
      appuyer(boite)
      cliquer(boite)
    })
    expect(fermer).toHaveBeenCalledOnce()
  })

  it('ne porte qu’un seul rôle de dialogue, et se referme en partant', async () => {
    const boite = await ouvrir(() => {})
    expect(boite.open).toBe(true)
    expect(hote.querySelectorAll('[role="dialog"]')).toHaveLength(0)
    act(() => racine.render(<></>))
    expect(boite.open).toBe(false)
  })

  it('le mot de passe d’un dossier généré par un outil reste tel quel : ses gestes éteints, l’avis dit pourquoi', async () => {
    vi.mocked(etatVerrou).mockResolvedValueOnce({ protege: true, verrouille: false, par: null, genere: { outil: 'Silak', titre: 'Clients' } })
    await act(async () => racine.render(<PartageEnFenetre tableau="t" moi={MOI} fermer={() => {}} protection />))
    const bloc = [...hote.querySelectorAll('.partage-lien')].find((b) => b.querySelector('input[type="password"]'))!
    expect(bloc.textContent).toContain('« Clients » est généré par Silak : il reste tel quel.')
    const champ = bloc.querySelector<HTMLInputElement>('input[type="password"]')!
    const boutons = [...bloc.querySelectorAll('button')]
    expect(champ.disabled).toBe(true)
    expect(boutons.length).toBeGreaterThan(1)
    expect(boutons.every((b) => b.disabled)).toBe(true)
    act(() => void bloc.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(poserMotDePasse).not.toHaveBeenCalled()
  })

  it('une autre toile se protège comme avant', async () => {
    await act(async () => racine.render(<PartageEnFenetre tableau="t" moi={MOI} fermer={() => {}} protection />))
    const bloc = [...hote.querySelectorAll('.partage-lien')].find((b) => b.querySelector('input[type="password"]'))!
    expect(bloc.textContent).not.toContain('généré')
    expect(bloc.querySelector<HTMLInputElement>('input[type="password"]')!.disabled).toBe(false)
  })
})

/** Tape dans un champ tenu par React, comme le clavier, puis laisse passer le délai avant que le serveur cherche. */
const taper = async (champ: HTMLInputElement, texte: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, texte)
    champ.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => new Promise((r) => setTimeout(r, 160)))
}
const touche = (champ: Element, key: string) => act(() => void champ.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
const inviter = (boite: Element) => act(async () => cliquer(boite.querySelector('.partage-form button[type="submit"]')!))

describe('inviter quelqu’un de l’entreprise', () => {
  beforeEach(() => {
    faux.proposerPersonnes.mockReset().mockImplementation(async (_t, q) => (q && 'cleo'.startsWith(q.replace('é', 'e')) ? [CLEO] : []))
    faux.partager.mockClear()
  })

  it('propose les membres par leur nom dès qu’on tape, et invite la personne choisie sans qu’on sache son adresse', async () => {
    const boite = await ouvrir(() => {})
    const champ = boite.querySelector<HTMLInputElement>('input[role="combobox"]')!
    await act(async () => champ.focus())
    await taper(champ, 'clé')
    expect(faux.proposerPersonnes).toHaveBeenLastCalledWith('t', 'clé')
    const options = boite.querySelectorAll('[role="option"]')
    expect([...options].map((o) => o.textContent)).toEqual(['CCléocleo@x.fr · Silak'])
    expect(champ.getAttribute('aria-expanded')).toBe('true')

    await touche(champ, 'Enter')
    expect(boite.querySelector('.partage-choisi')?.textContent).toContain('Cléo')
    expect(boite.querySelectorAll('[role="option"]')).toHaveLength(0)
    await inviter(boite)
    expect(faux.partager).toHaveBeenCalledWith('t', { email: 'cleo@x.fr' }, 'edition', null)
    expect(boite.querySelector('.partage-choisi')).toBeNull()
  })

  it('une adresse entière invite qui n’est pas de l’entreprise ; un nom que rien ne propose demande d’en choisir un', async () => {
    const boite = await ouvrir(() => {})
    const champ = boite.querySelector<HTMLInputElement>('input[role="combobox"]')!
    await taper(champ, 'xavier')
    await inviter(boite)
    expect(faux.partager).not.toHaveBeenCalled()
    expect(boite.querySelector('[role="alert"]')?.textContent).toBe('Choisissez une personne proposée, ou tapez une adresse entière')
    await taper(champ, 'Xavier@Dehors.fr')
    await inviter(boite)
    expect(faux.partager).toHaveBeenCalledWith('t', { email: 'xavier@dehors.fr' }, 'edition', null)
  })
})
