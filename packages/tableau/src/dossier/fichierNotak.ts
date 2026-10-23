import { deflateSync, inflateSync } from 'fflate'

/**
 * Un fichier du dossier Notak : des mises à jour Yjs, chacune pour un tableau.
 *
 * ```
 * « NOTAK » | version (1 octet) | genre (1 octet) | charge compressée | longueur de ce qui précède (4 octets) | SHA-256 (32 octets)
 * charge : nombre d'enregistrements (4 octets), puis pour chacun : longueur de l'id (2), id en UTF-8, longueur (4), mise à jour
 * ```
 *
 * Un fichier tronqué, abîmé ou d'un autre format se lit comme `null` : il n'est « pas encore arrivé ».
 */

const MAGIE = new TextEncoder().encode('NOTAK')
const VERSION = 1
const PIED = 4 + 32

export type GenreFichier = 'maj' | 'base' | 'version'
const GENRES: GenreFichier[] = ['maj', 'base', 'version']

export interface Enregistrement {
  tableau: string
  maj: Uint8Array
}

export interface FichierNotak {
  genre: GenreFichier
  enregistrements: Enregistrement[]
}

const empreinte = async (octets: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', octets as Uint8Array<ArrayBuffer>))

export async function encoderFichier(f: FichierNotak): Promise<Uint8Array> {
  const ids = f.enregistrements.map((e) => new TextEncoder().encode(e.tableau))
  const tailleCharge = 4 + f.enregistrements.reduce((n, e, i) => n + 2 + ids[i]!.length + 4 + e.maj.length, 0)
  const charge = new Uint8Array(tailleCharge)
  const vue = new DataView(charge.buffer)
  vue.setUint32(0, f.enregistrements.length)
  let p = 4
  f.enregistrements.forEach((e, i) => {
    const id = ids[i]!
    if (id.length > 0xffff) throw new Error('identifiant de tableau trop long')
    vue.setUint16(p, id.length)
    charge.set(id, p + 2)
    p += 2 + id.length
    vue.setUint32(p, e.maj.length)
    charge.set(e.maj, p + 4)
    p += 4 + e.maj.length
  })
  const compresse = deflateSync(charge)
  const tete = MAGIE.length + 2
  const sansPied = new Uint8Array(tete + compresse.length)
  sansPied.set(MAGIE)
  sansPied[MAGIE.length] = VERSION
  sansPied[MAGIE.length + 1] = GENRES.indexOf(f.genre)
  sansPied.set(compresse, tete)
  const tout = new Uint8Array(sansPied.length + PIED)
  tout.set(sansPied)
  new DataView(tout.buffer).setUint32(sansPied.length, sansPied.length)
  tout.set(await empreinte(sansPied), sansPied.length + 4)
  return tout
}

/** Commence-t-il comme un fichier Notak ? (Pour reconnaître une copie de conflit au nom inattendu.) */
export const estFichierNotak = (octets: Uint8Array) => octets.length >= MAGIE.length && MAGIE.every((o, i) => octets[i] === o)

/** Le fichier, ou `null` s'il est incomplet, abîmé ou d'un format inconnu. */
export async function decoderFichier(octets: Uint8Array): Promise<FichierNotak | null> {
  if (octets.length < MAGIE.length + 2 + PIED || !estFichierNotak(octets)) return null
  const fin = octets.length - PIED
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  if (vue.getUint32(fin) !== fin) return null
  const sansPied = octets.subarray(0, fin)
  const attendu = octets.subarray(fin + 4)
  const calcule = await empreinte(sansPied)
  if (!calcule.every((o, i) => o === attendu[i])) return null
  if (octets[MAGIE.length] !== VERSION) return null
  const genre = GENRES[octets[MAGIE.length + 1]!]
  if (!genre) return null
  try {
    const charge = inflateSync(sansPied.subarray(MAGIE.length + 2))
    const v = new DataView(charge.buffer, charge.byteOffset, charge.byteLength)
    const n = v.getUint32(0)
    const enregistrements: Enregistrement[] = []
    let p = 4
    for (let i = 0; i < n; i++) {
      const lId = v.getUint16(p)
      const tableau = new TextDecoder('utf-8', { fatal: true }).decode(charge.subarray(p + 2, p + 2 + lId))
      p += 2 + lId
      const lMaj = v.getUint32(p)
      if (p + 4 + lMaj > charge.length) return null
      enregistrements.push({ tableau, maj: charge.slice(p + 4, p + 4 + lMaj) })
      p += 4 + lMaj
    }
    return p === charge.length ? { genre, enregistrements } : null
  } catch {
    return null
  }
}
