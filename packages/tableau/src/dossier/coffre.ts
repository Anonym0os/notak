import * as Y from 'yjs'
import { type DepotLocal, type Dossier, ErreurDossier } from './dossier'
import { type Enregistrement, decoderFichier, encoderFichier } from './fichierNotak'
import { empreinte, texteCanonique, versBase64 } from './divergence'
import { type EtatVersions, elaguerVersions, joursDisponibles, lireVersion, noterVersion } from './versions'

/**
 * Le coffre : les tableaux d'un appareil, enregistrés dans un dossier que d'autres appareils (les siens, ceux des
 * personnes avec qui on partage le dossier) lisent et écrivent aussi. La spécification est `docs/STOCKAGE.md` ;
 * les règles qui comptent :
 *
 * - chaque appareil n'écrit que dans `appareils/<son id>/`, et un fichier écrit n'est jamais modifié ;
 * - on lit tout le reste, dans n'importe quel ordre : les mises à jour Yjs se fusionnent toujours ;
 * - un fichier n'est tenu pour lu que si Yjs n'attend plus rien après lui (sinon on le relira) ;
 * - on n'efface ses anciens fichiers qu'une fois leur remplaçant vu par un autre appareil (ou après un long délai) ;
 * - un appareil qui trouve chez lui des fichiers qu'il n'a pas écrits (il a été cloné) prend un nouvel id.
 */

/** L'origine des mises à jour que le coffre applique : ce qui vient du dossier n'y retourne pas. */
export const ORIGINE_DOSSIER = 'notak:dossier'

/** Les tableaux de l'appareil, tels que le coffre les atteint. */
export interface AccesTableaux {
  /** Les tableaux que l'appareil connaît. */
  lister(): Promise<string[]>
  /**
   * Ouvre le tableau (vide s'il est inconnu) le temps de `f`. `f` s'exécute d'un seul bloc, sans attente : rien
   * d'autre ne touche le document pendant ce temps. Ce que `f` y applique doit être gardé comme le reste.
   */
  avec<T>(tableau: string, f: (doc: Y.Doc) => T): Promise<T>
}

export interface Personne {
  id: string
  nom: string
  couleur?: string
}

export interface OptionsCoffre {
  dossier: Dossier
  depot: DepotLocal
  tableaux: AccesTableaux
  /**
   * Où garder l'historique : par défaut dans le dossier de l'appareil. Pour un dossier partagé, on le met dans le
   * dossier privé de la personne, qu'un participant ne peut pas effacer.
   */
  versions?: { dossier: Dossier; chemin: string }
  /** Le nom de l'appareil (« iPhone de Samy ») et la personne qui s'en sert. */
  nom: string
  personne?: Personne
  plateforme?: string
  maintenant?: () => number
  /** Un nombre au hasard dans [0, 1) : pour les identifiants. Par défaut, le hasard du système (les essais le fixent). */
  hasard?: () => number
  /** Seul dans le dossier, combien de temps garder un fichier remplacé avant de l'effacer (7 jours). */
  delaiSeul?: number
  /** Avec d'autres appareils qui ne donnent plus signe de vie, au bout de combien de temps effacer quand même (30 jours). */
  delaiMax?: number
}

/** Un appareil vu dans le dossier. */
export interface AppareilVu {
  id: string
  nom: string
  personne?: Personne
  plateforme?: string
  /** Quand il a écrit pour la dernière fois (ms), d'après lui. */
  passage?: number
  moi: boolean
  oublie: boolean
}

export interface RapportLecture {
  /** Les tableaux qui ont reçu quelque chose. */
  tableaux: string[]
  /** Les fichiers lus pour la première fois. */
  fichiers: number
  /** Des fichiers attendent encore (fantômes, incomplets, dépendances manquantes) : il faudra relire. */
  enAttente: boolean
  /** L'appareil a découvert qu'il était cloné, ou qu'on l'avait oublié : il a pris un nouvel id. */
  nouvelId?: string
}

export interface Coffre {
  /** L'identifiant de l'appareil dans le dossier. */
  id(): string
  /** Écrit dans le dossier ce que l'appareil a changé depuis la dernière fois (tous les tableaux, ou ceux-là). */
  enregistrer(tableaux?: string[]): Promise<void>
  /** Lit ce que les autres ont écrit, et l'applique. */
  relire(): Promise<RapportLecture>
  /** Remplace le journal par une base par tableau, et efface ce qui est couvert quand c'est sûr. */
  compacter(): Promise<void>
  /** Écrit une pierre tombale pour un appareil perdu ; son dossier sera effacé quand tout en aura été lu. */
  oublier(appareil: string): Promise<void>
  appareils(): Promise<AppareilVu[]>
  /** Le dossier refuse qu'on écrive (un dossier partagé en lecture seule). */
  lectureSeule(): boolean
  /** Écrit la version du jour des tableaux modifiés depuis la précédente, et élague les vieilles. */
  versionner(): Promise<void>
  /** Les jours auxquels ce tableau peut revenir. */
  jours(tableau: string): Promise<string[]>
  /** L'état du tableau à la fin de ce jour (une mise à jour Yjs complète), ou `null`. */
  version(tableau: string, jour: string): Promise<Uint8Array | null>
  /**
   * Les tableaux dont une autre copie a le même vecteur d'état mais pas le même contenu : quelqu'un a écrit sous
   * l'identité d'un autre (C8). Revenir à une version les répare.
   */
  divergences(): Promise<{ tableau: string; appareil: string }[]>
}

// --- Ce que l'appareil garde pour lui ---------------------------------------------------------------------------

/** Ce que le dossier a reçu d'un tableau : son état écrit (vecteur et suppressions), et ce qui attend de partir. */
interface EtatJournal {
  sv: Uint8Array
  ds: Uint8Array
  attente?: Uint8Array
}

/** Un fichier que cet appareil a écrit. */
interface Ecrit {
  nom: string
  genre: 'maj' | 'base'
  tableaux: string[]
  date: number
  /** Couvert par ces bases (écrites après lui) : il partira quand elles auront été vues ailleurs. */
  remplacePar?: string[]
  depuis?: number
}

interface Registre {
  sessions: string[]
  ecrits: Ecrit[]
  /** Mes fichiers déjà effacés (couverts) : s'ils reviennent de la corbeille du nuage, ils repartent. */
  effaces?: string[]
}

const CLE_ID = 'coffre:id'
const CLE_REGISTRE = 'coffre:registre'
const CLE_LUS = 'coffre:lus'
const CLE_BASES_VUES = 'coffre:bases-vues'
/** Mes pierres tombales, et si le dossier les a reçues. */
const CLE_OUBLIES = 'coffre:oublies'
const CLE_EMPREINTES = 'coffre:empreintes'
const cleVersions = (tableau: string) => `coffre:versions:${tableau}`
const cleJournal = (tableau: string) => `coffre:journal:${tableau}`

const JOUR = 24 * 3600 * 1000
/** Combien de noms de fichiers effacés on retient, pour ré-effacer ceux qui reviennent. */
const EFFACES_RETENUS = 5000
const ALPHABET = '0123456789abcdefghijklmnopqrstuv'
const hasardSysteme = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32

const egaux = (a: Uint8Array | undefined, b: Uint8Array | undefined) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((o, i) => o === b[i]))

/** L'état écrit d'un document : son vecteur d'état, et ses suppressions (qui ne changent pas le vecteur). */
const signature = (doc: Y.Doc) => {
  const sv = Y.encodeStateVector(doc)
  return { sv, ds: Y.encodeStateAsUpdate(doc, sv) }
}
/** Ce qu'une copie a reçu, en une chaîne : deux copies qui ont tout reçu pareil ont la même. */
const etatRecu = async (sv: Uint8Array, ds: Uint8Array) => `${versBase64(sv)}.${await empreinte(ds)}`
const enAttenteDans = (doc: Y.Doc) => doc.store.pendingStructs !== null || doc.store.pendingDs !== null

// --- Les noms -----------------------------------------------------------------------------------------------------

export const DOSSIER_APPAREILS = 'appareils'
const NOM_FICHIER = /^(maj|base)-([0-9a-v]+)-(\d+)/
const estDonnees = (nom: string) => (nom.includes('.nmj') || nom.includes('.nmb')) && !nom.startsWith('.') && !nom.endsWith('.tmp') && !nom.endsWith('.crswap')
/** La session qui a écrit ce fichier, lue dans son nom (une copie de conflit garde le début du nom). */
const sessionDe = (nom: string) => NOM_FICHIER.exec(nom)?.[2]

async function lireJson<T>(dossier: Dossier, chemin: string): Promise<T | undefined> {
  const o = await dossier.lire(chemin)
  if (!(o instanceof Uint8Array)) return undefined
  try {
    const v = JSON.parse(new TextDecoder().decode(o)) as unknown
    return typeof v === 'object' && v !== null ? (v as T) : undefined
  } catch {
    return undefined
  }
}
const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v))

interface FicheAppareil {
  format: 1
  appareil: string
  nom: string
  personne?: Personne
  plateforme?: string
  passage: number
}
/** Ce qu'un appareil a lu des autres : les bases, pour que chacun sache quand effacer ce qu'elles remplacent. */
interface FicheVu {
  format: 1
  bases: Record<string, string[]>
  /**
   * Par tableau : l'état reçu (vecteur d'état et empreinte des suppressions, qui ne changent pas le vecteur) et
   * l'empreinte du contenu, pour repérer une divergence.
   */
  tableaux?: Record<string, { sv: string; empreinte: string }>
}
interface FicheOublies {
  format: 1
  appareils: string[]
}

// --- Le coffre ----------------------------------------------------------------------------------------------------

export async function ouvrirCoffre(o: OptionsCoffre): Promise<Coffre> {
  const { dossier, depot, tableaux } = o
  const maintenant = o.maintenant ?? Date.now
  const delaiSeul = o.delaiSeul ?? 7 * JOUR
  const delaiMax = o.delaiMax ?? 30 * JOUR
  const tirer = o.hasard ?? hasardSysteme
  const hasard = (n: number) => Array.from({ length: n }, () => ALPHABET[Math.floor(tirer() * 32)]).join('')

  let id = (await depot.lire<string>(CLE_ID)) ?? ''
  if (!id) {
    id = hasard(16)
    await depot.ecrire(CLE_ID, id)
  }
  // Une session par lancement : deux copies du même appareil n'écrivent jamais le même nom de fichier.
  const session = maintenant().toString(32) + hasard(6)
  let seq = 0
  const registre: Registre = (await depot.lire<Registre>(CLE_REGISTRE)) ?? { sessions: [], ecrits: [] }
  registre.sessions.push(session)
  await depot.ecrire(CLE_REGISTRE, registre)
  /** Les fichiers déjà lus, par chemin, avec leur taille. */
  const lus: Record<string, number> = (await depot.lire<Record<string, number>>(CLE_LUS)) ?? {}
  let lectureSeule = false
  let dernierPassage = 0
  const basesVues: Record<string, string[]> = (await depot.lire<Record<string, string[]>>(CLE_BASES_VUES)) ?? {}
  let basesVuesEcrites = ''
  const oublies = (await depot.lire<{ appareils: string[]; ecrit: boolean }>(CLE_OUBLIES)) ?? { appareils: [], ecrit: true }
  const empreintes = (await depot.lire<Record<string, { sv: string; empreinte: string }>>(CLE_EMPREINTES)) ?? {}
  const ouVersions = () => o.versions ?? { dossier, chemin: chez(id, 'versions') }

  const chez = (appareil: string, nom = '') => `${DOSSIER_APPAREILS}/${appareil}${nom ? `/${nom}` : ''}`

  // Les opérations passent une à une : le coffre n'est jamais au milieu de deux choses à la fois.
  let file: Promise<unknown> = Promise.resolve()
  const enFile = <T>(f: () => Promise<T>): Promise<T> => {
    const p = file.then(f, f)
    file = p.catch(() => {})
    return p
  }

  const ecrire = async (chemin: string, octets: Uint8Array) => {
    try {
      await dossier.ecrireAtomique(chemin, octets)
      lectureSeule = false
    } catch (e) {
      if (e instanceof ErreurDossier && e.cause === 'lecture-seule') lectureSeule = true
      throw e
    }
  }

  const ficheAppareil = async (force = false) => {
    const t = maintenant()
    if (!force && t - dernierPassage < 3600 * 1000) return
    const fiche: FicheAppareil = {
      format: 1,
      appareil: id,
      nom: o.nom,
      passage: t,
      ...(o.personne ? { personne: o.personne } : {}),
      ...(o.plateforme ? { plateforme: o.plateforme } : {}),
    }
    await ecrire(chez(id, 'appareil.json'), json(fiche))
    dernierPassage = t
  }

  const journal = async (tableau: string) => await depot.lire<EtatJournal>(cleJournal(tableau))

  /** Ce que l'appareil a changé dans ces tableaux depuis le dernier passage passe dans l'attente (gardée). */
  const noterChangements = async (liste: string[]) => {
    for (const tableau of liste) {
      const avant = await journal(tableau)
      const r = await tableaux.avec(tableau, (doc) => {
        const s = signature(doc)
        if (avant && egaux(avant.sv, s.sv) && egaux(avant.ds, s.ds)) return null
        // Un tableau vide qu'on n'a jamais écrit n'a rien à dire.
        if (!avant && s.sv.length === 1 && doc.store.clients.size === 0) return null
        return { ...s, diff: Y.encodeStateAsUpdate(doc, avant?.sv) }
      })
      if (!r) continue
      const attente = avant?.attente ? Y.mergeUpdates([avant.attente, r.diff]) : r.diff
      await depot.ecrire(cleJournal(tableau), { sv: r.sv, ds: r.ds, attente } satisfies EtatJournal)
    }
  }

  const nouveauNom = (genre: 'maj' | 'base') => `${genre}-${session}-${String(++seq).padStart(6, '0')}.${genre === 'maj' ? 'nmj' : 'nmb'}`

  /** Écrit un fichier de cet appareil : noté au registre avant d'exister, pour qu'il ne passe jamais pour celui d'un autre. */
  const ecrireFichier = async (genre: 'maj' | 'base', enregistrements: Enregistrement[]) => {
    const nom = nouveauNom(genre)
    const ecrit: Ecrit = { nom, genre, tableaux: [...new Set(enregistrements.map((e) => e.tableau))], date: maintenant() }
    registre.ecrits.push(ecrit)
    await depot.ecrire(CLE_REGISTRE, registre)
    const octets = await encoderFichier({ genre, enregistrements })
    await ecrire(chez(id, nom), octets)
    // Le fichier est le nôtre : inutile de le relire.
    lus[chez(id, nom)] = octets.length
    await depot.ecrire(CLE_LUS, lus)
    return ecrit
  }

  /** Envoie ce qui attend dans un fichier de journal. */
  const viderAttente = async (liste: string[]) => {
    const enregistrements: Enregistrement[] = []
    for (const tableau of liste) {
      const j = await journal(tableau)
      if (j?.attente) enregistrements.push({ tableau, maj: j.attente })
    }
    if (enregistrements.length === 0) return
    await ficheAppareil()
    await ecrireFichier('maj', enregistrements)
    for (const e of enregistrements) {
      const j = await journal(e.tableau)
      // Rien n'a pu s'y ajouter entre-temps (le coffre fait une chose à la fois), mais on vérifie quand même.
      if (j && egaux(j.attente, e.maj)) await depot.ecrire(cleJournal(e.tableau), { sv: j.sv, ds: j.ds } satisfies EtatJournal)
    }
  }

  /** Ce que j'ai lu (les bases des autres) et l'empreinte de mes tableaux, écrits quand ça change. */
  const ecrireVu = async () => {
    const fiche: FicheVu = { format: 1, bases: basesVues, tableaux: empreintes }
    const texte = JSON.stringify(fiche)
    if (texte === basesVuesEcrites || lectureSeule) return
    try {
      await ecrire(chez(id, 'vu.json'), json(fiche))
      basesVuesEcrites = texte
    } catch {
      // Un dossier en lecture seule : les autres ne sauront pas, et garderont leurs fichiers un peu plus longtemps.
    }
  }

  /**
   * Repartir sous un nouvel id : l'ancien dossier appartient à une autre copie de cet appareil, ou a été oublié.
   * L'ancien id reçoit une pierre tombale : l'autre copie, s'il y en a une, repartira aussi, et l'ancien dossier sera
   * effacé quand tout ce qu'il contient aura été lu.
   */
  const prendreNouvelId = async () => {
    const ancien = id
    id = hasard(16)
    await depot.ecrire(CLE_ID, id)
    registre.ecrits = []
    registre.sessions = [session]
    await depot.ecrire(CLE_REGISTRE, registre)
    // Tout est à réécrire sous le nouvel id : on oublie ce que l'ancien avait déjà envoyé.
    for (const tableau of await tableaux.lister()) {
      const j = await journal(tableau)
      if (j) await depot.ecrire(cleJournal(tableau), { sv: new Uint8Array([0]), ds: new Uint8Array(), ...(j.attente ? { attente: j.attente } : {}) })
    }
    dernierPassage = 0
    basesVuesEcrites = ''
    // On ajoute : une pierre tombale plus ancienne n'a peut-être pas encore été lue par l'appareil qu'elle vise.
    if (!oublies.appareils.includes(ancien)) oublies.appareils.push(ancien)
    oublies.ecrit = false
    await depot.ecrire(CLE_OUBLIES, oublies)
    await ecrireOublies()
  }

  /** Les pierres tombales partent dans le dossier ; un échec (plantage, dossier absent) se rattrape au passage suivant. */
  const ecrireOublies = async () => {
    if (oublies.ecrit || lectureSeule) return
    try {
      await ecrire(chez(id, 'oublies.json'), json({ format: 1, appareils: oublies.appareils } satisfies FicheOublies))
      oublies.ecrit = true
      await depot.ecrire(CLE_OUBLIES, oublies)
    } catch {
      // On réessaiera.
    }
  }

  const enregistrer = async (liste?: string[]) => {
    await ecrireOublies()
    const cibles = liste ?? (await tableaux.lister())
    await noterChangements(cibles)
    await viderAttente(cibles)
  }

  const relire = async (): Promise<RapportLecture> => {
    const appareils = (await dossier.lister(DOSSIER_APPAREILS)).filter((e) => e.genre === 'dossier').map((e) => e.nom)
    let enAttente = false
    let nouvelIdPris: string | undefined

    // Suis-je oublié par un autre appareil ?
    for (const a of appareils) {
      if (a === id) continue
      const oublies = await lireJson<FicheOublies>(dossier, chez(a, 'oublies.json'))
      if (oublies?.appareils?.includes(id)) {
        await prendreNouvelId()
        nouvelIdPris = id
        break
      }
    }

    const nouveaux: { chemin: string; taille: number; appareil: string; nom: string; contenu: Enregistrement[] }[] = []
    const presents = new Set<string>()
    const listes = new Set<string>()
    for (const a of appareils) {
      const entrees = await dossier.lister(chez(a))
      if (entrees.length > 0) listes.add(`${chez(a)}/`)
      for (const e of entrees) presents.add(chez(a, e.nom))
      // Les bases qu'il a effacées depuis n'ont plus à figurer dans ce que j'ai vu.
      if (basesVues[a] && entrees.length > 0) basesVues[a] = basesVues[a].filter((n) => entrees.some((e) => e.nom === n))
      for (const e of entrees) {
        if (e.genre !== 'fichier' || !estDonnees(e.nom)) continue
        const chemin = chez(a, e.nom)
        if (a === id) {
          // Chez moi, un fichier d'une session que je n'ai jamais eue : une autre copie de cet appareil écrit ici.
          const s = sessionDe(e.nom)
          if (s && !registre.sessions.includes(s) && !nouvelIdPris) {
            await prendreNouvelId()
            nouvelIdPris = id
          }
        }
        if (e.taille !== undefined && lus[chemin] === e.taille) continue
        if (e.fantome) {
          enAttente = true
          await dossier.telecharger?.(chemin)
          continue
        }
        const octets = await dossier.lire(chemin)
        if (octets === 'absent') continue
        if (octets === 'fantome') {
          enAttente = true
          await dossier.telecharger?.(chemin)
          continue
        }
        const f = await decoderFichier(octets)
        if (!f) {
          // Pas encore arrivé en entier, ou abîmé : on réessaiera.
          enAttente = true
          continue
        }
        nouveaux.push({ chemin, taille: octets.length, appareil: a, nom: e.nom, contenu: f.genre === 'version' ? [] : f.enregistrements })
        if (f.genre === 'base' && a !== id) (basesVues[a] ??= []).includes(e.nom) || basesVues[a]!.push(e.nom)
      }
    }

    // Par tableau : ce que l'appareil a changé passe d'abord dans l'attente, puis on applique ce qui est arrivé.
    const parTableau = new Map<string, Uint8Array[]>()
    for (const n of nouveaux) for (const r of n.contenu) parTableau.set(r.tableau, [...(parTableau.get(r.tableau) ?? []), r.maj])
    const enSuspens = new Set<string>()
    for (const [tableau, majs] of parTableau) {
      const avant = await journal(tableau)
      const r = await tableaux.avec(tableau, (doc) => {
        const s0 = signature(doc)
        const change = !avant || !egaux(avant.sv, s0.sv) || !egaux(avant.ds, s0.ds)
        const local = change ? Y.encodeStateAsUpdate(doc, avant?.sv) : null
        for (const maj of majs) {
          try {
            Y.applyUpdate(doc, maj, ORIGINE_DOSSIER)
          } catch {
            // Une mise à jour que Yjs refuse : elle ne deviendra pas lisible en la relisant.
          }
        }
        return { ...signature(doc), local, suspens: enAttenteDans(doc) }
      })
      if (r.suspens) enSuspens.add(tableau)
      const attente = r.local ? (avant?.attente ? Y.mergeUpdates([avant.attente, r.local]) : r.local) : avant?.attente
      await depot.ecrire(cleJournal(tableau), { sv: r.sv, ds: r.ds, ...(attente ? { attente } : {}) } satisfies EtatJournal)
    }

    // Un fichier est lu si aucun de ses tableaux n'attend plus rien de Yjs ; sinon on le relira.
    let fichiers = 0
    for (const n of nouveaux) {
      if (n.contenu.some((r) => enSuspens.has(r.tableau))) {
        enAttente = true
        continue
      }
      lus[n.chemin] = n.taille
      fichiers++
    }
    // Ce qui a disparu du dossier n'a plus à figurer parmi les fichiers lus (sauf si son dossier n'a pas pu être listé).
    for (const chemin of Object.keys(lus)) if (!presents.has(chemin) && listes.has(chemin.slice(0, chemin.lastIndexOf('/') + 1))) delete lus[chemin]
    await depot.ecrire(CLE_LUS, lus)
    if (enSuspens.size > 0) enAttente = true

    // Ce que j'ai lu des bases des autres : ils sauront qu'ils peuvent effacer ce qu'elles remplacent.
    await depot.ecrire(CLE_BASES_VUES, basesVues)
    await ecrireVu()

    return { tableaux: [...parTableau.keys()], fichiers, enAttente, ...(nouvelIdPris ? { nouvelId: nouvelIdPris } : {}) }
  }

  /**
   * Écrit une base pour chacun de ces tableaux : l'état complet que l'appareil en connaît, ce qu'il a fait et ce qu'il
   * a lu des autres. Mes fichiers dont tous les tableaux ont maintenant une base plus récente sont couverts.
   */
  const rebaser = async (liste: string[]) => {
    const vivants = registre.ecrits.filter((e) => !e.remplacePar)
    const nouvelles = new Map<string, string>()
    for (const tableau of liste) {
      const etat = await tableaux.avec(tableau, (doc) => Y.encodeStateAsUpdate(doc))
      const e = await ecrireFichier('base', [{ tableau, maj: etat }])
      nouvelles.set(tableau, e.nom)
    }
    const t = maintenant()
    for (const e of vivants) {
      const par = e.tableaux.map((x) => nouvelles.get(x))
      if (e.tableaux.length > 0 && par.every((n): n is string => !!n)) {
        e.remplacePar = [...new Set(par)]
        e.depuis = t
      }
    }
    await depot.ecrire(CLE_REGISTRE, registre)
    return [...nouvelles.values()]
  }

  const compacter = async () => {
    // D'abord tout envoyer : une base ne remplace que ce qui est déjà parti.
    await enregistrer()
    // Les tableaux qui ont plus d'un fichier vivant à eux : ceux-là gagnent à n'en avoir plus qu'un.
    const compte = new Map<string, number>()
    for (const e of registre.ecrits) if (!e.remplacePar) for (const t of e.tableaux) compte.set(t, (compte.get(t) ?? 0) + (e.genre === 'maj' ? 2 : 1))
    await rebaser([...compte].filter(([, n]) => n > 1).map(([t]) => t))
    const ailleurs = await etatAilleurs()
    await effacerCeQuiEstCouvert(ailleurs)
    await nettoyerOublies(ailleurs)
  }

  /** Les autres appareils du dossier, et celles de mes bases qu'ils disent avoir lues. */
  const etatAilleurs = async () => {
    const autres = (await dossier.lister(DOSSIER_APPAREILS)).filter((e) => e.genre === 'dossier' && e.nom !== id).map((e) => e.nom)
    const vus = new Set<string>()
    for (const a of autres) for (const nom of (await lireJson<FicheVu>(dossier, chez(a, 'vu.json')))?.bases?.[id] ?? []) vus.add(nom)
    return { autres, vus }
  }
  type Ailleurs = Awaited<ReturnType<typeof etatAilleurs>>

  /**
   * Ce que ces bases remplacent peut-il partir ? Oui quand un autre appareil les a lues (elles ont donc quitté
   * l'appareil), ou, seul dans le dossier, après un délai ; ou, quoi qu'il arrive, après un long délai.
   */
  const peutPartir = (bases: string[], depuis: number, { autres, vus }: Ailleurs) => {
    const ecoule = maintenant() - depuis
    return bases.every((n) => vus.has(n)) || (autres.length === 0 && ecoule >= delaiSeul) || ecoule >= delaiMax
  }

  /** Efface mes fichiers couverts, quand leurs remplaçants peuvent les remplacer pour de bon. */
  const effacerCeQuiEstCouvert = async (ailleurs: Ailleurs) => {
    const restants: Ecrit[] = []
    const effaces = registre.effaces ?? []
    for (const e of registre.ecrits) {
      if (!e.remplacePar || !peutPartir(e.remplacePar, e.depuis ?? maintenant(), ailleurs)) {
        restants.push(e)
        continue
      }
      try {
        await dossier.supprimer(chez(id, e.nom))
        effaces.push(e.nom)
      } catch {
        restants.push(e)
      }
    }
    // Ce qui revient de la corbeille du nuage était déjà couvert : il repart.
    const effacesSet = new Set(effaces)
    for (const e of await dossier.lister(chez(id))) if (e.genre === 'fichier' && effacesSet.has(e.nom)) await dossier.supprimer(chez(id, e.nom)).catch(() => {})
    registre.ecrits = restants
    registre.effaces = effaces.slice(-EFFACES_RETENUS)
    await depot.ecrire(CLE_REGISTRE, registre)
  }

  /**
   * Le dossier d'un appareil oublié part quand il se tait depuis longtemps, que j'ai tout lu, et que ce que j'en ai
   * lu est dans mes propres bases (lu ne suffit pas : ce serait seulement sur mes appareils, plus dans aucun fichier).
   * Les bases d'abord ; l'effacement quand elles ont été vues ailleurs, comme pour mes propres fichiers.
   */
  const nettoyerOublies = async (ailleurs: Ailleurs) => {
    for (const a of oublies.appareils) {
      const entrees = (await dossier.lister(chez(a))).filter((e) => e.genre === 'fichier')
      const cle = `coffre:oubli:${a}`
      if (entrees.length === 0) continue
      const fiche = await lireJson<FicheAppareil>(dossier, chez(a, 'appareil.json'))
      if (fiche && maintenant() - fiche.passage < delaiMax) continue
      const toutLu = entrees.filter((e) => estDonnees(e.nom)).every((e) => !e.fantome && lus[chez(a, e.nom)] === e.taille)
      if (!toutLu) continue
      const prevu = await depot.lire<{ bases: string[]; depuis: number }>(cle)
      if (!prevu) {
        await depot.ecrire(cle, { bases: await rebaser(await tableaux.lister()), depuis: maintenant() })
        continue
      }
      if (!peutPartir(prevu.bases, prevu.depuis, ailleurs)) continue
      for (const e of entrees) await dossier.supprimer(chez(a, e.nom))
      // Son historique part avec lui : le mien couvre les mêmes tableaux.
      for (const t of await dossier.lister(chez(a, 'versions')))
        for (const f of await dossier.lister(chez(a, `versions/${t.nom}`))) await dossier.supprimer(chez(a, `versions/${t.nom}/${f.nom}`))
    }
  }

  const versionner = async () => {
    const { dossier: ou, chemin } = ouVersions()
    const t = maintenant()
    for (const tableau of await tableaux.lister()) {
      const avant = await depot.lire<EtatVersions>(cleVersions(tableau))
      const lu = await tableaux.avec(tableau, (doc) => ({
        ...signature(doc),
        complet: Y.encodeStateAsUpdate(doc),
        ...(avant ? { delta: Y.encodeStateAsUpdate(doc, avant.sv) } : {}),
        canon: texteCanonique(doc),
      }))
      empreintes[tableau] = { sv: await etatRecu(lu.sv, lu.ds), empreinte: await empreinte(lu.canon) }
      try {
        const apres = await noterVersion(ou, chemin, tableau, lu, avant, t)
        if (apres) await depot.ecrire(cleVersions(tableau), apres)
        await elaguerVersions(ou, chemin, tableau, t)
      } catch {
        // Un dossier en lecture seule, ou absent : pas d'historique cette fois.
      }
    }
    await depot.ecrire(CLE_EMPREINTES, empreintes)
    await ecrireVu()
  }

  const divergences = async () => {
    const trouvees: { tableau: string; appareil: string }[] = []
    const connus = new Set(await tableaux.lister())
    const miens = new Map<string, { sv: string; empreinte: string }>()
    for (const a of (await dossier.lister(DOSSIER_APPAREILS)).filter((e) => e.genre === 'dossier' && e.nom !== id)) {
      const autres = (await lireJson<FicheVu>(dossier, chez(a.nom, 'vu.json')))?.tableaux ?? {}
      for (const [tableau, chezLui] of Object.entries(autres)) {
        if (!connus.has(tableau)) continue
        if (!miens.has(tableau)) {
          const lu = await tableaux.avec(tableau, (doc) => ({ ...signature(doc), canon: texteCanonique(doc) }))
          miens.set(tableau, { sv: await etatRecu(lu.sv, lu.ds), empreinte: await empreinte(lu.canon) })
        }
        const moi = miens.get(tableau)!
        if (moi.sv === chezLui.sv && moi.empreinte !== chezLui.empreinte) trouvees.push({ tableau, appareil: a.nom })
      }
    }
    return trouvees
  }

  const oublier = async (appareil: string) => {
    if (appareil === id || oublies.appareils.includes(appareil)) return
    oublies.appareils.push(appareil)
    oublies.ecrit = false
    await depot.ecrire(CLE_OUBLIES, oublies)
    await ecrireOublies()
  }

  const appareils = async (): Promise<AppareilVu[]> => {
    const noms = (await dossier.lister(DOSSIER_APPAREILS)).filter((e) => e.genre === 'dossier').map((e) => e.nom)
    const oublies = new Set<string>()
    for (const a of noms) for (const x of (await lireJson<FicheOublies>(dossier, chez(a, 'oublies.json')))?.appareils ?? []) oublies.add(x)
    const vus: AppareilVu[] = []
    for (const a of noms) {
      const f = await lireJson<FicheAppareil>(dossier, chez(a, 'appareil.json'))
      vus.push({
        id: a,
        nom: typeof f?.nom === 'string' ? f.nom : a,
        ...(f?.personne ? { personne: f.personne } : {}),
        ...(typeof f?.plateforme === 'string' ? { plateforme: f.plateforme } : {}),
        ...(typeof f?.passage === 'number' ? { passage: f.passage } : {}),
        moi: a === id,
        oublie: oublies.has(a),
      })
    }
    return vus
  }

  // Au premier passage, l'appareil se présente (et vérifie au passage qu'il peut écrire).
  await enFile(() => ficheAppareil(true)).catch(() => {})

  return {
    id: () => id,
    enregistrer: (liste) => enFile(() => enregistrer(liste)),
    relire: () => enFile(relire),
    compacter: () => enFile(compacter),
    oublier: (a) => enFile(() => oublier(a)),
    appareils: () => enFile(appareils),
    lectureSeule: () => lectureSeule,
    versionner: () => enFile(versionner),
    jours: (tableau) => enFile(() => joursDisponibles(ouVersions().dossier, ouVersions().chemin, tableau)),
    version: (tableau, jour) => enFile(() => lireVersion(ouVersions().dossier, ouVersions().chemin, tableau, jour)),
    divergences: () => enFile(divergences),
  }
}
