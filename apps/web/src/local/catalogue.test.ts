// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { VERSION_FICHE, creerCatalogue, lireFiche } from './catalogue'

let n = 0
const base = () => `essai-catalogue-${++n}`

/** Une toile : une note, une carte de toile, un document jeté. */
function toile() {
  const doc = new Y.Doc()
  doc.getMap('meta').set('titre', 'Voyage')
  const elements = doc.getMap<unknown>('elements')
  elements.set('n1', { x: 0, y: 0, largeur: 20, contenu: { type: 'note', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Le temple de Kyoto' }] }] } } })
  elements.set('c1', { x: 30, y: 0, largeur: 10, contenu: { type: 'tableau', cible: 'japon' } })
  elements.set('d1', { x: 0, y: 30, largeur: 20, corbeille: 1, contenu: { type: 'document', titre: 'Jeté', texte: { type: 'doc', content: [] } } })
  return doc
}

describe('le catalogue de l’app', () => {
  it('lit d’une toile ce que montre la bibliothèque et ce qu’on y cherche, hors corbeille', () => {
    const { fiche, textes } = lireFiche('voyage', toile(), (id) => (id === 'japon' ? 'Japon' : undefined), 42)
    expect(fiche).toMatchObject({ id: 'voyage', version: VERSION_FICHE, lue: 42 })
    expect(fiche.resumes[0]).toMatchObject({ genre: 'toile', titre: 'Voyage', cartes: ['japon'] })
    expect(textes).toEqual({ id: 'voyage', titre: 'Voyage', elements: [['c1', 'Japon'], ['n1', 'Le temple de Kyoto']] })
  })

  it('garde la fiche d’une toile relue, et ce qui manque se dit : jamais lue, ou changée sans être relue', async () => {
    const nom = base()
    const c = creerCatalogue({ titreDe: () => undefined, base: nom })
    const prevenus: string[] = []
    c.ecouter((id) => prevenus.push(id))
    expect(await c.manquantes(['voyage', 'budget'])).toEqual(['voyage', 'budget'])
    c.relire('voyage', toile())
    await new Promise((fin) => setTimeout(fin, 50))
    expect((await c.fiches()).get('voyage')!.resumes[0]!.titre).toBe('Voyage')
    // La carte de « Japon », dont on ne sait pas le titre ici, n'a rien à chercher.
    expect((await c.textes()).get('voyage')!.elements).toEqual([['n1', 'Le temple de Kyoto']])
    expect(prevenus).toEqual(['voyage'])
    expect(await c.manquantes(['voyage', 'budget'])).toEqual(['budget'])
    // Changée, puis l'app s'arrête avant la relecture : elle reste à relire, même pour un autre lancement.
    c.change('voyage')
    expect(await creerCatalogue({ titreDe: () => undefined, base: nom }).manquantes(['voyage'])).toEqual(['voyage'])
    c.relire('voyage', toile())
    await new Promise((fin) => setTimeout(fin, 50))
    expect(await c.manquantes(['voyage'])).toEqual([])
  })

  it('complète ce qui manque en ouvrant chaque toile le temps de la lire', async () => {
    const c = creerCatalogue({ titreDe: () => undefined, base: base() })
    const ouvertes: string[] = []
    await c.completer(['voyage', 'budget'], async (id, f) => {
      ouvertes.push(id)
      return f(toile())
    })
    expect(ouvertes).toEqual(['voyage', 'budget'])
    expect([...(await c.fiches()).keys()].sort()).toEqual(['budget', 'voyage'])
  })
})
