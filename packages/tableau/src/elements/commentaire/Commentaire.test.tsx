// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Commentaire, Element } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import '../note'
import '../decor'
import { chargerEmojis } from '../decor/emojis'
import { ouvrirFil } from '../decor/etat'
import { RenduCommentaire } from './Commentaire'
import { ajouterMessage, nouveauCommentaire } from './fil'
import { marquerLu, oublierLus } from './suivi'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeAll(async () => {
  await chargerEmojis()
})
beforeEach(() => {
  oublierLus()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  ouvrirFil(null)
})

const bob = { id: 'bob', nom: 'Bob Martin', couleur: '#2a7' }

function monde(opts: { ecrivent?: string[]; replie?: boolean; messages?: Commentaire['messages'] } = {}) {
  const base = nouveauCommentaire(0, 0)
  const messages = opts.messages ?? [{ id: 'm1', auteur: bob, date: Date.now() - 60_000, texte: 'Bonjour' }]
  const contenu = messages.reduce((c, m) => ajouterMessage(c, m), base.contenu as Commentaire)
  const element: Element<Commentaire> = { ...base, contenu: { ...contenu, ...(opts.replie ? { replie: true } : {}) } }
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [element] })
  const autres = (opts.ecrivent ?? []).map((id) => ({ client: 1, utilisateur: { id, nom: 'Bob Martin', couleur: '#2a7' }, curseur: null, selection: [], edition: element.id }))
  const contexte = {
    magasin,
    commencerEdition() {},
    finirEdition() {},
    services: { presence: { moi: () => ({ id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }), autres: () => autres, ecouter: () => () => {}, signaler() {} } },
  } as unknown as ContexteToile
  const courant = () => magasin.lire().elements[0] as Element<Commentaire>
  const rendre = (choisie = true) =>
    act(() =>
      racine.render(
        <RenduCommentaire element={courant()} choisie={choisie} enEdition={false} contexte={contexte} brouillon={() => {}} changer={(c) => magasin.faire([{ type: 'contenu', id: element.id, avant: courant().contenu, apres: c }])} />,
      ),
    )
  return { element, courant, rendre, magasin }
}

describe('un fil sur la toile', () => {
  it('montre l’avatar, le prénom, l’âge et le texte de chaque message', () => {
    const { rendre } = monde()
    rendre()
    expect(hote.querySelector('.notak-commentaire-pastille')?.textContent).toBe('BM')
    expect(hote.querySelector('.notak-commentaire-entete strong')?.textContent).toBe('Bob')
    expect(hote.querySelector('.notak-commentaire-entete time')?.textContent).toBe('il y a 1 min')
    expect(hote.querySelector('.notak-commentaire-texte')?.textContent).toBe('Bonjour')
  })

  it('un message mis en forme se lit avec sa mise en forme et ses mentions', () => {
    const riche = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gras', marks: [{ type: 'bold' }] }, { type: 'text', text: ' et ' }, { type: 'mention', attrs: { id: 'ana', label: 'Ana' } }] }] }
    const { rendre } = monde({ messages: [{ id: 'm1', auteur: bob, date: Date.now(), texte: 'Gras et @Ana', riche }] })
    rendre()
    expect(hote.querySelector('.notak-commentaire-riche strong')?.textContent).toBe('Gras')
    expect(hote.querySelector('.notak-mention')?.textContent).toBe('@Ana')
  })

  it('la réaction à un message se pose, se compte et se retire, message par message', () => {
    const { rendre, courant } = monde({ messages: [{ id: 'm1', auteur: bob, date: Date.now(), texte: 'Un' }, { id: 'm2', auteur: bob, date: Date.now(), texte: 'Deux' }] })
    rendre()
    // Pas encore de réaction : le « + » est dans l’en-tête du message d’un autre.
    act(() => hote.querySelectorAll<HTMLButtonElement>('.notak-commentaire-reagir')[1]!.click())
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.notak-fenetre-emojis button[role="menuitem"]')].find((b) => b.textContent === '🍕')!.click())
    expect(courant().contenu.messages.map((m) => m.reactions)).toEqual([undefined, { '🍕': ['ana'] }])
    rendre()
    const pastille = hote.querySelector<HTMLButtonElement>('.notak-reaction')!
    expect(pastille.getAttribute('aria-pressed')).toBe('true')
    expect(hote.querySelector('.notak-reaction-ajout')).not.toBeNull()
    act(() => pastille.click())
    expect(courant().contenu.messages[1]!.reactions).toBeUndefined()
  })

  it('un message récent d’un autre porte un point orange tant que le fil n’a pas été regardé', () => {
    const { rendre, element } = monde()
    rendre(false)
    expect(hote.querySelector('.notak-commentaire-nonlu')).not.toBeNull()
    act(() => marquerLu(element.id, Date.now()))
    rendre(false)
    expect(hote.querySelector('.notak-commentaire-nonlu')).toBeNull()
  })

  it('dit qui écrit, avec l’anneau de sa couleur sur son avatar', () => {
    const { rendre } = monde({ ecrivent: ['bob'] })
    rendre()
    expect(hote.querySelector('.notak-commentaire-frappe')?.textContent).toContain('Bob est en train d’écrire')
    expect(hote.querySelector('.notak-commentaire-frappe .notak-commentaire-pastille')?.hasAttribute('data-ecrit')).toBe(true)
  })

  it('réduit en épingle, il ne montre plus que l’épingle et son compte ; un clic ouvre la bulle', () => {
    const { rendre } = monde({ replie: true })
    rendre()
    expect(hote.querySelector('[data-epingle]')).not.toBeNull()
    expect(hote.querySelector('.notak-epingle-compte')?.textContent).toBe('1')
    expect(hote.querySelector('.notak-fil-attache')).toBeNull()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-epingle-libre')!.click())
    expect(hote.querySelector('.notak-fil-attache')?.textContent).toContain('Bonjour')
  })
})

describe('écrire dans un fil', () => {
  type Champ = HTMLElement & { editor: { commands: { insertContent(t: string): boolean } } }
  it('le champ est l’éditeur de la note : ce qu’on tape part en brouillon, « Publier » le poste', () => {
    const { element, courant, magasin } = monde({ messages: [] })
    const brouillons: Commentaire[] = []
    const contexte = {
      magasin,
      jeter() {},
      commencerEdition() {},
      finirEdition() {},
      services: { presence: { moi: () => ({ id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }), autres: () => [], ecouter: () => () => {}, signaler() {} } },
    } as unknown as ContexteToile
    act(() => racine.render(<RenduCommentaire element={courant()} choisie enEdition contexte={contexte} brouillon={(c) => brouillons.push(c)} changer={() => {}} />))
    const champ = hote.querySelector<Champ>('.ProseMirror')!
    expect(hote.querySelector<HTMLButtonElement>('.notak-commentaire-publier')!.disabled).toBe(true)
    act(() => void champ.editor.commands.insertContent('Bonjour'))
    expect(brouillons.at(-1)!.messages.map((m) => m.texte)).toEqual(['Bonjour'])
    expect(hote.querySelector<HTMLButtonElement>('.notak-commentaire-publier')!.disabled).toBe(false)
    act(() => hote.querySelector<HTMLButtonElement>('.notak-commentaire-publier')!.click())
    // Posté : le message reste, le champ est vide, et le brouillon d’après ne le duplique pas.
    expect(brouillons.at(-1)!.messages).toHaveLength(1)
    expect(hote.querySelector('.notak-commentaire-texte')?.textContent).toBe('Bonjour')
    expect(hote.querySelector<HTMLButtonElement>('.notak-commentaire-publier')!.disabled).toBe(true)
    expect(element.id).toBeTruthy()
  })
})
