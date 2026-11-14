import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demandeDuChemin, injecter, inventaire, nomDeLElement } from './apercuLien.ts'
import { FONDS_NOTE, MARQUE, MARQUE_BOITE, svgDeLaCarte } from './carteApercu.ts'
import { type Compte, type Monde, ORIGINE_ESSAI, monde, poser, texte } from './essai.ts'
import { couper, dessinable, equilibrer, lier, manquants, mesurer, police } from './police.ts'

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte
let web: string
let idPhoto: string
const PIEGE = '"><script>alert(1)</script>'

/** Les balises Open Graph et Twitter d'une page, par nom. */
const balisesDe = (html: string): Record<string, string> => {
  const sortie: Record<string, string> = {}
  for (const [, nom, valeur] of html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)" \/>/g)) sortie[nom!] = valeur!
  const titre = /<title>([^<]*)<\/title>/.exec(html)
  if (titre) sortie.title = titre[1]!
  return sortie
}
const page = async (chemin: string) => {
  const r = await m.appelerBrut(chemin, { headers: { 'user-agent': 'facebookexternalhit/1.1' } })
  const html = await r.text()
  return { r, html, b: balisesDe(html) }
}
/** Ce qu'une page dit d'elle, hors de sa propre adresse (`og:url`) : deux pages génériques disent la même chose. */
const sansAdresse = (b: Record<string, string>) => {
  const { 'og:url': _u, ...reste } = b
  return reste
}
const lien = async (tableau: string, corps: Record<string, unknown> = {}) => {
  const r = await m.appeler(`/api/tableaux/${tableau}/liens`, { compte: ana, json: corps })
  expect(r.status).toBe(201)
  return (await r.json()) as { id: string; jeton: string }
}
const reglage = (c: Compte | undefined, tableau: string, json?: unknown) =>
  m.appeler(`/api/tableaux/${tableau}/apercu-lien`, { ...(c ? { compte: c } : {}), ...(json !== undefined ? { methode: 'PUT', json } : {}) })

beforeAll(async () => {
  web = mkdtempSync(join(tmpdir(), 'notak-web-'))
  copyFileSync(new URL('../../web/index.html', import.meta.url), join(web, 'index.html'))
  m = monde({ dossierWeb: web })
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
  const photo = await sharp({ create: { width: 640, height: 420, channels: 3, background: '#3a76df' } })
    .png()
    .toBuffer()
  idPhoto = ((await (await m.appeler('/api/fichiers', { compte: ana, corps: new Uint8Array(photo), type: 'image/png' })).json()) as { id: string }).id
  m.tableau(ana, 'tableau-carnet', 'Carnet de voyage', (doc) => {
    poser(doc, { type: 'note', texte: texte('Le texte secret de la première note, à ne pas montrer sur /t/') }, { id: 'note-1', x: 0, y: 0 })
    poser(doc, { type: 'document', titre: 'Plan du séjour', texte: texte('Jour 1') }, { id: 'doc-1', x: 40, y: 0 })
    poser(doc, { type: 'image', fichier: idPhoto, largeurOrigine: 640, hauteurOrigine: 420, legende: 'Kyoto' }, { id: 'img-1', x: 0, y: 20, largeur: 30 })
    poser(doc, { type: 'note', texte: texte('Jetée') }, { id: 'note-jetee', corbeille: 5 })
  })
  m.tableau(ana, 'tableau-piege', PIEGE)
  m.tableau(ana, 'tableau-coffre', 'Coffre fort', (doc) => void poser(doc, { type: 'note', texte: texte('Dans le coffre') }))
  m.tableau(ana, 'tableau-fils', 'Sous le coffre', undefined, 'tableau-coffre')
  m.base.definirAcces({ tableau: 'tableau-carnet', utilisateur: bob.utilisateur.id, role: 'edition' })
  expect((await m.appeler('/api/tableaux/tableau-coffre/mot-de-passe', { compte: ana, methode: 'PUT', json: { motDePasse: 'sésame ouvre-toi' } })).status).toBe(204)
})
afterAll(() => {
  m.fermer()
  rmSync(web, { recursive: true, force: true })
})

describe('les balises de la page, selon son adresse', () => {
  it('l’accueil : l’aperçu de Notak, que les moteurs peuvent lire', async () => {
    const { r, b } = await page('/')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/html')
    expect(r.headers.get('x-robots-tag')).toBeNull()
    expect(b.title).toBe('Notak')
    expect(b['og:title']).toBe('Notak')
    expect(b['og:site_name']).toBe('Notak')
    expect(b['og:locale']).toBe('fr_FR')
    expect(b['og:type']).toBe('website')
    expect(b['og:url']).toBe(`${ORIGINE_ESSAI}/`)
    expect(b['og:image']).toMatch(new RegExp(`^${ORIGINE_ESSAI}/api/apercu-lien/marque\\.png\\?v=[\\w-]{16}$`))
    expect([b['og:image:width'], b['og:image:height'], b['og:image:type']]).toEqual(['1200', '630', 'image/png'])
    expect(b['og:image:alt']).toBeTruthy()
    expect(b['twitter:card']).toBe('summary_large_image')
    expect(b['twitter:image']).toBe(b['og:image'])
    expect(b.description).toBe(b['og:description'])
    // Une seule fois chaque balise, et le reste de la page intact.
    const { html } = await page('/index.html')
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).toContain('<link rel="apple-touch-icon" href="/icones/eclat/apple-touch-180.png" />')
    expect(html).toContain('<script type="module"')
  })

  it('une autre page de l’app reçoit aussi l’aperçu de Notak', async () => {
    const { r, b } = await page('/connexion')
    expect(r.status).toBe(200)
    expect(b['og:title']).toBe('Notak')
  })

  it('une toile : son nom, jamais son contenu, et aucun moteur ne l’indexe', async () => {
    const { r, html, b } = await page('/t/tableau-carnet')
    expect(r.headers.get('x-robots-tag')).toBe('noindex')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(b['og:title']).toBe('Carnet de voyage')
    expect(b['og:description']).toBe('Une toile partagée sur Notak. Son contenu est réservé aux personnes qui y ont accès.')
    expect(b['og:image']).toMatch(/\/api\/apercu-lien\/t\/tableau-carnet\.png\?v=/)
    expect(b.robots).toBe('noindex')
    // L'onglet ne garde pas le nom d'une toile que l'app quitterait sans le changer.
    expect(b.title).toBe('Notak')
    for (const contenu of ['texte secret', 'Plan du séjour', 'Kyoto', 'Jour 1']) expect(html).not.toContain(contenu)
  })

  it('un élément ouvert en grand : son nom, et la toile où il est', async () => {
    const { b, html } = await page('/t/tableau-carnet/e/doc-1')
    expect(b['og:title']).toBe('Plan du séjour')
    expect(b['og:description']).toContain('Dans « Carnet de voyage »')
    expect(b['og:image']).toMatch(/\/api\/apercu-lien\/t\/tableau-carnet\/e\/doc-1\.png\?v=/)
    expect(html).not.toContain('Jour 1')
    // Une note n'a que son texte, qui est son contenu : elle se dit « Une note ».
    const note = await page('/t/tableau-carnet/e/note-1')
    expect(note.b['og:title']).toBe('Une note')
    expect(note.html).not.toContain('texte secret')
  })

  it('une toile ou un élément qui n’existent pas, ou un élément jeté : l’aperçu générique, sans le nom de la toile', async () => {
    const generique = sansAdresse((await page('/t/tableau-inconnu')).b)
    expect(generique['og:title']).toBe('Une toile Notak')
    expect(generique['og:image']).toMatch(/\/api\/apercu-lien\/toile\.png\?v=/)
    for (const chemin of ['/t/tableau-carnet/e/inconnu', '/t/tableau-carnet/e/note-jetee', '/t/%E0%A4%A', '/t/tableau-carnet/e/%3Cb%3E']) {
      const { r, html, b } = await page(chemin)
      expect(r.status, chemin).toBe(200)
      expect(sansAdresse(b), chemin).toEqual(generique)
      expect(html, chemin).not.toContain('Carnet')
    }
  })

  it('une toile protégée par un mot de passe, et ce qu’elle contient, ne disent pas leur nom', async () => {
    for (const chemin of ['/t/tableau-coffre', '/t/tableau-fils']) {
      const { html, b } = await page(chemin)
      expect(b['og:title'], chemin).toBe('Une toile Notak')
      expect(html, chemin).not.toMatch(/Coffre fort|Sous le coffre/)
    }
  })

  it('un nom piégé est échappé partout où il paraît', async () => {
    const { html, b } = await page('/t/tableau-piege')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(b['og:title']).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    // Son image le dessine en tracés : aucun texte du titre n'entre dans le SVG.
    const svg = svgDeLaCarte({ genre: 'toile', nom: 'Notak', hote: 'notak.essai', titre: PIEGE, description: PIEGE, pastille: PIEGE })
    expect(svg).not.toContain('script')
  })

  it('l’invitation : son jeton reste après #, l’aperçu ne nomme personne', async () => {
    const { r, b } = await page('/invitation')
    expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    expect(r.headers.get('x-robots-tag')).toBe('noindex')
    expect(b['og:title']).toBe('On vous invite sur une toile Notak')
    expect(b['og:image']).toMatch(/\/api\/apercu-lien\/invitation\.png\?v=/)
  })
})

describe('le lien visiteur', () => {
  it('valide : le titre, un extrait du texte, et le plan de la toile avec ses photos', async () => {
    const { jeton } = await lien('tableau-carnet')
    const { r, html, b } = await page(`/p/${jeton}`)
    expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    expect(r.headers.get('x-robots-tag')).toBe('noindex')
    expect(b.robots).toBe('noindex')
    expect(b.title).toBe('Carnet de voyage · Notak')
    expect(b['og:title']).toBe('Carnet de voyage')
    expect(b['og:description']).toBe('Le texte secret de la première note, à ne pas montrer sur /t/')
    expect(b['og:url']).toBe(`${ORIGINE_ESSAI}/p/${jeton}`)
    expect(b['og:image']).toMatch(new RegExp(`/api/apercu-lien/p/${jeton}\\.jpg\\?v=`))
    expect(b['og:image:type']).toBe('image/jpeg')
    expect(html).not.toContain('Jetée')
  })

  it('inconnu, échu, révoqué, protégé : le même aperçu générique, qui ne dit pas lequel', async () => {
    const echu = await lien('tableau-carnet', { expire: m.maintenant() + 60_000 })
    const revoque = await lien('tableau-carnet')
    const ferme = await lien('tableau-carnet', { motDePasse: 'lecture seule' })
    const coffre = await lien('tableau-coffre')
    m.avancer(120_000)
    expect((await m.appeler(`/api/tableaux/tableau-carnet/liens/${revoque.id}`, { compte: ana, methode: 'DELETE' })).status).toBe(204)
    const vus = []
    for (const jeton of ['inconnu-inconnu-inconnu', 'court', echu.jeton, revoque.jeton, ferme.jeton, coffre.jeton]) {
      const { r, html, b } = await page(`/p/${jeton}`)
      expect(r.status, jeton).toBe(200)
      expect(r.headers.get('referrer-policy'), jeton).toBe('no-referrer')
      expect(html, jeton).not.toMatch(/Carnet|Coffre|secret/)
      expect(b['og:image'], jeton).not.toContain(jeton)
      vus.push(sansAdresse(b))
    }
    for (const v of vus) expect(v).toEqual(vus[0])
    expect(vus[0]!['og:title']).toBe('Une toile Notak')
  })
})

describe('le nom dans l’aperçu, réglé au partage', () => {
  it('se lit par qui ouvre la toile ; seul qui gère le partage le change', async () => {
    expect(await (await reglage(bob, 'tableau-carnet')).json()).toEqual({ nom: true, modifiable: false })
    expect(await (await reglage(ana, 'tableau-carnet')).json()).toEqual({ nom: true, modifiable: true })
    expect((await reglage(undefined, 'tableau-carnet')).status).toBe(401)
    expect((await reglage(cleo, 'tableau-carnet')).status).toBe(404)
    expect((await reglage(bob, 'tableau-carnet', { nom: false })).status).toBe(403)
    expect((await reglage(cleo, 'tableau-carnet', { nom: false })).status).toBe(404)
    expect((await reglage(ana, 'tableau-carnet', { nom: 'non' })).status).toBe(400)
    expect((await reglage(ana, 'tableau-carnet', { nom: false, autre: 1 })).status).toBe(400)
    expect(m.base.nomMasque('tableau-carnet')).toBe(false)
  })

  it('décoché, la toile, ses éléments et ses liens visiteurs redeviennent génériques ; recoché, le nom revient', async () => {
    const { jeton } = await lien('tableau-carnet')
    const generiqueToile = sansAdresse((await page('/t/tableau-inconnu')).b)
    const generiqueLien = sansAdresse((await page('/p/inconnu-inconnu-inconnu')).b)
    const avant = (await page('/t/tableau-carnet')).b['og:image']
    expect(await (await reglage(ana, 'tableau-carnet', { nom: false })).json()).toEqual({ nom: false, modifiable: true })
    for (const chemin of ['/t/tableau-carnet', '/t/tableau-carnet/e/doc-1']) {
      const { html, b } = await page(chemin)
      expect(sansAdresse(b), chemin).toEqual(generiqueToile)
      expect(html, chemin).not.toMatch(/Carnet|Plan du séjour/)
    }
    const visiteur = await page(`/p/${jeton}`)
    expect(sansAdresse(visiteur.b)).toEqual(generiqueLien)
    // L'image de la toile, demandée à son adresse, ne dit plus son nom non plus : c'est celle du générique.
    const [image, generique] = await Promise.all([m.appelerBrut('/api/apercu-lien/t/tableau-carnet.png'), m.appelerBrut('/api/apercu-lien/toile.png')])
    expect(Buffer.from(await image.arrayBuffer()).equals(Buffer.from(await generique.arrayBuffer()))).toBe(true)
    expect((await reglage(ana, 'tableau-carnet', { nom: true })).status).toBe(200)
    expect((await page('/t/tableau-carnet')).b['og:image']).toBe(avant)
  })
})

describe('l’image de l’aperçu', () => {
  const lireImage = async (chemin: string) => {
    const r = await m.appelerBrut(chemin)
    const octets = Buffer.from(await r.arrayBuffer())
    return { r, octets, meta: r.status === 200 ? await sharp(octets).metadata() : null }
  }

  it('répond en PNG de 1200 × 630, de moins de 300 Ko, et se garde', async () => {
    for (const nom of ['marque', 'toile', 'lien', 'invitation', 't/tableau-carnet', 't/tableau-carnet/e/doc-1']) {
      const { r, octets, meta } = await lireImage(`/api/apercu-lien/${nom}.png`)
      expect(r.status, nom).toBe(200)
      expect(r.headers.get('content-type'), nom).toBe('image/png')
      expect([meta!.format, meta!.width, meta!.height], nom).toEqual(['png', 1200, 630])
      expect(octets.length, nom).toBeLessThan(300_000)
      expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    }
    const { b } = await page('/')
    const r = await m.appelerBrut(b['og:image']!.slice(ORIGINE_ESSAI.length))
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect((await m.appelerBrut('/api/apercu-lien/t/tableau-carnet.png')).headers.get('cache-control')).toBe('private, max-age=300')
  })

  it('celle d’un lien visiteur montre ses photos, en JPEG, sans rien dire à un autre site', async () => {
    const { jeton } = await lien('tableau-carnet')
    const { r, octets, meta } = await lireImage(`/api/apercu-lien/p/${jeton}.jpg`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/jpeg')
    expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    expect([meta!.format, meta!.width, meta!.height]).toEqual(['jpeg', 1200, 630])
    expect(octets.length).toBeLessThan(300_000)
  })

  it('un jeton ou une toile inconnus rendent l’image générique ; une adresse hors de ce qu’on sait faire, rien', async () => {
    const generique = Buffer.from(await (await m.appelerBrut('/api/apercu-lien/lien.png')).arrayBuffer())
    const inconnu = Buffer.from(await (await m.appelerBrut('/api/apercu-lien/p/inconnu-inconnu-inconnu.png')).arrayBuffer())
    expect(inconnu.equals(generique)).toBe(true)
    for (const chemin of ['/api/apercu-lien/autre.png', '/api/apercu-lien/marque.gif', '/api/apercu-lien/', '/api/apercu-lien/x/y.png']) {
      expect((await m.appelerBrut(chemin)).status, chemin).toBe(404)
    }
  })
})

describe('le texte des cartes', () => {
  const corps = { police: police('Inter-Regular.ttf'), taille: 26 }

  it('la police lit Inter : les chasses et l’approche des paires', () => {
    const p = police('Inter-Regular.ttf')
    expect(p.unites).toBe(2048)
    expect(p.glyphe('A'.codePointAt(0)!)).toBeGreaterThan(0)
    expect(p.glyphe(0x1f3a8)).toBe(0)
    // « AV » se rapproche plus que « AA » : l'approche de GPOS est lue.
    const [a, v] = ['A', 'V'].map((c) => p.glyphe(c.codePointAt(0)!)) as [number, number]
    expect(p.approche(a, v)).toBeLessThan(0)
    expect(mesurer(corps, 'AV')).toBeLessThan(mesurer(corps, 'AA'))
    expect(p.contours(a).length).toBeGreaterThan(0)
    // Une lettre accentuée est un glyphe composé : il a ses contours, ceux de la lettre et de l'accent.
    expect(p.contours(p.glyphe('É'.codePointAt(0)!)).length).toBeGreaterThan(p.contours(p.glyphe('E'.codePointAt(0)!)).length)
  })

  it('coupe aux espaces, garde les espaces insécables à la française, et finit par une ellipse', () => {
    expect(lier(' Voyage au  Japon — printemps : « oui » !\n')).toBe('Voyage au Japon — printemps : « oui » !')
    const lignes = couper(corps, 'Une très longue phrase qui ne tiendra jamais sur deux lignes étroites de cent quatre-vingts pixels', 180, 2)
    expect(lignes).toHaveLength(2)
    expect(lignes[1]!.endsWith('…')).toBe(true)
    for (const l of lignes) expect(mesurer(corps, l)).toBeLessThanOrEqual(180)
    expect(couper(corps, 'Court', 180, 2)).toEqual(['Court'])
    // Un mot plus long qu'une ligne se coupe à la lettre.
    expect(couper(corps, 'Anticonstitutionnellement', 120, 3).length).toBeGreaterThan(1)
    expect(manquants(corps, '🎨 Idées 日本')).toBe(3)
    expect(dessinable(corps, '🎨 Idées 日本 de couleurs ✨')).toBe('Idées de couleurs')
  })

  it('équilibre les lignes : pas de mot seul sur la dernière', () => {
    const titre = { police: police('Inter-Display-Bold.ttf'), taille: 64, interlettrage: -0.032 }
    const pleines = couper(titre, 'Lancement de la bêta', 548, 3)
    const equilibrees = equilibrer(titre, 'Lancement de la bêta', 548, 3)
    expect(pleines).toEqual(['Lancement de la', 'bêta'])
    expect(equilibrees).toHaveLength(2)
    expect(equilibrees.join(' ')).toBe('Lancement de la bêta')
    const ecart = (l: string[]) => Math.abs(mesurer(titre, l[0]!) - mesurer(titre, l[1]!))
    expect(ecart(equilibrees)).toBeLessThan(ecart(pleines))
    // Ce qui déborde garde son ellipse.
    expect(equilibrer(corps, 'un deux trois quatre cinq six sept huit neuf dix onze douze', 120, 2).at(-1)!.endsWith('…')).toBe(true)
  })

  it('les couleurs des notes et l’éclat restent ceux de l’app', () => {
    // Celles de la toile, que `note.css` décline (et dont un essai de la toile vérifie qu'elles égalent `FOND_NOTE`).
    const css = readFileSync(new URL('../../../packages/tableau/src/elements/note/note.css', import.meta.url), 'utf8')
    const declarees = Object.fromEntries([...css.matchAll(/--notak-note-([a-z_]+): (#[0-9a-f]{6});/g)].map(([, nom, valeur]) => [nom!, valeur!]))
    expect(FONDS_NOTE).toEqual(declarees)
    const fichier = readFileSync(new URL('../../web/public/icones/eclat/marque.svg', import.meta.url), 'utf8')
    expect(fichier).toContain(`d="${MARQUE}"`)
    expect(fichier).toContain(`viewBox="${MARQUE_BOITE[0]} ${MARQUE_BOITE[1]} ${MARQUE_BOITE[2]} ${MARQUE_BOITE[2]}"`)
  })
})

describe('ce que dit l’adresse', () => {
  it('reconnaît une toile, un élément, un lien visiteur, une invitation', () => {
    expect(demandeDuChemin('/t/abc')).toEqual({ genre: 'toile', tableau: 'abc' })
    expect(demandeDuChemin('/t/abc/')).toEqual({ genre: 'toile', tableau: 'abc' })
    expect(demandeDuChemin('/t/abc/e/def')).toEqual({ genre: 'toile', tableau: 'abc', element: 'def' })
    expect(demandeDuChemin('/p/jeton')).toEqual({ genre: 'visiteur', jeton: 'jeton' })
    expect(demandeDuChemin('/invitation')).toEqual({ genre: 'invitation' })
    expect(demandeDuChemin('/')).toEqual({ genre: 'marque' })
    expect(demandeDuChemin('/t/abc/e/def/autre')).toEqual({ genre: 'marque' })
  })

  it('nomme un élément comme la bibliothèque, et compte ce que porte la toile', () => {
    const el = (contenu: Record<string, unknown>) => ({ id: 'x', x: 0, y: 0, largeur: 10, contenu: contenu as { type: string } })
    expect(nomDeLElement(el({ type: 'document', titre: 'Plan' }))).toBe('Plan')
    expect(nomDeLElement(el({ type: 'document', titre: '' }))).toBe('Une page')
    expect(nomDeLElement(el({ type: 'note', texte: texte('secret') }))).toBe('Une note')
    expect(nomDeLElement(el({ type: 'arbre', sujets: { a: { titre: 'Central' }, b: { titre: 'Branche', parent: 'a' } } }))).toBe('Central')
    expect(nomDeLElement(el({ type: 'tableau', cible: 'autre', titre: 'Secret' }))).toBe('Une toile')
    expect(inventaire([el({ type: 'note' }), el({ type: 'note' }), el({ type: 'image' }), el({ type: 'ligne' })])).toEqual({ total: 3, phrase: '2 notes et 1 photo' })
    // Au-delà de trois genres, le reste se compte à part : la phrase ne prétend pas tout dire.
    const cinq = ['note', 'image', 'lien', 'document', 'table'].map((type) => el({ type }))
    expect(inventaire(cinq).phrase).toBe('1 note, 1 photo, 1 lien et 2 autres éléments')
    expect(inventaire([el({ type: 'table' })]).phrase).toBe('1 élément')
  })

  it('pose les balises à la place du titre, ou avant la fin de l’en-tête', () => {
    expect(injecter('<head><title>Notak</title></head>', '<title>X</title>')).toBe('<head><title>X</title></head>')
    expect(injecter('<head></head>', '<title>$&</title>')).toContain('<title>$&</title>')
  })
})
