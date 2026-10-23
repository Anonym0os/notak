import { TAILLE_MAX } from '../image/geometrie'
import { extensionDe } from './genre'

/** Les 43 extensions que Milanote refuse (programmes, installateurs, scripts, pages web, images disque, raccourcis). */
const EXTENSIONS_REFUSEES = new Set(
  (
    'ade adp apk appx appxbundle bat cab chm cmd com cpl dll dmg exe hta htm html isp iso jse lib lnk mde msc msi msix msixbundle msp mst nsh ' +
    'pif ps1 scr sct shb sys vb vbe vbs vxd wsc wsf wsh'
  ).split(' '),
)

/** Les noms de fichiers de configuration d'un site : un fichier qui les porte pourrait en changer le comportement. */
const NOMS_REFUSES = new Set(['.htaccess', 'web.config', 'robots.txt', 'crossdomain.xml', 'clientaccesspolicy.xml'])

export type Refus = { motif: 'vide' | 'point' | 'nom' | 'extension' | 'taille'; extension?: string }

/** Pourquoi ce fichier ne part pas, ou `null` s'il peut partir. */
export function refusDe(nom: string, taille: number): Refus | null {
  const minuscule = nom.toLowerCase()
  if (taille <= 0) return { motif: 'vide' }
  if (NOMS_REFUSES.has(minuscule)) return { motif: 'nom' }
  if (nom.startsWith('.')) return { motif: 'point' }
  const extension = extensionDe(nom)
  if (EXTENSIONS_REFUSEES.has(extension)) return { motif: 'extension', extension }
  if (taille > TAILLE_MAX) return { motif: 'taille', extension }
  return null
}
