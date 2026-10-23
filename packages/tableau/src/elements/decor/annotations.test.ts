import { describe, expect, it } from 'vitest'
import { type Element, annoter, appliquer, inverse } from '../../coeur/tableau'
import { creerMagasin } from '../../coeur/magasin'
import {
  basculerEtiquette,
  basculerReaction,
  compterReactions,
  etatEcheance,
  etatEtiquette,
  contourEtiquette,
  couleurPourNom,
  etiquetteNommee,
  etiquettesAReprendre,
  etiquettesDe,
  quiReagit,
  reagirSurPlusieurs,
  texteEtiquette,
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
  it('une étiquette neuve prend la couleur que dit son nom, et refuse un nom vide ou déjà pris', () => {
    const a = nouvelleEtiquette([], ' Urgent ')!
    expect(a.nom).toBe('Urgent')
    expect(a.couleur).toBe('rouge')
    expect(nouvelleEtiquette([a], 'À voir')!.couleur).toBeDefined()
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
  it('ne montre que les étiquettes qui existent encore, dans l’ordre où on les a posées', () => {
    const a = { id: 'a', nom: 'A', couleur: 'vert' as const }
    const b = { id: 'b', nom: 'B', couleur: 'rouge' as const }
    expect(etiquettesDe(note('1', { etiquettes: ['b', 'zzz', 'a'] }), [a, b]).map((e) => e.id)).toEqual(['b', 'a'])
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
    expect(peutEtreIcone({ type: 'image' } as never)).toBe(false)
    expect(peutEtreIcone({ type: 'fichier' } as never)).toBe(false)
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

describe('couleur et texte des étiquettes', () => {
  it('prend la couleur que dit le nom, puis le sens du mot, puis le hasard', () => {
    expect(couleurPourNom('Urgent rouge')).toBe('rouge')
    expect(couleurPourNom('Deep blue')).toBe('bleu_nuit')
    expect(couleurPourNom('Blue sky')).toBe('bleu')
    expect(couleurPourNom('Terminé')).toBe('vert')
    expect(couleurPourNom('Bug')).toBe('rouge')
    expect(couleurPourNom('Idées', () => 0)).toBe('gris')
    expect(couleurPourNom('Idées', () => 0.999)).toBe('bleu_nuit')
  })
  it('écrit en noir sur un fond clair, en blanc sur un fond sombre', () => {
    expect(texteEtiquette('jaune')).toBe('#1f2430')
    expect(texteEtiquette('bleu_nuit')).toBe('#ffffff')
  })
  it('met un contour quand la pastille se confond avec la carte', () => {
    expect(contourEtiquette('gris', '#bbbec3')).toBe('clair')
    expect(contourEtiquette('jaune', '#ffffff')).toBeUndefined()
    expect(contourEtiquette('bleu_nuit', '#5882f8')).toBe('sombre')
  })
  it('retrouve une étiquette par son nom, sans égard à la casse', () => {
    const a = { id: 'a', nom: 'Idée', couleur: 'vert' as const }
    expect(etiquetteNommee([a], ' idée ')).toBe(a)
    expect(etiquetteNommee([a], 'autre')).toBeUndefined()
  })
})

describe('qui a réagi', () => {
  it('met soi en premier, puis les prénoms, jusqu’à six', () => {
    expect(quiReagit(['Anna Roux', 'Marc'], true).qui).toBe('Vous, Anna et Marc')
    expect(quiReagit(['Anna Roux'], false).qui).toBe('Anna')
    expect(quiReagit(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], true).qui).toBe('Vous, A, B, C, D, E et 3 autres')
    expect(quiReagit([''], false).qui).toBe('Quelqu’un')
  })
})

describe('réagir sur plusieurs éléments', () => {
  it('ne fait que retirer quand l’un des éléments l’a déjà, sinon pose partout', () => {
    const a = note('a', { reactions: { '🔥': ['ana'] } })
    const b = note('b')
    expect(reagirSurPlusieurs([a, b], '🔥', 'ana')).toHaveLength(1)
    expect(reagirSurPlusieurs([b, note('c')], '🔥', 'ana')).toHaveLength(2)
  })
})

describe('les étiquettes des autres tableaux', () => {
  const e = (id: string, nom: string) => ({ id, nom, couleur: 'rouge' as const })
  const autres = [
    { id: 't1', titre: 'Projet', etiquettes: [e('a', 'Urgent'), e('b', 'Idée')] },
    { id: 't2', titre: 'Accueil', etiquettes: [e('b', 'Idée'), e('c', 'À voir'), e('d', 'urgent')] },
  ]
  it('ne propose que celles qu’on n’a pas ici, ni par identifiant ni par nom', () => {
    const r = etiquettesAReprendre([e('a', 'Urgent')], autres)
    expect(r.map((s) => [s.titre, s.etiquettes.map((x) => x.nom)])).toEqual([
      ['Projet', ['Idée']],
      ['Accueil', ['À voir']],
    ])
  })
  it('une étiquette présente dans deux tableaux n’est proposée qu’une fois, au plus proche', () => {
    const r = etiquettesAReprendre([], autres)
    expect(r[1]!.etiquettes.map((x) => x.id)).toEqual(['c'])
  })
  it('suit la recherche, sans égard à la casse, et fait disparaître les sections vides', () => {
    expect(etiquettesAReprendre([], autres, 'VOIR').map((s) => s.titre)).toEqual(['Accueil'])
    expect(etiquettesAReprendre([], autres, 'zzz')).toEqual([])
  })
})
