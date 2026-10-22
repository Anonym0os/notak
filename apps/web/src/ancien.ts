import { type Espace, type Tableau, espaceDepuis } from '@notak/tableau'

// Ce que la version d'avant la synchronisation a laissé dans le navigateur.
const CLE = 'notak:espace'
const ANCIENNE_CLE = 'notak:tableau'
const BASE = 'notak'
const MAGASIN = 'fichiers'

/** L'ancien espace local, ou `null` s'il n'y en a pas (ou s'il est vide). */
export function lireAncienEspace(): Espace | null {
  try {
    const json = localStorage.getItem(CLE) ?? localStorage.getItem(ANCIENNE_CLE)
    if (!json) return null
    const espace = espaceDepuis(JSON.parse(json) as Tableau | Espace)
    return Object.values(espace.tableaux).some((t) => t.elements.length > 0) ? espace : null
  } catch {
    return null
  }
}

/** Une image restée dans l'ancien IndexedDB, ou `undefined`. */
export function lireAncienFichier(id: string): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    try {
      const demande = indexedDB.open(BASE)
      demande.onerror = () => resolve(undefined)
      demande.onsuccess = () => {
        const db = demande.result
        if (!db.objectStoreNames.contains(MAGASIN)) return resolve(undefined)
        const lecture = db.transaction(MAGASIN).objectStore(MAGASIN).get(id)
        lecture.onsuccess = () => resolve(lecture.result as Blob | undefined)
        lecture.onerror = () => resolve(undefined)
      }
    } catch {
      resolve(undefined)
    }
  })
}

const cleFait = (utilisateur: string) => `notak:import:${utilisateur}`
export const importDejaPropose = (utilisateur: string) => {
  try {
    return localStorage.getItem(cleFait(utilisateur)) !== null
  } catch {
    return true
  }
}
export const noterImportPropose = (utilisateur: string) => {
  try {
    localStorage.setItem(cleFait(utilisateur), String(Date.now()))
  } catch {
    // Sans stockage, la proposition reviendra : tant pis.
  }
}
