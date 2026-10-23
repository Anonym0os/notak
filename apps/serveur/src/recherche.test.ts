import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'
import { entreesDIndex, indexerDocument, indexerLesAbsents, requeteIndex } from './indexation.ts'
import { lireTableau } from './contenu.ts'
import { nomDuDocument } from './synchro.ts'

describe('requeteIndex', () => {
  it('met chaque mot entre guillemets, le dernier en préfixe, et neutralise les opérateurs', () => {
    expect(requeteIndex('plage  été')).toBe('"plage" "été"*')
    expect(requeteIndex('Lisbonne')).toBe('"Lisbonne"*')
    expect(requeteIndex('a OR "b" NEAR(c) -d*')).toBe('"a" "OR" "b" "NEAR" "c" "d"*')
    expect(requeteIndex('   ')).toBeNull()
    expect(requeteIndex('"*()')).toBeNull()
  })
})

describe('entreesDIndex', () => {
  it('le titre, puis le texte des éléments, sans la corbeille ni les cartes de tableau', () => {
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', 'Voyage')
    poser(doc, { type: 'note', texte: texte('Billets de train') }, { id: 'n1' })
    poser(doc, { type: 'note', texte: texte('jetée') }, { id: 'n2', corbeille: 1 })
    poser(doc, { type: 'note', texte: texte('') }, { id: 'n3' })
    poser(doc, { type: 'tableau', cible: 'autre', titre: 'Budget' }, { id: 'n4' })
    poser(doc, { type: 'colonne', titre: 'Hôtels' }, { id: 'n5' })
    expect(entreesDIndex(lireTableau(doc))).toEqual([
      { element: '', texte: 'Voyage' },
      { element: 'n1', texte: 'Billets de train' },
      { element: 'n5', texte: 'Hôtels' },
    ])
  })
})

describe('GET /api/recherche', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte
  let cleo: Compte
  const ecrire = (id: string, titre: string, ...notes: string[]) => {
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', titre)
    notes.forEach((n, i) => poser(doc, { type: 'note', texte: texte(n) }, { id: `${id}-n${i}` }))
    m.base.enregistrerDocument(nomDuDocument(id), Y.encodeStateAsUpdate(doc))
    indexerDocument(m.base, id, doc)
  }
  const chercher = async (q: string, c?: Compte) => {
    const r = await m.appeler(`/api/recherche?q=${encodeURIComponent(q)}`, { compte: c })
    return r.status === 200 ? ((await r.json()) as { tableau: string; titre: string; element: string | null; extrait: string; role: string }[]) : r.status
  }

  beforeAll(async () => {
    m = monde()
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    cleo = await m.compte('Cléo')
    m.tableau(ana, 'tableau-voyage', 'Voyage')
    m.tableau(ana, 'tableau-secret', 'Secret')
    m.tableau(ana, 'tableau-fils-1', 'Étape', undefined, 'tableau-voyage')
    ecrire('tableau-voyage', 'Voyage', 'Billets de train pour Lisbonne', 'Réserver la plage de Cascais')
    ecrire('tableau-secret', 'Secret', 'Le code de la plage privée')
    ecrire('tableau-fils-1', 'Étape', 'Dîner près de la plage')
    m.base.definirAcces({ tableau: 'tableau-voyage', utilisateur: bob.utilisateur.id, role: 'lecture' })
  })
  afterAll(() => m.fermer())

  it('trouve dans tous les tableaux du compte, sans accents ni majuscules, en préfixe', async () => {
    const r = await chercher('PLAGE', ana)
    expect(Array.isArray(r) && r.map((t) => t.tableau).sort()).toEqual(['tableau-fils-1', 'tableau-secret', 'tableau-voyage'])
    expect(await chercher('etape', ana)).toMatchObject([{ tableau: 'tableau-fils-1', titre: 'Étape', element: null }])
    expect(await chercher('lisb', ana)).toMatchObject([{ tableau: 'tableau-voyage', element: 'tableau-voyage-n0', role: 'proprietaire' }])
    expect(await chercher('billets lisbonne', ana)).toHaveLength(1)
    expect(await chercher('billets cascais', ana)).toEqual([])
  })

  it('rend un extrait du texte trouvé', async () => {
    const r = await chercher('cascais', ana)
    expect(r).toMatchObject([{ extrait: 'Réserver la plage de Cascais' }])
  })

  it('ne rend que ce que le compte peut ouvrir, sous-tableaux compris', async () => {
    const r = await chercher('plage', bob)
    expect(Array.isArray(r) && r.map((t) => [t.tableau, t.role]).sort()).toEqual([
      ['tableau-fils-1', 'lecture'],
      ['tableau-voyage', 'lecture'],
    ])
    expect(await chercher('plage', cleo)).toEqual([])
  })

  it('refuse sans session, rend une liste vide pour une saisie sans mot', async () => {
    expect(await chercher('plage')).toBe(401)
    expect(await chercher('  ', ana)).toEqual([])
    expect(await chercher('"', ana)).toEqual([])
  })

  it('suit les changements : un texte réécrit se retrouve, l’ancien non', async () => {
    ecrire('tableau-voyage', 'Voyage', 'Billets de train pour Lisbonne', 'Réserver la terrasse')
    expect(await chercher('cascais', ana)).toEqual([])
    expect(await chercher('terrasse', ana)).toHaveLength(1)
  })

  it('un tableau enregistré avant l’index est indexé au démarrage', async () => {
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', 'Ancien')
    poser(doc, { type: 'note', texte: texte('mémoire ancienne') })
    m.tableau(ana, 'tableau-ancien', 'Ancien')
    m.base.enregistrerDocument(nomDuDocument('tableau-ancien'), Y.encodeStateAsUpdate(doc))
    expect(await chercher('ancienne', ana)).toEqual([])
    expect(m.base.tableauxNonIndexes()).toContain('tableau-ancien')
    expect(indexerLesAbsents(m.base)).toBeGreaterThan(0)
    expect(await chercher('ancienne', ana)).toHaveLength(1)
    expect(m.base.tableauxNonIndexes()).toEqual([])
  })
})
