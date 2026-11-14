// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { type Commentaire, type Element, nouvelleNote } from './coeur/tableau'
import './elements'
import { ajouterMessage, nouveauCommentaire } from './elements/commentaire/fil'
import { fermerMenus } from './menuUnique'
import type { Services } from './elements/types'
import { Toile } from './Toile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  document.elementsFromPoint ??= () => []
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  HTMLElement.prototype.setPointerCapture ??= () => {}
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

/** La toile de ces éléments, montée ; on lui parle au clavier comme quand elle a le focus. */
async function monter(elements: Element[], services: Services = {}) {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements })
  act(() => racine.render(<Toile magasin={magasin} services={services} />))
  await act(async () => {})
  const toile = hote.querySelector<HTMLElement>('.notak-toile')!
  const taper = (key: string, mods: KeyboardEventInit = {}) =>
    act(() => void toile.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })))
  const place = (id: string) => {
    const e = magasin.lire().elements.find((x) => x.id === id)
    return e && [e.x, e.y]
  }
  return { magasin, toile, taper, place }
}

/** Tout choisir, au clavier. */
const toutChoisir = (taper: (key: string, mods?: KeyboardEventInit) => void) => taper('a', { code: 'KeyA', keyCode: 65, metaKey: true })

describe('les flèches et le verrou', () => {
  it('dans une sélection mêlée, les flèches déplacent les autres, de 1 puis de 5 avec Maj ; le verrouillé reste', async () => {
    const libre = nouvelleNote(0, 0, 'libre')
    const fige = { ...nouvelleNote(40, 0, 'fige'), verrou: true }
    const { taper, place } = await monter([libre, fige])
    toutChoisir(taper)
    taper('ArrowRight')
    expect(place(libre.id)).toEqual([1, 0])
    taper('ArrowDown', { shiftKey: true })
    expect(place(libre.id)).toEqual([1, 5])
    expect(place(fige.id)).toEqual([40, 0])
  })

  it('le verrouillé choisi seul ne bouge pas, et rien ne s’inscrit à annuler', async () => {
    const fige = { ...nouvelleNote(40, 0, 'fige'), verrou: true }
    const { taper, place, magasin } = await monter([fige])
    toutChoisir(taper)
    taper('ArrowLeft', { shiftKey: true })
    expect(place(fige.id)).toEqual([40, 0])
    expect(magasin.peutAnnuler()).toBe(false)
  })
})

describe('un commentateur, à la touche Supprimer', () => {
  const ana = { id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }
  const bob = { id: 'bob', nom: 'Bob Martin', couleur: '#2a7' }
  /** Une épingle de commentaire posée en (x, 0), avec ces messages. */
  const epingle = (x: number, auteurs: (typeof ana)[]) => {
    const base = nouveauCommentaire(x, 0)
    const contenu = auteurs.reduce((c, auteur, i) => ajouterMessage(c, { id: `m${x}-${i}`, auteur, date: 1, texte: `message ${i}` }), base.contenu as Commentaire)
    return { ...base, contenu: { ...contenu, replie: true } } as Element<Commentaire>
  }
  // Les autres : le même tableau tant que rien ne change, comme le veut la présence.
  const personne: never[] = []
  const commentateur: Services = {
    lectureSeule: true,
    droits: { role: 'commentaire', elements: {} },
    presence: { moi: () => ana, autres: () => personne, ecouter: () => () => {}, signaler() {} } as unknown as Services['presence'],
  }

  it('retire l’épingle dont il a écrit tous les messages, d’un seul pas que Cmd+Z rend ; le reste demeure', async () => {
    const sienne = epingle(0, [ana, ana])
    const melee = epingle(40, [ana, bob])
    const note = nouvelleNote(80, 0, 'note')
    const { taper, magasin } = await monter([sienne, melee, note], commentateur)
    const ids = () => magasin.lire().elements.map((x) => x.id)
    toutChoisir(taper)
    taper('Delete')
    expect(ids()).toEqual([melee.id, note.id])
    taper('z', { code: 'KeyZ', keyCode: 90, metaKey: true })
    const rendue = magasin.lire().elements.find((x) => x.id === sienne.id)
    expect((rendue?.contenu as Commentaire | undefined)?.messages.map((m) => m.texte)).toEqual(['message 0', 'message 1'])
    taper('z', { code: 'KeyZ', keyCode: 90, metaKey: true, shiftKey: true })
    expect(ids()).toEqual([melee.id, note.id])
  })

  it('Retour arrière aussi ; un fil verrouillé ou celui d’un autre ne part pas', async () => {
    const fige = { ...epingle(0, [ana]), verrou: true }
    const autre = epingle(40, [bob])
    const { taper, magasin } = await monter([fige, autre], commentateur)
    toutChoisir(taper)
    taper('Backspace')
    expect(magasin.lire().elements).toHaveLength(2)
    expect(magasin.peutAnnuler()).toBe(false)
  })

  it('qui ne fait que lire ne supprime rien, pas même un fil qu’il aurait écrit', async () => {
    const sienne = epingle(0, [ana])
    const { taper, magasin } = await monter([sienne], { ...commentateur, droits: { role: 'lecture', elements: {} } })
    toutChoisir(taper)
    taper('Delete')
    expect(magasin.lire().elements).toHaveLength(1)
  })
})
