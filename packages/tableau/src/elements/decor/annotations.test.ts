import { describe, expect, it } from 'vitest'
import { type Element, annoter, appliquer, inverse } from '../../coeur/tableau'
import { creerMagasin } from '../../coeur/magasin'
import {
  basculerEtiquette,
  basculerReaction,
  compterReactions,
  etatEcheance,
  etatEtiquette,
  etiquettesDe,
  jourDe,
  libelleEcheance,
  nouvelleEtiquette,
  passeLeFiltre,
  peutEtreIcone,
  renommerEtiquette,
} from './annotations'

const note = (id: string, plus: Partial<Element> = {}): Element => ({
  id,
  x: 0,
  y: 0,
  largeur: 34,
  contenu: { type: 'note', texte: { type: 'doc' } },
  ...plus,
})

describe('étiquettes', () => {
  it('une étiquette neuve prend la couleur la moins employée, et refuse un nom vide ou déjà pris', () => {
    const a = nouvelleEtiquette([], ' Urgent ')!
    expect(a.nom).toBe('Urgent')
    const b = nouvelleEtiquette([a], 'À voir')!
    expect(b.couleur).not.toBe(a.couleur)
    expect(nouvelleEtiquette([a], 'urgent')).toBeNull()
    expect(nouvelleEtiquette([a], '   ')).toBeNull()
    expect(nouvelleEtiquette([], 'x'.repeat(80))!.nom).toHaveLength(30)
  })
  it('renomme sans laisser un nom vide', () => {
    const a = nouvelleEtiquette([], 'Idée')!
    expect(renommerEtiquette([a], a.id, 'Piste')[0]!.nom).toBe('Piste')
    expect(renommerEtiquette([a], a.id, ' ')[0]!.nom).toBe('Idée')
  })
  it('pose et retire sur un élément, et dit où en est une sélection', () => {
    expect(basculerEtiquette(undefined, 'a')).toEqual(['a'])
    expect(basculerEtiquette(['a', 'b'], 'a')).toEqual(['b'])
    const els = [note('1', { etiquettes: ['a'] }), note('2')]
    expect(etatEtiquette(els, 'a')).toBe('certains')
    expect(etatEtiquette([els[0]!], 'a')).toBe('tous')
    expect(etatEtiquette([els[1]!], 'a')).toBe('aucun')
  })
  it('ne montre que les étiquettes qui existent encore, dans l’ordre du tableau', () => {
    const a = { id: 'a', nom: 'A', couleur: 'vert' as const }
    const b = { id: 'b', nom: 'B', couleur: 'rouge' as const }
    expect(etiquettesDe(note('1', { etiquettes: ['b', 'zzz', 'a'] }), [a, b]).map((e) => e.id)).toEqual(['a', 'b'])
  })
  it('le filtre laisse passer ce qui porte une des étiquettes voulues, et tout quand il est vide', () => {
    const e = note('1', { etiquettes: ['a'] })
    expect(passeLeFiltre(e, new Set())).toBe(true)
    expect(passeLeFiltre(e, new Set(['a', 'b']))).toBe(true)
    expect(passeLeFiltre(e, new Set(['b']))).toBe(false)
    expect(passeLeFiltre(note('2'), new Set(['b']))).toBe(false)
  })
})

describe('réactions', () => {
  it('une personne pose puis retire son émoji, et un émoji sans personne disparaît', () => {
    const r1 = basculerReaction(undefined, '👍', 'ana')
    const r2 = basculerReaction(r1, '👍', 'bob')
    expect(r2).toEqual({ '👍': ['ana', 'bob'] })
    expect(basculerReaction(r2, '👍', 'ana')).toEqual({ '👍': ['bob'] })
    expect(basculerReaction(r1, '👍', 'ana')).toEqual({})
  })
  it('compte par émoji et dit si c’est le sien', () => {
    expect(compterReactions({ '👍': ['ana', 'bob'], '🎉': ['bob'] }, 'ana')).toEqual([
      { emoji: '👍', n: 2, moi: true },
      { emoji: '🎉', n: 1, moi: false },
    ])
    expect(compterReactions(undefined, 'ana')).toEqual([])
  })
})

describe('échéance', () => {
  const maintenant = new Date(2026, 9, 23, 14, 0)
  it('dit où on en est', () => {
    expect(etatEcheance('2026-10-22', maintenant)).toBe('passee')
    expect(etatEcheance('2026-10-23', maintenant)).toBe('aujourdhui')
    expect(etatEcheance('2026-10-26', maintenant)).toBe('proche')
    expect(etatEcheance('2026-10-27', maintenant)).toBe('avenir')
  })
  it('se dit comme on la dit', () => {
    expect(libelleEcheance('2026-10-23', maintenant)).toBe('aujourd’hui')
    expect(libelleEcheance('2026-10-24', maintenant)).toBe('demain')
    expect(libelleEcheance('2026-10-22', maintenant)).toBe('hier')
    expect(libelleEcheance('2026-12-05', maintenant)).toBe('5 déc.')
    expect(libelleEcheance('2027-01-05', maintenant)).toBe('5 janv. 2027')
    expect(jourDe(maintenant)).toBe('2026-10-23')
  })
})

describe('mode d’affichage', () => {
  it('un conteneur, un tableau et une ligne ne se replient pas', () => {
    expect(peutEtreIcone({ type: 'note' } as never)).toBe(true)
    expect(peutEtreIcone({ type: 'colonne', accepte: () => true } as never)).toBe(false)
    expect(peutEtreIcone({ type: 'tableau' } as never)).toBe(false)
    expect(peutEtreIcone({ type: 'ligne', calque: 'lignes' } as never)).toBe(false)
    expect(peutEtreIcone(undefined)).toBe(false)
  })
})

describe('annoter', () => {
  it('écrit les champs, retire ceux qui sont vides, et ne fait rien quand rien ne change', () => {
    const e = note('1')
    const op = annoter(e, { echeance: '2026-10-30', etiquettes: ['a'] })!
    const t = appliquer({ titre: '', elements: [e] }, op)
    expect(t.elements[0]).toMatchObject({ echeance: '2026-10-30', etiquettes: ['a'] })
    const e2 = t.elements[0]!
    expect(annoter(e2, { echeance: '2026-10-30' })).toBeNull()
    const sans = appliquer(t, annoter(e2, { etiquettes: [], echeance: null })!)
    expect(sans.elements[0]).not.toHaveProperty('etiquettes')
    expect(sans.elements[0]).not.toHaveProperty('echeance')
  })
  it('s’annule', () => {
    const e = note('1', { affichage: 'icone' })
    const op = annoter(e, { affichage: null })!
    const t = appliquer({ titre: '', elements: [e] }, op)
    expect(t.elements[0]).not.toHaveProperty('affichage')
    expect(appliquer(t, inverse(op)).elements[0]).toMatchObject({ affichage: 'icone' })
  })
  it('passe par le magasin et son historique, comme les étiquettes du tableau', () => {
    const m = creerMagasin({ titre: '', elements: [note('1')] })
    m.faire([{ type: 'etiquettes', de: [], vers: [{ id: 'a', nom: 'A', couleur: 'vert' }] }, annoter(m.lire().elements[0]!, { etiquettes: ['a'] })!])
    expect(m.lire().etiquettes).toHaveLength(1)
    expect(m.lire().elements[0]!.etiquettes).toEqual(['a'])
    m.annuler()
    expect(m.lire().etiquettes).toBeUndefined()
    expect(m.lire().elements[0]!.etiquettes).toBeUndefined()
  })
})
