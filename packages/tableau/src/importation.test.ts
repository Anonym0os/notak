// @vitest-environment jsdom
import { File as FichierNode } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './elements'
import { creerEspace } from './coeur/espace'
import { type Element, surLeTableau } from './coeur/tableau'
import { importerSurLaToile } from './importation'
import type { DepotFichiers } from './elements/types'

/** Le `DataTransfer` du navigateur, que jsdom n'a pas : des fichiers, et rien d'autre. */
class DT {
  files: File[] = []
  types = ['Files']
  items = { add: (f: File) => this.files.push(f) }
  getData = () => ''
}

/** Un dépôt qui garde les envois en attente, pour les finir quand le test le dit. */
function depot() {
  const finir: ((id: string) => void)[] = []
  const d: DepotFichiers = { enregistrer: () => new Promise((fini) => finir.push(fini)), adresse: async () => null }
  return { d, finir }
}

// Le `File` de jsdom ne sait pas se lire (`text()`) : celui de Node, comme celui des navigateurs, le sait.
const File = FichierNode as unknown as typeof globalThis.File

const accueil = (elements: Element[] = []) => creerEspace({ racine: 'accueil', tableaux: { accueil: { titre: 'Accueil', elements } } })

describe('importer des fichiers sur une toile fermée', () => {
  beforeEach(() => {
    vi.stubGlobal('DataTransfer', DT)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:essai' }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('un texte devient un document titré du nom du fichier, son Markdown en blocs', async () => {
    const espace = accueil()
    const md = new File(['# Plan\n\n- un\n- deux'], 'Notes de réunion.md', { type: 'text/markdown' })
    const [doc] = await importerSurLaToile(espace, 'accueil', [md], {})
    expect(doc!.contenu.type).toBe('document')
    if (doc!.contenu.type !== 'document') return
    expect(doc!.contenu.titre).toBe('Notes de réunion')
    expect(doc!.contenu.texte.content?.[0]?.type).toBe('heading')
    expect(doc!.contenu.texte.content).toHaveLength(3)
    expect(surLeTableau(espace.tableau('accueil')!).map((e) => e.id)).toEqual([doc!.id])
  })

  it('se pose à la suite de ce que la toile porte, chaque fichier à droite du précédent', async () => {
    const espace = accueil([{ id: 'note', x: 0, y: 3, largeur: 20, contenu: { type: 'note', texte: { type: 'doc' } } } as unknown as Element])
    const { d } = depot()
    const poses = await importerSurLaToile(espace, 'accueil', [new File(['a'], 'a.txt'), new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' })], { fichiers: d })
    expect(poses.map((e) => e.contenu.type)).toEqual(['document', 'fichier'])
    expect(poses[0]!.x).toBeGreaterThanOrEqual(20)
    expect(poses[1]!.x).toBeGreaterThan(poses[0]!.x)
    // Sur la même rangée que la note, en haut.
    expect(Math.min(...poses.map((e) => e.y))).toBe(3)
  })

  it('un fichier joint prend son vrai fichier à la fin de l’envoi, sans toile ouverte pour le faire', async () => {
    const espace = accueil()
    const { d, finir } = depot()
    const [f] = await importerSurLaToile(espace, 'accueil', [new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' })], { fichiers: d })
    const lu = () => espace.tableau('accueil')!.elements.find((e) => e.id === f!.id)!.contenu as { fichier: string }
    expect(lu().fichier).toMatch(/^envoi-/)
    finir[0]!('vrai-id')
    await new Promise((r) => setTimeout(r))
    expect(lu().fichier).toBe('vrai-id')
  })

  it('rien de lisible, rien de posé', async () => {
    const espace = accueil()
    // Sans dépôt de fichiers, un PDF ne peut aller nulle part.
    expect(await importerSurLaToile(espace, 'accueil', [new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' })], {})).toEqual([])
    expect(espace.tableau('accueil')!.elements).toEqual([])
  })
})
