import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ajouterMessage, nouveauCommentaire } from '../elements/commentaire/fil'
import { filDe, poserFil } from '../elements/arbre/modele/commentaires'
import { supprimerBranches } from '../elements/arbre/modele/sujets'
import { lireTableau } from '../export/contenu'
import { NOM_ARBRES, cleArbre } from './arbresYjs'
import { type MagasinYjs, creerMagasinYjs } from './magasinYjs'
import type { Arbre, Commentaire, Element } from './tableau'

const auteur = { id: 'ana', nom: 'Ana Dupont' }
const fil = (texte: string): Commentaire => ajouterMessage(nouveauCommentaire(0, 0).contenu as Commentaire, { id: `m-${texte}`, auteur, date: 1000, texte })

const carte = (): Element<Arbre> => ({
  id: 'k',
  x: 0,
  y: 0,
  largeur: 40,
  contenu: { type: 'arbre', sujets: { c: { ordre: 'V', titre: 'Central' }, s: { parent: 'c', ordre: 'V', titre: 'Idée' } } },
})
const arbre = (m: MagasinYjs) => m.lire().elements.find((e) => e.id === 'k')!.contenu as Arbre
function geste(m: MagasinYjs, f: (a: Arbre) => Arbre) {
  const avant = arbre(m)
  m.faire([{ type: 'contenu', id: 'k', avant, apres: f(avant) }])
}

function deuxAppareils() {
  const [da, db] = [new Y.Doc(), new Y.Doc()]
  const a = creerMagasinYjs(da)
  a.faire([{ type: 'creer', element: carte() }])
  Y.applyUpdate(db, Y.encodeStateAsUpdate(da))
  const b = creerMagasinYjs(db)
  const synchroniser = () => {
    const [ua, ub] = [Y.encodeStateAsUpdate(da, Y.encodeStateVector(db)), Y.encodeStateAsUpdate(db, Y.encodeStateVector(da))]
    Y.applyUpdate(db, ua)
    Y.applyUpdate(da, ub)
  }
  return { a, b, da, db, synchroniser }
}

describe('les fils des sujets dans le document partagé', () => {
  it('le fil d’un sujet a sa propre clé dans `arbres`, à côté du sujet', () => {
    const doc = new Y.Doc()
    const m = creerMagasinYjs(doc)
    m.faire([{ type: 'creer', element: carte() }])
    geste(m, (a) => poserFil(a, 's', fil('Bonjour')))
    const arbres = doc.getMap<unknown>(NOM_ARBRES)
    expect((arbres.get(cleArbre('k', 'fils', 's')) as Commentaire).messages[0]!.texte).toBe('Bonjour')
    expect(filDe(arbre(m), 's')?.messages).toHaveLength(1)
    // Ce que lisent l’export et la recherche le retrouve aussi.
    const lu = lireTableau(doc).elements.find((e) => e.id === 'k')!.contenu as unknown as Arbre
    expect(filDe(lu, 's')?.messages[0]?.texte).toBe('Bonjour')
  })

  it('l’un écrit dans le fil d’un sujet, l’autre renomme ce sujet : rien ne se perd', () => {
    const { a, b, synchroniser } = deuxAppareils()
    geste(a, (x) => poserFil(x, 's', fil('Un mot')))
    geste(b, (x) => ({ ...x, sujets: { ...x.sujets, s: { ...x.sujets.s!, titre: 'Renommé' } } }))
    synchroniser()
    for (const m of [a, b]) {
      expect(arbre(m).sujets.s!.titre).toBe('Renommé')
      expect(filDe(arbre(m), 's')?.messages[0]?.texte).toBe('Un mot')
    }
  })

  it('supprimer le sujet supprime son fil, et annuler rend les deux', () => {
    const doc = new Y.Doc()
    const m = creerMagasinYjs(doc)
    m.faire([{ type: 'creer', element: carte() }])
    geste(m, (a) => poserFil(a, 's', fil('À garder si on annule')))
    geste(m, (a) => supprimerBranches(a, ['s']))
    expect(arbre(m).sujets.s).toBeUndefined()
    expect(Object.keys(arbre(m).fils ?? {})).toEqual([])
    expect(doc.getMap<unknown>(NOM_ARBRES).has(cleArbre('k', 'fils', 's'))).toBe(false)
    m.annuler()
    expect(arbre(m).sujets.s?.titre).toBe('Idée')
    expect(filDe(arbre(m), 's')?.messages[0]?.texte).toBe('À garder si on annule')
    m.retablir()
    expect(arbre(m).sujets.s).toBeUndefined()
    expect(Object.keys(arbre(m).fils ?? {})).toEqual([])
  })

  it('annuler un message retire le message, rétablir le rend', () => {
    const doc = new Y.Doc()
    const m = creerMagasinYjs(doc)
    m.faire([{ type: 'creer', element: carte() }])
    geste(m, (a) => poserFil(a, 's', fil('Un')))
    geste(m, (a) => poserFil(a, 's', ajouterMessage(filDe(a, 's')!, { id: 'm2', auteur, date: 2000, texte: 'Deux' })))
    expect(filDe(arbre(m), 's')?.messages).toHaveLength(2)
    m.annuler()
    expect(filDe(arbre(m), 's')?.messages).toHaveLength(1)
    m.retablir()
    expect(filDe(arbre(m), 's')?.messages).toHaveLength(2)
  })
})
