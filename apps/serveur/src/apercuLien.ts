import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from 'hono'
import sharp from 'sharp'
import type { Base } from './base.ts'
import { type Carte, photosDuPlan, rendreLaCarte } from './carteApercu.ts'
import { type Cle, duDisque } from './chiffrement.ts'
import { type ElementLu, type TableauLu, resumesDuTableau, texteCherchable } from './contenu.ts'
import { fileDAttente } from './tailles.ts'

// L'aperçu d'un lien Notak : ce qu'iMessage, WhatsApp, Slack, Teams, Discord, LinkedIn, Signal ou un courriel montrent
// quand on y colle une adresse du serveur. Leur robot lit les balises Open Graph de la page, sans cookie ni session :
// la page (`index.html`) les reçoit ici, selon son adresse, et l'image vient de `/api/apercu-lien/…`.
//
// Ce que chaque adresse dit, et rien de plus :
// - `/t/<toile>` et `/t/<toile>/e/<élément>` (réservées aux comptes qui y ont accès) : le nom de la toile ou de
//   l'élément, que le propriétaire peut masquer (`base.nomMasque`), jamais leur contenu ;
// - `/p/<jeton>`, le lien visiteur, qui donne la lecture à qui l'a : le titre, un extrait, le plan de la toile, ses
//   photos ; un jeton inconnu, échu, révoqué ou protégé par un mot de passe n'en dit rien ;
// - `/invitation` : son jeton voyage après `#` et n'arrive jamais au serveur, l'aperçu ne peut donc nommer personne ;
// - le reste : l'aperçu de Notak.
// L'image d'une adresse se calcule par le même chemin que sa page : elle n'en dit jamais plus.

/** Change quand le dessin des cartes change : les plateformes, qui gardent une image par adresse, la redemandent. */
export const VERSION_CARTES = 1

const JETON_PUBLIC = /^[A-Za-z0-9_-]{16,64}$/
const IDENTIFIANT = /^[A-Za-z0-9_-]{1,64}$/

export interface Apercu {
  /** Le titre de la page (`<title>`). */
  titrePage: string
  /** Le titre et la description de l'aperçu. */
  titre: string
  description: string
  /** Ce que dit l'image, pour qui ne la voit pas. */
  alt: string
  /** L'adresse de l'image, sans l'origine ni l'extension : `marque`, `toile`, `lien`, `invitation`, `t/…`, `p/…`. */
  image: string
  carte: Omit<Carte, 'photos'>
  /** Les photos du plan, que l'image ira lire. */
  photos: { fichier: string; largeur: number; hauteur: number }[]
  /** La page porte un secret (`/p/`, `/invitation`) : rien ne le répète à un autre site. */
  secret: boolean
  /** Un moteur peut l'indexer : seulement l'accueil et les pages publiques de l'app. */
  indexable: boolean
}

export interface SourceApercus {
  base: Base
  /** Le nom de l'instance (`NOTAK_NOM`). */
  nom: string
  dossierWeb?: string
  dossierFichiers: string
  cle: Cle | null
  maintenant(): number
  /** Le tableau tel qu'il est enregistré (ou en direct). */
  lire(tableau: string): TableauLu
  /** Ce qu'un visiteur en voit (`vuePublique`, sans les fils de discussion). */
  vuePublique(tableau: string): { titre: string; couleur?: string; elements: ElementLu[] }
  /** Le lien ouvre-t-il encore son tableau, d'après OpenFGA (un blocage pour tous vaut aussi pour lui) ? */
  lienOuvre(jeton: string, tableau: string): Promise<boolean>
}

const nombre = (n: number) => n.toLocaleString('fr-FR')
const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`
const chaine = (v: unknown): string => (typeof v === 'string' ? v : '')
/** Un texte d'une ligne, au plus `n` caractères, coupé au mot. */
export function resserrer(texte: string, n: number): string {
  const t = texte.replace(/\s+/gu, ' ').trim()
  if ([...t].length <= n) return t
  const coupe = [...t].slice(0, n - 1).join('')
  const mot = coupe.lastIndexOf(' ')
  return `${(mot > n * 0.6 ? coupe.slice(0, mot) : coupe).replace(/[\s,;:.–—-]+$/u, '')}…`
}

/** Le tableau, ou l'un de ses parents, porte-t-il un mot de passe ? Son aperçu ne dit alors rien de lui. */
function protege(base: Base, tableau: string): boolean {
  const vus = new Set<string>()
  for (let t: string | null = tableau; t !== null && !vus.has(t); t = base.tableau(t)?.parent ?? null) {
    vus.add(t)
    if (base.motDePasse(t, 'tableau') !== null) return true
  }
  return false
}

/** Ce qu'est un élément, quand il n'a pas de nom à lui. */
const GENRES: Record<string, string> = {
  note: 'Une note',
  taches: 'Une liste de tâches',
  document: 'Une page',
  arbre: 'Une carte mentale',
  image: 'Une photo',
  lien: 'Un lien',
  fichier: 'Un fichier',
  colonne: 'Une colonne',
  tableau: 'Une toile',
  table: 'Une table',
  dessin: 'Un dessin',
  croquis: 'Un croquis',
  nuancier: 'Un nuancier',
  lieu: 'Un lieu',
  commentaire: 'Un commentaire',
}

/**
 * Le nom d'un élément, celui que la bibliothèque lui donne : le titre d'une page, d'une liste ou d'une colonne, le sujet
 * central d'une carte mentale, la légende d'une photo, le titre d'un lien ou d'un fichier. Une note n'a que son texte,
 * qui est son contenu : elle se dit « Une note ». La carte d'une toile ne dit pas le nom de l'autre toile.
 */
export function nomDeLElement(e: ElementLu): string {
  const c = e.contenu
  let nom = ''
  switch (c.type) {
    case 'document':
    case 'taches':
    case 'colonne':
      nom = chaine(c.titre)
      break
    case 'image':
      nom = chaine(c.legende)
      break
    case 'lien':
      nom = chaine(c.titre) || chaine((c.apercu as { titre?: unknown } | undefined)?.titre)
      break
    case 'fichier':
      nom = chaine(c.titre) || chaine(c.nom)
      break
    case 'arbre': {
      const sujets = Object.values((c.sujets ?? {}) as Record<string, { parent?: unknown; genre?: unknown; titre?: unknown }>)
      nom = chaine(sujets.find((s) => s && s.parent === undefined && s.genre === undefined)?.titre)
      break
    }
  }
  return resserrer(nom, 140) || GENRES[c.type] || 'Un élément'
}

/** Un extrait du texte de la toile, dans l'ordre de lecture (de haut en bas, puis de gauche à droite). */
export function extraitDuContenu(elements: readonly ElementLu[]): string {
  const textes = elements
    .filter((e) => ['note', 'document', 'taches', 'arbre'].includes(e.contenu.type))
    .sort((a, b) => a.y - b.y || a.x - b.x)
  for (const e of textes) {
    // Le texte de l'élément seulement : pas ses fils de discussion, qui sont les échanges de ceux qui y travaillent.
    const { commentaire: _c, ...sansFil } = e
    const t = texteCherchable({ ...sansFil, contenu: { ...e.contenu, fils: undefined } }, () => undefined)
    const propre = t.replace(/\s+/gu, ' ').trim()
    if ([...propre].length >= 12) return resserrer(propre, 180)
  }
  return ''
}

/** Ce que porte la toile, en mots : « 8 notes, 4 photos et 2 liens ». */
export function inventaire(elements: readonly ElementLu[]): { total: number; phrase: string } {
  const genres: [string, string, string][] = [
    ['note', 'note', 'notes'],
    ['image', 'photo', 'photos'],
    ['lien', 'lien', 'liens'],
    ['document', 'page', 'pages'],
    ['taches', 'liste', 'listes'],
    ['tableau', 'toile', 'toiles'],
    ['fichier', 'fichier', 'fichiers'],
    ['arbre', 'carte mentale', 'cartes mentales'],
  ]
  const comptes = new Map<string, number>()
  let total = 0
  for (const e of elements) {
    if (e.contenu.type === 'ligne' || e.contenu.type === 'commentaire') continue
    total++
    comptes.set(e.contenu.type, (comptes.get(e.contenu.type) ?? 0) + 1)
  }
  // Les trois genres qu'on nomme, dans cet ordre ; ce qui reste se compte à part.
  const nommes = genres.filter(([type]) => comptes.has(type)).slice(0, 3)
  const reste = total - nommes.reduce((n, [type]) => n + comptes.get(type)!, 0)
  const morceaux = [...nommes.map(([type, un, plusieurs]) => pluriel(comptes.get(type)!, un, plusieurs)), ...(reste ? [pluriel(reste, nommes.length ? 'autre élément' : 'élément', nommes.length ? 'autres éléments' : 'éléments')] : [])]
  const phrase = morceaux.length > 1 ? `${morceaux.slice(0, -1).join(', ')} et ${morceaux.at(-1)}` : (morceaux[0] ?? '')
  return { total, phrase }
}

/** Ce que l'adresse demande : la page d'une toile, d'un élément, d'un lien visiteur, d'une invitation, ou le reste. */
export type Demande = { genre: 'toile'; tableau: string; element?: string } | { genre: 'visiteur'; jeton: string } | { genre: 'invitation' } | { genre: 'marque' }

export function demandeDuChemin(chemin: string): Demande {
  const decoder = (s: string) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return ''
    }
  }
  const t = /^\/t\/([^/]+)(?:\/e\/([^/]+))?\/?$/.exec(chemin)
  if (t) {
    const [tableau, element] = [decoder(t[1]!), t[2] === undefined ? undefined : decoder(t[2])]
    return { genre: 'toile', tableau, ...(element !== undefined ? { element } : {}) }
  }
  const p = /^\/p\/([^/]+)\/?$/.exec(chemin)
  if (p) return { genre: 'visiteur', jeton: decoder(p[1]!) }
  if (/^\/invitation\/?$/.test(chemin)) return { genre: 'invitation' }
  return { genre: 'marque' }
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** L'empreinte de ce que montre une image : elle change avec le titre, le plan ou le dessin des cartes. */
export const empreinteDe = (a: Pick<Apercu, 'carte' | 'photos'>) =>
  createHash('sha256')
    .update(JSON.stringify([VERSION_CARTES, a.carte, a.photos.map((p) => p.fichier)]))
    .digest('base64url')
    .slice(0, 16)

/** Les balises de la page : titre, description, Open Graph et carte de X, à poser à la place de `<title>`. */
export function balises(a: Apercu, origine: string, chemin: string): string {
  const image = `${origine}/api/apercu-lien/${a.image}.${a.photos.length ? 'jpg' : 'png'}?v=${empreinteDe(a)}`
  const lignes = [
    `<title>${echapper(a.titrePage)}</title>`,
    `<meta name="description" content="${echapper(a.description)}" />`,
    ...(a.indexable ? [] : ['<meta name="robots" content="noindex" />']),
    `<meta property="og:site_name" content="${echapper(a.carte.nom)}" />`,
    '<meta property="og:locale" content="fr_FR" />',
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${echapper(origine + chemin)}" />`,
    `<meta property="og:title" content="${echapper(a.titre)}" />`,
    `<meta property="og:description" content="${echapper(a.description)}" />`,
    `<meta property="og:image" content="${echapper(image)}" />`,
    ...(image.startsWith('https:') ? [`<meta property="og:image:secure_url" content="${echapper(image)}" />`] : []),
    `<meta property="og:image:type" content="${a.photos.length ? 'image/jpeg' : 'image/png'}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${echapper(a.alt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${echapper(a.titre)}" />`,
    `<meta name="twitter:description" content="${echapper(a.description)}" />`,
    `<meta name="twitter:image" content="${echapper(image)}" />`,
    `<meta name="twitter:image:alt" content="${echapper(a.alt)}" />`,
  ]
  return lignes.join('\n    ')
}

/** La page avec ses balises : elles prennent la place du `<title>` d'origine, ou se posent avant `</head>`. */
export function injecter(html: string, bloc: string): string {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title>[\s\S]*?<\/title>/i, () => bloc)
  return html.replace(/<\/head>/i, () => `  ${bloc}\n  </head>`)
}

/** Au plus tant d'images gardées en mémoire (une centaine de Ko chacune). */
const IMAGES_GARDEES = 96

export function creerApercus(s: SourceApercus) {
  const { base } = s
  const hote = (origine: string) => {
    try {
      return new URL(origine).host
    } catch {
      return origine
    }
  }

  // ---- Les aperçus génériques ----

  const marque = (h: string): Apercu => ({
    titrePage: s.nom,
    titre: s.nom,
    description: 'Des toiles libres pour poser vos idées : notes, images, liens et tâches sur un fond infini, seul ou à plusieurs.',
    alt: `${s.nom} : des cartes posées sur une toile, une idée, un moodboard, une liste de tâches.`,
    image: 'marque',
    carte: { genre: 'marque', nom: s.nom, hote: h, titre: 'Des toiles libres pour poser vos idées', description: 'Notes, images, liens et tâches sur un fond infini, seul ou à plusieurs.', pastille: 'Open source' },
    photos: [],
    secret: false,
    indexable: true,
  })
  const toileGenerique = (h: string): Apercu => ({
    titrePage: s.nom,
    titre: 'Une toile Notak',
    description: 'Ouvrez le lien pour la voir sur Notak. Son contenu est réservé aux personnes qui y ont accès.',
    alt: 'Une toile Notak, dont le contenu est réservé aux personnes qui y ont accès.',
    image: 'toile',
    carte: { genre: 'toile', nom: s.nom, hote: h, titre: 'Une toile Notak', description: 'Ouvrez le lien pour la voir. Son contenu est réservé aux personnes qui y ont accès.', pastille: 'Accès réservé' },
    photos: [],
    secret: false,
    indexable: false,
  })
  // Un lien visiteur dont on ne peut rien dire : inconnu, échu, révoqué, protégé, ou dont le nom est masqué. Tous ont
  // la même image et les mêmes mots : l'aperçu ne trahit pas lequel c'est.
  const lienGenerique = (h: string): Apercu => ({
    titrePage: s.nom,
    titre: 'Une toile Notak',
    description: 'Une toile partagée sur Notak. Ouvrez le lien pour la voir.',
    alt: 'Une toile partagée sur Notak.',
    image: 'lien',
    carte: { genre: 'toile', nom: s.nom, hote: h, titre: 'Une toile Notak', description: 'Une toile partagée sur Notak. Ouvrez le lien pour la voir.', pastille: 'Lien de partage' },
    photos: [],
    secret: true,
    indexable: false,
  })
  const invitation = (h: string): Apercu => ({
    titrePage: `Invitation · ${s.nom}`,
    titre: 'On vous invite sur une toile Notak',
    description: 'Ouvrez le lien pour découvrir l’invitation et rejoindre la toile.',
    alt: 'Une invitation à rejoindre une toile Notak.',
    image: 'invitation',
    carte: { genre: 'invitation', nom: s.nom, hote: h, titre: 'On vous invite sur une toile', description: 'Ouvrez le lien pour découvrir l’invitation et rejoindre la toile sur Notak.', pastille: 'Invitation' },
    photos: [],
    secret: true,
    indexable: false,
  })
  const generiques: Record<string, (h: string) => Apercu> = { marque, toile: toileGenerique, lien: lienGenerique, invitation }

  // ---- Une toile, ou un élément, réservés aux comptes ----

  const pourLaToile = (h: string, tableau: string, element?: string): Apercu => {
    if (!IDENTIFIANT.test(tableau) || (element !== undefined && !IDENTIFIANT.test(element))) return toileGenerique(h)
    const ligne = base.tableau(tableau)
    if (!ligne || base.nomMasque(tableau) || protege(base, tableau)) return toileGenerique(h)
    const nomToile = resserrer(ligne.titre, 140)
    const chemin = `t/${encodeURIComponent(tableau)}${element !== undefined ? `/e/${encodeURIComponent(element)}` : ''}`
    if (element === undefined) {
      if (!nomToile) return toileGenerique(h)
      return {
        titrePage: s.nom,
        titre: nomToile,
        description: 'Une toile partagée sur Notak. Son contenu est réservé aux personnes qui y ont accès.',
        alt: `« ${nomToile} », une toile Notak dont le contenu est réservé aux personnes qui y ont accès.`,
        image: chemin,
        carte: { genre: 'toile', nom: s.nom, hote: h, titre: nomToile, description: 'Une toile partagée sur Notak, réservée aux personnes qui y ont accès.', pastille: 'Accès réservé' },
        photos: [],
        secret: false,
        indexable: false,
      }
    }
    // L'élément doit être sur la toile, hors de sa corbeille : sinon, rien ne se dit, pas même le nom de la toile.
    const e = s.lire(tableau).elements.find((x) => x.id === element && x.corbeille === undefined)
    if (!e) return toileGenerique(h)
    const nom = nomDeLElement(e)
    const dans = nomToile ? `Dans « ${nomToile} », une toile partagée sur Notak.` : 'Sur une toile partagée sur Notak.'
    return {
      titrePage: s.nom,
      titre: nom,
      description: `${dans} Son contenu est réservé aux personnes qui y ont accès.`,
      alt: `« ${nom} »${nomToile ? `, dans la toile « ${nomToile} »` : ''}, sur Notak. Son contenu est réservé aux personnes qui y ont accès.`,
      image: chemin,
      carte: { genre: 'toile', nom: s.nom, hote: h, titre: nom, description: nomToile ? `Dans « ${nomToile} »` : 'Sur une toile Notak', pastille: 'Accès réservé' },
      photos: [],
      secret: false,
      indexable: false,
    }
  }

  // ---- Un lien visiteur ----

  const pourLeVisiteur = async (h: string, jeton: string): Promise<Apercu> => {
    if (!JETON_PUBLIC.test(jeton)) return lienGenerique(h)
    const l = base.lienDuJeton(jeton)
    if (!l || !base.tableau(l.tableau)) return lienGenerique(h)
    if (l.expire !== null && l.expire <= s.maintenant()) return lienGenerique(h)
    if (l.motDePasse !== null || protege(base, l.tableau) || base.nomMasque(l.tableau)) return lienGenerique(h)
    if (!(await s.lienOuvre(jeton, l.tableau))) return lienGenerique(h)
    const vue = s.vuePublique(l.tableau)
    const titre = resserrer(vue.titre || base.tableau(l.tableau)?.titre || '', 140) || 'Sans titre'
    const { total, phrase } = inventaire(vue.elements)
    const extrait = extraitDuContenu(vue.elements)
    const resume = resumesDuTableau({ titre: vue.titre, elements: vue.elements })[0]
    const boites = resume?.genre === 'toile' ? resume.boites : []
    const niveau = l.niveau === 'commentaire' ? 'Commentaires ouverts' : 'Lecture seule'
    const description = extrait || (total ? `Une toile partagée sur Notak : ${phrase}.` : 'Une toile partagée sur Notak.')
    return {
      titrePage: `${titre} · ${s.nom}`,
      titre,
      description,
      alt: total ? `Le plan de la toile « ${titre} » : ${phrase}.` : `La toile « ${titre} », encore vide.`,
      image: `p/${jeton}`,
      carte: {
        genre: 'visiteur',
        nom: s.nom,
        hote: h,
        titre,
        description: extrait || (total ? `Une toile partagée sur Notak : ${phrase}.` : 'Une toile partagée sur Notak, encore vide.'),
        pastille: total ? `${niveau} · ${pluriel(total, 'élément', 'éléments')}` : niveau,
        ...(vue.couleur ? { couleur: vue.couleur } : {}),
        boites,
      },
      photos: photosDuPlan(boites),
      secret: true,
      indexable: false,
    }
  }

  /** L'aperçu d'une adresse de l'app. Ce qui ne se lit pas (un document abîmé, une clé qui manque) retombe sur le générique. */
  const apercuDe = async (chemin: string, origine: string): Promise<Apercu> => {
    const h = hote(origine)
    const d = demandeDuChemin(chemin)
    try {
      if (d.genre === 'toile') return pourLaToile(h, d.tableau, d.element)
      if (d.genre === 'visiteur') return await pourLeVisiteur(h, d.jeton)
      if (d.genre === 'invitation') return invitation(h)
      return marque(h)
    } catch {
      return d.genre === 'toile' ? toileGenerique(h) : d.genre === 'visiteur' ? lienGenerique(h) : marque(h)
    }
  }

  // ---- La page ----

  let gardee: { mtime: number; html: string } | null = null
  const pageDOrigine = (): string | null => {
    if (!s.dossierWeb) return null
    const chemin = join(s.dossierWeb, 'index.html')
    try {
      const mtime = statSync(chemin).mtimeMs
      if (!gardee || gardee.mtime !== mtime) gardee = { mtime, html: readFileSync(chemin, 'utf8') }
      return gardee.html
    } catch {
      return null
    }
  }

  /** `index.html`, avec les balises de son adresse. */
  const page = async (c: Context, origine: string): Promise<Response> => {
    const html = pageDOrigine()
    if (html === null) return c.text('introuvable', 404)
    const a = await apercuDe(c.req.path, origine)
    const entetes: Record<string, string> = {
      'content-type': 'text/html; charset=utf-8',
      // Le nom d'une toile change, un lien se révoque : la page se redemande toujours.
      'cache-control': a.indexable ? 'no-cache' : 'no-store',
    }
    if (!a.indexable) entetes['x-robots-tag'] = 'noindex'
    if (a.secret) entetes['referrer-policy'] = 'no-referrer'
    return c.body(injecter(html, balises(a, origine, c.req.path)), 200, entetes)
  }

  // ---- L'image ----

  const gardees = new Map<string, Promise<{ octets: Buffer; type: 'image/png' | 'image/jpeg' }>>()
  const aTour = fileDAttente(2)
  const TYPES_PHOTO = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

  /** Les petites copies des photos du plan, en `data:` ; une photo illisible garde le dessin d'une photo. */
  const lirePhotos = async (photos: Apercu['photos']): Promise<Map<string, string>> => {
    const lues = new Map<string, string>()
    for (const p of photos) {
      const f = base.fichier(p.fichier)
      if (!f || !TYPES_PHOTO.has(f.type)) continue
      try {
        const octets = duDisque(s.cle, await readFile(join(s.dossierFichiers, p.fichier)))
        const petite = await sharp(octets, { failOn: 'error', animated: false })
          .autoOrient()
          .resize(Math.min(600, Math.max(8, p.largeur)), Math.min(600, Math.max(8, p.hauteur)), { fit: 'outside', withoutEnlargement: true })
          .jpeg({ quality: 74, mozjpeg: true })
          .toBuffer()
        lues.set(p.fichier, `data:image/jpeg;base64,${petite.toString('base64')}`)
      } catch {
        // une photo absente ou abîmée : son dessin à la place
      }
    }
    return lues
  }

  const rendre = (a: Apercu) => {
    const cle = empreinteDe(a)
    let rendue = gardees.get(cle)
    if (rendue) {
      // La plus récemment servie passe en dernier : les plus anciennes partent d'abord.
      gardees.delete(cle)
      gardees.set(cle, rendue)
      return rendue
    }
    rendue = aTour(async () => rendreLaCarte({ ...a.carte, ...(a.photos.length ? { photos: await lirePhotos(a.photos) } : {}) }))
    rendue.catch(() => gardees.delete(cle))
    gardees.set(cle, rendue)
    while (gardees.size > IMAGES_GARDEES) gardees.delete(gardees.keys().next().value!)
    return rendue
  }

  /** `GET /api/apercu-lien/<image>.png` (ou `.jpg`) : l'image de l'aperçu, recalculée par le chemin de la page. */
  const image = async (c: Context, origine: string): Promise<Response> => {
    const m = /^\/api\/apercu-lien\/(.+)\.(png|jpg)$/.exec(c.req.path)
    if (!m) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const nom = m[1]!
    const fabrique = generiques[nom]
    const a = fabrique ? fabrique(hote(origine)) : /^[tp]\//.test(nom) ? await apercuDe(`/${nom}`, origine) : null
    if (!a) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const { octets, type } = await rendre(a)
    const generique = a.image in generiques
    const entetes: Record<string, string> = {
      'content-type': type,
      'content-length': String(octets.length),
      // Une image de marque se garde ; celle d'une toile se redemande vite : un lien révoqué ou un nom masqué cessent de se voir.
      'cache-control': generique ? (c.req.query('v') === empreinteDe(a) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400') : 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    }
    if (a.secret) entetes['referrer-policy'] = 'no-referrer'
    return c.body(new Uint8Array(octets), 200, entetes)
  }

  return { apercuDe, page, image }
}
