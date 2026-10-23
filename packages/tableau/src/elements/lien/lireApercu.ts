import type { Apercu } from '../../coeur/tableau'

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decoder(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITES[n.toLowerCase()] ?? m)
}

function attributs(balise: string): Record<string, string> {
  const rendu: Record<string, string> = {}
  for (const m of balise.matchAll(/([a-z][a-z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    rendu[m[1]!.toLowerCase()] = decoder(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return rendu
}

const absolue = (adresse: string | undefined, base: string): string | undefined => {
  if (!adresse) return undefined
  try {
    const u = new URL(adresse, base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined
  } catch {
    return undefined
  }
}

/**
 * Lit l'aperçu d'une page dans son HTML : `og:*`, puis `twitter:*`, `<title>` et `<link rel="icon">`.
 * `base` est l'adresse de la page : les adresses relatives en deviennent absolues.
 */
export function lireApercu(html: string, base: string): Apercu {
  const tete = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : 400_000)
  const meta = new Map<string, string>()
  for (const m of tete.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributs(m[0])
    const nom = (a.property ?? a.name)?.toLowerCase()
    if (nom && a.content !== undefined && !meta.has(nom)) meta.set(nom, a.content.trim())
  }
  const titrePage = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(tete)?.[1]
  let icone: string | undefined
  for (const m of tete.matchAll(/<link\b[^>]*>/gi)) {
    const a = attributs(m[0])
    if (a.href && /(^|\s)(shortcut\s+)?icon(\s|$)/i.test(a.rel ?? '')) {
      icone = a.href
      break
    }
  }
  const choisir = (...noms: string[]) => noms.map((n) => meta.get(n)).find((v) => v) || undefined

  const apercu: Apercu = {}
  const titre = choisir('og:title', 'twitter:title') ?? (titrePage ? decoder(titrePage).replace(/\s+/g, ' ').trim() : undefined)
  const description = choisir('og:description', 'twitter:description', 'description')
  const image = absolue(choisir('og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), base)
  const site = choisir('og:site_name', 'twitter:site')
  const favicon = absolue(icone ?? '/favicon.ico', base)
  if (titre) apercu.titre = titre
  if (description) apercu.description = description
  if (image) apercu.image = image
  // La taille de l'image, quand la page la dit : la carte réserve sa place avant le chargement.
  const largeur = Math.round(Number(choisir('og:image:width', 'twitter:image:width')))
  const hauteur = Math.round(Number(choisir('og:image:height', 'twitter:image:height')))
  if (image && largeur > 0 && hauteur > 0) Object.assign(apercu, { largeur, hauteur })
  if (site) apercu.site = site
  if (favicon) apercu.favicon = favicon
  return apercu
}
