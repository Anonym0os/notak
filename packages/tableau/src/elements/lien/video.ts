export interface Lecteur {
  fournisseur: 'youtube' | 'vimeo'
  id: string
  /** L'adresse de l'iframe, lecture lancée. */
  src: string
}

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/
const ID_VIMEO = /^\d{6,12}$/

/** L'identifiant de la vidéo d'une adresse YouTube ou Vimeo, ou `null` pour toute autre adresse. */
export function lecteurDe(url: string): Lecteur | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const hote = u.hostname.replace(/^(www|m)\./i, '').toLowerCase()
  const segments = u.pathname.split('/').filter(Boolean)
  if (hote === 'youtu.be') {
    const id = segments[0]
    return id && ID_YOUTUBE.test(id) ? youtube(id) : null
  }
  if (hote === 'youtube.com' || hote === 'youtube-nocookie.com') {
    const id =
      segments[0] === 'watch'
        ? u.searchParams.get('v')
        : segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live'
          ? segments[1]
          : null
    return id && ID_YOUTUBE.test(id) ? youtube(id) : null
  }
  if (hote === 'vimeo.com' || hote === 'player.vimeo.com') {
    // `vimeo.com/123`, `vimeo.com/channels/x/123`, `player.vimeo.com/video/123`
    const id = [...segments].reverse().find((s) => ID_VIMEO.test(s))
    return id ? { fournisseur: 'vimeo', id, src: `https://player.vimeo.com/video/${id}?dnt=1&autoplay=1` } : null
  }
  return null
}

const youtube = (id: string): Lecteur => ({
  fournisseur: 'youtube',
  id,
  src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
})
