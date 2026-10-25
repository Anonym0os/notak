import { type ContenuNotak, encoderNotak } from '../fichierEspace.ts'
import { idsDeFichiers, lireEtat } from './contenu.ts'

// L'export « Notak » d'un tableau : le fichier `.notak` (fichierEspace.ts) de ce tableau, de ses sous-tableaux et de
// ses fichiers. Le serveur l'écrit avec ce code ; l'édition locale a le sien, qui part de son index (local/copie.ts).

export interface OptionsCopie {
  sousTableaux: boolean
  fichiers: boolean
}

export interface SourceCopie {
  /** L'état Yjs du tableau, ou `null` si on ne peut pas le lire (inconnu, hors des droits) : il reste alors dehors. */
  etat(id: string): Promise<Uint8Array | null>
  fichier(id: string): Promise<{ octets: Uint8Array; type: string } | null>
  /** Le titre, quand l'état ne le porte pas (le serveur le garde aussi dans sa base). */
  titre?(id: string): string | undefined
}

/** Au-delà, la copie s'arrête : un espace entier se sauvegarde autrement. */
export const TABLEAUX_MAX = 2000

/** Le tableau `racine`, et selon les options ses sous-tableaux et ses fichiers, en fichier `.notak`. */
export async function ecrireCopie(racine: string, source: SourceCopie, options: OptionsCopie): Promise<Uint8Array> {
  const contenu: ContenuNotak = { racine, tableaux: [], fichiers: [] }
  const fichiers = new Set<string>()
  // Chaque sous-tableau garde, comme parent, le tableau où on l'a trouvé : la réimportation les range pareil.
  const parents = new Map<string, string>()
  const file = [racine]
  for (let i = 0; i < file.length && contenu.tableaux.length < TABLEAUX_MAX; i++) {
    const id = file[i]!
    const etat = await source.etat(id)
    if (!etat) continue
    const lu = lireEtat(etat)
    const parent = parents.get(id)
    contenu.tableaux.push({ id, titre: lu.titre || source.titre?.(id) || '', ...(parent ? { parent } : {}), ...(lu.couleur ? { couleur: lu.couleur } : {}), etat })
    if (options.fichiers) for (const f of idsDeFichiers(lu.elements)) fichiers.add(f)
    if (!options.sousTableaux) continue
    for (const e of lu.elements) {
      const cible = e.corbeille === undefined && e.contenu.type === 'tableau' ? e.contenu.cible : undefined
      if (typeof cible !== 'string' || cible === racine || parents.has(cible)) continue
      parents.set(cible, id)
      file.push(cible)
    }
  }
  if (contenu.tableaux.length === 0) throw new Error('introuvable')
  // Un fichier perdu n'empêche pas la copie : l'élément le citera sans l'avoir.
  for (const id of fichiers) {
    const f = await source.fichier(id)
    if (f) contenu.fichiers.push({ id, ...f })
  }
  return encoderNotak(contenu)
}

/**
 * La même valeur, chaque chaîne qui est exactement un ancien identifiant remplacée par le nouveau : les renvois, les
 * fichiers et les mentions suivent ainsi les tableaux et les fichiers recréés, où qu'ils se trouvent dans l'élément.
 */
export function renommer<T>(valeur: T, nouveaux: ReadonlyMap<string, string>): T {
  if (typeof valeur === 'string') return (nouveaux.get(valeur) ?? valeur) as T
  if (Array.isArray(valeur)) return valeur.map((v) => renommer(v, nouveaux)) as T
  if (valeur && typeof valeur === 'object') {
    const sortie: Record<string, unknown> = {}
    for (const [cle, v] of Object.entries(valeur)) sortie[cle] = renommer(v, nouveaux)
    return sortie as T
  }
  return valeur
}
