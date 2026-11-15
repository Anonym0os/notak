// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Commentaire, Element, Note } from '../../coeur/tableau'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import '../note'
import '../decor'
import { chargerEmojis } from '../decor/emojis'
import { ouvrirFil } from '../decor/etat'
import { Decor } from '../decor/Decor'
import { RenduNote } from '../note/Note'
import { OutilsCommentaire, RenduCommentaire } from './Commentaire'
import { GlypheEpingle } from './Epingle'
import { GroupeResolus, afficherResolus, oublierAffichageResolus, partagerResolus } from './Resolu'
import { ajouterMessage, nouveauCommentaire } from './fil'
import { oublierLus } from './suivi'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Un fil résolu se distingue partout d'un fil ouvert (`Resolu.tsx`) : sa fiche dit « Résolu · Rouvrir » et estompe ses
// messages, son épingle passe au vert avec une coche, sa fiche en marge se réduit à une ligne ; dans une liste, il se
// range sous « Résolus », replié tant qu'on ne demande pas à le voir.

let racine: Root
let hote: HTMLElement
beforeAll(async () => {
  await chargerEmojis()
})
beforeEach(() => {
  oublierLus()
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

function carte(resolu = false) {
  const base = nouveauCommentaire(0, 0)
  const contenu = ajouterMessage(base.contenu as Commentaire, { id: 'm1', auteur: bob, date: Date.now(), texte: 'Bonjour' })
  const element: Element<Commentaire> = { ...base, contenu: resolu ? { ...contenu, resolu: true } : contenu }
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [element] })
  const contexte = { magasin, jeter() {}, commencerEdition() {}, finirEdition() {}, services: { presence } } as unknown as ContexteToile
  const courant = () => magasin.lire().elements[0] as Element<Commentaire>
  const rendre = () =>
    act(() =>
      racine.render(<RenduCommentaire element={courant()} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={(c) => magasin.faire([{ type: 'contenu', id: element.id, avant: courant().contenu, apres: c }])} />),
    )
  magasin.ecouter(rendre)
  rendre()
  return { courant, contexte }
}

describe('un fil résolu sur la toile', () => {
  it('« Résoudre » au premier message : la fiche dit « Résolu », estompe ses messages, et « Rouvrir » la rend', () => {
    const { courant } = carte()
    expect(hote.querySelector('.notak-resolu')).toBeNull()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-commentaire-resoudre')!.click())
    expect(courant().contenu.resolu).toBe(true)
    expect(hote.querySelector('.notak-commentaire')?.hasAttribute('data-resolu')).toBe(true)
    expect(hote.querySelector('.notak-commentaire-defile')?.hasAttribute('data-resolu')).toBe(true)
    expect(hote.querySelector('.notak-resolu')?.textContent).toContain('Résolu')
    // Résolu, il n'a plus « Résoudre » : « Rouvrir » le remplace.
    expect(hote.querySelector('.notak-commentaire-resoudre')).toBeNull()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-resolu-rouvrir')!.click())
    expect(courant().contenu.resolu).toBeUndefined()
    expect(hote.querySelector('.notak-resolu')).toBeNull()
  })

  it('les outils du fil choisi : « Résoudre », puis « Rouvrir »', () => {
    const { courant, contexte } = carte()
    const outils = () => act(() => racine.render(<OutilsCommentaire {...({ elements: [courant()], contexte } as unknown as PropsOutils<Commentaire>)} />))
    outils()
    const bouton = () => [...hote.querySelectorAll<HTMLButtonElement>('button')].find((b) => /Résoudre|Rouvrir/.test(b.textContent ?? ''))!
    expect(bouton().textContent).toContain('Résoudre')
    act(() => bouton().click())
    expect(courant().contenu.resolu).toBe(true)
    outils()
    expect(bouton().textContent).toContain('Rouvrir')
  })

  it('en lecture seule, un fil résolu se lit sans « Rouvrir »', () => {
    const base = nouveauCommentaire(0, 0)
    const element: Element<Commentaire> = { ...base, contenu: { ...ajouterMessage(base.contenu as Commentaire, { id: 'm1', auteur: bob, date: 0, texte: 'Vu' }), resolu: true } }
    const contexte = { magasin: creerMagasin({ titre: '', etiquettes: [], elements: [element] }), commencerEdition() {}, finirEdition() {}, services: { presence, lectureSeule: true } } as unknown as ContexteToile
    act(() => racine.render(<RenduCommentaire element={element} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />))
    expect(hote.querySelector('.notak-resolu')?.textContent).toContain('Résolu')
    expect(hote.querySelector('.notak-resolu-rouvrir')).toBeNull()
  })
})

describe('l’épingle d’un fil résolu', () => {
  it('passe au vert, une coche à la place du compte', () => {
    act(() => racine.render(<GlypheEpingle n={3} hex="#2f63f7" resolu />))
    expect(hote.querySelector('.notak-epingle-compte')?.hasAttribute('data-resolu')).toBe(true)
    expect(hote.querySelector('.notak-epingle-compte')?.textContent).toBe('')
    expect(hote.querySelector('.notak-epingle-forme path')?.getAttribute('fill')).toBe('#2f9a5a')
    act(() => racine.render(<GlypheEpingle n={3} hex="#2f63f7" />))
    expect(hote.querySelector('.notak-epingle-compte')?.textContent).toBe('3')
  })

  it('le fil accroché à un élément : l’épingle le dit, la bulle s’annonce « Résolu » et sa réponse le rouvre', () => {
    const base = { id: 'n1', x: 0, y: 0, largeur: 34, contenu: { type: 'note', texte: { type: 'doc', content: [] } } } as unknown as Element
    const fil: Commentaire = { type: 'commentaire', resolu: true, messages: [{ id: 'm1', auteur: bob, date: Date.now(), texte: 'Bonjour' }] }
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [{ ...base, commentaire: fil }] })
    const contexte = { magasin, commencerEdition() {}, finirEdition() {}, services: { presence } } as unknown as ContexteToile
    const rendre = () => act(() => racine.render(<div className="notak-carte"><Decor element={magasin.lire().elements[0]!} contexte={contexte} mode="toile" /></div>))
    magasin.ecouter(rendre)
    rendre()
    expect(hote.querySelector('.notak-epingle-bouton')?.hasAttribute('data-resolu')).toBe(true)
    act(() => hote.querySelector<HTMLButtonElement>('.notak-epingle-bouton')!.click())
    expect(hote.querySelector('.notak-fil-attache .notak-resolu')).not.toBeNull()
    const champ = hote.querySelector<HTMLElement & { editor: { commands: { insertContent(t: string): boolean } } }>('.notak-fil-attache .ProseMirror')!
    act(() => void champ.editor.commands.insertContent('Pas tout à fait'))
    act(() => hote.querySelector<HTMLButtonElement>('.notak-commentaire-publier')!.click())
    expect(magasin.lire().elements[0]!.commentaire?.resolu).toBeUndefined()
    expect(hote.querySelector('.notak-fil-attache .notak-resolu')).toBeNull()
  })
})

describe('le fil résolu d’un passage', () => {
  function note(resolu: boolean) {
    let contenu = {
      type: 'note',
      texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'un passage', marks: [{ type: 'commentaireTexte', attrs: { fil: 'f1' } }] }] }] },
      fils: { f1: { type: 'commentaire', messages: [{ id: 'm1', auteur: bob, date: 0, texte: 'Pastèque' }], ...(resolu ? { resolu: true } : {}) } },
    } as unknown as Note
    const rendre = () => {
      const element = { id: 'n', x: 0, y: 0, largeur: 34, contenu } as Element<Note>
      const contexte = { services: { presence }, magasin: {}, prendrePointEdition: () => null, finirEdition: () => {}, commencerEdition: () => {}, creerSuivant: () => {}, jeter: () => {} }
      const props = { element, choisie: false, enEdition: false, contexte, brouillon: () => {}, changer: (c: Note) => ((contenu = c), rendre()) } as unknown as PropsRendu<Note>
      act(() => racine.render(<RenduNote {...props} />))
    }
    rendre()
    return { fil: () => contenu.fils?.f1 }
  }

  it('son passage ne s’éclaire plus, et sa fiche dit « Résolu · Rouvrir »', () => {
    const f = note(true)
    expect(hote.querySelector('style')?.textContent).toContain('[data-fil="f1"]')
    act(() => hote.querySelector<HTMLElement>('[data-fil="f1"]')!.click())
    expect(hote.querySelector('.notak-fil-marge')?.hasAttribute('data-resolu')).toBe(true)
    expect(hote.querySelector('.notak-fil-marge .notak-resolu')?.textContent).toContain('Résolu')
    act(() => hote.querySelector<HTMLButtonElement>('.notak-fil-marge .notak-resolu-rouvrir')!.click())
    expect(f.fil()?.resolu).toBeUndefined()
  })

  it('un fil ouvert se résout de la coche de son premier message, et sa fiche se ferme', () => {
    const f = note(false)
    expect(hote.querySelector('style')).toBeNull()
    act(() => hote.querySelector<HTMLElement>('[data-fil="f1"]')!.click())
    act(() => hote.querySelector<HTMLButtonElement>('.notak-fil-marge button[aria-label="Résoudre le fil"]')!.click())
    expect(f.fil()?.resolu).toBe(true)
    expect(hote.querySelector('.notak-fil-marge')).toBeNull()
  })
})

describe('les fils résolus d’une liste', () => {
  beforeEach(() => {
    localStorage.clear()
    oublierAffichageResolus()
  })
  const ouvert: Commentaire = { type: 'commentaire', messages: [] }
  const regle: Commentaire = { type: 'commentaire', messages: [], resolu: true }

  it('se rangent à part, dans leur ordre', () => {
    expect(partagerResolus([['a', ouvert], ['b', regle], ['c', ouvert]] as const, (x) => x[1])).toEqual({ ouverts: [['a', ouvert], ['c', ouvert]], resolus: [['b', regle]] })
  })

  it('« Résolus (n) » se replie et se déplie, et le réglage est retenu', () => {
    act(() => racine.render(<GroupeResolus n={2}><p className="fils-resolus">…</p></GroupeResolus>))
    const entete = () => hote.querySelector<HTMLButtonElement>('.notak-resolus-entete')!
    expect(entete().textContent).toBe('Résolus (2)')
    expect(hote.querySelector('.fils-resolus')).toBeNull()
    act(() => entete().click())
    expect(entete().getAttribute('aria-expanded')).toBe('true')
    expect(hote.querySelector('.fils-resolus')).not.toBeNull()
    expect(localStorage.getItem('notak.commentaires.resolus')).toBe('afficher')
    act(() => afficherResolus(false))
    expect(hote.querySelector('.fils-resolus')).toBeNull()
  })

  it('rien quand il n’y en a pas', () => {
    act(() => racine.render(<GroupeResolus n={0}>x</GroupeResolus>))
    expect(hote.innerHTML).toBe('')
  })
})
