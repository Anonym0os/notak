// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Commentaire, Element, Note } from '../../coeur/tableau'
import type { ContexteToile, PropsRendu } from '../types'
import '../note'
import '../decor'
import { chargerEmojis } from '../decor/emojis'
import { ouvrirFil } from '../decor/etat'
import { Decor } from '../decor/Decor'
import { RenduNote } from '../note/Note'
import { RenduCommentaire } from './Commentaire'
import { brouillonEnCours, brouillonGarde, oublierBrouillons } from './brouillon'
import { ajouterMessage, nouveauCommentaire } from './fil'
import { oublierLus } from './suivi'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// La garde des commentaires non publiés (`brouillon.ts`), branchée sur chaque champ : la bulle d'une épingle (élément,
// épingle libre, sujet de carte, page de PDF), la fiche d'un passage en marge (note, document), la modification d'un
// message. Un geste de sortie la signale, le second l'abandonne ; vide ou publié, rien n'est retenu.

let racine: Root
let hote: HTMLElement
beforeAll(async () => {
  await chargerEmojis()
})
beforeEach(() => {
  oublierLus()
  oublierBrouillons()
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  hote = document.createElement('div')
  hote.className = 'notak-plan'
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  ouvrirFil(null)
})

const ana = { id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }
const bob = { id: 'bob', nom: 'Bob Martin', couleur: '#2a7' }
const presence = { moi: () => ana, autres: () => [], ecouter: () => () => {}, signaler() {} }

type Champ = HTMLElement & { editor: { commands: { insertContent(t: string): boolean; selectAll(): boolean; deleteSelection(): boolean } } }
const champ = (dans = '') => document.querySelector<Champ>(`${dans} .ProseMirror`.trim())!
const taper = (texte: string, dans = '') => act(() => void champ(dans).editor.commands.insertContent(texte))
const dehors = () => act(() => void document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })))
const echap = (dans = '') => act(() => void champ(dans).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
const alerte = () => document.querySelector<HTMLElement>('.notak-compositeur-alerte')
const bulle = () => hote.querySelector('.notak-fil-attache')

/** Une carte qui porte un fil accroché, et son épingle : un clic l'ouvre en bulle. */
function carteAvecFil() {
  const base = { id: 'n1', x: 0, y: 0, largeur: 34, contenu: { type: 'note', texte: { type: 'doc', content: [] } } } as unknown as Element
  const fil: Commentaire = { type: 'commentaire', messages: [{ id: 'm1', auteur: bob, date: Date.now(), texte: 'Bonjour' }] }
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [{ ...base, commentaire: fil }] })
  const contexte = { magasin, commencerEdition() {}, finirEdition() {}, services: { presence } } as unknown as ContexteToile
  const rendre = () =>
    act(() =>
      racine.render(
        <div className="notak-carte">
          <Decor element={magasin.lire().elements[0]!} contexte={contexte} mode="toile" />
        </div>,
      ),
    )
  magasin.ecouter(rendre)
  rendre()
  const ouvrir = () => act(() => hote.querySelector<HTMLButtonElement>('.notak-epingle-bouton')!.click())
  return { magasin, ouvrir, messages: () => magasin.lire().elements[0]!.commentaire?.messages.map((m) => m.texte) }
}

describe('la bulle d’une épingle', () => {
  it('un clic dehors avec un brouillon : la bulle reste et le dit ; un second l’abandonne et ferme', () => {
    const { ouvrir } = carteAvecFil()
    ouvrir()
    taper('Pas encore envoyé')
    dehors()
    expect(bulle()).not.toBeNull()
    expect(alerte()?.textContent).toContain('Commentaire non publié')
    expect(hote.querySelector('.notak-compositeur-bloc')?.getAttribute('data-secousse')).toBe('a')
    dehors()
    expect(bulle()).toBeNull()
    expect(brouillonEnCours()).toBe(false)
    // Rouverte, la bulle n'a plus rien.
    ouvrir()
    expect(champ().textContent).toBe('')
  })

  it('un champ vide, ou d’espaces seulement, ne retient rien', () => {
    const { ouvrir } = carteAvecFil()
    ouvrir()
    dehors()
    expect(bulle()).toBeNull()
    ouvrir()
    taper('   ')
    dehors()
    expect(bulle()).toBeNull()
  })

  it('publié, plus rien ne retient : le clic dehors ferme', () => {
    const { ouvrir, messages } = carteAvecFil()
    ouvrir()
    taper('Envoyé')
    act(() => hote.querySelector<HTMLButtonElement>('.notak-commentaire-publier')!.click())
    expect(messages()).toEqual(['Bonjour', 'Envoyé'])
    dehors()
    expect(bulle()).toBeNull()
  })

  it('« Publier » de l’avertissement envoie ; « Abandonner » vide le champ', () => {
    const { ouvrir, messages } = carteAvecFil()
    ouvrir()
    taper('Un')
    dehors()
    act(() => [...alerte()!.querySelectorAll('button')].find((b) => b.textContent === 'Publier')!.click())
    expect(messages()).toEqual(['Bonjour', 'Un'])
    expect(alerte()).toBeNull()
    taper('Deux')
    dehors()
    act(() => [...alerte()!.querySelectorAll('button')].find((b) => b.textContent === 'Abandonner')!.click())
    expect(champ().textContent).toBe('')
    expect(alerte()).toBeNull()
    expect(messages()).toEqual(['Bonjour', 'Un'])
    dehors()
    expect(bulle()).toBeNull()
  })

  it('Échap : le premier signale, le second abandonne et ferme', () => {
    const { ouvrir } = carteAvecFil()
    ouvrir()
    taper('Brouillon')
    echap()
    expect(bulle()).not.toBeNull()
    expect(alerte()).not.toBeNull()
    echap()
    expect(bulle()).toBeNull()
  })

  it('une frappe après l’avertissement le retire : il faudra le redire avant d’abandonner', () => {
    const { ouvrir } = carteAvecFil()
    ouvrir()
    taper('Un')
    dehors()
    expect(alerte()).not.toBeNull()
    taper(' de plus')
    expect(alerte()).toBeNull()
    dehors()
    expect(bulle()).not.toBeNull()
    expect(alerte()).not.toBeNull()
  })

  it('le geste retenu ne va pas plus loin : ni le clic qui le suit, ni l’appui qu’attendait la toile', () => {
    const { ouvrir } = carteAvecFil()
    let appuis = 0
    let clics = 0
    const toile = document.createElement('button')
    toile.addEventListener('pointerdown', () => appuis++)
    toile.addEventListener('click', () => clics++)
    document.body.append(toile)
    ouvrir()
    taper('Brouillon')
    act(() => void toile.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })))
    act(() => toile.click())
    expect([appuis, clics]).toEqual([0, 0])
    act(() => void toile.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })))
    act(() => toile.click())
    expect([appuis, clics]).toEqual([1, 1])
    toile.remove()
  })

  it('la bulle fermée par son code (une autre épingle ouverte) garde le brouillon, rendu à la réouverture', () => {
    const { ouvrir } = carteAvecFil()
    ouvrir()
    taper('Je reviens')
    act(() => ouvrirFil(null))
    expect(bulle()).toBeNull()
    expect(brouillonGarde('bulle:fil:n1')?.texte).toBe('Je reviens')
    ouvrir()
    expect(champ().textContent).toBe('Je reviens')
    // Rendu, il retient encore.
    dehors()
    expect(bulle()).not.toBeNull()
  })
})

describe('l’épingle libre d’un fil réduit', () => {
  it('retient son brouillon comme toute bulle', () => {
    const base = nouveauCommentaire(0, 0)
    const contenu = { ...ajouterMessage(base.contenu as Commentaire, { id: 'm1', auteur: bob, date: Date.now(), texte: 'Bonjour' }), replie: true }
    const element: Element<Commentaire> = { ...base, contenu }
    const contexte = { magasin: creerMagasin({ titre: '', etiquettes: [], elements: [element] }), commencerEdition() {}, finirEdition() {}, services: { presence } } as unknown as ContexteToile
    act(() => racine.render(<RenduCommentaire element={element} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />))
    act(() => hote.querySelector<HTMLButtonElement>('.notak-epingle-libre')!.click())
    taper('Réponse')
    dehors()
    expect(bulle()).not.toBeNull()
    dehors()
    expect(bulle()).toBeNull()
  })
})

describe('modifier un message', () => {
  function fil() {
    const base = nouveauCommentaire(0, 0)
    const element: Element<Commentaire> = { ...base, contenu: ajouterMessage(base.contenu as Commentaire, { id: 'm1', auteur: ana, date: Date.now(), texte: 'Pastèque' }) }
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [element] })
    const contexte = { magasin, jeter() {}, commencerEdition() {}, finirEdition() {}, services: { presence } } as unknown as ContexteToile
    const courant = () => magasin.lire().elements[0] as Element<Commentaire>
    const rendre = () =>
      act(() =>
        racine.render(<RenduCommentaire element={courant()} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={(c) => magasin.faire([{ type: 'contenu', id: element.id, avant: courant().contenu, apres: c }])} />),
      )
    magasin.ecouter(rendre)
    rendre()
    return { courant }
  }
  const modifier = () => act(() => hote.querySelector<HTMLButtonElement>('.notak-commentaire-modifier')!.click())

  it('une modification en cours retient le clic dehors, puis l’abandonne : le message reste tel quel', () => {
    const { courant } = fil()
    modifier()
    taper(' mûre')
    dehors()
    expect(hote.querySelector('.notak-commentaire-message[data-edition]')).not.toBeNull()
    expect(alerte()?.textContent).toContain('Modification non enregistrée')
    dehors()
    expect(hote.querySelector('.notak-commentaire-message[data-edition]')).toBeNull()
    expect(courant().contenu.messages[0]!.texte).toBe('Pastèque')
  })

  it('ouverte sans rien changer, elle ne retient rien', () => {
    fil()
    modifier()
    dehors()
    expect(alerte()).toBeNull()
  })

  it('« Enregistrer » de l’avertissement enregistre', () => {
    const { courant } = fil()
    modifier()
    taper(' mûre')
    dehors()
    act(() => [...alerte()!.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer')!.click())
    expect(courant().contenu.messages[0]!.texte).toBe('Pastèque mûre')
    expect(hote.querySelector('.notak-commentaire-message[data-edition]')).toBeNull()
    expect(brouillonEnCours()).toBe(false)
  })
})

describe('la fiche d’un passage commenté', () => {
  function note() {
    let contenu = {
      type: 'note',
      texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'un passage', marks: [{ type: 'commentaireTexte', attrs: { fil: 'f1' } }] }] }] },
      fils: { f1: { type: 'commentaire', messages: [{ id: 'm1', auteur: bob, date: 0, texte: 'Pastèque' }] } },
    } as unknown as Note
    const rendre = () => {
      const element = { id: 'n', x: 0, y: 0, largeur: 34, contenu } as Element<Note>
      const contexte = { services: { presence }, magasin: {}, prendrePointEdition: () => null, finirEdition: () => {}, commencerEdition: () => {}, creerSuivant: () => {}, jeter: () => {} }
      const props = { element, choisie: false, enEdition: false, contexte, brouillon: () => {}, changer: (c: Note) => ((contenu = c), rendre()) } as unknown as PropsRendu<Note>
      act(() => racine.render(<RenduNote {...props} />))
    }
    rendre()
    act(() => hote.querySelector<HTMLElement>('[data-fil="f1"]')!.click())
    return { messages: () => contenu.fils?.f1?.messages.map((m) => m.texte) }
  }
  const fiche = () => hote.querySelector('.notak-fil-marge')

  it('un clic dehors avec une réponse en cours : la fiche reste ; un second la ferme sans rien envoyer', () => {
    const f = note()
    taper('Pas mûre', '.notak-fil-marge')
    dehors()
    expect(fiche()).not.toBeNull()
    expect(alerte()?.textContent).toContain('Commentaire non publié')
    dehors()
    expect(fiche()).toBeNull()
    expect(f.messages()).toEqual(['Pastèque'])
  })

  it('Échap fait de même, et vide, la fiche se ferme tout de suite', () => {
    note()
    taper('Pas mûre', '.notak-fil-marge')
    echap('.notak-fil-marge')
    expect(fiche()).not.toBeNull()
    echap('.notak-fil-marge')
    expect(fiche()).toBeNull()
    act(() => hote.querySelector<HTMLElement>('[data-fil="f1"]')!.click())
    dehors()
    expect(fiche()).toBeNull()
  })
})
