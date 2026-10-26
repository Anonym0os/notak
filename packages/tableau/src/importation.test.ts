// @vitest-environment jsdom
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

/** Un fichier qui se lit (`text()`), comme dans les navigateurs ; celui de jsdom ne le sait pas. */
const fichier = (contenu: string, nom: string, type = '') => Object.assign(new File([contenu], nom, { type }), { text: async () => contenu })

const accueil = (elements: Element[] = []) => creerEspace({ racine: 'accueil', tableaux: { accueil: { titre: 'Accueil', elements } } })

describe('importer des fichiers sur une toile fermée', () => {
  beforeEach(() => {
    vi.stubGlobal('DataTransfer', DT)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:essai' }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('un texte devient un document, son Markdown en blocs', async () => {
    const espace = accueil()
    const md = fichier('# Plan\n\n- un\n- deux', 'Notes de réunion.md', 'text/markdown')
    const [doc] = await importerSurLaToile(espace, 'accueil', [md], {})
    expect(doc!.contenu.type).toBe('document')
    if (doc!.contenu.type !== 'document') return
    // Le titre en tête devient celui du document, comme dans Notion.
    expect(doc!.contenu.titre).toBe('Plan')
    expect(doc!.contenu.texte.content).toHaveLength(2)
    expect(surLeTableau(espace.tableau('accueil')!).map((e) => e.id)).toEqual([doc!.id])
  })

  it('se pose à la suite de ce que la toile porte, chaque fichier à droite du précédent', async () => {
    const espace = accueil([{ id: 'note', x: 0, y: 3, largeur: 20, contenu: { type: 'note', texte: { type: 'doc' } } } as unknown as Element])
    const { d } = depot()
    const poses = await importerSurLaToile(espace, 'accueil', [fichier('a', 'a.txt'), fichier('%PDF', 'devis.pdf', 'application/pdf')], { fichiers: d })
    expect(poses.map((e) => e.contenu.type)).toEqual(['document', 'fichier'])
    // Sans titre en tête, le document prend le nom du fichier.
    expect((poses[0]!.contenu as { titre: string }).titre).toBe('a')
    expect(poses[0]!.x).toBeGreaterThanOrEqual(20)
    expect(poses[1]!.x).toBeGreaterThan(poses[0]!.x)
    // Sur la même rangée que la note, en haut.
    expect(Math.min(...poses.map((e) => e.y))).toBe(3)
  })

  it('un fichier joint prend son vrai fichier à la fin de l’envoi, sans toile ouverte pour le faire', async () => {
    const espace = accueil()
    const { d, finir } = depot()
    const [f] = await importerSurLaToile(espace, 'accueil', [fichier('%PDF', 'devis.pdf', 'application/pdf')], { fichiers: d })
    const lu = () => espace.tableau('accueil')!.elements.find((e) => e.id === f!.id)!.contenu as { fichier: string }
    expect(lu().fichier).toMatch(/^envoi-/)
    finir[0]!('vrai-id')
    await new Promise((r) => setTimeout(r))
    expect(lu().fichier).toBe('vrai-id')
  })

  it('rien de lisible, rien de posé', async () => {
    const espace = accueil()
    // Sans dépôt de fichiers, un PDF ne peut aller nulle part.
    expect(await importerSurLaToile(espace, 'accueil', [fichier('%PDF', 'devis.pdf', 'application/pdf')], {})).toEqual([])
    expect(espace.tableau('accueil')!.elements).toEqual([])
  })
})
