import { Inflate, unzipSync } from 'fflate'

/**
 * Ouvrir une archive reçue sans se laisser noyer. Une « bombe » de quelques Mo peut se déplier en dizaines de Go et
 * faire tomber l'onglet, ou l'app, à chaque essai : une copie .notak, un export Milanote, une carte Xmind, un fichier
 * du dossier synchronisé viennent tous de quelqu'un d'autre.
 *
 * - un zip annonce la taille dépliée de chaque fichier, et fflate n'écrit jamais au-delà (une archive qui ment sur sa
 *   taille est tronquée, pas plus grosse) : on refuse donc l'archive dès que ce qu'elle annonce dépasse les bornes ;
 * - un flux deflate seul n'annonce rien : on le déplie par petits morceaux, en comptant.
 */

export class ErreurTropGros extends Error {}

export interface Bornes {
  /** Un fichier de l'archive, déplié. */
  parFichier: number
  /** Toute l'archive, dépliée. */
  total: number
  /** Combien de fichiers. */
  fichiers: number
}

const MIO = 1024 * 1024
/** Assez pour un espace chargé de photos et de vidéos ; bien moins que ce qui fait tomber un onglet. */
export const BORNES_ARCHIVE: Bornes = { parFichier: 512 * MIO, total: 1024 * MIO, fichiers: 100_000 }

/**
 * Les fichiers d'un zip, s'il reste dans les bornes ; sinon une `ErreurTropGros`, avant d'avoir rien déplié. L'objet
 * rendu n'a pas de prototype : un fichier nommé `__proto__` ou `constructor` ne se confond avec rien.
 */
export function dezipper(octets: Uint8Array, bornes: Bornes = BORNES_ARCHIVE): Record<string, Uint8Array> {
  let total = 0
  let fichiers = 0
  const nus: Record<string, Uint8Array> = Object.create(null)
  const lus = unzipSync(octets, {
    filter: (f) => {
      total += f.originalSize
      if (++fichiers > bornes.fichiers || f.originalSize > bornes.parFichier || total > bornes.total) throw new ErreurTropGros('archive trop grosse une fois dépliée')
      return true
    },
  })
  for (const nom of Object.keys(lus)) nus[nom] = lus[nom]!
  return nus
}

/** Ce qu'un morceau comprimé donne au plus en une fois (deflate ne dépasse pas 1 032 pour 1) : quelques Mo. */
const MORCEAU = 4096

/** Un flux deflate déplié, s'il ne dépasse pas `max` octets ; sinon une `ErreurTropGros`, sans avoir tout déplié. */
export function gonfler(octets: Uint8Array, max: number): Uint8Array {
  const morceaux: Uint8Array[] = []
  let taille = 0
  const flux = new Inflate((morceau) => {
    taille += morceau.length
    if (taille > max) throw new ErreurTropGros('flux trop gros une fois déplié')
    morceaux.push(morceau)
  })
  for (let i = 0; i < octets.length; i += MORCEAU) flux.push(octets.subarray(i, i + MORCEAU), i + MORCEAU >= octets.length)
  if (octets.length === 0) flux.push(octets, true)
  const sortie = new Uint8Array(taille)
  let p = 0
  for (const m of morceaux) {
    sortie.set(m, p)
    p += m.length
  }
  return sortie
}
