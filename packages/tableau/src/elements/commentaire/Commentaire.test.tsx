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
import { Decor } from '../decor/Decor'
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

  it('l’épingle ouverte ne réveille pas l’épingle « 0 » du cadre commun : une seule bulle', () => {
    const { courant } = monde({ replie: true })
    const contexte = { magasin: creerMagasin({ titre: '', etiquettes: [], elements: [courant()] }), commencerEdition() {}, finirEdition() {}, services: { presence: { moi: () => bob, autres: () => [], ecouter: () => () => {}, signaler() {} } } } as unknown as ContexteToile
    act(() =>
      racine.render(
        <div className="notak-carte">
          <RenduCommentaire element={courant()} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />
          <Decor element={courant()} contexte={contexte} mode="toile" />
        </div>,
      ),
    )
    act(() => hote.querySelector<HTMLButtonElement>('.notak-epingle-libre')!.click())
    expect(hote.querySelectorAll('.notak-fil-attache')).toHaveLength(1)
    expect([...hote.querySelectorAll('.notak-epingle-compte')].map((n) => n.textContent)).toEqual(['1'])
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

describe('supprimer un message', () => {
  const ana = { id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }
  /** Le monde d'un fil, avec ces droits et ces services en plus ; `jetes` reçoit ce que la toile met à la corbeille. */
  function fil(messages: Commentaire['messages'], services: Record<string, unknown> = {}, replie = false) {
    const base = nouveauCommentaire(0, 0)
    const element: Element<Commentaire> = { ...base, contenu: { ...messages.reduce((c, m) => ajouterMessage(c, m), base.contenu as Commentaire), ...(replie ? { replie: true } : {}) } }
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [element] })
    const jetes: string[][] = []
    const contexte = {
      magasin,
      jeter: (ids: Iterable<string>) => jetes.push([...ids]),
      commencerEdition() {},
      finirEdition() {},
      services: { presence: { moi: () => ana, autres: () => [], ecouter: () => () => {}, signaler() {} }, ...services },
    } as unknown as ContexteToile
    const courant = () => magasin.lire().elements[0] as Element<Commentaire> | undefined
    const rendre = () =>
      act(() =>
        racine.render(
          <RenduCommentaire element={courant()!} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={(c) => magasin.faire([{ type: 'contenu', id: element.id, avant: courant()!.contenu, apres: c }])} />,
        ),
      )
    return { courant, rendre, magasin, jetes }
  }
  const menus = () => [...hote.querySelectorAll<HTMLButtonElement>('.notak-commentaire-plus')]
  const lignes = () => [...document.querySelectorAll<HTMLButtonElement>('.notak-commentaire-menu .notak-e')].map((b) => b.textContent)
  const choisir = (libelle: string) => act(() => [...document.querySelectorAll<HTMLButtonElement>('.notak-commentaire-menu .notak-e')].find((b) => b.textContent === libelle)!.click())
  const confirmation = () => document.querySelector<HTMLElement>('[role="alertdialog"]')
  const repondre = (libelle: string) => act(() => [...confirmation()!.querySelectorAll('button')].find((b) => b.textContent === libelle)!.click())
  const deux = [
    { id: 'm1', auteur: ana, date: Date.now(), texte: 'Pastèque' },
    { id: 'm2', auteur: bob, date: Date.now(), texte: 'Melon' },
  ]

  it('mon message, le premier compris, a son menu « ⋯ » : Modifier, Supprimer, qui demande confirmation', () => {
    const { rendre, courant } = fil(deux)
    rendre()
    act(() => menus()[0]!.click())
    expect(lignes()).toEqual(['Modifier', 'Supprimer'])
    choisir('Supprimer')
    expect(confirmation()?.textContent).toContain('Supprimer ce message ?')
    // Annuler ne touche à rien.
    repondre('Annuler')
    expect(courant()!.contenu.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    act(() => menus()[0]!.click())
    choisir('Supprimer')
    repondre('Supprimer')
    // Le premier parti, la réponse de Bob reste, et devient le premier.
    expect(courant()!.contenu.messages.map((m) => m.id)).toEqual(['m2'])
  })

  it('celui d’un autre ne se supprime pas, sauf pour le propriétaire du tableau', () => {
    const editeur = fil(deux, { droits: { role: 'edition', elements: {} } })
    editeur.rendre()
    // Le message de Bob n'a ni Modifier ni Supprimer : pas de menu.
    expect(menus()).toHaveLength(1)
    act(() => racine.render(<></>))
    const proprietaire = fil(deux, { droits: { role: 'proprietaire', elements: {} } })
    proprietaire.rendre()
    act(() => menus()[1]!.click())
    expect(lignes()).toEqual(['Supprimer'])
    choisir('Supprimer')
    repondre('Supprimer')
    expect(proprietaire.courant()!.contenu.messages.map((m) => m.id)).toEqual(['m1'])
  })

  it('un commentateur supprime les siens, jamais ceux des autres', () => {
    const { rendre } = fil(deux, { lectureSeule: true, droits: { role: 'commentaire', elements: {} } })
    rendre()
    expect(menus()).toHaveLength(1)
    act(() => menus()[0]!.click())
    // Le sien : Modifier et Supprimer.
    expect(lignes()).toEqual(['Modifier', 'Supprimer'])
  })

  it('le dernier message supprimé, le fil part à la corbeille d’un seul pas ; la confirmation le dit', () => {
    const { rendre, jetes, courant } = fil([deux[0]!])
    rendre()
    act(() => menus()[0]!.click())
    choisir('Supprimer')
    expect(confirmation()?.textContent).toContain('le fil disparaît avec lui')
    repondre('Supprimer')
    expect(jetes).toEqual([[courant()!.id]])
    // Il part entier : le remettre rend son message.
    expect(courant()!.contenu.messages).toHaveLength(1)
  })

  it('pour un commentateur, le fil vidé est retiré tout de suite, et Annuler le rend', () => {
    const { rendre, jetes, courant, magasin } = fil([deux[0]!], { lectureSeule: true, droits: { role: 'commentaire', elements: {} } })
    rendre()
    act(() => menus()[0]!.click())
    choisir('Supprimer')
    repondre('Supprimer')
    expect(jetes).toEqual([])
    expect(courant()).toBeUndefined()
    act(() => void magasin.annuler())
    expect(courant()!.contenu.messages.map((m) => m.texte)).toEqual(['Pastèque'])
  })

  it('réduit en épingle, son dernier message supprimé, la bulle se ferme et l’épingle s’en va', () => {
    const { rendre, jetes, courant } = fil([deux[0]!], {}, true)
    rendre()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-epingle-libre')!.click())
    act(() => menus()[0]!.click())
    choisir('Supprimer')
    repondre('Supprimer')
    expect(jetes).toEqual([[courant()!.id]])
    expect(hote.querySelector('.notak-fil-attache')).toBeNull()
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
