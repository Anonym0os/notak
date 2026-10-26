import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type ElementLu, type NoeudTexte, type TableauLu, fichiersDe, idsDeFichiers, lireTableau, texteCherchable } from './contenu.ts'
import { exporterTexte, ordreDeLecture, texteRiche } from './exporter.ts'

const para = (...morceaux: (string | NoeudTexte)[]): NoeudTexte => ({
  type: 'paragraph',
  content: morceaux.map((m) => (typeof m === 'string' ? { type: 'text', text: m } : m)),
})
const doc = (...blocs: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content: blocs })
const gras = (t: string): NoeudTexte => ({ type: 'text', text: t, marks: [{ type: 'bold' }] })

let n = 0
const el = (contenu: ElementLu['contenu'], p: Partial<ElementLu> = {}): ElementLu => ({ id: `e${++n}`, x: 0, y: 0, largeur: 34, contenu, ...p })
const note = (texte: NoeudTexte, p: Partial<ElementLu> = {}) => el({ type: 'note', texte }, p)

describe('texteRiche', () => {
  it('rend les marques, les titres, les listes et les cases', () => {
    const d = doc(
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Idées' }] },
      para('un ', gras('gras'), ' et ', { type: 'text', text: 'lien', marks: [{ type: 'link', attrs: { href: 'https://a.fr' } }] }),
      { type: 'bulletList', content: [{ type: 'listItem', content: [para('a'), { type: 'bulletList', content: [{ type: 'listItem', content: [para('a1')] }] }] }, { type: 'listItem', content: [para('b')] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [para('un')] }, { type: 'listItem', content: [para('deux')] }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para('fait')] }, { type: 'taskItem', attrs: { checked: false }, content: [para('à faire')] }] },
    )
    expect(texteRiche(d, 'md')).toBe(
      ['# Idées', '', 'un **gras** et [lien](https://a.fr)', '', '- a', '  - a1', '- b', '', '1. un', '2. deux', '', '- [x] fait', '- [ ] à faire'].join('\n'),
    )
    expect(texteRiche(d, 'txt')).toBe(
      ['Idées', '', 'un gras et lien', '', '- a', '  - a1', '- b', '', '1. un', '2. deux', '', '[x] fait', '[ ] à faire'].join('\n'),
    )
  })

  it('descend les titres, garde les espaces hors du gras, cite et code', () => {
    const d = doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sous' }] },
      para({ type: 'text', text: ' fort ', marks: [{ type: 'bold' }] }),
      { type: 'blockquote', content: [para('cité')] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'let a = 1' }] },
    )
    expect(texteRiche(d, 'md', undefined, 1)).toBe(['### Sous', '', ' **fort** ', '', '> cité', '', '```ts', 'let a = 1', '```'].join('\n'))
  })
})

describe('ordre de lecture', () => {
  it('lit de haut en bas, puis de gauche à droite, les colonnes avec leur contenu, sans corbeille ni lignes', () => {
    const colonne = el({ type: 'colonne', titre: 'À faire' }, { x: 50, y: 0 })
    const a = note(doc(para('a')), { x: 10, y: 20 })
    const b = note(doc(para('b')), { x: 0, y: 20 })
    const c = note(doc(para('c')), { parent: colonne.id, ordre: 'b' })
    const d = note(doc(para('d')), { parent: colonne.id, ordre: 'a' })
    const jetee = note(doc(para('jetée')), { corbeille: 1 })
    const trait = el({ type: 'ligne', libelle: 'relie' })
    const attente = note(doc(para('attente')), { nonTrie: 5 })
    const lu = ordreDeLecture([a, b, c, d, colonne, jetee, trait, attente])
    expect(lu.racines.map((e) => e.id)).toEqual([colonne.id, b.id, a.id])
    expect(lu.enfants.get(colonne.id)!.map((e) => e.id)).toEqual([d.id, c.id])
    expect(lu.nonTries.map((e) => e.id)).toEqual([attente.id])
  })
})

describe('exporterTexte', () => {
  const colonne = el({ type: 'colonne', titre: 'Courses' }, { x: 40, y: 25 })
  const tableau: TableauLu = {
    titre: 'Voyage',
    elements: [
      note(doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Plan' }] }, para('Partir ', gras('tôt'))), { y: 0 }),
      el({ type: 'taches', titre: 'Valises', texte: doc({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [para('passeport')] }] }) }, { y: 10 }),
      el({ type: 'lien', url: 'https://hotel.fr', statut: 'pret', apercu: { titre: 'Hôtel', description: 'Près de la gare' } }, { y: 20 }),
      colonne,
      note(doc(para('pain')), { parent: colonne.id, ordre: 'a' }),
      el({ type: 'tableau', cible: 'autre' }, { y: 30 }),
      el({ type: 'image', fichier: 'f', legende: 'Plage' }, { y: 40 }),
      el({ type: 'commentaire', messages: [{ auteur: { nom: 'Ana' }, texte: 'Super' }], resolu: true }, { y: 50 }),
      note(doc(para('jetée')), { corbeille: 3 }),
      note(doc(para('à placer')), { nonTrie: 9 }),
    ],
  }
  const titreDe = (id: string) => (id === 'autre' ? 'Budget' : undefined)

  it('Markdown', () => {
    expect(exporterTexte(tableau, 'md', titreDe)).toBe(
      [
        '# Voyage',
        '',
        '## Plan',
        '',
        'Partir **tôt**',
        '',
        '**Valises**',
        '',
        '- [ ] passeport',
        '',
        '[Hôtel](https://hotel.fr)',
        '',
        'Près de la gare',
        '',
        '## Courses',
        '',
        'pain',
        '',
        '*Tableau : Budget*',
        '',
        '*Image : Plage*',
        '',
        '> Ana : Super',
        '> (résolu)',
        '',
        '## Non triés',
        '',
        'à placer',
        '',
      ].join('\n'),
    )
  })

  it('texte brut : aucun signe de mise en forme', () => {
    const t = exporterTexte(tableau, 'txt', titreDe)
    expect(t.startsWith('Voyage\n\nPlan\n\nPartir tôt\n\nValises\n\n[ ] passeport\n\nHôtel (https://hotel.fr)')).toBe(true)
    expect(t).not.toMatch(/[*#>]/)
    expect(t).toContain('Tableau : Budget')
    expect(t).not.toContain('jetée')
  })

  it('un tableau sans titre ni contenu', () => {
    expect(exporterTexte({ titre: '  ', elements: [] }, 'md')).toBe('# Sans titre\n')
  })
})

describe('lecture d’un document Yjs', () => {
  it('lit le titre et les éléments dans l’ordre d’empilement, sans le plan', () => {
    const y = new Y.Doc()
    const meta = y.getMap('meta')
    meta.set('titre', 'Mon tableau')
    const elements = y.getMap('elements')
    elements.set('b', { id: 'b', x: 0, y: 0, largeur: 34, plan: 'n', contenu: { type: 'note', texte: doc(para('haut')) } })
    elements.set('a', { id: 'a', x: 0, y: 0, largeur: 34, plan: 'a', contenu: { type: 'note', texte: doc(para('bas')) } })
    const t = lireTableau(y)
    expect(t.titre).toBe('Mon tableau')
    expect(t.elements.map((e) => e.id)).toEqual(['a', 'b'])
    expect('plan' in t.elements[0]!).toBe(false)
  })
})

describe('texte cherchable et fichiers', () => {
  it('reprend ce que cherche la toile', () => {
    expect(texteCherchable(note(doc(para('Bonjour'), para('monde'))), () => undefined)).toBe('Bonjour\nmonde')
    expect(texteCherchable(el({ type: 'tableau', cible: 'x', titre: 'ancien' }), (id) => (id === 'x' ? 'Nouveau' : undefined))).toBe('Nouveau')
    expect(texteCherchable(el({ type: 'fichier', fichier: 'f', nom: 'a.pdf', titre: 'Contrat' }), () => undefined)).toBe('Contrat\na.pdf')
  })

  it('liste les fichiers du tableau, sans la corbeille', () => {
    const elements = [
      el({ type: 'image', fichier: 'i1', legende: 'Plage', typeMime: 'image/png', tailles: [{ largeur: 400, fichier: 'i1-400' }] }),
      el({ type: 'fichier', fichier: 'f1', nom: 'a.pdf', typeMime: 'application/pdf' }),
      el({ type: 'image', fichier: 'i2' }, { corbeille: 1 }),
    ]
    expect(fichiersDe(elements).map((f) => f.id)).toEqual(['i1', 'f1'])
    expect([...idsDeFichiers(elements)].sort()).toEqual(['f1', 'i1', 'i1-400'])
  })

  it('garde servi l\u2019image qu\u2019on a donnée à un lien comme aperçu', () => {
    const lien = el({ type: 'lien', url: 'https://x.fr', image: { fichier: 'apercu', largeur: 400, hauteur: 300 } })
    expect([...idsDeFichiers([lien])]).toEqual(['apercu'])
  })

  it('garde servie la couverture d\u2019une carte de toile', () => {
    expect([...idsDeFichiers([el({ type: 'tableau', cible: 'x', image: 'couv' })])]).toEqual(['couv'])
    expect([...idsDeFichiers([el({ type: 'tableau', cible: 'y' })])]).toEqual([])
  })

  it('garde servi l\u2019original d\u2019une image détourée', () => {
    const detouree = el({ type: 'image', fichier: 'png', original: { fichier: 'photo', tailles: [{ largeur: 400, fichier: 'photo-400' }] } })
    expect([...idsDeFichiers([detouree])].sort()).toEqual(['photo', 'photo-400', 'png'])
  })
})

describe('exporterTexte en anglais', () => {
  it('écrit ses propres mots en anglais et laisse le texte de l’utilisateur', () => {
    const tableau = {
      titre: '  ',
      elements: [
        { id: 'a', x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible: 'z', titre: '' } },
        { id: 'b', x: 0, y: 20, largeur: 10, contenu: { type: 'fichier', nom: 'plan.pdf' } },
        { id: 'c', x: 0, y: 40, largeur: 10, contenu: { type: 'commentaire', resolu: true, messages: [{ auteur: { nom: 'Ana' }, texte: 'Bonjour' }] } },
      ],
    } as never
    const md = exporterTexte(tableau, 'md', () => undefined, 'en')
    expect(md).toContain('# Untitled')
    expect(md).toContain('*Board: Untitled*')
    expect(md).toContain('*File: plan.pdf*')
    expect(md).toContain('> (resolved)')
    expect(md).toContain('> Ana : Bonjour')
    expect(exporterTexte(tableau, 'txt')).toContain('Tableau : Sans titre')
  })
})

describe('le document à blocs (docs/NOTION.md)', () => {
  const texte = doc(
    { type: 'deroulant', attrs: { niveau: 0 }, content: [{ type: 'resumeDeroulant', content: [{ type: 'text', text: 'Plus' }] }, para('dedans')] },
    { type: 'colonnes', content: [{ type: 'colonne', content: [para('gauche')] }, { type: 'colonne', content: [para('droite')] }] },
  )
  const document = el({ type: 'document', titre: 'Compte rendu', texte })

  it('se cherche par son titre et son texte', () => {
    const t = texteCherchable(document, () => undefined)
    for (const mot of ['Compte rendu', 'Plus', 'dedans', 'gauche', 'droite']) expect(t).toContain(mot)
  })

  it('s’exporte avec le texte du tableau, son titre en tête', () => {
    expect(exporterTexte({ titre: 'T', elements: [document] }, 'md')).toBe('# T\n\n## Compte rendu\n\nPlus\n\ndedans\n\ngauche\n\ndroite\n')
  })
})
