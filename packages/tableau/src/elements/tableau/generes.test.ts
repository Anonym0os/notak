import { describe, expect, it } from 'vitest'
import type { Paquet } from '../../coeur/pressePapiers'
import type { Element } from '../../coeur/tableau'
import { avecAvis, avisGeneres, outilDe, retenus, sansGeneres } from './generes'

const carte = (id: string, cible: string, extra: object = {}, contenu: object = {}) =>
  ({ id, x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible, ...contenu }, ...extra }) as unknown as Element
const note = (id: string, extra: object = {}) => ({ id, x: 0, y: 0, largeur: 200, contenu: { type: 'note', texte: { type: 'doc', content: [] } }, ...extra }) as unknown as Element
const colonne = (id: string) => ({ id, x: 0, y: 0, largeur: 20, contenu: { type: 'colonne', titre: 'C' } }) as unknown as Element
const GENERES = { clients: 'Silak', dupont: 'Silak' }

describe('les cartes des dossiers générés, sur la toile qui les porte', () => {
  it('se reconnaissent à leur toile ; pas un raccourci, ni une autre carte, ni sans ce que dit le serveur', () => {
    expect(outilDe(carte('c', 'clients'), GENERES)).toBe('Silak')
    expect(outilDe(carte('r', 'clients', {}, { raccourci: true }), GENERES)).toBeUndefined()
    expect(outilDe(carte('a', 'autre'), GENERES)).toBeUndefined()
    expect(outilDe(note('n'), GENERES)).toBeUndefined()
    expect(outilDe(carte('c', 'clients'), undefined)).toBeUndefined()
  })

  it('restent quand on emporte ailleurs ce qu’on a choisi avec elles, et la colonne qui en range une aussi', () => {
    const elements = [carte('c', 'clients'), note('n'), colonne('col'), carte('d', 'dupont', { parent: 'col', ordre: 'a' }), note('m', { parent: 'col', ordre: 'b' }), colonne('vide')]
    expect(retenus(elements, ['c', 'n', 'col', 'vide'], GENERES)).toEqual({ ids: new Set(['c', 'col']), dossiers: ['clients', 'dupont'] })
    // Tirée seule de sa colonne, la carte reste ; la colonne n'est pas du geste.
    expect(retenus(elements, ['d'], GENERES)).toEqual({ ids: new Set(['d']), dossiers: ['dupont'] })
    expect(retenus(elements, ['n', 'vide'], GENERES)).toEqual({ ids: new Set(), dossiers: [] })
    expect(retenus(elements, ['c'], undefined)).toEqual({ ids: new Set(), dossiers: [] })
  })

  it('ne se doublent pas : un paquet les laisse, et ne rend rien s’il n’avait qu’elles', () => {
    const p: Paquet = { elements: [carte('c', 'clients'), note('n')], cadre: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } } }
    expect(sansGeneres(p, GENERES)).toEqual({ paquet: { ...p, elements: [note('n')] }, dossiers: ['clients'] })
    expect(sansGeneres({ ...p, elements: [carte('c', 'clients')] }, GENERES)).toEqual({ paquet: null, dossiers: ['clients'] })
    expect(sansGeneres(p, undefined)).toEqual({ paquet: p, dossiers: [] })
    expect(sansGeneres(null, GENERES)).toEqual({ paquet: null, dossiers: [] })
  })

  it('l’avis est celui de la bibliothèque, à la suite du geste fait', () => {
    const titre = (id: string) => ({ clients: 'Clients' })[id]
    expect(avisGeneres(['clients'], GENERES, titre)).toBe('« Clients » est généré par Silak : il reste tel quel.')
    expect(avisGeneres(['clients', 'dupont'], GENERES, titre)).toBe('2 dossiers générés par Silak restent tels quels.')
    expect(avisGeneres([], GENERES, titre)).toBe('')
    expect(avecAvis('Mis à la corbeille', avisGeneres(['clients'], GENERES, titre))).toBe('Mis à la corbeille. « Clients » est généré par Silak : il reste tel quel.')
    expect(avecAvis('', avisGeneres(['clients'], GENERES, titre))).toBe('« Clients » est généré par Silak : il reste tel quel.')
  })
})
