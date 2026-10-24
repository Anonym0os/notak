import { verifierContrat } from '@notak/tableau/essais/contrat'
import { describe, expect, it } from 'vitest'
import { type PoigneeDossier, type PoigneeFichierDossier, dossierNavigateur } from './dossierNavigateur'

/** Un faux système de fichiers, à la façon de l'API du navigateur : des poignées de dossiers et de fichiers. */
class FauxFichier implements PoigneeFichierDossier {
  readonly kind = 'file'
  constructor(
    readonly name: string,
    public octets = new Uint8Array(),
  ) {}
  async getFile() {
    return new Blob([this.octets.slice()])
  }
  async createWritable() {
    // Comme le vrai : on écrit à côté, et le fichier n'est remplacé qu'à la fermeture.
    let tampon = new Uint8Array()
    return {
      write: async (d: BufferSource | Blob) => {
        tampon = d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d)
      },
      close: async () => {
        this.octets = tampon
      },
    }
  }
}

class FauxDossier implements PoigneeDossier {
  readonly kind = 'directory'
  readonly enfants = new Map<string, FauxDossier | FauxFichier>()
  constructor(readonly name = 'racine') {}
  async getDirectoryHandle(nom: string, o?: { create?: boolean }) {
    const e = this.enfants.get(nom)
    if (e instanceof FauxDossier) return e
    if (e || !o?.create) throw new DOMException('absent', e ? 'TypeMismatchError' : 'NotFoundError')
    const d = new FauxDossier(nom)
    this.enfants.set(nom, d)
    return d
  }
  async getFileHandle(nom: string, o?: { create?: boolean }) {
    const e = this.enfants.get(nom)
    if (e instanceof FauxFichier) return e
    if (e || !o?.create) throw new DOMException('absent', e ? 'TypeMismatchError' : 'NotFoundError')
    const f = new FauxFichier(nom)
    this.enfants.set(nom, f)
    return f
  }
  async removeEntry(nom: string) {
    if (!this.enfants.delete(nom)) throw new DOMException('absent', 'NotFoundError')
  }
  async *entries() {
    yield* [...this.enfants]
  }
}

verifierContrat('API d’accès aux fichiers du navigateur', async () => dossierNavigateur(new FauxDossier()))

describe('dossier du navigateur', () => {
  it('voit les fantômes d’iCloud sous leur vrai nom', async () => {
    const racine = new FauxDossier()
    const d = await racine.getDirectoryHandle('appareils', { create: true })
    await d.getFileHandle('.maj-1.nmj.icloud', { create: true })
    const dossier = dossierNavigateur(racine)
    expect(await dossier.lister('appareils')).toEqual([{ nom: 'maj-1.nmj', genre: 'fichier', fantome: true }])
    expect(await dossier.lire('appareils/maj-1.nmj')).toBe('fantome')
  })
})
