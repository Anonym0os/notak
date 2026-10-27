import { strFromU8, strToU8, zipSync } from 'fflate'
import { ErreurTropGros, dezipper } from './coeur/dezipper.ts'
import type { Id } from './coeur/tableau'
import { idReserve } from './coeur/idsReserves.ts'

/**
 * Le fichier `.notak` : une copie d'un espace (ou d'un tableau et de ses sous-tableaux), à garder où l'on veut.
 * C'est un zip ordinaire :
 *
 * ```
 * notak.json              { format, application, racine, tableaux: [{ id, titre, parent?, couleur? }], fichiers: [{ id, type }] }
 * tableaux/<id>.yjs       l'état Yjs complet du tableau
 * fichiers/<id>           les images et fichiers, sous leur nom (l'empreinte de leur contenu)
 * ```
 *
 * Rouvrir un fichier fusionne (Yjs) : rouvrir sa propre copie ne duplique rien, et le fichier de quelqu'un d'autre
 * s'ajoute à ce qu'on a.
 */

export const FORMAT_NOTAK = 1
export const EXTENSION_NOTAK = 'notak'
export const TYPE_NOTAK = 'application/x-notak'

export interface TableauNotak {
  id: Id
  titre: string
  parent?: Id
  couleur?: string
  /** L'état Yjs complet du tableau. */
  etat: Uint8Array
}

export interface FichierNotak {
  id: string
  type: string
  octets: Uint8Array
}

export interface ContenuNotak {
  /** Le tableau de tête : l'accueil pour un espace entier, le tableau choisi sinon. */
  racine: Id
  tableaux: TableauNotak[]
  fichiers: FichierNotak[]
}

export class ErreurNotak extends Error {}

/** Un nom de chemin sûr dans le zip : pas de dossier qui remonte, rien qu'un système de fichiers refuserait. */
const sur = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id)

export function encoderNotak(c: ContenuNotak): Uint8Array {
  const entrees: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  const tableaux = c.tableaux.filter((t) => sur(t.id))
  const fichiers = c.fichiers.filter((f) => sur(f.id))
  const manifeste = {
    format: FORMAT_NOTAK,
    application: 'notak',
    racine: c.racine,
    tableaux: tableaux.map(({ id, titre, parent, couleur }) => ({ id, titre, ...(parent ? { parent } : {}), ...(couleur ? { couleur } : {}) })),
    fichiers: fichiers.map(({ id, type }) => ({ id, type })),
  }
  entrees['notak.json'] = [strToU8(JSON.stringify(manifeste, null, 2)), { level: 6 }]
  for (const t of tableaux) entrees[`tableaux/${t.id}.yjs`] = [t.etat, { level: 6 }]
  // Les images sont déjà compressées : les recompresser coûte pour rien.
  for (const f of fichiers) entrees[`fichiers/${f.id}`] = [f.octets, { level: /^(image|video|audio)\//.test(f.type) ? 0 : 6 }]
  return zipSync(entrees)
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Le contenu d'un fichier `.notak` ; une `ErreurNotak` si ce n'en est pas un. Ce qui manque ou est abîmé est ignoré. */
export function decoderNotak(octets: Uint8Array): ContenuNotak {
  let zip: Record<string, Uint8Array>
  try {
    zip = dezipper(octets)
  } catch (e) {
    throw new ErreurNotak(e instanceof ErreurTropGros ? 'fichier Notak trop gros une fois décompressé' : 'pas un fichier Notak')
  }
  const brut = zip['notak.json']
  if (!brut) throw new ErreurNotak('pas un fichier Notak')
  let m: unknown
  try {
    m = JSON.parse(strFromU8(brut))
  } catch {
    throw new ErreurNotak('fichier Notak abîmé')
  }
  if (!estObjet(m) || m.application !== 'notak' || typeof m.racine !== 'string') throw new ErreurNotak('pas un fichier Notak')
  // Un tableau qui porterait le nom d'une base de l'espace (l'index, les fichiers…) l'ouvrirait comme la sienne.
  if (!sur(m.racine) || idReserve(m.racine)) throw new ErreurNotak('fichier Notak abîmé')
  if (typeof m.format !== 'number' || m.format > FORMAT_NOTAK) throw new ErreurNotak('fichier Notak d’une version plus récente')
  const tableaux: TableauNotak[] = []
  for (const t of Array.isArray(m.tableaux) ? m.tableaux : []) {
    if (!estObjet(t) || typeof t.id !== 'string' || !sur(t.id) || idReserve(t.id)) continue
    const etat = zip[`tableaux/${t.id}.yjs`]
    if (!etat) continue
    tableaux.push({
      id: t.id,
      titre: typeof t.titre === 'string' ? t.titre : '',
      ...(typeof t.parent === 'string' ? { parent: t.parent } : {}),
      ...(typeof t.couleur === 'string' ? { couleur: t.couleur } : {}),
      etat,
    })
  }
  const fichiers: FichierNotak[] = []
  for (const f of Array.isArray(m.fichiers) ? m.fichiers : []) {
    if (!estObjet(f) || typeof f.id !== 'string' || !sur(f.id)) continue
    const o = zip[`fichiers/${f.id}`]
    if (o) fichiers.push({ id: f.id, type: typeof f.type === 'string' ? f.type : 'application/octet-stream', octets: o })
  }
  return { racine: m.racine, tableaux, fichiers }
}
