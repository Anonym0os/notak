import { describe, expect, it } from 'vitest'
import { type DroitsTableau, gesteSurElement, pasPermis, permis, peutSupprimerMessage } from './droitsElements'
import type { Element, Tableau } from './tableau'

const message = (id: string, auteur: string, texte: string, reactions?: Record<string, string[]>) => ({
  id,
  auteur: { id: auteur, nom: auteur },
  date: 1,
  texte,
  ...(reactions ? { reactions } : {}),
})
const fil = (id: string, messages: unknown[], extra: object = {}) => ({ id, x: 0, y: 0, largeur: 300, contenu: { type: 'commentaire', messages }, ...extra })
const note = (id: string, extra: object = {}) => ({ id, x: 0, y: 0, largeur: 200, contenu: { type: 'note', texte: { type: 'doc', content: [] } }, ...extra })

describe('gesteSurElement', () => {
  it('créer un fil, y répondre, le déplacer : commenter suffit', () => {
    expect(gesteSurElement(undefined, fil('f', [message('m1', 'bob', 'Salut')]), 'bob')).toBe('commentaire')
    const avant = fil('f', [message('m1', 'ana', 'Une question')])
    expect(gesteSurElement(avant, fil('f', [message('m1', 'ana', 'Une question'), message('m2', 'bob', 'Réponse')]), 'bob')).toBe('commentaire')
    expect(gesteSurElement(avant, { ...avant, x: 40 }, 'bob')).toBe('commentaire')
  })

  it('changer ou effacer le message d’un autre, ou écrire au nom d’un autre : il faut écrire', () => {
    const avant = fil('f', [message('m1', 'ana', 'Une question')])
    expect(gesteSurElement(avant, fil('f', [message('m1', 'ana', 'Autre chose')]), 'bob')).toBe('ecriture')
    expect(gesteSurElement(avant, fil('f', []), 'bob')).toBe('ecriture')
    expect(gesteSurElement(avant, undefined, 'bob')).toBe('ecriture')
    expect(gesteSurElement(undefined, fil('f', [message('m1', 'ana', 'Faux')]), 'bob')).toBe('ecriture')
  })

  it('réagir pour soi passe, retirer la réaction d’un autre non', () => {
    const avant = fil('f', [message('m1', 'ana', 'Q', { '👍': ['ana'] })])
    expect(gesteSurElement(avant, fil('f', [message('m1', 'ana', 'Q', { '👍': ['ana', 'bob'] })]), 'bob')).toBe('commentaire')
    expect(gesteSurElement(avant, fil('f', [message('m1', 'ana', 'Q', { '👍': [] })]), 'bob')).toBe('ecriture')
  })

  it('sur une carte mentale, le fil d’un sujet relève du commentaire, ses sujets de l’écriture', () => {
    const carte = (extra: object = {}) => ({ id: 'c', x: 0, y: 0, largeur: 300, contenu: { type: 'arbre', sujets: { s1: { titre: 'Central' } }, ...extra } })
    const fils = (messages: unknown[]) => ({ fils: { s1: { type: 'commentaire', messages } } })
    expect(gesteSurElement(carte(), carte(fils([message('m1', 'bob', 'Ici ?')])), 'bob')).toBe('commentaire')
    expect(gesteSurElement(carte(fils([message('m1', 'ana', 'Q')])), carte(fils([message('m1', 'ana', 'Q'), message('m2', 'bob', 'R')])), 'bob')).toBe('commentaire')
    expect(gesteSurElement(carte(fils([message('m1', 'ana', 'Q')])), carte(fils([message('m1', 'ana', 'Volé')])), 'bob')).toBe('ecriture')
    expect(gesteSurElement(carte(), { ...carte(), contenu: { type: 'arbre', sujets: { s1: { titre: 'Renommé' } } } }, 'bob')).toBe('ecriture')
  })

  it('sur un autre élément, seuls son fil et ses réactions relèvent du commentaire', () => {
    const avant = note('n')
    expect(gesteSurElement(avant, note('n', { commentaire: { type: 'commentaire', messages: [message('m1', 'bob', 'Ici ?')] } }), 'bob')).toBe('commentaire')
    expect(gesteSurElement(avant, note('n', { reactions: { '🎉': ['bob'] } }), 'bob')).toBe('commentaire')
    expect(gesteSurElement(avant, note('n', { x: 10 }), 'bob')).toBe('ecriture')
    expect(gesteSurElement(avant, undefined, 'bob')).toBe('ecriture')
    expect(gesteSurElement(undefined, note('n'), 'bob')).toBe('ecriture')
  })
})

describe('permis', () => {
  const droits = (role: DroitsTableau['role'], elements: DroitsTableau['elements'] = {}): DroitsTableau => ({ role, elements })
  it('le rôle sur le tableau vaut pour les éléments sans droits propres', () => {
    expect(permis(droits('commentaire'), 'x', 'commentaire')).toBe(true)
    expect(permis(droits('commentaire'), 'x', 'ecriture')).toBe(false)
    expect(permis(droits('lecture'), 'x', 'commentaire')).toBe(false)
    expect(permis(droits('edition'), null, 'ecriture')).toBe(true)
    expect(permis(droits('commentaire'), null, 'commentaire')).toBe(false)
  })
  it('un élément qui a ses droits les impose', () => {
    expect(permis(droits('edition', { x: { ecrire: false, commenter: true } }), 'x', 'ecriture')).toBe(false)
    expect(permis(droits('commentaire', { x: { ecrire: true, commenter: true } }), 'x', 'ecriture')).toBe(true)
  })
})

describe('peutSupprimerMessage', () => {
  const droits = (role: DroitsTableau['role'], elements: DroitsTableau['elements'] = {}): DroitsTableau => ({ role, elements })
  it('chacun supprime les siens, partout où il commente', () => {
    for (const role of ['commentaire', 'edition', 'proprietaire'] as const) expect(peutSupprimerMessage({ droits: droits(role) }, 'x', 'ana', 'ana')).toBe(true)
    expect(peutSupprimerMessage({ lectureSeule: true, droits: droits('commentaire') }, 'x', 'ana', 'ana')).toBe(true)
    expect(peutSupprimerMessage({ droits: droits('lecture') }, 'x', 'ana', 'ana')).toBe(false)
    expect(peutSupprimerMessage({ droits: droits('edition', { x: { ecrire: false, commenter: false } }) }, 'x', 'ana', 'ana')).toBe(false)
    expect(peutSupprimerMessage({ presentation: true }, 'x', 'ana', 'ana')).toBe(false)
  })
  it('celui d’un autre : le propriétaire seul, comme chez Notion ; ni l’éditeur, ni le commentateur', () => {
    expect(peutSupprimerMessage({ droits: droits('proprietaire') }, 'x', 'bob', 'ana')).toBe(true)
    expect(peutSupprimerMessage({ droits: droits('edition') }, 'x', 'bob', 'ana')).toBe(false)
    expect(peutSupprimerMessage({ lectureSeule: true, droits: droits('commentaire') }, 'x', 'bob', 'ana')).toBe(false)
  })
  it('sans droits du serveur, le tableau est à qui l’ouvre, hors lecture seule', () => {
    expect(peutSupprimerMessage({}, undefined, 'bob', 'ana')).toBe(true)
    expect(peutSupprimerMessage({ lectureSeule: true }, undefined, 'bob', 'ana')).toBe(false)
  })
})

describe('pasPermis', () => {
  const t: Tableau = { titre: 'T', elements: [note('libre'), note('fige')] as unknown as Element[] }
  const droits: DroitsTableau = { role: 'edition', elements: { fige: { ecrire: false, commenter: true } } }
  it('un geste qui touche un élément figé est refusé en entier', () => {
    expect(pasPermis(t, [{ type: 'deplacer', id: 'libre', de: [0, 0], vers: [5, 5] }], droits, 'bob')).toBe(true)
    expect(
      pasPermis(
        t,
        [
          { type: 'deplacer', id: 'libre', de: [0, 0], vers: [5, 5] },
          { type: 'deplacer', id: 'fige', de: [0, 0], vers: [5, 5] },
        ],
        droits,
        'bob',
      ),
    ).toBe(false)
  })
})
