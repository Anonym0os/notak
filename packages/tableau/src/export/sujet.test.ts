import { strFromU8, unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Arbre, Element } from '../coeur/tableau'
import { ajouterEnfant, lire, nouvelArbre } from '../elements/arbre/modele/sujets'
import { sujetCarte } from '../elements/arbre/exporter'
import { sujetDocument } from '../elements/document/sujetExport'
import type { ContexteToile } from '../elements/types'
import { decouper } from './capture'
import { exporterCarte } from './exporter'
import { lireEtat } from './contenu'
import { decoderNotak } from '../fichierEspace'
import { fichiersCites, notakDElement } from './notakElement'
import { type Prepare, type SujetExport, REGLAGES_PAR_DEFAUT, brancherExport, exportBranche, nomDeFichier, ouvrirExport } from './sujet'

let debrancher: (() => void) | null = null
afterEach(() => {
  debrancher?.()
  debrancher = null
})

/** Le texte d'un Blob. */
const texte = async (b: Blob) => new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()))
const format = (s: SujetExport, id: string) => s.formats.find((f) => f.id === id)!
const preparer = (s: SujetExport, id: string): Promise<Prepare> => format(s, id).preparer(REGLAGES_PAR_DEFAUT)

describe('le dialogue d’export que l’application branche', () => {
  it('sans dialogue branché, rien ne s’ouvre : la carte et le document gardent leur menu', () => {
    expect(exportBranche()).toBe(false)
    expect(ouvrirExport({ genre: 'carte', titre: 'C', formats: [] })).toBe(false)
  })

  it('branché, il reçoit le sujet ; débranché, il ne reçoit plus rien', () => {
    const ouvrir = vi.fn()
    debrancher = brancherExport(ouvrir)
    expect(exportBranche()).toBe(true)
    const s: SujetExport = { genre: 'document', titre: 'D', formats: [] }
    expect(ouvrirExport(s)).toBe(true)
    expect(ouvrir).toHaveBeenCalledWith(s)
    debrancher()
    expect(ouvrirExport(s)).toBe(false)
  })

  it('un nom de fichier sûr, tiré du titre', () => {
    expect(nomDeFichier('Plan : été/hiver ?', 'pdf', 'tableau')).toBe('Plan - été-hiver -.pdf')
    expect(nomDeFichier('   ', 'md', 'tableau')).toBe('tableau.md')
  })
})

describe('les pages d’un document', () => {
  it('coupe à la dernière coupe permise qui tient dans la page', () => {
    expect(decouper(2500, [300, 900, 1100, 1700, 2100], 1000)).toEqual([
      [0, 900],
      [900, 1700],
      [1700, 2500],
    ])
  })

  it('coupe au bas de la page quand la seule coupe la laisserait presque vide, ou qu’il n’y en a pas', () => {
    expect(decouper(1500, [100], 1000)).toEqual([
      [0, 1000],
      [1000, 1500],
    ])
    expect(decouper(600, [], 1000)).toEqual([[0, 600]])
  })
})

/** Une carte : le central, deux branches, une sous-branche. */
function carte(): Arbre {
  let a = nouvelArbre('Voyage')
  const c = lire(a).central
  let p: string
  ;[a, p] = ajouterEnfant(a, c, 'Étapes')
  ;[a] = ajouterEnfant(a, p, 'Lyon')
  ;[a] = ajouterEnfant(a, c, 'Budget')
  return a
}
const element = (a: Arbre): Element => ({ id: 'E1', x: 0, y: 0, largeur: 10, contenu: a }) as Element
const contexte = { services: {} } as unknown as ContexteToile

describe('l’export d’une carte mentale', () => {
  it('en plan : le central en titre, puis ses sujets en liste', () => {
    expect(exporterCarte(carte().sujets, 'md')).toBe('# Voyage\n\n- Étapes\n  - Lyon\n- Budget\n')
    expect(exporterCarte(carte().sujets, 'txt')).toBe('Voyage\n\nÉtapes\n  Lyon\nBudget\n')
  })

  it('ouverte, elle s’exporte en .notak (recommandé, comme partout), en image, en PDF, en .xmind et en texte', () => {
    const s = sujetCarte(element(carte()), contexte, () => null)
    expect(s.genre).toBe('carte')
    expect(s.titre).toBe('Voyage')
    expect(s.formats.map((f) => f.id)).toEqual(['notak', 'png', 'pdf', 'xmind', 'md', 'txt'])
    expect(s.formats.filter((f) => f.recommande).map((f) => f.id)).toEqual(['notak'])
    expect(format(s, 'notak').options).toEqual(['fichiers'])
    expect(format(s, 'png').options).toEqual(['fond'])
  })

  it('sans son dessin (choisie sur la toile), ni image ni PDF', () => {
    expect(sujetCarte(element(carte()), contexte, null).formats.map((f) => f.id)).toEqual(['notak', 'xmind', 'md', 'txt'])
  })

  it('le .notak : un tableau qui ne contient qu’elle, et qui la redonne entière, sujets compris', async () => {
    const p = await preparer(sujetCarte(element(carte()), contexte, null), 'notak')
    expect(p.apercu).toEqual({
      type: 'contenu',
      resume: '1 toile',
      lignes: [
        { icone: 'tableau', texte: 'Voyage' },
        { icone: 'carteMentale', texte: 'Voyage', detail: 'Carte mentale' },
      ],
    })
    const c = decoderNotak(new Uint8Array(await p.fichier!.arrayBuffer()))
    expect(c.tableaux).toHaveLength(1)
    const lu = lireEtat(c.tableaux[0]!.etat)
    expect(lu.titre).toBe('Voyage')
    expect(lu.elements).toHaveLength(1)
    const sujets = Object.values((lu.elements[0]!.contenu as unknown as { sujets: Record<string, { titre: string }> }).sujets).map((x) => x.titre)
    expect(sujets.sort()).toEqual(['Budget', 'Lyon', 'Voyage', 'Étapes'])
  })

  it('le .notak emporte les fichiers que l’élément cite, si on le veut', async () => {
    expect([...fichiersCites({ sujets: { a: { image: { fichier: 'F1' } }, b: { piece: { fichier: 'F2', nom: 'x.pdf' } } }, texte: { attrs: { fichier: 'F3' } } })]).toEqual([
      'F1',
      'F2',
      'F3',
    ])
    const depot = { enregistrer: vi.fn(), adresse: vi.fn(async (id: string) => `data:image/png;base64,${btoa(id)}`) }
    const a = carte()
    const [sujet] = Object.keys(a.sujets)
    const avecImage = { ...a, sujets: { ...a.sujets, [sujet!]: { ...a.sujets[sujet!]!, image: { fichier: 'F1', l: 10, h: 10 } } } } as Arbre
    const avec = await notakDElement(element(avecImage), 'Voyage', depot, true)
    expect((avec.apercu as { resume: string }).resume).toBe('1 toile · 1 image ou fichier')
    expect(decoderNotak(new Uint8Array(await avec.fichier!.arrayBuffer())).fichiers.map((f) => f.id)).toEqual(['F1'])
    const sans = await notakDElement(element(avecImage), 'Voyage', depot, false)
    expect(decoderNotak(new Uint8Array(await sans.fichier!.arrayBuffer())).fichiers).toEqual([])
  })

  it('le .xmind : l’aperçu compte les sujets et montre les branches, le fichier est un classeur Xmind', async () => {
    const p = await preparer(sujetCarte(element(carte()), contexte, null), 'xmind')
    expect(p.apercu).toEqual({
      type: 'contenu',
      resume: '4 sujets',
      lignes: [
        { icone: 'carteMentale', texte: 'Voyage' },
        { icone: 'chevronDroite', texte: 'Étapes' },
        { icone: 'chevronDroite', texte: 'Budget' },
      ],
    })
    expect(Object.keys(unzipSync(new Uint8Array(await p.fichier!.arrayBuffer())))).toContain('content.json')
  })

  it('le Markdown : l’aperçu est le fichier même', async () => {
    const p = await preparer(sujetCarte(element(carte()), contexte, null), 'md')
    expect(p.apercu).toEqual({ type: 'texte', texte: '# Voyage\n\n- Étapes\n  - Lyon\n- Budget\n' })
    expect(await texte(p.fichier!)).toBe('# Voyage\n\n- Étapes\n  - Lyon\n- Budget\n')
  })

  it('une carte sans dessin ne se photographie pas : l’aperçu échoue, sans rien casser', async () => {
    await expect(
      preparer(
        sujetCarte(element(carte()), contexte, () => null),
        'png',
      ),
    ).rejects.toThrow()
  })
})

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Départ' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Le train part à ' },
        { type: 'text', text: '8 h', marks: [{ type: 'bold' }] },
      ],
    },
  ],
}

describe('l’export d’un document', () => {
  const s = sujetDocument('Carnet', () => doc)

  it('ses pages en PDF ou en Word, puis son texte ; le PDF recommandé quand le .notak n’est pas possible', () => {
    expect(s.genre).toBe('document')
    expect(s.formats.map((f) => f.id)).toEqual(['pdf', 'docx', 'md', 'txt'])
    expect(format(s, 'pdf').recommande).toBe(true)
    expect(format(s, 'md').filet).toBe(true)
  })

  it('le Markdown et le texte brut : l’aperçu est le fichier même', async () => {
    const md = await preparer(s, 'md')
    expect(md.apercu).toEqual({ type: 'texte', texte: '# Carnet\n\n## Départ\n\nLe train part à **8 h**\n' })
    expect(await texte(md.fichier!)).toBe('# Carnet\n\n## Départ\n\nLe train part à **8 h**\n')
    expect(md.fichier!.type).toBe('text/markdown;charset=utf-8')
    const txt = await preparer(s, 'txt')
    expect(await texte(txt.fichier!)).toBe('Carnet\n\nDépart\n\nLe train part à 8 h\n')
  })

  it('avec son élément, le .notak vient en tête, recommandé comme partout', async () => {
    const el = { id: 'D1', x: 0, y: 0, largeur: 10, contenu: { type: 'document', titre: 'Carnet', texte: doc } } as unknown as Element
    const avec = sujetDocument('Carnet', () => doc, undefined, { element: () => el })
    expect(avec.formats.map((f) => f.id)).toEqual(['notak', 'pdf', 'docx', 'md', 'txt'])
    expect(avec.formats.filter((f) => f.recommande).map((f) => f.id)).toEqual(['notak'])
    const p = await preparer(avec, 'notak')
    const lu = lireEtat(decoderNotak(new Uint8Array(await p.fichier!.arrayBuffer())).tableaux[0]!.etat)
    expect(lu.elements.map((e) => [e.contenu.type, (e.contenu as { titre?: string }).titre])).toEqual([['document', 'Carnet']])
  })

  it('un document sans titre s’appelle « Sans titre »', () => {
    expect(sujetDocument('  ', () => doc).titre).toBe('Sans titre')
  })

  it('le .docx se fabrique avec le texte du moment, même hors de l’aperçu des pages', async () => {
    // Le Word ne dépend pas des pages : son fichier vient du texte. (Les pages, elles, demandent un navigateur.)
    const { documentEnDocx } = await import('../elements/document/docx')
    const octets = documentEnDocx('Carnet', doc as never)
    expect(strFromU8(unzipSync(octets)['word/document.xml']!)).toContain('Le train part à ')
  })
})
