import { lireAdresse } from './adresse'

/**
 * L'adresse qu'un raccourci web contient : un fichier `.url` de Windows (`URL=…` dans un INI) ou un `.webloc` de macOS
 * (une propriété `URL` dans un plist). `null` si le texte n'en porte pas une lisible.
 */
export function lireRaccourci(texte: string): string | null {
  const ini = /^\s*URL\s*=\s*(\S+)\s*$/im.exec(texte)?.[1]
  if (ini) return lireAdresse(ini)
  const plist = /<key>\s*URL\s*<\/key>\s*<string>\s*([^<\s]+)\s*<\/string>/i.exec(texte)?.[1]
  return plist ? lireAdresse(plist.replace(/&amp;/g, '&')) : null
}
