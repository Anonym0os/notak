/**
 * Où va un export : la personne le choisit d'abord, puis le fichier s'y écrit.
 * - dans Notak de bureau (la coque Tauri) : la fenêtre « Enregistrer sous » du système, puis la coque écrit les
 *   octets (la webview de macOS ne télécharge rien d'elle-même) ;
 * - dans Chrome et Edge sur ordinateur : la fenêtre « Enregistrer sous » du navigateur ;
 * - ailleurs (Safari, Firefox, téléphone) : un téléchargement, qui va où le navigateur range les siens.
 * L'emplacement se demande au clic, avant de fabriquer le fichier : la fenêtre n'en veut pas après une longue attente.
 */
import { ErreurExport } from '@notak/tableau'

export interface Emplacement {
  /** Le nom retenu, celui que la personne a pu changer. */
  nom: string
  ecrire(blob: Blob): Promise<void>
}

/** Ce qu'il faut pour proposer un fichier : son nom, son extension sans point, son type et ce qu'on en dit. */
export interface FichierPropose {
  nom: string
  extension: string
  type: string
  description: string
}

interface Tauri {
  invoke<T>(commande: string, arguments_?: unknown, options?: unknown): Promise<T>
}
interface PoigneeFichier {
  name: string
  createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>
}
interface AvecSelecteur {
  showSaveFilePicker?(o: unknown): Promise<PoigneeFichier>
  __TAURI_INTERNALS__?: Tauri
}

const fenetre = () => window as unknown as AvecSelecteur
const tactile = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const annule = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** Le téléchargement ordinaire d'un navigateur. */
export function telecharger(blob: Blob, nom: string) {
  const adresse = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = adresse
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(adresse), 10_000)
}

/** L'emplacement choisi, ou `null` si la personne a renoncé. */
export async function choisirEmplacement(f: FichierPropose, w: AvecSelecteur = fenetre()): Promise<Emplacement | null> {
  const tauri = w.__TAURI_INTERNALS__
  if (tauri) {
    // Une coque d'avant ces commandes ne sait pas enregistrer : on le dit, plutôt qu'un échec sans cause.
    const nom = await tauri.invoke<string | null>('choisir_emplacement', { nom: f.nom, extension: f.extension, description: f.description }).catch((e: unknown) => {
      throw /not found|not allowed|denied/i.test(String(e)) ? new ErreurExport('bureau_a_mettre_a_jour') : e
    })
    if (!nom) return null
    return { nom, ecrire: async (blob) => void (await tauri.invoke('ecrire_fichier', new Uint8Array(await blob.arrayBuffer()))) }
  }
  if (w.showSaveFilePicker && !tactile()) {
    try {
      const poignee = await w.showSaveFilePicker({ suggestedName: f.nom, types: [{ description: f.description, accept: { [f.type]: [`.${f.extension}`] } }] })
      return {
        nom: poignee.name,
        async ecrire(blob) {
          const ecriture = await poignee.createWritable()
          await ecriture.write(blob)
          await ecriture.close()
        },
      }
    } catch (e) {
      if (annule(e)) return null
      // Un type que le sélecteur refuse, un navigateur qui le bride : le téléchargement prend le relais.
    }
  }
  return { nom: f.nom, ecrire: async (blob) => telecharger(blob, f.nom) }
}
