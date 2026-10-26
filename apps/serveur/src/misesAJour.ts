// Le serveur regarde de lui-même s'il existe une version plus récente de Notak : la même annonce que lisent les apps de
// bureau (`latest.json`, écrite par la publication), demandée une minute après le démarrage puis toutes les douze heures.
// Il ne fait que le dire : au journal, une fois par version, et aux admins (`GET /api/instance/mise-a-jour`). Rien ne
// s'installe seul : c'est à l'admin de tirer la nouvelle image. La réponse vient d'Internet : elle est lue comme
// hostile (taille bornée, délai, forme vérifiée champ par champ) et une réponse ratée ne change rien à ce qu'on savait.

export const DEPOT = 'Anonym0os/notak'
export const ADRESSE_ANNONCE = `https://github.com/${DEPOT}/releases/latest/download/latest.json`
export const PREMIERE_VERIFICATION_MS = 60_000
export const INTERVALLE_VERIFICATION_MS = 12 * 3600_000
const DELAI_MS = 15_000
/** L'annonce tient en quelques kilo-octets : au-delà, ce n'est pas elle. */
export const ANNONCE_MAX = 1024 * 1024
const NOTES_MAX = 20_000
const VERSION_MAX = 64

/** Une version publiée : trois nombres, sans zéro en tête, et rien d'autre (une pré-version porte un suffixe). */
const PUBLIEE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
/** Une version au sens de semver, pré-version et métadonnées comprises : celle qui tourne peut en être une. */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export interface NouvelleVersion {
  version: string
  notes: string
  /** La date de publication, en ISO 8601. */
  date: string
  /** La page de la version sur GitHub, ses notes et ses paquets. */
  adresse: string
}

export interface EtatMisesAJour {
  /** La version qui tourne. */
  actuelle: string
  /** La vérification se fait (`NOTAK_VERIFIER_MAJ` n'est pas à 0, et l'on n'est pas en développement). */
  active: boolean
  /** Le dernier instant (ms) où l'annonce a été lue et comprise. */
  verifiee?: number
  /** Une version plus récente que celle qui tourne, s'il y en a une. */
  nouvelle?: NouvelleVersion
}

export interface Verificateur {
  etat(): EtatMisesAJour
  /** Lit l'annonce maintenant ; ne lève jamais. */
  verifier(): Promise<void>
  arreter(): void
}

export interface OptionsVerificateur {
  actuelle: string
  active: boolean
  lire?: typeof fetch
  journal?: (message: string) => void
  maintenant?: () => number
  /** Faux pour les essais : rien ne part tout seul, `verifier()` s'appelle à la main. */
  programmer?: boolean
}

/** Les nombres de deux versions sans les convertir : `99999999999999999999` reste plus grand que `9`. */
const comparerNombres = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0)

/**
 * Compare deux versions selon semver : négatif si `a` vient avant `b`, positif après, zéro si elles se valent (les
 * métadonnées après `+` ne comptent pas). `null` si l'une n'est pas une version.
 */
export function comparerVersions(a: string, b: string): number | null {
  const x = SEMVER.exec(a)
  const y = SEMVER.exec(b)
  if (!x || !y) return null
  for (let i = 1; i <= 3; i++) {
    const d = comparerNombres(x[i]!, y[i]!)
    if (d !== 0) return Math.sign(d)
  }
  // À numéros égaux, une pré-version vient avant la version elle-même.
  const [p, q] = [x[4], y[4]]
  if (p === undefined || q === undefined) return p === q ? 0 : p === undefined ? 1 : -1
  const [u, v] = [p.split('.'), q.split('.')]
  for (let i = 0; i < Math.min(u.length, v.length); i++) {
    const [s, t] = [u[i]!, v[i]!]
    const [ns, nt] = [/^\d+$/.test(s), /^\d+$/.test(t)]
    const d = ns && nt ? comparerNombres(s, t) : ns ? -1 : nt ? 1 : s < t ? -1 : s > t ? 1 : 0
    if (d !== 0) return Math.sign(d)
  }
  return Math.sign(u.length - v.length)
}

/**
 * L'annonce lue, réduite à ce qu'on en garde, ou `null` si elle n'a pas la forme attendue. Une pré-version n'est pas
 * proposée à un serveur : seul un numéro sans suffixe passe.
 */
export function lireAnnonce(valeur: unknown): NouvelleVersion | null {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return null
  const { version, notes, pub_date: date } = valeur as Record<string, unknown>
  if (typeof version !== 'string' || version.length > VERSION_MAX || !PUBLIEE.test(version)) return null
  if (typeof notes !== 'string' || typeof date !== 'string' || date.length > 40 || Number.isNaN(Date.parse(date))) return null
  return {
    version,
    notes: notes.slice(0, NOTES_MAX),
    date: new Date(date).toISOString(),
    adresse: `https://github.com/${DEPOT}/releases/tag/v${version}`,
  }
}

/** Le corps de la réponse, jusqu'à `max` octets ; au-delà, la lecture s'arrête et lève. */
async function lireBorne(reponse: Response, max: number): Promise<string> {
  if (Number(reponse.headers.get('content-length')) > max) {
    void reponse.body?.cancel().catch(() => {})
    throw new Error('annonce trop grosse')
  }
  if (!reponse.body) return ''
  const lecteur = reponse.body.getReader()
  const morceaux: Uint8Array[] = []
  let taille = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    taille += value.length
    if (taille > max) {
      void lecteur.cancel().catch(() => {})
      throw new Error('annonce trop grosse')
    }
    morceaux.push(value)
  }
  return Buffer.concat(morceaux).toString('utf8')
}

export function creerVerificateur(o: OptionsVerificateur): Verificateur {
  const lire = o.lire ?? fetch
  const journal = o.journal ?? console.log
  const maintenant = o.maintenant ?? Date.now
  const etat: EtatMisesAJour = { actuelle: o.actuelle, active: o.active }
  /** Les versions déjà dites au journal : une seule fois chacune, pas toutes les douze heures. */
  const dites = new Set<string>()
  let enCours: Promise<void> | null = null
  const minuteries: ReturnType<typeof setTimeout>[] = []

  const verifierUneFois = async () => {
    try {
      const reponse = await lire(ADRESSE_ANNONCE, { redirect: 'follow', signal: AbortSignal.timeout(DELAI_MS), headers: { accept: 'application/json' } })
      if (!reponse.ok) {
        void reponse.body?.cancel().catch(() => {})
        return
      }
      const annonce = lireAnnonce(JSON.parse(await lireBorne(reponse, ANNONCE_MAX)))
      if (!annonce) return
      etat.verifiee = maintenant()
      const ecart = comparerVersions(annonce.version, o.actuelle)
      if (ecart === null || ecart <= 0) {
        delete etat.nouvelle
        return
      }
      etat.nouvelle = annonce
      if (!dites.has(annonce.version)) {
        dites.add(annonce.version)
        journal(
          `Notak : la version ${annonce.version} est disponible (ce serveur est en ${o.actuelle}). Ses notes : ${annonce.adresse}\n` +
            '  Pour mettre à jour, dans le dossier de compose.yaml : docker compose pull && docker compose up -d',
        )
      }
    } catch {
      // Réseau coupé, GitHub injoignable, réponse illisible : on réessaiera à la prochaine échéance.
    }
  }

  const verifier = () => {
    if (!enCours) enCours = verifierUneFois().finally(() => (enCours = null))
    return enCours
  }

  if (o.active && o.programmer !== false) {
    const premiere = setTimeout(() => {
      void verifier()
      const suivantes = setInterval(() => void verifier(), INTERVALLE_VERIFICATION_MS)
      suivantes.unref()
      minuteries.push(suivantes)
    }, PREMIERE_VERIFICATION_MS)
    premiere.unref()
    minuteries.push(premiere)
  }

  return {
    etat: () => ({ ...etat, ...(etat.nouvelle ? { nouvelle: { ...etat.nouvelle } } : {}) }),
    verifier: () => (o.active ? verifier() : Promise.resolve()),
    arreter() {
      for (const m of minuteries) clearTimeout(m)
      minuteries.length = 0
    },
  }
}
