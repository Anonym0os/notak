import { describe, expect, test } from 'vitest'
import { type Element, type Tableau, nouvelleNote } from '../../coeur/tableau'
import { attacherFil, pointDePose } from './attacher'
import { ajouterMessage, nouveauCommentaire } from './fil'

const auteur = { id: 'a', nom: 'Ana' }
const fil = (texte: string | null = 'Salut'): Element => {
  const e = nouveauCommentaire(40, 0)
  return texte === null ? e : { ...e, contenu: ajouterMessage(e.contenu as never, { id: 'm', auteur, date: 1, texte }) as never }
}
const tableau = (...elements: Element[]): Tableau => ({ titre: '', elements }) as Tableau

describe('lâcher un fil sur un élément', () => {
  test('le fil devient l’épingle de l’élément, au point du dépôt, et quitte la toile', () => {
    const note = nouvelleNote(0, 0, 'Idée')
    const f = fil()
    const pas = attacherFil(tableau(note, f), f.id, note.id, 120, 30)!
    expect(pas[0]).toMatchObject({ type: 'supprimer' })
    expect(pas[1]).toMatchObject({ type: 'annoter', id: note.id })
    const vers = (pas[1] as { vers: { commentaire?: { epingle?: unknown; messages: unknown[] } } }).vers
    expect(vers.commentaire?.epingle).toEqual({ x: 120, y: 30 })
    expect(vers.commentaire?.messages).toHaveLength(1)
  })
  test('rien ne s’attache à un fil, à une colonne, ni à un élément qui a déjà le sien', () => {
    const note = nouvelleNote(0, 0)
    const f = fil()
    const autre = fil()
    expect(attacherFil(tableau(autre, f), f.id, autre.id, 0, 0)).toBeNull()
    const pris = { ...note, commentaire: (f.contenu as never) } as Element
    expect(attacherFil(tableau(pris, f), f.id, pris.id, 0, 0)).toBeNull()
  })
  test('un fil sans message ne s’attache pas', () => {
    const note = nouvelleNote(0, 0)
    const vide = fil(null)
    expect(attacherFil(tableau(note, vide), vide.id, note.id, 0, 0)).toBeNull()
  })
  test('le point est aimanté à la grille et borné à la carte', () => {
    expect(pointDePose(123, 47, 340, 100)).toEqual({ x: 120, y: 50 })
    expect(pointDePose(-20, 400, 340, 100)).toEqual({ x: 0, y: 100 })
  })
})
