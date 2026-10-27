import type { DepotFichiers } from '@notak/tableau'
import { typeAffichable } from '@notak/tableau/securite'

/**
 * Les fichiers de l'édition locale (images, documents) : rangés dans IndexedDB, nommés par l'empreinte de leur
 * contenu. Un même fichier posé deux fois n'est gardé qu'une fois, et un fichier `.notak` rouvert retrouve les
 * siens sous le même nom. La toile les affiche par des adresses `blob:`.
 */

const BASE = 'notak:local:fichiers'
const MAGASIN = 'fichiers'
/** Au-delà, une photo est réduite avant d'être gardée : l'écran n'en montre pas plus, et le navigateur a peu de place. */
const COTE_MAX = 2560
const REDUCTIBLES = /^image\/(jpeg|png|webp)$/

let base: Promise<IDBDatabase> | null = null
function ouvrir(): Promise<IDBDatabase> {
  base ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(BASE, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  return base
}

async function transaction<T>(mode: IDBTransactionMode, f: (m: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await ouvrir()
  return new Promise((resolve, reject) => {
    const r = f(db.transaction(MAGASIN, mode).objectStore(MAGASIN))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

const hex = (o: ArrayBuffer) => Array.from(new Uint8Array(o), (x) => x.toString(16).padStart(2, '0')).join('')

/** Une photo trop grande, réduite à `COTE_MAX` de côté, dans son format ; les autres fichiers passent tels quels. */
async function reduire(blob: Blob): Promise<Blob> {
  if (!REDUCTIBLES.test(blob.type) || typeof createImageBitmap !== 'function') return blob
  try {
    const image = await createImageBitmap(blob)
    const echelle = COTE_MAX / Math.max(image.width, image.height)
    if (echelle >= 1) {
      image.close()
      return blob
    }
    const toile = document.createElement('canvas')
    toile.width = Math.round(image.width * echelle)
    toile.height = Math.round(image.height * echelle)
    toile.getContext('2d')!.drawImage(image, 0, 0, toile.width, toile.height)
    image.close()
    const reduite = await new Promise<Blob | null>((r) => toile.toBlob(r, blob.type, 0.9))
    return reduite && reduite.size < blob.size ? reduite : blob
  } catch {
    return blob
  }
}

/** Garde un fichier, sous l'empreinte de son contenu ; un fichier déjà là n'est pas réécrit. */
export async function garderFichier(blob: Blob, deja?: string): Promise<string> {
  const id = deja ?? hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
  const present = await transaction('readonly', (m) => m.getKey(id))
  if (present === undefined) await transaction('readwrite', (m) => m.put(blob, id))
  return id
}

export async function lireFichier(id: string): Promise<Blob | undefined> {
  return (await transaction<Blob | undefined>('readonly', (m) => m.get(id))) ?? undefined
}

const adresses = new Map<string, Promise<string | null>>()

export const fichiersLocaux: DepotFichiers = {
  enregistrer: async (blob) => garderFichier(await reduire(blob)),
  adresse: (id) => {
    let a = adresses.get(id)
    if (!a) {
      // Montré sous une sorte qui ne s'exécute jamais (`typeAffichable`) : un fichier reçu qui se dirait page HTML
      // s'ouvrirait sinon comme une page de Notak.
      a = lireFichier(id).then((b) => (b ? URL.createObjectURL(new Blob([b], { type: typeAffichable(b.type) })) : null))
      adresses.set(id, a)
      // Un fichier absent aujourd'hui peut arriver demain (un fichier .notak qu'on rouvre) : on redemandera.
      void a.then((x) => x === null && adresses.delete(id))
    }
    return a
  },
}
