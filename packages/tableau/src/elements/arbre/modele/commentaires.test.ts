import { describe, expect, it } from 'vitest'
import type { Arbre, Commentaire, Id } from '../../../coeur/tableau'
import { ajouterMessage, nouveauCommentaire } from '../../commentaire/fil'
import { estCommente, filDe, poserFil, sujetsCommentes } from './commentaires'
import { type Geste, appliquerGeste } from './gestes'
import { coller, extraire } from './insertions'
import { ajouterEnfant, dupliquer, lire, nouvelArbre, supprimerBranches, supprimerSeul } from './sujets'

const auteur = { id: 'ana', nom: 'Ana Dupont' }
const fil = (...textes: string[]): Commentaire =>
  textes.reduce((c, texte, i) => ajouterMessage(c, { id: `m${i}`, auteur, date: 1000 + i, texte }), nouveauCommentaire(0, 0).contenu as Commentaire)

function carte() {
  let a: Arbre = nouvelArbre('Central')
  const c = lire(a).central
  let x: Id, y: Id, z: Id
  ;[a, x] = ajouterEnfant(a, c, 'A')
  ;[a, y] = ajouterEnfant(a, x, 'A1')
  ;[a, z] = ajouterEnfant(a, c, 'B')
  return { a, c, x, y, z }
}
const titre = () => 'Sujet'
const faire = (a: Arbre, g: Geste) => appliquerGeste(a, g, titre)?.arbre ?? a

describe('un fil attaché à un sujet de la carte', () => {
  it('se pose sous l’identifiant du sujet, à part des sujets (ils gardent leur identité)', () => {
    const { a, x } = carte()
    const b = poserFil(a, x, fil('Bonjour'))
    expect(filDe(b, x)?.messages.map((m) => m.texte)).toEqual(['Bonjour'])
    expect(b.sujets).toBe(a.sujets)
    expect(estCommente(b, x)).toBe(true)
    expect(estCommente(b, lire(a).central)).toBe(false)
  })

  it('un fil sans message n’est pas gardé, et un sujet qui n’existe pas ne reçoit rien', () => {
    const { a, x } = carte()
    expect(poserFil(a, x, fil())).toBe(a)
    expect(poserFil(a, 'fantome', fil('Salut'))).toBe(a)
    const b = poserFil(a, x, fil('Un'))
    // Tous les messages retirés : le fil disparaît, la carte revient sans le champ.
    const vide = poserFil(b, x, { ...filDe(b, x)!, messages: [] })
    expect(vide.fils).toBeUndefined()
    expect('fils' in vide).toBe(false)
    expect(poserFil(b, x, null).fils).toBeUndefined()
  })

  it('le geste « commenter » pose, remplace (réponse, résolution) et retire le fil', () => {
    const { a, x } = carte()
    const un = faire(a, { type: 'commenter', id: x, fil: fil('Un') })
    const deux = faire(un, { type: 'commenter', id: x, fil: { ...ajouterMessage(filDe(un, x)!, { id: 'r', auteur, date: 2000, texte: 'Deux' }), resolu: true } })
    expect(filDe(deux, x)?.messages).toHaveLength(2)
    expect(filDe(deux, x)?.resolu).toBe(true)
    expect(faire(deux, { type: 'commenter', id: x, fil: null }).fils).toBeUndefined()
    // Rien à retirer : le geste ne change rien.
    expect(appliquerGeste(a, { type: 'commenter', id: x, fil: null }, titre)).toBeNull()
  })

  it('commenter ne change ni les sujets ni la lecture de la carte (pas de remesure)', () => {
    const { a, x } = carte()
    const b = faire(a, { type: 'commenter', id: x, fil: fil('Un') })
    expect(b.sujets).toBe(a.sujets)
    expect(lire(b)).toBe(lire(a))
  })

  it('supprimer un sujet supprime son fil, et ceux de sa branche ; les autres fils restent', () => {
    const { a, x, y, z } = carte()
    let b = poserFil(a, x, fil('Sur A'))
    b = poserFil(b, y, fil('Sur A1'))
    b = poserFil(b, z, fil('Sur B'))
    const apres = supprimerBranches(b, [x])
    expect(Object.keys(apres.fils ?? {})).toEqual([z])
    expect(sujetsCommentes(apres, lire(apres))).toEqual([z])
    // Par le geste du clavier aussi.
    expect(Object.keys(faire(b, { type: 'supprimer', ids: [x] }).fils ?? {})).toEqual([z])
  })

  it('« supprimer le sujet seul » emporte son fil, pas celui de ses enfants', () => {
    const { a, x, y } = carte()
    const b = poserFil(poserFil(a, x, fil('Sur A')), y, fil('Sur A1'))
    const apres = supprimerSeul(b, x)
    expect(Object.keys(apres.fils ?? {})).toEqual([y])
  })

  it('le dernier fil supprimé retire le champ de la carte', () => {
    const { a, z } = carte()
    const apres = supprimerBranches(poserFil(a, z, fil('Sur B')), [z])
    expect('fils' in apres).toBe(false)
  })

  it('une branche dupliquée ou collée ne reprend pas les commentaires de l’original', () => {
    const { a, x, y, c } = carte()
    const b = poserFil(poserFil(a, x, fil('Sur A')), y, fil('Sur A1'))
    const [copie] = dupliquer(b, x)
    expect(Object.keys(copie.sujets)).toHaveLength(Object.keys(b.sujets).length + 2)
    expect(Object.keys(copie.fils ?? {}).sort()).toEqual([x, y].sort())
    const fragment = extraire(b, [x])!
    const [collee] = coller(b, fragment, { parent: c })
    expect(Object.keys(collee.fils ?? {}).sort()).toEqual([x, y].sort())
    expect(Object.keys(collee.sujets)).toHaveLength(Object.keys(b.sujets).length + 2)
  })

  it('les sujets commentés sont ceux que la carte montre, un fil sans message ne compte pas', () => {
    const { a, x, z } = carte()
    const b: Arbre = { ...poserFil(a, x, fil('Un')), fils: { ...poserFil(a, x, fil('Un')).fils, [z]: fil(), orphelin: fil('Perdu') } }
    expect(sujetsCommentes(b, lire(b))).toEqual([x])
  })
})
