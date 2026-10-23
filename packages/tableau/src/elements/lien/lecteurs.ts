/**
 * Les lecteurs intégrés : les adresses qu'on sait montrer dans la carte même (une vidéo, un morceau,
 * une carte, une maquette). Chaque fournisseur a sa forme d'adresse publique et sa page d'intégration.
 */
export type GenreLecteur = 'video' | 'audio' | 'carte' | 'riche'

export interface OptionsLecture {
  /** Lancé par la lecture automatique : le son est coupé, sinon le navigateur refuse. */
  auto?: boolean
  boucle?: boolean
}

export interface Lecteur {
  fournisseur: string
  genre: GenreLecteur
  id: string
  /** L'adresse de l'iframe, lecture lancée par un clic. */
  src: string
  /** Largeur sur hauteur ; ou, pour un lecteur de hauteur fixe (un morceau), `hauteur` en pixels. */
  proportions?: number
  hauteur?: number
  /** L'adresse de l'iframe selon les options (lecture automatique, en boucle). */
  adresse(options?: OptionsLecture): string
}

/** Ce que l'iframe a le droit de faire : assez pour jouer, rien pour toucher à la page qui l'accueille. */
export const PERMISSIONS: Record<GenreLecteur, string> = {
  video: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
  audio: 'autoplay; encrypted-media',
  carte: 'fullscreen',
  riche: 'fullscreen; clipboard-write',
}
export const BAC_A_SABLE = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation'

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/
const ID_VIMEO = /^\d{6,12}$/
const ID_LOOM = /^[0-9a-f]{32}$/
const ID_SPOTIFY = /^[A-Za-z0-9]{22}$/

type Fabrique = (u: URL, hote: string, segments: string[]) => Lecteur | null

function lecteur(
  fournisseur: string,
  genre: GenreLecteur,
  id: string,
  forme: { proportions?: number; hauteur?: number },
  adresse: (o: OptionsLecture) => string,
): Lecteur {
  return { fournisseur, genre, id, ...forme, src: adresse({}), adresse: (o = {}) => adresse(o) }
}

const avec = (base: string, params: Record<string, string | false | undefined>) => {
  const u = new URL(base)
  for (const [k, v] of Object.entries(params)) if (v !== false && v !== undefined) u.searchParams.set(k, v)
  return u.href
}

/** « 1h2m3s », « 90 », « 1:30 » en secondes ; `undefined` si illisible. */
export function lireDebut(t: string | null): number | undefined {
  if (!t) return undefined
  if (/^\d+$/.test(t)) return Number(t)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return undefined
}

const youtube: Fabrique = (u, hote, s) => {
  let id: string | null | undefined
  if (hote === 'youtu.be') id = s[0]
  else if (hote === 'youtube.com' || hote === 'youtube-nocookie.com' || hote === 'music.youtube.com')
    id = s[0] === 'watch' ? u.searchParams.get('v') : ['embed', 'shorts', 'live', 'v'].includes(s[0] ?? '') ? s[1] : null
  if (!id || !ID_YOUTUBE.test(id)) return null
  const debut = lireDebut(u.searchParams.get('t') ?? u.searchParams.get('start'))
  const vertical = s[0] === 'shorts'
  return lecteur('youtube', 'video', id, { proportions: vertical ? 9 / 16 : 16 / 9 }, (o) =>
    avec(`https://www.youtube-nocookie.com/embed/${id}`, {
      autoplay: '1',
      mute: o.auto && '1',
      // YouTube ne boucle une vidéo seule que si elle est aussi sa propre liste de lecture.
      loop: o.boucle && '1',
      playlist: o.boucle && id,
      start: debut ? String(debut) : undefined,
      rel: '0',
    }),
  )
}

const vimeo: Fabrique = (_u, hote, s) => {
  if (hote !== 'vimeo.com' && hote !== 'player.vimeo.com') return null
  // `vimeo.com/123`, `vimeo.com/channels/x/123`, `player.vimeo.com/video/123`
  const id = [...s].reverse().find((x) => ID_VIMEO.test(x))
  if (!id) return null
  return lecteur('vimeo', 'video', id, { proportions: 16 / 9 }, (o) =>
    avec(`https://player.vimeo.com/video/${id}`, { dnt: '1', autoplay: '1', muted: o.auto && '1', loop: o.boucle && '1' }),
  )
}

const loom: Fabrique = (_u, hote, s) => {
  if (hote !== 'loom.com' || (s[0] !== 'share' && s[0] !== 'embed')) return null
  const id = s[1]?.split('-').pop()
  if (!id || !ID_LOOM.test(id)) return null
  return lecteur('loom', 'video', id, { proportions: 16 / 9 }, (o) =>
    avec(`https://www.loom.com/embed/${id}`, { autoplay: '1', muted: o.auto && '1', hide_owner: 'true' }),
  )
}

const dailymotion: Fabrique = (_u, hote, s) => {
  const id = hote === 'dai.ly' ? s[0] : hote === 'dailymotion.com' && s[0] === 'video' ? s[1]?.split('_')[0] : undefined
  if (!id || !/^[a-z0-9]{5,10}$/i.test(id)) return null
  return lecteur('dailymotion', 'video', id, { proportions: 16 / 9 }, (o) =>
    avec(`https://www.dailymotion.com/embed/video/${id}`, { autoplay: '1', mute: o.auto && '1', loop: o.boucle && '1' }),
  )
}

const wistia: Fabrique = (_u, hote, s) => {
  if (!/(^|\.)wistia\.(com|net)$/.test(hote) && hote !== 'wi.st') return null
  const i = s.findIndex((x) => x === 'medias' || x === 'iframe')
  const id = i >= 0 ? s[i + 1] : undefined
  if (!id || !/^[a-z0-9]{6,12}$/i.test(id)) return null
  return lecteur('wistia', 'video', id, { proportions: 16 / 9 }, (o) =>
    avec(`https://fast.wistia.net/embed/iframe/${id}`, {
      autoPlay: 'true',
      muted: o.auto && 'true',
      endVideoBehavior: o.boucle ? 'loop' : undefined,
    }),
  )
}

const tiktok: Fabrique = (_u, hote, s) => {
  if (hote !== 'tiktok.com') return null
  const i = s.indexOf('video')
  const id = i >= 0 ? s[i + 1] : undefined
  if (!id || !/^\d{8,25}$/.test(id)) return null
  return lecteur('tiktok', 'video', id, { proportions: 9 / 16 }, () => `https://www.tiktok.com/embed/v2/${id}`)
}

const spotify: Fabrique = (_u, hote, s) => {
  if (hote !== 'open.spotify.com') return null
  // `open.spotify.com/intl-fr/track/…` : le segment de langue se saute.
  const r = s[0]?.startsWith('intl-') ? s.slice(1) : s
  const [genre, id] = r
  if (!genre || !id || !['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(genre) || !ID_SPOTIFY.test(id)) return null
  const court = genre === 'track' || genre === 'episode'
  return lecteur('spotify', 'audio', id, { hauteur: court ? 152 : 352 }, () => `https://open.spotify.com/embed/${genre}/${id}`)
}

const soundcloud: Fabrique = (_u, hote, s) => {
  if (hote !== 'soundcloud.com' || s.length < 2) return null
  // Les pages du site lui-même ne sont pas des morceaux.
  if (['discover', 'stream', 'search', 'you', 'upload', 'pages', 'charts', 'stations', 'settings'].includes(s[0]!)) return null
  if (['followers', 'following', 'likes', 'reposts', 'comments'].includes(s[s.length - 1]!)) return null
  const propre = `https://soundcloud.com/${s.join('/')}`
  const liste = s[1] === 'sets'
  return lecteur('soundcloud', 'audio', s.join('/'), { hauteur: liste ? 450 : 166 }, () =>
    avec('https://w.soundcloud.com/player/', { url: propre, auto_play: 'true', visual: 'false', show_teaser: 'false' }),
  )
}

const appleMusic: Fabrique = (u, hote, s) => {
  if (hote !== 'music.apple.com' || s.length < 3 || !['album', 'playlist', 'song'].includes(s[1]!)) return null
  const morceau = s[1] === 'song' || u.searchParams.has('i')
  const base = `https://embed.music.apple.com/${s.join('/')}`
  return lecteur('apple-music', 'audio', s.join('/'), { hauteur: morceau ? 175 : 450 }, () =>
    avec(base, { i: u.searchParams.get('i') ?? undefined }),
  )
}

const deezer: Fabrique = (_u, hote, s) => {
  if (hote !== 'deezer.com') return null
  const r = /^[a-z]{2}$/.test(s[0] ?? '') ? s.slice(1) : s
  const [genre, id] = r
  if (!genre || !id || !['track', 'album', 'playlist', 'episode', 'show'].includes(genre) || !/^\d+$/.test(id)) return null
  return lecteur('deezer', 'audio', id, { hauteur: genre === 'track' || genre === 'episode' ? 152 : 300 }, (o) =>
    avec(`https://widget.deezer.com/widget/auto/${genre}/${id}`, { autoplay: o.auto ? 'true' : undefined }),
  )
}

/** Une adresse Google Maps : un lieu nommé, des coordonnées, ou une recherche. */
const googleMaps: Fabrique = (u, hote, s) => {
  if (!/^(maps\.)?google\.[a-z.]{2,6}$/.test(hote) || (!hote.startsWith('maps.') && s[0] !== 'maps')) return null
  const r = s[0] === 'maps' ? s.slice(1) : s
  const coord = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/.exec(u.pathname)
  const lieu = r[0] === 'place' || r[0] === 'search' ? decodeURIComponent(r[1] ?? '').replace(/\+/g, ' ') : ''
  const q = u.searchParams.get('q') ?? u.searchParams.get('query') ?? (lieu || (coord ? `${coord[1]},${coord[2]}` : ''))
  if (!q) return null
  const z = coord?.[3] ? String(Math.round(Number(coord[3]))) : undefined
  return lecteur('google-maps', 'carte', q, { proportions: 4 / 3 }, () =>
    avec('https://maps.google.com/maps', { q, z, output: 'embed' }),
  )
}

/** OpenStreetMap : `#map=zoom/lat/lon`, montré avec un repère au centre. */
const openStreetMap: Fabrique = (u, hote) => {
  if (hote !== 'openstreetmap.org') return null
  const m = /map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(u.hash)
  if (!m) return null
  const [z, lat, lon] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // L'étendue d'une vue de 600 px environ à ce zoom.
  const demi = (360 / 2 ** z) * 1.2
  const bbox = [lon - demi, lat - demi / 2, lon + demi, lat + demi / 2].map((v) => v.toFixed(5)).join(',')
  return lecteur('openstreetmap', 'carte', `${z}/${lat}/${lon}`, { proportions: 4 / 3 }, () =>
    avec('https://www.openstreetmap.org/export/embed.html', { bbox, layer: 'mapnik', marker: `${lat},${lon}` }),
  )
}

const figma: Fabrique = (u, hote, s) => {
  if (hote !== 'figma.com' || !['file', 'design', 'proto', 'board', 'slides', 'deck'].includes(s[0] ?? '') || !s[1]) return null
  return lecteur('figma', 'riche', s[1], { proportions: 16 / 10 }, () =>
    avec('https://www.figma.com/embed', { embed_host: 'notak', url: u.href }),
  )
}

const miro: Fabrique = (_u, hote, s) => {
  if (hote !== 'miro.com' || s[0] !== 'app' || s[1] !== 'board' || !s[2]) return null
  return lecteur('miro', 'riche', s[2], { proportions: 16 / 10 }, () => `https://miro.com/app/live-embed/${s[2]}/`)
}

const codepen: Fabrique = (_u, hote, s) => {
  if (hote !== 'codepen.io' || (s[1] !== 'pen' && s[1] !== 'embed') || !s[2]) return null
  return lecteur('codepen', 'riche', s[2], { proportions: 4 / 3 }, () =>
    avec(`https://codepen.io/${s[0]}/embed/${s[2]}`, { 'default-tab': 'result' }),
  )
}

const googleDocs: Fabrique = (_u, hote, s) => {
  if (hote !== 'docs.google.com' || s[1] !== 'd' || !s[2]) return null
  const fin = { presentation: 'embed', document: 'preview', spreadsheets: 'preview', forms: 'viewform' }[s[0] ?? '']
  if (!fin) return null
  const proportions = s[0] === 'presentation' ? 16 / 9 : 3 / 4
  return lecteur('google-docs', 'riche', s[2], { proportions }, () => `https://docs.google.com/${s[0]}/d/${s[2]}/${fin}`)
}

const FABRIQUES: Fabrique[] = [
  youtube, vimeo, loom, dailymotion, wistia, tiktok,
  spotify, soundcloud, appleMusic, deezer,
  googleMaps, openStreetMap,
  figma, miro, codepen, googleDocs,
]

/** Le lecteur intégré d'une adresse, ou `null` si on ne sait pas la montrer en place. */
export function lecteurDe(url: string): Lecteur | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const hote = u.hostname.replace(/^(www|m)\./i, '').toLowerCase()
  const segments = u.pathname.split('/').filter(Boolean)
  for (const f of FABRIQUES) {
    const l = f(u, hote, segments)
    if (l) return l
  }
  return null
}
