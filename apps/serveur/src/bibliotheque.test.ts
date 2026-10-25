import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ELEMENTS_VUS_GARDES } from './base.ts'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'
import { indexerDocument } from './indexation.ts'
import { lireTableau, resumesDuTableau } from './contenu.ts'
import { nomDuDocument } from './synchro.ts'

type Entree = { tableau: string; element: string | null; genre: string; titre: string; ou: string | null; vu: number | null; favori: boolean; partage: boolean; resume: unknown }

/** Une carte mentale : un central et ses principaux, dans le désordre de leurs clés. */
const carte = (central: string, ...branches: string[]) => ({
  type: 'arbre',
  sujets: {
    c: { titre: central, ordre: 'a0' },
    ...Object.fromEntries(branches.map((b, i) => [`b${i}`, { titre: b, ordre: `a${branches.length - i}`, parent: 'c' }])),
    flottant: { titre: 'À part', ordre: 'b0', genre: 'detache' },
  },
})

describe('resumesDuTableau', () => {
  it('la toile et son plan, puis chaque carte et document hors corbeille', () => {
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', 'Voyage')
    doc.getMap('meta').set('couleur', 'bleu')
    poser(doc, { type: 'note', texte: texte('Billets'), couleur: 'jaune' }, { id: 'n1', x: 2.4, y: 3, largeur: 34 })
    poser(doc, { type: 'colonne', titre: 'Hôtels' }, { id: 'col', x: 40, y: 0 })
    poser(doc, { type: 'note', texte: texte('rangée') }, { id: 'n2', parent: 'col' })
    poser(doc, { type: 'ligne' }, { id: 'l1' })
    poser(doc, carte('Plan', 'Aller', 'Retour'), { id: 'a1' })
    poser(doc, { type: 'document', titre: 'Notes', texte: texte('Première ligne') }, { id: 'd1' })
    poser(doc, { type: 'document', titre: 'Jeté', texte: texte('') }, { id: 'd2', corbeille: 1 })
    const [toile, ...autres] = resumesDuTableau(lireTableau(doc))
    expect(toile).toMatchObject({ genre: 'toile', element: '', titre: 'Voyage', couleur: 'bleu' })
    expect(toile!.genre === 'toile' && toile!.boites.slice(0, 2)).toEqual([
      [2, 3, 34, 7, 'jaune'],
      [40, 0, 34, 6, 'colonne'],
    ])
    expect(autres).toEqual([
      { genre: 'arbre', element: 'a1', titre: 'Plan', branches: ['Retour', 'Aller'] },
      { genre: 'document', element: 'd1', titre: 'Notes', lignes: ['Première ligne'] },
    ])
  })
})

describe('GET /api/bibliotheque', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte
  const ecrire = (id: string, titre: string, remplir: (doc: Y.Doc) => void = () => {}) => {
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', titre)
    remplir(doc)
    m.base.enregistrerDocument(nomDuDocument(id), Y.encodeStateAsUpdate(doc))
    indexerDocument(m.base, id, doc)
  }
  const lire = async (c?: Compte) => {
    const r = await m.appeler('/api/bibliotheque', { compte: c })
    return r.status === 200 ? ((await r.json()) as Entree[]) : r.status
  }
  const cle = (e: Entree) => `${e.tableau}/${e.element ?? ''}`

  beforeAll(async () => {
    m = monde()
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    m.tableau(ana, 'voyage', 'Voyage', undefined, ana.utilisateur.racine)
    m.tableau(ana, 'etape', 'Étape', undefined, 'voyage')
    m.tableau(ana, 'secret', 'Secret')
    ecrire(ana.utilisateur.racine, 'Accueil', (d) => poser(d, carte('Idées'), { id: 'idees' }))
    ecrire('voyage', 'Voyage', (d) => poser(d, { type: 'document', titre: 'Budget', texte: texte('Train : 80 €') }, { id: 'budget' }))
    ecrire('etape', 'Étape', (d) => poser(d, carte('Lisbonne', 'Musées'), { id: 'lisbonne' }))
    ecrire('secret', 'Secret')
    m.base.definirAcces({ tableau: 'voyage', utilisateur: bob.utilisateur.id, role: 'lecture' })
  })
  afterAll(() => m.fermer())

  it('chaque toile (sauf l’accueil), carte et document, avec la toile qui le porte', async () => {
    const r = await lire(ana)
    expect(Array.isArray(r) && r.map(cle).sort()).toEqual([`${ana.utilisateur.racine}/idees`, 'etape/', 'etape/lisbonne', 'secret/', 'voyage/', 'voyage/budget'])
    const parCle = new Map((r as Entree[]).map((e) => [cle(e), e]))
    expect(parCle.get('voyage/')).toMatchObject({ genre: 'toile', titre: 'Voyage', ou: 'Accueil d’Ana', vu: null, favori: false, partage: false })
    expect(parCle.get('etape/lisbonne')).toMatchObject({ genre: 'arbre', titre: 'Lisbonne', ou: 'Étape', resume: { branches: ['Musées'] } })
    expect(parCle.get('voyage/budget')).toMatchObject({ genre: 'document', titre: 'Budget', ou: 'Voyage', resume: { lignes: ['Train : 80 €'] } })
  })

  it('ne rend que ce que le compte peut lire ; un partage le dit', async () => {
    const r = await lire(bob)
    expect(Array.isArray(r) && r.map(cle).sort()).toEqual(['etape/', 'etape/lisbonne', 'voyage/', 'voyage/budget'])
    const voyage = (r as Entree[]).find((e) => cle(e) === 'voyage/')
    // L'accueil d'Ana, Bob ne le lit pas : la toile ne dit pas où elle est posée.
    expect(voyage).toMatchObject({ partage: true, ou: null })
    expect(await lire()).toBe(401)
  })

  it('dit quand le compte a ouvert chaque toile et chaque élément, et ses favoris', async () => {
    m.base.definirFavori(ana.utilisateur.id, 'secret', 1)
    expect((await m.appeler('/api/tableaux/voyage/vu', { methode: 'POST', compte: ana })).status).toBe(204)
    expect((await m.appeler('/api/tableaux/etape/elements/lisbonne/vu', { methode: 'POST', compte: ana })).status).toBe(204)
    const r = (await lire(ana)) as Entree[]
    const parCle = new Map(r.map((e) => [cle(e), e]))
    expect(parCle.get('voyage/')!.vu).toEqual(expect.any(Number))
    expect(parCle.get('etape/lisbonne')!.vu).toEqual(expect.any(Number))
    expect(parCle.get('voyage/budget')!.vu).toBeNull()
    expect(parCle.get('secret/')!.favori).toBe(true)
  })

  it('n’ouvre que les cartes et documents qui existent, sur une toile qu’on lit', async () => {
    expect((await m.appeler('/api/tableaux/voyage/elements/inconnu/vu', { methode: 'POST', compte: ana })).status).toBe(404)
    expect((await m.appeler('/api/tableaux/secret/elements/idees/vu', { methode: 'POST', compte: ana })).status).toBe(404)
    expect((await m.appeler('/api/tableaux/secret/elements/x/vu', { methode: 'POST', compte: bob })).status).toBe(404)
    expect((await m.appeler('/api/tableaux/voyage/elements/budget/vu', { methode: 'POST' })).status).toBe(401)
  })

  it('suit les changements du document : une carte jetée part', async () => {
    ecrire('etape', 'Étape', (d) => poser(d, carte('Lisbonne'), { id: 'lisbonne', corbeille: 1 }))
    const r = (await lire(ana)) as Entree[]
    expect(r.map(cle)).not.toContain('etape/lisbonne')
  })

  it('ne garde que les éléments ouverts les plus récents', () => {
    for (let i = 0; i < ELEMENTS_VUS_GARDES + 3; i++) m.base.noterElementVu(ana.utilisateur.id, 'voyage', `e${i}`, Date.now() + 1000 + i)
    const gardes = m.base.vus(ana.utilisateur.id).filter((v) => v.element !== '')
    expect(gardes).toHaveLength(ELEMENTS_VUS_GARDES)
    expect(gardes[0]!.element).toBe(`e${ELEMENTS_VUS_GARDES + 2}`)
  })
})
