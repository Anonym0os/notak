import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ELEMENTS_VUS_GARDES } from './base.ts'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'
import { indexerDocument } from './indexation.ts'
import { AUCUN_CHANGEMENT } from './rangement.ts'
import { lireTableau, resumesDuTableau } from './contenu.ts'
import { nomDuDocument } from './synchro.ts'

type Entree = { tableau: string; element: string | null; genre: string; titre: string; ou: string | null; dans: string | null; vu: number | null; favori: boolean; partage: boolean; resume: unknown }

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
      [2, 3, 34, 7, 'jaune', 'note', 1],
      [40, 0, 34, 15, '', 'colonne', 1],
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
    expect(Array.isArray(r) && r.map(cle).sort()).toEqual([`${ana.utilisateur.racine}/idees`, 'etape/', 'etape/lisbonne', 'secret/', 'voyage/', 'voyage/budget'].sort())
    const parCle = new Map((r as Entree[]).map((e) => [cle(e), e]))
    expect(parCle.get('voyage/')).toMatchObject({ genre: 'toile', titre: 'Voyage', ou: 'Accueil d’Ana', dans: ana.utilisateur.racine, vu: null, favori: false, partage: false })
    expect(parCle.get('etape/lisbonne')).toMatchObject({ genre: 'arbre', titre: 'Lisbonne', ou: 'Étape', dans: 'etape', resume: { branches: ['Musées'] } })
    expect(parCle.get('voyage/budget')).toMatchObject({ genre: 'document', titre: 'Budget', ou: 'Voyage', resume: { lignes: ['Train : 80 €'] } })
  })

  it('ne rend que ce que le compte peut lire ; un partage le dit', async () => {
    const r = await lire(bob)
    expect(Array.isArray(r) && r.map(cle).sort()).toEqual(['etape/', 'etape/lisbonne', 'voyage/', 'voyage/budget'])
    const voyage = (r as Entree[]).find((e) => cle(e) === 'voyage/')
    // L'accueil d'Ana, Bob ne le lit pas : la toile ne dit pas où elle est posée.
    expect(voyage).toMatchObject({ partage: true, ou: null, dans: null })
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

  it('ce que le compte a ajouté ou changé compte comme ouvert : une photo posée sur une toile vient dans les récents', async () => {
    ecrire('etape', 'Étape', (d) => {
      poser(d, carte('Lisbonne', 'Musées'), { id: 'lisbonne' })
      poser(d, { type: 'image', fichier: 'f-tram', largeurOrigine: 30, hauteurOrigine: 40 }, { id: 'tram' })
      poser(d, { type: 'image', fichier: 'f-fado', largeurOrigine: 30, hauteurOrigine: 40 }, { id: 'fado' })
      poser(d, { type: 'tableau', cible: 'secret' }, { id: 'carte-secret' })
    })
    const geste = (auteur: Compte, element: string, typeElement: string, genre: 'cree' | 'modifie' | 'supprime', instant: number) =>
      m.base.noterActivite({ tableau: 'etape', auteur: auteur.utilisateur.id, genre, element, typeElement, libelle: '', instant }, 0)
    // Dans le passé : les essais suivants comptent sur des ouvertures plus récentes que celles-ci.
    const avant = Date.now() - 600_000
    geste(ana, 'tram', 'image', 'cree', avant + 1)
    // Ce qu'un autre a posé, et ce qu'Ana a jeté, ne comptent pas pour elle.
    geste(bob, 'fado', 'image', 'cree', avant + 2)
    geste(ana, 'fado', 'image', 'supprime', avant + 3)
    const lu = async () => new Map(((await (await m.appeler('/api/bibliotheque?genres=image,arbre', { compte: ana })).json()) as Entree[]).map((e) => [cle(e), e]))
    let r = await lu()
    expect(r.get('etape/tram')!.vu).toBe(avant + 1)
    expect(r.get('etape/fado')!.vu).toBeNull()
    // La toile est récente de ce qu'Ana y a fait.
    expect(r.get('etape/')!.vu).toBe(avant + 1)
    // Y ranger une toile (sa carte) ne la rend pas récente ; la renommer, si.
    geste(ana, 'carte-secret', 'tableau', 'cree', avant + 4)
    r = await lu()
    expect(r.get('etape/')!.vu).toBe(avant + 1)
    geste(ana, '', 'tableau', 'modifie', avant + 5)
    r = await lu()
    expect(r.get('etape/')!.vu).toBe(avant + 5)
    // L'ouverture la plus récente l'emporte sur un geste plus ancien.
    m.base.noterElementVu(ana.utilisateur.id, 'etape', 'tram', avant + 9)
    r = await lu()
    expect(r.get('etape/tram')!.vu).toBe(avant + 9)
    // Les récents de Bob ne sont pas ceux d'Ana.
    const deBob = new Map(((await (await m.appeler('/api/bibliotheque?genres=image', { compte: bob })).json()) as Entree[]).map((e) => [cle(e), e]))
    expect(deBob.get('etape/fado')!.vu).toBe(avant + 2)
    expect(deBob.get('etape/tram')!.vu).toBeNull()
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

  it('une toile est dans celle qui porte sa carte ; sa carte jetée, elle part avec ce qu’elle contient', async () => {
    ecrire('etape', 'Étape', (d) => poser(d, carte('Lisbonne'), { id: 'lisbonne' }))
    // « Étape » a été créée dans « Voyage », puis sa carte glissée sur l'accueil.
    ecrire(ana.utilisateur.racine, 'Accueil', (d) => poser(d, { type: 'tableau', cible: 'etape' }, { id: 'carte-etape' }))
    let r = (await lire(ana)) as Entree[]
    expect(r.find((e) => cle(e) === 'etape/')).toMatchObject({ dans: ana.utilisateur.racine })
    expect(r.find((e) => cle(e) === 'etape/')!.resume).not.toHaveProperty('cartes')
    ecrire(ana.utilisateur.racine, 'Accueil', (d) => poser(d, { type: 'tableau', cible: 'etape' }, { id: 'carte-etape', corbeille: 1 }))
    r = (await lire(ana)) as Entree[]
    expect(r.map(cle)).not.toContain('etape/')
    expect(r.map(cle)).not.toContain('etape/lisbonne')
    expect(r.map(cle)).toContain('voyage/')
  })

  it('les photos, liens et fichiers, seulement si on les demande : une app d’avant ne reçoit que ce qu’elle sait montrer', async () => {
    ecrire('voyage', 'Voyage', (d) => {
      poser(d, { type: 'document', titre: 'Budget', texte: texte('Train : 80 €') }, { id: 'budget' })
      poser(d, { type: 'image', fichier: 'f-port', largeurOrigine: 40, hauteurOrigine: 30, legende: 'Le port' }, { id: 'port' })
      poser(d, { type: 'lien', url: 'https://exemple.fr', statut: 'pret', apercu: { titre: 'Exemple' } }, { id: 'site' })
      poser(d, { type: 'fichier', fichier: 'f-devis', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 12 }, { id: 'devis' })
    })
    const avant = (await lire(ana)) as Entree[]
    expect(avant.map((e) => e.genre).filter((g) => !['toile', 'arbre', 'document'].includes(g))).toEqual([])
    const r = await m.appeler('/api/bibliotheque?genres=image,lien,fichier', { compte: ana })
    const tous = (await r.json()) as Entree[]
    const parCle = new Map(tous.map((e) => [cle(e), e]))
    expect(parCle.get('voyage/port')).toMatchObject({ genre: 'image', titre: 'Le port', ou: 'Voyage', resume: { fichier: 'f-port' } })
    expect(parCle.get('voyage/site')).toMatchObject({ genre: 'lien', titre: 'Exemple', resume: { url: 'https://exemple.fr' } })
    expect(parCle.get('voyage/devis')).toMatchObject({ genre: 'fichier', titre: 'devis.pdf', resume: { typeMime: 'application/pdf' } })
    // Les toiles viennent toujours ; ce qu'on n'a pas demandé, non.
    expect(tous.map(cle)).toContain('voyage/')
    expect(tous.map(cle)).not.toContain('voyage/budget')
  })

  it('un élément en favori : la photo, la page ; pas ce qui n’est pas sur la toile', async () => {
    const favori = (id: string, el: string, methode: 'PUT' | 'DELETE', c: Compte | null = ana) =>
      m.appeler(`/api/tableaux/${id}/elements/${el}/favori`, { methode, compte: c ?? undefined })
    expect((await favori('voyage', 'port', 'PUT')).status).toBe(204)
    expect((await favori('voyage', 'budget', 'PUT')).status).toBe(204)
    expect((await favori('voyage', 'inconnu', 'PUT')).status).toBe(404)
    expect((await favori('secret', 'x', 'PUT', bob)).status).toBe(404)
    expect((await favori('voyage', 'port', 'PUT', null)).status).toBe(401)
    const lu = async () => new Map(((await (await m.appeler('/api/bibliotheque?genres=image,document,arbre', { compte: ana })).json()) as Entree[]).map((e) => [cle(e), e]))
    let r = await lu()
    expect(r.get('voyage/port')!.favori).toBe(true)
    expect(r.get('voyage/budget')!.favori).toBe(true)
    expect(r.get('voyage/')!.favori).toBe(false)
    // Le favori d'Ana n'est pas celui de Bob.
    const deBob = (await lire(bob)) as Entree[]
    expect(deBob.find((e) => cle(e) === 'voyage/budget')!.favori).toBe(false)
    expect((await favori('voyage', 'port', 'DELETE')).status).toBe(204)
    r = await lu()
    expect(r.get('voyage/port')!.favori).toBe(false)
  })

  it('ne garde que les éléments ouverts les plus récents', () => {
    for (let i = 0; i < ELEMENTS_VUS_GARDES + 3; i++) m.base.noterElementVu(ana.utilisateur.id, 'voyage', `e${i}`, Date.now() + 1000 + i)
    const gardes = m.base.vus(ana.utilisateur.id).filter((v) => v.element !== '')
    expect(gardes).toHaveLength(ELEMENTS_VUS_GARDES)
    expect(gardes[0]!.element).toBe(`e${ELEMENTS_VUS_GARDES + 2}`)
  })
})

describe('PUT /api/tableaux/:id/parent', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte
  let cle: Compte
  const ranger = (c: Compte, id: string, json: Record<string, unknown>) => m.appeler(`/api/tableaux/${id}/parent`, { methode: 'PUT', compte: c, json })
  const roleDe = (c: Compte, id: string) => m.autorisation.roleSur(`user:${c.utilisateur.id}`, id)
  const fermetures: string[] = []

  beforeAll(async () => {
    m = monde({ fermetures })
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    cle = await m.compte('Cléo')
    const accueil = ana.utilisateur.racine
    m.tableau(ana, 'projets', 'Projets', undefined, accueil)
    m.tableau(ana, 'equipe', 'Équipe', undefined, accueil)
    m.tableau(ana, 'idee', 'Idée', undefined, accueil)
    m.tableau(ana, 'detail', 'Détail', undefined, 'idee')
    m.base.definirAcces({ tableau: 'equipe', utilisateur: bob.utilisateur.id, role: 'edition' })
    m.base.definirAcces({ tableau: 'projets', utilisateur: cle.utilisateur.id, role: 'lecture' })
  })
  afterAll(() => m.fermer())

  it('compte qui gagnerait l’accès, sans rien ranger à l’essai', async () => {
    const r = await ranger(ana, 'idee', { parent: 'equipe', essai: true })
    expect(await r.json()).toEqual({ ...AUCUN_CHANGEMENT, nouveaux: 1, fait: false })
    expect(m.base.tableau('idee')!.parent).toBe(ana.utilisateur.racine)
    const prudent = await ranger(ana, 'idee', { parent: 'equipe', siPersonne: true })
    expect(await prudent.json()).toEqual({ ...AUCUN_CHANGEMENT, nouveaux: 1, fait: false })
  })

  it('range la toile : ses accès hérités et ceux de ce qu’elle contient suivent', async () => {
    expect(await roleDe(bob, 'detail')).toBeNull()
    const r = await ranger(ana, 'idee', { parent: 'equipe' })
    expect(await r.json()).toEqual({ ...AUCUN_CHANGEMENT, nouveaux: 1, fait: true })
    expect(m.base.tableau('idee')!.parent).toBe('equipe')
    expect(await roleDe(bob, 'detail')).toBe('edition')
    // Rangée ailleurs, elle quitte ceux d'avant : Bob la perd, Cléo la gagne.
    expect(await (await ranger(ana, 'idee', { parent: 'projets' })).json()).toEqual({ ...AUCUN_CHANGEMENT, nouveaux: 1, perdus: 1, fait: true })
    expect(await roleDe(bob, 'detail')).toBeNull()
    expect(await roleDe(cle, 'detail')).toBe('lecture')
    expect(m.base.tableau('idee')!.parent).toBe('projets')
  })

  it('ferme les synchros de la toile et de ce qu’elle contient : l’éditeur venu de l’ancien parent y relit son rôle', async () => {
    m.tableau(ana, 'chantier', 'Chantier', undefined, 'equipe')
    m.tableau(ana, 'plan-chantier', 'Plan', undefined, 'chantier')
    expect(await roleDe(bob, 'plan-chantier')).toBe('edition')
    fermetures.length = 0
    expect((await ranger(ana, 'chantier', { parent: 'projets' })).status).toBe(200)
    expect(fermetures).toEqual(expect.arrayContaining([nomDuDocument('chantier'), nomDuDocument('plan-chantier')]))
    expect(await roleDe(bob, 'chantier')).toBeNull()
    expect(await roleDe(bob, 'plan-chantier')).toBeNull()
  })

  it('refuse l’accueil, la toile dans elle-même ou dans ce qu’elle contient, et sans les droits', async () => {
    expect((await ranger(ana, ana.utilisateur.racine, { parent: 'projets' })).status).toBe(400)
    expect((await ranger(ana, 'idee', { parent: 'idee' })).status).toBe(400)
    expect((await ranger(ana, 'idee', { parent: 'detail' })).status).toBe(400)
    expect((await ranger(ana, 'idee', { parent: 'inconnue' })).status).toBe(404)
    // Bob écrit dans « Équipe », mais ne possède pas « Projets » ; Cléo ne fait que lire « Projets ».
    expect((await ranger(bob, 'equipe', { parent: 'idee' })).status).toBe(403)
    m.tableau(cle, 'a-cleo', 'À Cléo', undefined, cle.utilisateur.racine)
    expect((await ranger(cle, 'a-cleo', { parent: 'projets' })).status).toBe(403)
    expect((await ranger(bob, 'idee', { parent: 'equipe' })).status).toBe(404)
  })
})
