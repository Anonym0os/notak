import { type DepotFichiers, type Id, nouvelId } from '@notak/tableau'

// Les fichiers vivent dans IndexedDB, en attendant un vrai dépôt côté serveur.
const BASE = 'notak'
const MAGASIN = 'fichiers'

let base: Promise<IDBDatabase> | undefined
const ouvrir = () =>
  (base ??= new Promise<IDBDatabase>((resolve, reject) => {
    const demande = indexedDB.open(BASE, 1)
    demande.onupgradeneeded = () => demande.result.createObjectStore(MAGASIN)
    demande.onsuccess = () => resolve(demande.result)
    demande.onerror = () => {
      base = undefined
      reject(demande.error)
    }
  }))

const attendre = <T>(demande: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    demande.onsuccess = () => resolve(demande.result)
    demande.onerror = () => reject(demande.error)
  })

// Une adresse par fichier, gardée tant que la page vit.
const adresses = new Map<Id, Promise<string | null>>()

export const fichiers: DepotFichiers = {
  async enregistrer(blob) {
    const id = nouvelId()
    const db = await ouvrir()
    const tx = db.transaction(MAGASIN, 'readwrite')
    const fini = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    tx.objectStore(MAGASIN).put(blob, id)
    await fini
    adresses.set(id, Promise.resolve(URL.createObjectURL(blob)))
    return id
  },

  adresse(id) {
    let adresse = adresses.get(id)
    if (!adresse) {
      adresse = ouvrir()
        .then((db) => attendre<Blob | undefined>(db.transaction(MAGASIN).objectStore(MAGASIN).get(id)))
        .then((blob) => (blob ? URL.createObjectURL(blob) : null))
        .catch(() => null)
      adresses.set(id, adresse)
      // Un fichier absent ou illisible n'est pas retenu : il peut arriver plus tard.
      void adresse.then((a) => a === null && adresses.delete(id))
    }
    return adresse
  },
}
