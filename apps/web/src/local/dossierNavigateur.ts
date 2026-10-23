import { type Dossier, type EntreeDossier, ErreurDossier } from '@notak/tableau'

/**
 * Un `Dossier` sur l'API d'accès aux fichiers du navigateur (Chrome et Edge sur ordinateur) : le dossier que la
 * personne a choisi, par exemple dans son iCloud Drive, son OneDrive ou son Dropbox. Le logiciel de synchro du nuage
 * fait le reste.
 *
 * `createWritable` écrit dans un fichier temporaire (`.crswap`) et ne remplace le fichier qu'à la fermeture : une
 * écriture est donc entière ou n'a pas lieu, sans qu'on ait à renommer quoi que ce soit.
 */

// Les types de l'API, réduits à ce qu'on utilise (TypeScript ne les a pas tous).
export interface PoigneeDossier {
  readonly kind: 'directory'
  readonly name: string
  getDirectoryHandle(nom: string, o?: { create?: boolean }): Promise<PoigneeDossier>
  getFileHandle(nom: string, o?: { create?: boolean }): Promise<PoigneeFichierDossier>
  removeEntry(nom: string): Promise<void>
  entries(): AsyncIterable<[string, PoigneeDossier | PoigneeFichierDossier]>
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>
}
export interface PoigneeFichierDossier {
  readonly kind: 'file'
  readonly name: string
  getFile(): Promise<Blob>
  createWritable(): Promise<{ write(d: BufferSource | Blob): Promise<void>; close(): Promise<void> }>
}

/** Un fichier qu'iCloud a laissé dans le nuage (« Optimiser le stockage ») apparaît sous `.nom.icloud`. */
const FANTOME_ICLOUD = /^\.(.+)\.icloud$/

const introuvable = (e: unknown) => e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')

function traduire(e: unknown): unknown {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError' || e.name === 'NoModificationAllowedError' || e.name === 'SecurityError')
      return new ErreurDossier('le dossier refuse qu’on y écrive', 'lecture-seule')
    if (e.name === 'QuotaExceededError') return new ErreurDossier('plus de place', 'plein')
    if (e.name === 'NotFoundError') return new ErreurDossier('dossier introuvable', 'indisponible')
  }
  return e
}

const morceaux = (chemin: string) => chemin.split('/').filter(Boolean)

export function dossierNavigateur(racine: PoigneeDossier): Dossier {
  const sousDossier = async (parties: string[], creer: boolean): Promise<PoigneeDossier | null> => {
    let d = racine
    for (const p of parties) {
      try {
        d = await d.getDirectoryHandle(p, { create: creer })
      } catch (e) {
        if (!creer && introuvable(e)) return null
        throw traduire(e)
      }
    }
    return d
  }

  return {
    async lister(chemin) {
      const d = await sousDossier(morceaux(chemin), false)
      if (!d) return []
      const entrees: EntreeDossier[] = []
      for await (const [nom, h] of d.entries()) {
        if (h.kind === 'directory') {
          entrees.push({ nom, genre: 'dossier' })
          continue
        }
        const fantome = FANTOME_ICLOUD.exec(nom)
        if (fantome) {
          entrees.push({ nom: fantome[1]!, genre: 'fichier', fantome: true })
          continue
        }
        const f = await h.getFile().catch(() => null)
        entrees.push({ nom, genre: 'fichier', ...(f ? { taille: f.size } : {}) })
      }
      return entrees
    },

    async lire(chemin) {
      const parties = morceaux(chemin)
      const nom = parties.pop()!
      const d = await sousDossier(parties, false)
      if (!d) return 'absent'
      try {
        const f = await (await d.getFileHandle(nom)).getFile()
        return new Uint8Array(await f.arrayBuffer())
      } catch (e) {
        if (!introuvable(e)) throw traduire(e)
      }
      try {
        await d.getFileHandle(`.${nom}.icloud`)
        return 'fantome'
      } catch {
        return 'absent'
      }
    },

    async ecrireAtomique(chemin, octets) {
      const parties = morceaux(chemin)
      const nom = parties.pop()!
      try {
        const d = (await sousDossier(parties, true))!
        const ecriture = await (await d.getFileHandle(nom, { create: true })).createWritable()
        await ecriture.write(octets as Uint8Array<ArrayBuffer>)
        await ecriture.close()
      } catch (e) {
        throw traduire(e)
      }
    },

    async supprimer(chemin) {
      const parties = morceaux(chemin)
      const nom = parties.pop()!
      const d = await sousDossier(parties, false)
      if (!d) return
      try {
        await d.removeEntry(nom)
      } catch (e) {
        if (!introuvable(e)) throw traduire(e)
      }
    },
  }
}
