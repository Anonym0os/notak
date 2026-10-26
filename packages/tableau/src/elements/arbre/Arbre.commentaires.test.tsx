// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Arbre, Commentaire, Element as ElementToile, Id } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import '../note'
import '../decor'
import { chargerEmojis } from '../decor/emojis'
import { ajouterMessage, nouveauCommentaire } from '../commentaire/fil'
import { oublierLus } from '../commentaire/suivi'
import { RenduArbre } from './Arbre'
import { EpinglesCarte } from './Epingles'
import type { Disposition } from './disposition'
import { poserFil } from './modele/commentaires'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const racines: Root[] = []
beforeAll(async () => {
  await chargerEmojis()
})
beforeEach(() => oublierLus())
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

const ana = { id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }
const bob = { id: 'bob', nom: 'Bob Martin', couleur: '#2a7' }
const fil = (...messages: { auteur: typeof ana; texte: string; date?: number }[]): Commentaire =>
  messages.reduce((c, m, i) => ajouterMessage(c, { id: `m${i}`, auteur: m.auteur, date: m.date ?? Date.now() - 3_600_000, texte: m.texte }), nouveauCommentaire(0, 0).contenu as Commentaire)

function carte() {
  let a: Arbre = nouvelArbre('Central')
  let idees: Id, recette: Id
  ;[a, idees] = ajouterEnfant(a, lire(a).central, 'Idées')
  ;[a, recette] = ajouterEnfant(a, lire(a).central, 'Recette')
  return { a, idees, recette }
}

function contexteDe(lire: () => ElementToile<Arbre>, ecouteurs: Set<() => void>, services: object = {}) {
  return {
    magasin: { lire: () => ({ elements: [lire()] }), ecouter: (f: () => void) => (ecouteurs.add(f), () => ecouteurs.delete(f)), annuler() {}, retablir() {} },
    services: { presence: { moi: () => ana, autres: () => [], ecouter: () => () => {}, signaler() {} }, ...services },
    finirEdition() {},
    jeter() {},
  } as unknown as ContexteToile
}

/** La carte ouverte en grand, avec un faux magasin. */
function ouvrir(contenu: Arbre, services: object = {}) {
  let element: ElementToile<Arbre> = { id: 'k', x: 0, y: 0, largeur: 40, contenu }
  const ecouteurs = new Set<() => void>()
  const contexte = contexteDe(() => element, ecouteurs, services)
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const racine = createRoot(hote)
  racines.push(racine)
  const changer = (a: Arbre) => {
    element = { ...element, contenu: a }
    ecouteurs.forEach((f) => f())
  }
  act(() => racine.render(<RenduArbre element={element} choisie brouillon={() => {}} enEdition contexte={contexte} changer={changer} />))
  return { courant: () => element.contenu }
}

const clic = (e: Element) => act(() => void e.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const menuContextuel = (e: Element) => act(() => void e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 120 })))
const sujetDe = (titre: string) => [...document.querySelectorAll('.notak-arbre-surface [data-sujet]')].find((s) => s.textContent === titre)!
const epingles = () => [...document.querySelectorAll<HTMLElement>('[data-epingle-sujet]')]
type Champ = HTMLElement & { editor: { commands: { insertContent(t: string): boolean } } }

describe('commenter un sujet de la carte', () => {
  it('« Commenter » dans le menu du sujet ouvre le fil ; le premier message crée le fil et l’épingle', () => {
    const { a, idees } = carte()
    const c = ouvrir(a)
    menuContextuel(sujetDe('Idées'))
    const entree = [...document.querySelectorAll('.notak-arbre-ctx > .notak-e')].find((b) => b.textContent!.startsWith('Commenter'))!
    expect(entree).toBeTruthy()
    clic(entree)
    // Le fil est ouvert, sans message : rien n’est encore écrit dans la carte.
    expect(document.querySelector('[data-epingle-sujet] .notak-fil-attache')).not.toBeNull()
    expect(c.courant().fils).toBeUndefined()
    const champ = document.querySelector<Champ>('.notak-fil-attache .ProseMirror')!
    act(() => void champ.editor.commands.insertContent('Quelle idée !'))
    act(() => document.querySelector<HTMLButtonElement>('.notak-fil-attache .notak-commentaire-publier')!.click())
    expect(c.courant().fils?.[idees]?.messages.map((m) => [m.texte, m.auteur.id])).toEqual([['Quelle idée !', 'ana']])
    expect(epingles()).toHaveLength(1)
    expect(epingles()[0]!.getAttribute('data-epingle-sujet')).toBe(idees)
    expect(epingles()[0]!.querySelector('.notak-epingle-compte')?.textContent).toBe('1')
  })

  it('un fil resté sans message quand on le ferme ne laisse ni fil ni épingle', () => {
    const { a } = carte()
    const c = ouvrir(a)
    menuContextuel(sujetDe('Recette'))
    clic([...document.querySelectorAll('.notak-arbre-ctx > .notak-e')].find((b) => b.textContent!.startsWith('Commenter'))!)
    expect(epingles()).toHaveLength(1)
    act(() => void document.querySelector('.notak-fil-attache')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(epingles()).toHaveLength(0)
    expect(c.courant().fils).toBeUndefined()
  })

  it('Alt+Cmd+M commente le sujet choisi', () => {
    const { a, recette } = carte()
    ouvrir(a)
    const cible = sujetDe('Recette')
    const [, x, y] = cible.getAttribute('transform')!.match(/translate\((-?[\d.]+) (-?[\d.]+)\)/)!
    act(() => void cible.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: Number(x) + 5, clientY: Number(y) + 5, pointerId: 1, button: 0, buttons: 1 })))
    act(() => void document.querySelector('.notak-arbre-surface')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: Number(x) + 5, clientY: Number(y) + 5, pointerId: 1, button: 0, buttons: 0 })))
    act(() => void document.querySelector('.notak-arbre-fond')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'µ', code: 'KeyM', altKey: true, metaKey: true, bubbles: true, cancelable: true })))
    expect(epingles().map((e) => e.getAttribute('data-epingle-sujet'))).toEqual([recette])
    expect(document.querySelector('.notak-fil-attache .ProseMirror')).not.toBeNull()
  })

  it('les sujets commentés portent leur épingle avec le compte ; un clic ouvre le fil, un autre le ferme', () => {
    const { a, idees, recette } = carte()
    const avec = poserFil(poserFil(a, idees, fil({ auteur: bob, texte: 'Bonjour' }, { auteur: ana, texte: 'Salut' })), recette, fil({ auteur: bob, texte: 'Une recette' }))
    ouvrir(avec)
    expect(epingles().map((e) => e.querySelector('.notak-epingle-compte')?.textContent)).toEqual(['2', '1'])
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
    const bouton = epingles()[0]!.querySelector<HTMLButtonElement>('.notak-epingle-bouton')!
    clic(bouton)
    expect(document.querySelector('.notak-fil-attache')?.textContent).toContain('Bonjour')
    expect(document.querySelector('.notak-fil-attache')?.textContent).toContain('Salut')
    clic(bouton)
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
  })

  it('un fil résolu a son épingle atténuée', () => {
    const { a, idees, recette } = carte()
    const avec = poserFil(poserFil(a, idees, { ...fil({ auteur: bob, texte: 'Fait' }), resolu: true }), recette, fil({ auteur: bob, texte: 'Ouvert' }))
    ouvrir(avec)
    expect(epingles().map((e) => e.querySelector('.notak-epingle-bouton')!.hasAttribute('data-resolu'))).toEqual([true, false])
  })

  it('un message récent d’un autre met un point orange sur l’épingle, qui s’éteint à l’ouverture', () => {
    const { a, idees } = carte()
    ouvrir(poserFil(a, idees, fil({ auteur: bob, texte: 'Regarde ça', date: Date.now() - 60_000 })))
    expect(epingles()[0]!.querySelector('.notak-epingle-nonlu')).not.toBeNull()
    clic(epingles()[0]!.querySelector('.notak-epingle-bouton')!)
    clic(epingles()[0]!.querySelector('.notak-epingle-bouton')!)
    expect(epingles()[0]!.querySelector('.notak-epingle-nonlu')).toBeNull()
  })

  it('supprimer le sujet supprime son épingle et son fil', () => {
    const { a, idees, recette } = carte()
    const c = ouvrir(poserFil(poserFil(a, idees, fil({ auteur: bob, texte: 'Un' })), recette, fil({ auteur: bob, texte: 'Deux' })))
    menuContextuel(sujetDe('Idées'))
    clic([...document.querySelectorAll('.notak-arbre-ctx > .notak-e')].find((b) => b.textContent!.startsWith('Supprimer'))!)
    expect(Object.keys(c.courant().sujets)).not.toContain(idees)
    expect(Object.keys(c.courant().fils ?? {})).toEqual([recette])
    expect(epingles()).toHaveLength(1)
  })

  it('en lecture seule le fil se lit, sans champ ni menu pour l’écrire', () => {
    const { a, idees } = carte()
    const c = ouvrir(poserFil(a, idees, fil({ auteur: bob, texte: 'À lire' })), { lectureSeule: true })
    clic(epingles()[0]!.querySelector('.notak-epingle-bouton')!)
    expect(document.querySelector('.notak-fil-attache')?.textContent).toContain('À lire')
    expect(document.querySelector('.notak-fil-attache .ProseMirror')).toBeNull()
    expect(document.querySelector('.notak-fil-attache .notak-commentaire-publier')).toBeNull()
    menuContextuel(sujetDe('Idées'))
    expect(document.querySelector('.notak-arbre-ctx')).toBeNull()
    act(() => void document.querySelector('.notak-arbre-fond')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'µ', code: 'KeyM', altKey: true, metaKey: true, bubbles: true, cancelable: true })))
    expect(c.courant().fils?.[idees]?.messages).toHaveLength(1)
  })

  it('un commentateur lit la carte et commente ses sujets : le menu n’a que « Commenter », le fil s’écrit', () => {
    const { a, idees } = carte()
    const c = ouvrir(a, { lectureSeule: true, droits: { role: 'commentaire', elements: {} } })
    menuContextuel(sujetDe('Idées'))
    expect([...document.querySelectorAll('.notak-arbre-ctx > .notak-e')].map((b) => b.textContent!.replace(/[⌥⌘M]|Alt\+|Ctrl\+/g, '').trim())).toEqual(['Commenter'])
    clic(document.querySelector('.notak-arbre-ctx > .notak-e')!)
    const champ = document.querySelector<Champ>('.notak-fil-attache .ProseMirror')!
    act(() => void champ.editor.commands.insertContent('Une remarque'))
    act(() => document.querySelector<HTMLButtonElement>('.notak-fil-attache .notak-commentaire-publier')!.click())
    expect(c.courant().fils?.[idees]?.messages.map((m) => m.texte)).toEqual(['Une remarque'])
    // Le reste de la carte ne s’écrit pas : pas de menu sur le fond.
    menuContextuel(document.querySelector('.notak-arbre-fond')!)
    expect(document.querySelectorAll('.notak-arbre-ctx > .notak-e').length).toBe(0)
  })
})

describe('l’épingle suit la carte', () => {
  const boites = new Map([['s', { x: 100, y: 50, l: 80, h: 30 }]])
  const disposition = { boites } as unknown as Disposition
  function poser(camera: { x: number; y: number; z: number }) {
    const base: Arbre = { type: 'arbre', sujets: { s: { ordre: 'V', titre: 'Sujet' } } }
    const arbre = poserFil(base, 's', fil({ auteur: bob, texte: 'Un' }))
    const hote = document.createElement('div')
    document.body.appendChild(hote)
    const racine = createRoot(hote)
    racines.push(racine)
    const contexte = contexteDe(() => ({ id: 'k', x: 0, y: 0, largeur: 1, contenu: arbre }), new Set())
    act(() => racine.render(<EpinglesCarte carte="k" arbre={arbre} lecture={lire(arbre)} disposition={disposition} camera={camera} ouvert={null} ouvrir={() => {}} contexte={contexte} ecrire poser={() => {}} />))
    const e = epingles()[0]!
    return { gauche: parseFloat(e.style.left), haut: parseFloat(e.style.top), echelle: e.querySelector('.notak-epingle-bouton') }
  }

  it('la pointe est au coin haut droit du sujet, là où la caméra le met : elle suit le déplacement et le zoom', () => {
    const un = poser({ x: 0, y: 0, z: 1 })
    expect([un.gauche, un.haut]).toEqual([176, 54])
    act(() => racines.pop()!.unmount())
    document.body.innerHTML = ''
    const deux = poser({ x: 10, y: 20, z: 2 })
    // (x + l) × zoom + déplacement, au même retrait près : l’épingle, elle, garde sa taille.
    expect([deux.gauche, deux.haut]).toEqual([10 + 180 * 2 - 4, 20 + 50 * 2 + 4])
    expect(deux.echelle?.getAttribute('style') ?? '').not.toContain('scale')
  })
})
