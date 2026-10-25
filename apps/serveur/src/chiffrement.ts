import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Le chiffrement au repos : l'état des documents et les fichiers déposés sont écrits chiffrés sur le disque, et
// déchiffrés en mémoire à la lecture. Le serveur garde la clé : la recherche, l'activité, l'export et les pages
// publiques continuent de fonctionner. Ce n'est pas du bout en bout, c'est une protection du disque et des sauvegardes.
//
// L'enveloppe : `NKC1` | id de clé (1 octet) | nonce (12) | tag (16) | données chiffrées, en AES-256-GCM.
// L'en-tête (`NKC1` et l'id) est authentifié avec les données : on ne peut pas le changer sans casser le tag.

/** Une clé de chiffrement : 32 octets, et le numéro qui la désigne dans chaque enveloppe (pour une rotation future). */
export interface Cle {
  id: number
  secret: Buffer
}

export class ErreurChiffrement extends Error {}

const MAGIE = Buffer.from('NKC1', 'ascii')
const NONCE = 12
const TAG = 16
const ENTETE = MAGIE.length + 1
/** Le numéro de la clé lue dans l'environnement ; une rotation en ajoutera d'autres. */
export const ID_CLE = 1

/** Les octets commencent-ils par l'en-tête d'une enveloppe ? Sinon, c'est une donnée d'avant le chiffrement, en clair. */
export function estChiffre(octets: Uint8Array): boolean {
  return octets.length >= ENTETE && MAGIE.equals(octets.subarray(0, MAGIE.length))
}

export function chiffrer(cle: Cle, donnees: Uint8Array): Buffer {
  const entete = Buffer.concat([MAGIE, Buffer.from([cle.id])])
  const nonce = randomBytes(NONCE)
  const chiffreur = createCipheriv('aes-256-gcm', cle.secret, nonce)
  chiffreur.setAAD(entete)
  const corps = Buffer.concat([chiffreur.update(donnees), chiffreur.final()])
  return Buffer.concat([entete, nonce, chiffreur.getAuthTag(), corps])
}

/** Déchiffre une enveloppe. Lève si elle est abîmée, ou faite avec une autre clé que `cle`. */
export function dechiffrer(cle: Cle, enveloppe: Uint8Array): Buffer {
  const octets = Buffer.from(enveloppe.buffer, enveloppe.byteOffset, enveloppe.byteLength)
  if (!estChiffre(octets) || octets.length < ENTETE + NONCE + TAG) throw new ErreurChiffrement('enveloppe illisible')
  const id = octets[MAGIE.length]!
  if (id !== cle.id) throw new ErreurChiffrement(`chiffré avec la clé n° ${id}, inconnue ici`)
  const nonce = octets.subarray(ENTETE, ENTETE + NONCE)
  const tag = octets.subarray(ENTETE + NONCE, ENTETE + NONCE + TAG)
  const dechiffreur = createDecipheriv('aes-256-gcm', cle.secret, nonce)
  dechiffreur.setAAD(octets.subarray(0, ENTETE))
  dechiffreur.setAuthTag(tag)
  try {
    return Buffer.concat([dechiffreur.update(octets.subarray(ENTETE + NONCE + TAG)), dechiffreur.final()])
  } catch {
    throw new ErreurChiffrement('clé fausse ou donnée abîmée')
  }
}

/**
 * Ce qu'on écrit sur le disque : chiffré s'il y a une clé, tel quel sinon (le serveur sans clé reste celui d'avant).
 */
export function pourLeDisque(cle: Cle | null, donnees: Uint8Array): Uint8Array {
  return cle ? chiffrer(cle, donnees) : donnees
}

/**
 * Ce qu'on relit du disque. La lecture est tolérante : une donnée sans en-tête est d'avant le chiffrement et se lit
 * en clair (elle sera réécrite chiffrée à la prochaine écriture). Une donnée chiffrée sans clé, elle, ne se lit pas.
 */
export function duDisque(cle: Cle | null, octets: Uint8Array): Buffer {
  if (!estChiffre(octets)) return Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength)
  if (!cle) throw new ErreurChiffrement('donnée chiffrée, et aucune clé donnée (NOTAK_CLE ou NOTAK_CLE_FICHIER)')
  return dechiffrer(cle, octets)
}

/** Une clé à partir de son texte en base64 (32 octets). */
export function cleDepuisTexte(texte: string): Cle {
  const valeur = texte.trim()
  // 32 octets font 43 caractères en base64, plus le `=` de remplissage.
  if (!/^[A-Za-z0-9+/]{43}=?$/.test(valeur)) {
    throw new ErreurChiffrement('la clé doit faire 32 octets, écrits en base64 (openssl rand -base64 32)')
  }
  return { id: ID_CLE, secret: Buffer.from(valeur, 'base64') }
}

/**
 * La clé donnée au serveur : `NOTAK_CLE` (la clé en base64), ou `NOTAK_CLE_FICHIER` (le chemin d'un fichier qui la
 * contient, pour un secret Docker par exemple). Les deux à la fois : on refuse plutôt que d'en choisir une. Aucune : `null`.
 */
export function lireCle(variables: { cle?: string; fichier?: string }): Cle | null {
  const { cle, fichier } = variables
  if (cle && fichier) throw new ErreurChiffrement('NOTAK_CLE et NOTAK_CLE_FICHIER sont données toutes les deux : n’en garder qu’une')
  if (cle) return cleDepuisTexte(cle)
  if (fichier) {
    let texte: string
    try {
      texte = readFileSync(fichier, 'utf8')
    } catch {
      throw new ErreurChiffrement(`NOTAK_CLE_FICHIER : ${fichier} ne se lit pas`)
    }
    return cleDepuisTexte(texte)
  }
  return null
}
