// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Magasin, creerMagasin } from '../../coeur/magasin'
import { creerMagasinYjs } from '../../coeur/magasinYjs'
import type { Commentaire, Element } from '../../coeur/tableau'
import '..'
import { fermerMenus } from '../../menuUnique'
import { Toile } from '../../Toile'
import type { Services } from '../types'
import { chargerEmojis } from '../decor/emojis'
import { brouillonEnCours, brouillonGarde, oublierBrouillons } from './brouillon'
import { cleBrouillonFil } from './Commentaire'
import { ajouterMessage, nouveauCommentaire } from './fil'
import { oublierLus } from './suivi'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// La fiche « Commentaire » posée sur la toile, comme les autres fils : son premier message s'écrit dans le champ commun
// et reste chez soi jusqu'à « Publier » ; la garde des brouillons retient la sortie ; posée puis laissée vide, ou son
// brouillon abandonné, elle s'en va sans corbeille ni pas à annuler.

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeAll(async () => {
  await chargerEmojis()
})
beforeEach(() => {
  oublierLus()
  oublierBrouillons()
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  document.elementsFromPoint ??= () => []
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  HTMLElement.prototype.setPointerCapture ??= () => {}
  // Le champ se montre en entier quand il prend le curseur : ProseMirror mesure la sélection.
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
})

const ana = { id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }
const bob = { id: 'bob', nom: 'Bob Martin', couleur: '#2a7' }
// Les autres : le même tableau tant que rien ne change, comme le veut la présence.
const personne: never[] = []
const presence = { moi: () => ana, autres: () => personne, ecouter: () => () => {}, signaler() {} }

type Champ = HTMLElement & { editor: { commands: { insertContent(t: string): boolean } } }

/** La toile de ce magasin, montée. */
async function monter(magasin: Magasin, services: Services = {}) {
  act(() => racine.render(<Toile magasin={magasin} services={{ presence, ...services } as Services} />))
  await act(async () => {})
  const toile = hote.querySelector<HTMLElement>('.notak-toile')!
  const fils = () => magasin.lire().elements.filter((e): e is Element<Commentaire> => e.contenu.type === 'commentaire')
  return { magasin, toile, fils }
}

/** Pose une fiche Commentaire depuis le clic droit de la toile, comme depuis la barre : elle naît en édition. */
async function poser(toile: HTMLElement) {
  act(() => void toile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 })))
  const entree = [...document.querySelectorAll<HTMLElement>('.notak-menu-ctx [role="menuitem"], .notak-menu-ctx button')].find((b) => b.textContent?.trim() === 'Commentaire')
  expect(entree).toBeDefined()
  act(() => entree!.click())
  await act(async () => {})
}

const champ = () => hote.querySelector<Champ>('.notak-commentaire[data-edition] .ProseMirror')
const taper = async (texte: string) => {
  act(() => void champ()!.editor.commands.insertContent(texte))
  await act(async () => {})
}
/** Un appui sur le fond de la toile, loin de la fiche. */
const dehors = async (toile: HTMLElement) => {
  act(() => void toile.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 900, clientY: 700 })))
  await act(async () => {})
}
const touche = async (key: string, mods: KeyboardEventInit = {}) => {
  act(() => void champ()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })))
  await act(async () => {})
}
/** Le seul fil de la toile choisi (⌘A), puis ouvert à l'écriture (Entrée), au clavier de la toile. */
const ouvrir = async (toile: HTMLElement) => {
  for (const e of [{ key: 'a', code: 'KeyA', metaKey: true, ctrlKey: true }, { key: 'Enter' }])
    act(() => void toile.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...e })))
  await act(async () => {})
}
const alerte = () => hote.querySelector<HTMLElement>('.notak-compositeur-alerte')
const publier = async () => {
  act(() => hote.querySelector<HTMLButtonElement>('.notak-commentaire-publier')!.click())
  await act(async () => {})
}

describe('la fiche Commentaire posée sur la toile', () => {
  it('posée, tapée, un clic dehors la retient et le dit ; le second abandonne, et la fiche s’en va sans trace', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    const { toile, fils } = await monter(magasin)
    await poser(toile)
    expect(fils()).toHaveLength(1)
    expect(champ()).not.toBeNull()
    await taper('Pas encore publié')
    await dehors(toile)
    expect(champ()).not.toBeNull()
    expect(alerte()?.textContent).toContain('Commentaire non publié')
    expect(fils()[0]!.contenu.messages).toEqual([])
    await dehors(toile)
    expect(champ()).toBeNull()
    // Ni sur la toile, ni à la corbeille, ni dans l'historique.
    expect(magasin.lire().elements).toEqual([])
    expect(magasin.peutAnnuler()).toBe(false)
    expect(brouillonEnCours()).toBe(false)
  })

  it('posée puis quittée sans rien écrire, au clic dehors ou à Échap, elle ne laisse rien', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    const { toile } = await monter(magasin)
    await poser(toile)
    await dehors(toile)
    await act(async () => {})
    expect(magasin.lire().elements).toEqual([])
    expect(magasin.peutAnnuler()).toBe(false)
    await poser(toile)
    await touche('Escape')
    await act(async () => {})
    expect(magasin.lire().elements).toEqual([])
    expect(magasin.peutAnnuler()).toBe(false)
  })

  it('Échap avec un brouillon : le premier le signale, le second l’abandonne et la fiche s’en va', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    const { toile } = await monter(magasin)
    await poser(toile)
    await taper('Brouillon')
    await touche('Escape')
    expect(alerte()).not.toBeNull()
    expect(magasin.lire().elements).toHaveLength(1)
    await touche('Escape')
    await act(async () => {})
    expect(magasin.lire().elements).toEqual([])
  })

  it('« Publier » poste le premier message : la fiche devient un fil publié, qui reste en sortant', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    const { toile, fils } = await monter(magasin)
    await poser(toile)
    await taper('Bonjour')
    expect(fils()[0]!.contenu.messages).toEqual([])
    await publier()
    expect(fils()[0]!.contenu.messages.map((m) => [m.auteur.id, m.texte])).toEqual([['ana', 'Bonjour']])
    expect(hote.querySelector('.notak-commentaire-texte')?.textContent).toBe('Bonjour')
    // Le champ attend une réponse, et rien ne retient la sortie.
    expect(champ()!.textContent).toBe('')
    await dehors(toile)
    await act(async () => {})
    expect(champ()).toBeNull()
    expect(fils()).toHaveLength(1)
    expect(hote.querySelector('.notak-commentaire .notak-commentaire-texte')?.textContent).toBe('Bonjour')
    // Annuler retire le message, puis la pose.
    act(() => void magasin.annuler())
    expect(fils()[0]!.contenu.messages).toEqual([])
    act(() => void magasin.annuler())
    expect(fils()).toEqual([])
  })

  it('⌘Entrée publie aussi, sans faire naître de fil dessous', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    const { toile, fils } = await monter(magasin)
    await poser(toile)
    await taper('Vite fait')
    await touche('Enter', /Mac/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true })
    expect(fils()).toHaveLength(1)
    expect(fils()[0]!.contenu.messages.map((m) => m.texte)).toEqual(['Vite fait'])
    expect(champ()!.textContent).toBe('')
  })

  it('une fiche écrite à l’ancienne (son texte déjà dans le fil) se lit comme un fil publié, et s’ouvre pour y répondre', async () => {
    const base = nouveauCommentaire(0, 0)
    const ancienne: Element<Commentaire> = { ...base, contenu: ajouterMessage(base.contenu as Commentaire, { id: 'm1', auteur: bob, date: Date.now(), texte: 'Écrit avant' }) }
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [ancienne] })
    const { toile, fils } = await monter(magasin)
    expect(hote.querySelector('.notak-commentaire-texte')?.textContent).toBe('Écrit avant')
    await ouvrir(toile)
    expect(champ()).not.toBeNull()
    expect(champ()!.textContent).toBe('')
    await taper('Ma réponse')
    await publier()
    await dehors(toile)
    await act(async () => {})
    expect(fils()[0]!.contenu.messages.map((m) => m.texte)).toEqual(['Écrit avant', 'Ma réponse'])
  })

  it('le texte non publié n’entre pas dans le document partagé, même après le délai d’écriture de la toile', async () => {
    const doc = new Y.Doc()
    const magasin = creerMagasinYjs(doc)
    const { toile } = await monter(magasin)
    await poser(toile)
    await taper('Secret en cours')
    await act(async () => void (await new Promise((r) => setTimeout(r, 1200))))
    const texte = new TextDecoder().decode(Y.encodeStateAsUpdate(doc))
    expect(texte).not.toContain('Secret en cours')
    expect(magasin.lire().elements).toHaveLength(1)
    await publier()
    expect(new TextDecoder().decode(Y.encodeStateAsUpdate(doc))).toContain('Secret en cours')
  })

  it('démontée par le code, la fiche garde son brouillon et le rend à la réouverture', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    const { fils } = await monter(magasin)
    await poser(hote.querySelector<HTMLElement>('.notak-toile')!)
    const id = fils()[0]!.id
    await taper('Gardé')
    // Un autre tableau s'ouvre : la toile part, sans geste de sortie.
    act(() => racine.render(<div />))
    await act(async () => {})
    expect(brouillonGarde(cleBrouillonFil(id))?.texte).toBe('Gardé')
    expect(fils()).toHaveLength(1)
    const { toile } = await monter(magasin)
    await ouvrir(toile)
    expect(champ()!.textContent).toBe('Gardé')
    await publier()
    await dehors(toile)
    expect(fils()[0]!.contenu.messages.map((m) => m.texte)).toEqual(['Gardé'])
    expect(brouillonEnCours()).toBe(false)
  })

  it('un commentateur pose sa fiche, la publie, et celle qu’il laisse vide s’en va de même', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    const { toile, fils } = await monter(magasin, { lectureSeule: true, droits: { role: 'commentaire', elements: {} } })
    await poser(toile)
    await taper('De la part d’Ana')
    await publier()
    await dehors(toile)
    expect(fils().map((f) => f.contenu.messages.map((m) => m.texte))).toEqual([['De la part d’Ana']])
    await poser(toile)
    expect(fils()).toHaveLength(2)
    await dehors(toile)
    await act(async () => {})
    expect(fils()).toHaveLength(1)
  })
})
