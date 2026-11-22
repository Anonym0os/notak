import { lireAdresse } from '../lien/lireAdresse.ts'

// Les adresses web d'un texte. Sans React : le collage du Markdown (`blocs/collageMarkdown.ts`) s'en sert, et la porte
// des agents le charge sous Node, sans bundler ; `conversion.ts` le redonne à l'app.

/** Les extensions qu'on reconnaît sans protocole ni `www.` : assez pour l'usage, sans prendre « node.js » pour une adresse. */
const EXTENSIONS_CONNUES = new Set(
  'com fr org net io app dev co eu be ch ca de uk es it nl info me ai tv fm so xyz site page link studio design gouv edu'.split(' '),
)

export type MorceauTexte = { texte: string; url?: string }

/**
 * Le texte coupé autour des adresses web qu'il contient : elles restent du texte, que l'affichage repère
 * (souligné, cliquable). La ponctuation qui suit une adresse ne lui appartient pas.
 */
export function decouperAdresses(texte: string): MorceauTexte[] {
  const morceaux: MorceauTexte[] = []
  let reste = 0
  for (const m of texte.matchAll(/\S+/g)) {
    const brut = m[0].replace(/[.,;:!?»"')\]]+$/, '')
    const url = brut && lireAdresse(brut)
    if (!url) continue
    const hote = new URL(url).hostname
    const explicite = /^https?:\/\//i.test(brut) || /^www\./i.test(brut)
    if (!explicite && !EXTENSIONS_CONNUES.has(hote.split('.').pop()!.toLowerCase())) continue
    if (m.index > reste) morceaux.push({ texte: texte.slice(reste, m.index) })
    morceaux.push({ texte: brut, url })
    reste = m.index + brut.length
  }
  if (reste < texte.length) morceaux.push({ texte: texte.slice(reste) })
  return morceaux
}
