import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { decoderNotak } from '../fichierEspace'
import { type SourceCopie, ecrireCopie, renommer } from './copie'

/** L'état Yjs d'un tableau : son titre et ses éléments. */
function etat(titre: string, elements: Record<string, unknown>[]): Uint8Array {
  const doc = new Y.Doc()
  doc.getMap('meta').set('titre', titre)
  for (const e of elements) doc.getMap('elements').set(e.id as string, { x: 0, y: 0, largeur: 10, ...e })
  return Y.encodeStateAsUpdate(doc)
}

const etats: Record<string, Uint8Array> = {
  A: etat('Tête', [
    { id: 'n1', contenu: { type: 'image', fichier: 'F1', largeurOrigine: 1, hauteurOrigine: 1 } },
    { id: 'n2', contenu: { type: 'tableau', cible: 'B' } },
    { id: 'n3', contenu: { type: 'tableau', cible: 'A' } },
    { id: 'n4', contenu: { type: 'tableau', cible: 'C' }, corbeille: 1 },
  ]),
  B: etat('Fille', [{ id: 'm1', contenu: { type: 'tableau', cible: 'Z' } }]),
  C: etat('Jetée', []),
}
const source: SourceCopie = {
  etat: async (id) => etats[id] ?? null,
  fichier: async (id) => (id === 'F1' ? { octets: new Uint8Array([1, 2, 3]), type: 'image/png' } : null),
}

describe('l’export Notak d’un tableau', () => {
  it('suit les renvois (pas ceux de la corbeille, pas les boucles), range chaque sous-tableau sous le sien, prend les fichiers', async () => {
    const c = decoderNotak(await ecrireCopie('A', source, { sousTableaux: true, fichiers: true }))
    expect(c.racine).toBe('A')
    expect(c.tableaux.map((t) => [t.id, t.titre, t.parent])).toEqual([
      ['A', 'Tête', undefined],
      ['B', 'Fille', 'A'],
    ])
    expect(c.fichiers).toEqual([{ id: 'F1', type: 'image/png', octets: new Uint8Array([1, 2, 3]) }])
  })

  it('suit les options', async () => {
    const c = decoderNotak(await ecrireCopie('A', source, { sousTableaux: false, fichiers: false }))
    expect(c.tableaux.map((t) => t.id)).toEqual(['A'])
    expect(c.fichiers).toEqual([])
  })

  it('prend le titre de la source quand l’état n’en a pas', async () => {
    const c = decoderNotak(await ecrireCopie('V', { ...source, etat: async () => etat('', []), titre: () => 'Depuis la base' }, { sousTableaux: true, fichiers: true }))
    expect(c.tableaux[0]!.titre).toBe('Depuis la base')
  })

  it('renomme chaque identifiant connu, à toute profondeur, et rien d’autre', () => {
    const nouveaux = new Map([
      ['B', 'B2'],
      ['F1', 'F9'],
    ])
    expect(renommer({ a: 'B', b: ['F1', 'Bx'], c: { d: 'F1', e: 3 } }, nouveaux)).toEqual({ a: 'B2', b: ['F9', 'Bx'], c: { d: 'F9', e: 3 } })
  })
})
