import { EXTENSION_NOTAK, TYPE_NOTAK } from '@notak/tableau'
import { telecharger } from '../Export'

/**
 * Où va une copie `.notak`, selon ce que le navigateur sait faire :
 * - Chrome et Edge sur ordinateur : la fenêtre « Enregistrer sous », et les fois suivantes, le même fichier, réécrit
 *   sans rien demander (comme un document ordinaire) ;
 * - un téléphone : la feuille de partage, d'où l'on choisit iCloud Drive, Google Drive, Fichiers… ;
 * - ailleurs : un téléchargement.
 */

interface PoigneeFichier {
  name: string
  createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>
  getFile(): Promise<File>
}
interface AvecSelecteurs {
  showSaveFilePicker?(o: unknown): Promise<PoigneeFichier>
  showOpenFilePicker?(o: unknown): Promise<PoigneeFichier[]>
}
const fenetre = () => window as unknown as AvecSelecteurs
const TYPES = [{ description: 'Notak', accept: { [TYPE_NOTAK]: [`.${EXTENSION_NOTAK}`] } }]

/** La poignée du fichier choisi la première fois : Cmd+S le réécrit ensuite. Le temps de l'onglet seulement. */
let poignee: PoigneeFichier | null = null

const tactile = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const annule = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export type CopieRangee = { ou: 'fichier'; nom: string } | { ou: 'partage' } | { ou: 'telechargement'; nom: string } | { ou: 'annule' }

/** Range une copie ; `nouveau` redemande où, même si un fichier a déjà été choisi. */
export async function rangerCopie(octets: Uint8Array, nom: string, nouveau = false): Promise<CopieRangee> {
  const fichier = new File([octets as Uint8Array<ArrayBuffer>], nom, { type: TYPE_NOTAK })
  const w = fenetre()
  if (w.showSaveFilePicker && !tactile()) {
    try {
      if (!poignee || nouveau) poignee = await w.showSaveFilePicker({ suggestedName: nom, types: TYPES })
      const ecriture = await poignee.createWritable()
      await ecriture.write(fichier)
      await ecriture.close()
      return { ou: 'fichier', nom: poignee.name }
    } catch (e) {
      if (annule(e)) return { ou: 'annule' }
      // Une permission retirée, un fichier déplacé : on redemandera la prochaine fois.
      poignee = null
      throw e
    }
  }
  if (tactile() && navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: nom })
      return { ou: 'partage' }
    } catch (e) {
      if (annule(e)) return { ou: 'annule' }
      throw e
    }
  }
  telecharger(fichier, nom)
  return { ou: 'telechargement', nom }
}

/** Le fichier où la copie se range aujourd'hui, s'il y en a un. */
export const fichierDeCopie = () => poignee?.name ?? null

/** Demande un fichier `.notak` à rouvrir ; `null` si l'on renonce. */
export async function choisirCopie(): Promise<File | null> {
  const w = fenetre()
  if (w.showOpenFilePicker) {
    try {
      const [p] = await w.showOpenFilePicker({ types: TYPES, multiple: false })
      return p ? await p.getFile() : null
    } catch (e) {
      if (annule(e)) return null
      throw e
    }
  }
  return new Promise((resolve) => {
    const champ = document.createElement('input')
    champ.type = 'file'
    champ.accept = `.${EXTENSION_NOTAK},${TYPE_NOTAK},application/zip`
    champ.onchange = () => resolve(champ.files?.[0] ?? null)
    champ.oncancel = () => resolve(null)
    champ.click()
  })
}

/** Un nom de copie : le titre de l'accueil et la date du jour. */
export function nomDeCopie(titre: string, quand = new Date()): string {
  const net = titre.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 60) || 'Notak'
  return `${net} ${quand.toISOString().slice(0, 10)}.${EXTENSION_NOTAK}`
}

export const estCopie = (f: File) => f.name.toLowerCase().endsWith(`.${EXTENSION_NOTAK}`)
