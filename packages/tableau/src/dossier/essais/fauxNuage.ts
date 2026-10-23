import { type Dossier, type EntreeDossier, ErreurDossier } from '../dossier'

/**
 * Un faux logiciel de synchro : un nuage, et une copie locale du dossier par appareil. Il fait, au hasard d'une
 * graine (donc de façon rejouable), tout ce que font les vrais : livrer en retard et dans le désordre, livrer un
 * fichier à moitié avant de le livrer en entier, remplacer un fichier par un fantôme à télécharger, propager une
 * suppression avant la création qui la précédait, faire réapparaître un fichier effacé, et créer une copie de
 * conflit sous un autre nom quand deux appareils écrivent le même chemin.
 */

/** Un générateur de nombres pseudo-aléatoires à graine (mulberry32). */
export function generateur(graine: number) {
  let a = graine >>> 0
  const suivant = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    suivant,
    entier: (n: number) => Math.floor(suivant() * n),
    vrai: (p: number) => suivant() < p,
    choisir: <T>(l: readonly T[]) => l[Math.floor(suivant() * l.length)]!,
  }
}
export type Hasard = ReturnType<typeof generateur>

export interface Fautes {
  /** Probabilité qu'un fichier arrive d'abord tronqué. */
  tronque: number
  /** Probabilité qu'un fichier arrive comme fantôme. */
  fantome: number
  /** Probabilité, à chaque pas, qu'un fichier effacé réapparaisse (une restauration depuis la corbeille du nuage). */
  resurrection: number
}

export const FAUTES_ORDINAIRES: Fautes = { tronque: 0.15, fantome: 0.15, resurrection: 0.02 }

interface Local {
  octets: Uint8Array
  fantome?: boolean
}

/** Un changement en route : vers le nuage (envoi) ou vers un appareil (livraison). */
type Envoi = { vue: VueLocale; chemin: string; octets: Uint8Array | null; versionVue: number }
type Livraison = { vue: VueLocale; chemin: string; octets: Uint8Array | null; tronque?: boolean; fantome?: boolean }

const FORMES_CONFLIT = [
  (base: string, ext: string, n: number) => `${base} ${n + 1}${ext}`, // iCloud
  (base: string, ext: string) => `${base} (copie en conflit de Léa 2026-10-23)${ext}`, // Dropbox
  (base: string, ext: string) => `${base}-PC-DE-LEA${ext}`, // OneDrive
  (base: string, ext: string, n: number) => `${base}.sync-conflict-20261023-12000${n}-ABCDEFG${ext}`, // Syncthing
]

export class FauxNuage {
  readonly hasard: Hasard
  /** Le contenu du nuage, par chemin, et sa version. */
  readonly verite = new Map<string, { octets: Uint8Array; version: number }>()
  /** Ce qui a été effacé du nuage, pour le faire réapparaître. */
  private readonly effaces = new Map<string, Uint8Array>()
  private envois: Envoi[] = []
  private livraisons: Livraison[] = []
  readonly vues: VueLocale[] = []
  /** Qui a écrit chaque fichier de données : deux auteurs pour un même chemin violent la règle d'écrivain unique. */
  readonly auteurs = new Map<string, Set<string>>()
  private version = 0

  constructor(
    graine: number,
    readonly fautes: Fautes = FAUTES_ORDINAIRES,
  ) {
    this.hasard = generateur(graine)
  }

  /** Un appareil de plus : sa copie locale part de ce que le nuage contient (sauf `vide`). */
  vue(nom: string, options: { lectureSeule?: boolean; copieDe?: VueLocale } = {}): VueLocale {
    const v = new VueLocale(this, nom, options.lectureSeule ?? false)
    if (options.copieDe) {
      // Une copie d'un autre disque : le logiciel de synchro la remet ensuite à jour avec le nuage.
      for (const [c, l] of options.copieDe.local) v.local.set(c, { ...l })
      for (const [c, f] of this.verite) this.livraisons.push({ vue: v, chemin: c, octets: f.octets })
      for (const c of options.copieDe.local.keys()) if (!this.verite.has(c)) this.livraisons.push({ vue: v, chemin: c, octets: null })
    } else for (const [c, f] of this.verite) v.local.set(c, { octets: f.octets, fantome: this.hasard.vrai(this.fautes.fantome) })
    this.vues.push(v)
    return v
  }

  envoyer(e: Envoi) {
    // Un appareil qui réécrit un fichier pas encore parti n'envoie que la dernière version (comme les vrais).
    const avant = this.envois.findIndex((x) => x.vue === e.vue && x.chemin === e.chemin)
    if (avant >= 0) {
      e.versionVue = this.envois[avant]!.versionVue
      this.envois.splice(avant, 1)
    }
    this.envois.push(e)
  }

  enRoute() {
    return this.envois.length + this.livraisons.length
  }

  /** Fait avancer le monde de quelques événements, dans le désordre. */
  pas(n = 1 + this.hasard.entier(4)) {
    for (let i = 0; i < n; i++) {
      const total = this.envois.length + this.livraisons.length
      if (total === 0) break
      const k = this.hasard.entier(total)
      if (k < this.envois.length) this.recevoir(this.envois.splice(k, 1)[0]!)
      else this.livrer(this.livraisons.splice(k - this.envois.length, 1)[0]!)
    }
    if (this.effaces.size > 0 && this.hasard.vrai(this.fautes.resurrection)) {
      const [chemin, octets] = this.hasard.choisir([...this.effaces])
      this.effaces.delete(chemin)
      this.poser(chemin, octets, null)
    }
  }

  /** Tout ce qui est en route arrive, en entier (les fantômes restent des fantômes tant qu'on ne les demande pas). */
  toutLivrer() {
    for (let garde = 0; this.enRoute() > 0 && garde < 100_000; garde++) this.pas(50)
  }

  private recevoir(e: Envoi) {
    const actuel = this.verite.get(e.chemin)
    if (e.octets === null) {
      if (!actuel) return
      this.verite.delete(e.chemin)
      this.effaces.set(e.chemin, actuel.octets)
      for (const v of this.vues) if (v !== e.vue) this.livraisons.push({ vue: v, chemin: e.chemin, octets: null })
      return
    }
    // Quelqu'un a changé ce chemin depuis que cet appareil l'a vu : le nuage garde les deux, l'un sous un autre nom.
    if (actuel && actuel.version !== e.versionVue && !egaux(actuel.octets, e.octets)) {
      const point = e.chemin.lastIndexOf('.')
      const [base, ext] = point > e.chemin.lastIndexOf('/') ? [e.chemin.slice(0, point), e.chemin.slice(point)] : [e.chemin, '']
      const forme = this.hasard.choisir(FORMES_CONFLIT)
      this.poser(forme(base, ext, this.hasard.entier(9)), e.octets, null)
      return
    }
    this.poser(e.chemin, e.octets, e.vue)
  }

  /** Le nuage prend un contenu et le fait descendre chez tous (sauf chez celui qui l'a envoyé). */
  private poser(chemin: string, octets: Uint8Array, de: VueLocale | null) {
    const version = ++this.version
    this.verite.set(chemin, { octets, version })
    this.effaces.delete(chemin)
    if (de) de.versions.set(chemin, version)
    for (const v of this.vues) {
      if (v === de) continue
      if (this.hasard.vrai(this.fautes.tronque) && octets.length > 1) {
        this.livraisons.push({ vue: v, chemin, octets: octets.slice(0, 1 + this.hasard.entier(octets.length - 1)), tronque: true })
      }
      this.livraisons.push({ vue: v, chemin, octets, fantome: this.hasard.vrai(this.fautes.fantome) })
    }
  }

  private livrer(l: Livraison) {
    if (!l.vue.connectee) {
      // Hors ligne : la livraison attendra.
      this.livraisons.push(l)
      return
    }
    if (l.octets === null) {
      l.vue.local.delete(l.chemin)
      return
    }
    // Une livraison tronquée qui arrive après la complète (ou son fantôme) ne l'écrase pas : le vrai logiciel finit
    // toujours par livrer la dernière version en entier.
    if (l.tronque && l.vue.local.has(l.chemin)) return
    l.vue.local.set(l.chemin, { octets: l.octets, ...(l.fantome ? { fantome: true } : {}) })
    l.vue.versions.set(l.chemin, this.verite.get(l.chemin)?.version ?? 0)
  }

  /** Un fantôme qu'un appareil demande : il descend au prochain pas. */
  demander(vue: VueLocale, chemin: string) {
    const f = this.verite.get(chemin)
    if (f) this.livraisons.push({ vue, chemin, octets: f.octets })
  }
}

const egaux = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((o, i) => o === b[i])

/** La copie locale du dossier sur un appareil, vue comme un `Dossier`. */
export class VueLocale implements Dossier {
  readonly local = new Map<string, Local>()
  /** La version du nuage de chaque chemin, telle que cet appareil l'a vue en dernier. */
  readonly versions = new Map<string, number>()
  connectee = true
  /** Le prochain `ecrireAtomique` plante après avoir laissé son fichier temporaire. */
  planterAuProchainEcrit = false

  constructor(
    private readonly nuage: FauxNuage,
    readonly nom: string,
    public lectureSeule: boolean,
  ) {}

  async lister(chemin: string): Promise<EntreeDossier[]> {
    const prefixe = chemin ? `${chemin}/` : ''
    const vus = new Map<string, EntreeDossier>()
    for (const [c, l] of this.local) {
      if (!c.startsWith(prefixe)) continue
      const reste = c.slice(prefixe.length)
      const i = reste.indexOf('/')
      if (i >= 0) vus.set(reste.slice(0, i), { nom: reste.slice(0, i), genre: 'dossier' })
      else vus.set(reste, { nom: reste, genre: 'fichier', taille: l.octets.length, ...(l.fantome ? { fantome: true } : {}) })
    }
    return [...vus.values()]
  }

  async lire(chemin: string) {
    const l = this.local.get(chemin)
    if (!l) return 'absent' as const
    if (l.fantome) return 'fantome' as const
    return l.octets.slice()
  }

  async ecrireAtomique(chemin: string, octets: Uint8Array) {
    if (this.lectureSeule) throw new ErreurDossier('dossier en lecture seule', 'lecture-seule')
    const tmp = `${chemin}.tmp`
    this.local.set(tmp, { octets: octets.slice() })
    this.nuage.envoyer({ vue: this, chemin: tmp, octets: octets.slice(), versionVue: this.versions.get(tmp) ?? 0 })
    if (this.planterAuProchainEcrit) {
      this.planterAuProchainEcrit = false
      throw new Error('plantage pendant l’écriture')
    }
    this.local.delete(tmp)
    this.nuage.envoyer({ vue: this, chemin: tmp, octets: null, versionVue: 0 })
    this.local.set(chemin, { octets: octets.slice() })
    if (/\.nm[jb]$/.test(chemin)) {
      const a = this.nuage.auteurs.get(chemin) ?? new Set()
      a.add(this.nom)
      this.nuage.auteurs.set(chemin, a)
    }
    this.nuage.envoyer({ vue: this, chemin, octets: octets.slice(), versionVue: this.versions.get(chemin) ?? 0 })
  }

  async supprimer(chemin: string) {
    if (this.lectureSeule) throw new ErreurDossier('dossier en lecture seule', 'lecture-seule')
    if (!this.local.has(chemin)) return
    this.local.delete(chemin)
    this.nuage.envoyer({ vue: this, chemin, octets: null, versionVue: 0 })
  }

  async telecharger(chemin: string) {
    this.nuage.demander(this, chemin)
  }
}
