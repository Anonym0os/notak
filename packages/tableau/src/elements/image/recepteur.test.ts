import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { type Magasin, creerMagasin } from '../../coeur/magasin'
import { creerMagasinYjs } from '../../coeur/magasinYjs'
import type { Element, Image, Operation } from '../../coeur/tableau'
import type { ContexteToile, DepotFichiers } from '../types'
import { fichier, heic, jpeg, octets, png } from './fauxOctets'

const avis = vi.hoisted(() => ({ annonces: [] as string[] }))
vi.mock('../../avis', () => ({ annoncer: (a: { texte: string }) => void avis.annonces.push(a.texte) }))
// Les couleurs demandent un vrai décodage : ici, chaque image en a une, quand `palette.lue` le permet.
const palette = vi.hoisted(() => ({ lue: Promise.resolve() }))
vi.mock('./palette', () => ({ lirePalette: vi.fn(async () => (await palette.lue, ['#aa0000'])), paletteDe: vi.fn(() => ['#aa0000']) }))
// Réduire une photo demande une vraie toile : ici, la copie réduite est un objet, et son aperçu un petit fichier.
const reduction = vi.hoisted(() => ({ lues: [] as { taille: number; cote: number }[] }))
vi.mock('./lecture', async (original) => ({
  ...(await original<typeof import('./lecture')>()),
  lireReduite: vi.fn(async (f: Blob, cote: number) => (reduction.lues.push({ taille: f.size, cote }), { toile: f.size })),
  enApercu: vi.fn(async () => new Blob(['aperçu'], { type: 'image/jpeg' })),
  viderToile: vi.fn(),
}))

const { recevoirImages, remplacerImage } = await import('./recepteur')
const { copieLocale } = await import('../envois')
const { COTE_APERCU } = await import('./lecture')
const { lirePalette, paletteDe } = await import('./palette')

/** Les couleurs ne se lisent qu'à l'appel de la fonction rendue. */
function retenirCouleurs() {
  let lacher = () => {}
  palette.lue = new Promise((fin) => (lacher = fin))
  return lacher
}

function contexte(largeurVue = 1440, magasin: Magasin = creerMagasin({ titre: 'Toile', elements: [] })) {
  const envoyes: string[] = []
  const depot: DepotFichiers = {
    enregistrer: async (f) => {
      envoyes.push((f as File).name)
      return `recu-${envoyes.length}`
    },
    adresse: async () => null,
  }
  const ctx = { magasin, services: { fichiers: depot }, largeurVue: () => largeurVue } as unknown as ContexteToile
  return { ctx, magasin, envoyes }
}

const recus = (...fichiers: File[]) => ({ files: fichiers }) as unknown as DataTransfer
const crees = (ops: Operation[]) => ops.flatMap((op) => (op.type === 'creer' ? [op.element as Element<Image>] : []))
const couleursDe = (magasin: Magasin, id: string) => (magasin.lire().elements.find((e) => e.id === id)?.contenu as Image | undefined)?.couleurs
const photo = (nom = 'a.jpg') => fichier(jpeg(800, 600), nom, 'image/jpeg')

beforeEach(() => {
  avis.annonces = []
  palette.lue = Promise.resolve()
})

describe('recevoirImages', () => {
  it('pose plusieurs photos dans l’ordre reçu, une colonne chacune, aux proportions de l’écran (portrait d’iPhone compris)', async () => {
    const { ctx, envoyes } = contexte()
    const portrait = fichier(jpeg(4032, 3024, { orientation: 6 }), 'IMG_0001.jpg', 'image/jpeg', 1000)
    const paysage = fichier(jpeg(4032, 3024), 'IMG_0002.jpg', 'image/jpeg', 1000)
    const capture = fichier(png(1179, 2556), 'capture.png', 'image/png')
    const ops = (await recevoirImages(recus(portrait, paysage, capture), { x: 100, y: 50 }, ctx))!
    const [a, b, c] = crees(ops)
    expect([a, b, c].map((e) => [e!.contenu.largeurOrigine, e!.contenu.hauteurOrigine, e!.contenu.typeMime])).toEqual([
      [3024, 4032, 'image/jpeg'],
      [4032, 3024, 'image/jpeg'],
      [1179, 2556, 'image/png'],
    ])
    expect([a, b, c].map((e) => [e!.x, e!.y])).toEqual([
      [100, 50],
      [136, 50],
      [172, 50],
    ])
    expect(a!.contenu.transparente).toBe(false)
    await vi.waitFor(() => expect(envoyes).toEqual(['IMG_0001.jpg', 'IMG_0002.jpg', 'capture.png']))
  })

  it('range beaucoup de photos en colonnes sans qu’elles se chevauchent', async () => {
    const { ctx } = contexte(1080)
    const photos = Array.from({ length: 7 }, (_, i) => fichier(jpeg(i % 2 ? 4032 : 3024, i % 2 ? 3024 : 4032), `IMG_${i}.jpg`, 'image/jpeg'))
    const elements = crees((await recevoirImages(recus(...photos), { x: 0, y: 0 }, ctx))!)
    expect(elements).toHaveLength(7)
    const boites = elements.map((e) => ({ x: e.x, y: e.y, l: e.largeur, h: Math.round((e.largeur * e.contenu.hauteurOrigine) / e.contenu.largeurOrigine) }))
    for (const [i, p] of boites.entries())
      for (const q of boites.slice(i + 1)) expect(p.x < q.x + q.l && q.x < p.x + p.l && p.y < q.y + q.h && q.y < p.y + p.h, JSON.stringify([p, q])).toBe(false)
  })

  it('l’échec d’une photo ne fait pas tomber les autres, et tous les refus se disent en un avis', async () => {
    const { ctx, envoyes } = contexte()
    const bonne = fichier(jpeg(800, 600), 'bonne.jpg', 'image/jpeg')
    const illisible = fichier(octets('pas une image'), 'abimee.jpg', 'image/jpeg')
    // Sans décodeur HEIC (ici comme dans Chrome), la photo est refusée en le disant, jamais posée cassée.
    const photoHeic = fichier(heic(), 'IMG_0009.HEIC', 'image/heic')
    const ops = (await recevoirImages(recus(photoHeic, bonne, illisible), { x: 0, y: 0 }, ctx))!
    expect(crees(ops).map((e) => e.contenu.largeurOrigine)).toEqual([800])
    expect(avis.annonces).toEqual(['2 images n’ont pas été prises. « IMG_0009.HEIC » est une photo HEIC, que ce navigateur ne sait pas lire : posez-la depuis Safari ou l’app Notak, qui la convertissent, ou enregistrez-la en JPEG.'])
    await vi.waitFor(() => expect(envoyes).toEqual(['bonne.jpg']))
  })

  it('dit pourquoi une seule image n’est pas prise', async () => {
    const { ctx } = contexte()
    expect(await recevoirImages(recus(fichier(octets('GIF89a', [1, 0, 1, 0]), 'anim.gif', 'image/gif', 26 * 1024 * 1024)), { x: 0, y: 0 }, ctx)).toEqual([])
    expect(avis.annonces).toEqual(['« anim.gif » dépasse la taille maximale (25 Mo).'])
  })

  it('une grande photo se montre réduite le temps de son envoi ; une petite, telle quelle', async () => {
    reduction.lues = []
    const montrees = new Map<string, Blob>()
    const creer = URL.createObjectURL
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      const a = creer(b as Blob)
      montrees.set(a, b as Blob)
      return a
    })
    const { ctx } = contexte()
    // Des envois qui restent en route : l'aperçu sert le temps qu'ils durent.
    ctx.services.fichiers!.enregistrer = () => new Promise(() => {})
    const grande = fichier(jpeg(4032, 3024), 'IMG_0001.jpg', 'image/jpeg', 4000)
    const petite = fichier(jpeg(800, 600), 'petite.jpg', 'image/jpeg', 300)
    const [g, p] = crees((await recevoirImages(recus(grande, petite), { x: 0, y: 0 }, ctx))!)
    // La petite se montre aussitôt ; la grande attend son aperçu, qui ne la décode qu'une fois, à la taille voulue.
    expect(montrees.get(copieLocale(p!.contenu.fichier)!)!.size).toBe(petite.size)
    await vi.waitFor(() => expect(copieLocale(g!.contenu.fichier)).toBeDefined())
    expect(montrees.get(copieLocale(g!.contenu.fichier)!)!.size).toBe(new Blob(['aperçu']).size)
    expect(reduction.lues).toEqual([{ taille: grande.size, cote: COTE_APERCU }])
    vi.mocked(URL.createObjectURL).mockRestore()
  })

  it('les couleurs d’une grande photo se lisent sur sa copie réduite : elle n’est décodée qu’une fois', async () => {
    reduction.lues = []
    vi.mocked(lirePalette).mockClear()
    const { ctx, magasin } = contexte()
    const grande = fichier(jpeg(8064, 6048), 'IMG_0048.jpg', 'image/jpeg', 4000)
    const ops = (await recevoirImages(recus(grande), { x: 0, y: 0 }, ctx))!
    magasin.faire(ops)
    await vi.waitFor(() => expect(couleursDe(magasin, crees(ops)[0]!.id)).toEqual(['#aa0000']))
    expect(vi.mocked(paletteDe)).toHaveBeenCalledWith({ toile: grande.size })
    expect(lirePalette).not.toHaveBeenCalled()
    expect(reduction.lues).toHaveLength(1)
  })

  it('laisse les fichiers qui ne sont pas des images au récepteur des fichiers', () => {
    const { ctx } = contexte()
    expect(recevoirImages(recus(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })), { x: 0, y: 0 }, ctx)).toBeNull()
  })

  it('lit les couleurs après la naissance, hors de l’historique : défaire la pose la retire d’un seul pas', async () => {
    const { ctx, magasin } = contexte()
    const ops = (await recevoirImages(recus(fichier(jpeg(800, 600), 'a.jpg', 'image/jpeg')), { x: 0, y: 0 }, ctx))!
    const [e] = crees(ops)
    expect(e!.contenu.couleurs).toBeUndefined()
    // La toile pose ce que rendent les récepteurs un peu plus tard : les couleurs attendent l'élément.
    await new Promise((fin) => setTimeout(fin, 5))
    magasin.faire(ops)
    await vi.waitFor(() => expect((magasin.lire().elements[0]!.contenu as Image).couleurs).toEqual(['#aa0000']))
    expect(magasin.annuler()).toBe(true)
    expect(magasin.lire().elements).toEqual([])
  })

  // Le magasin d'une toile seule, et celui, partagé, de l'application : l'historique de l'un garde les opérations,
  // celui de l'autre ce qu'elles ont écrit.
  for (const [nom, nouveau] of [
    ['seul', () => creerMagasin({ titre: 'Toile', elements: [] })],
    ['partagé', () => creerMagasinYjs(new Y.Doc())],
  ] as const) {
    describe(`magasin ${nom}`, () => {
      it('rétablir la pose rend la photo avec ses couleurs', async () => {
        const { ctx, magasin } = contexte(1440, nouveau())
        const ops = (await recevoirImages(recus(photo()), { x: 0, y: 0 }, ctx))!
        const { id } = crees(ops)[0]!
        magasin.faire(ops)
        await vi.waitFor(() => expect(couleursDe(magasin, id)).toEqual(['#aa0000']))
        magasin.annuler()
        magasin.retablir()
        expect(couleursDe(magasin, id)).toEqual(['#aa0000'])
      })

      it('défaite avant que ses couleurs soient lues, la photo les a dès qu’on la rétablit, et les garde', async () => {
        const lacher = retenirCouleurs()
        const { ctx, magasin } = contexte(1440, nouveau())
        const ops = (await recevoirImages(recus(photo()), { x: 0, y: 0 }, ctx))!
        const { id } = crees(ops)[0]!
        magasin.faire(ops)
        magasin.annuler()
        lacher()
        await new Promise((fin) => setTimeout(fin, 5))
        magasin.retablir()
        await vi.waitFor(() => expect(couleursDe(magasin, id)).toEqual(['#aa0000']))
        magasin.annuler()
        magasin.retablir()
        expect(couleursDe(magasin, id)).toEqual(['#aa0000'])
      })

      it('les couleurs qui arrivent pendant qu’un geste défait attend n’empêchent pas de le refaire, et n’attendent pas', async () => {
        const lacher = retenirCouleurs()
        const { ctx, magasin } = contexte(1440, nouveau())
        const premiere = (await recevoirImages(recus(photo('a.jpg')), { x: 0, y: 0 }, ctx))!
        magasin.faire(premiere)
        magasin.faire([{ type: 'creer', element: { id: 'note', x: 40, y: 0, largeur: 10, contenu: { type: 'image', fichier: 'f', largeurOrigine: 10, hauteurOrigine: 10 } } }])
        magasin.annuler()
        lacher()
        await vi.waitFor(() => expect(couleursDe(magasin, crees(premiere)[0]!.id)).toEqual(['#aa0000']))
        expect(magasin.retablir()).toBe(true)
        expect(magasin.lire().elements.map((e) => e.id)).toContain('note')
        // Défaire les deux gestes emporte aussi les couleurs avec la pose.
        expect(magasin.annuler()).toBe(true)
        expect(magasin.annuler()).toBe(true)
        expect(magasin.lire().elements).toEqual([])
      })
    })
  }
})

describe('remplacerImage', () => {
  it('le nouveau fichier prend la place de l’ancien : même place, même largeur, même légende, ses propres proportions', async () => {
    const { ctx, magasin } = contexte()
    const ancienne: Element<Image> = { id: 'img', x: 5, y: 6, largeur: 20, contenu: { type: 'image', fichier: 'f', largeurOrigine: 400, hauteurOrigine: 300, legende: 'Plage', couleurs: ['#000000'] } }
    magasin.faire([{ type: 'creer', element: ancienne }])
    const ops = await remplacerImage(ancienne, fichier(jpeg(4032, 3024, { orientation: 6 }), 'IMG_0010.jpg', 'image/jpeg'), ctx)
    expect(ops).toHaveLength(1)
    const apres = (ops[0] as Extract<Operation, { type: 'contenu' }>).apres as Image
    expect([apres.largeurOrigine, apres.hauteurOrigine, apres.legende, apres.couleurs]).toEqual([3024, 4032, 'Plage', undefined])
    magasin.faire(ops)
    await vi.waitFor(() => expect((magasin.lire().elements[0]!.contenu as Image).couleurs).toEqual(['#aa0000']))
    // Défaire rend l'ancienne photo et ses couleurs ; refaire, la nouvelle avec les siennes.
    magasin.annuler()
    expect(couleursDe(magasin, 'img')).toEqual(['#000000'])
    magasin.retablir()
    expect(couleursDe(magasin, 'img')).toEqual(['#aa0000'])
  })

  it('une photo refusée ne remplace rien', async () => {
    const { ctx } = contexte()
    const ancienne: Element<Image> = { id: 'img', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: 'f', largeurOrigine: 400, hauteurOrigine: 300 } }
    expect(await remplacerImage(ancienne, fichier(heic(), 'IMG.HEIC', 'image/heic'), ctx)).toEqual([])
    expect(avis.annonces).toHaveLength(1)
  })
})
