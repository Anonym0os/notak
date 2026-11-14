import { createHmac, timingSafeEqual } from 'node:crypto'
import type * as Y from 'yjs'
import { nouvelId, planApres } from './arrivee.ts'
import { normaliserOrigine } from './auth.ts'
import type { Base, Rattachement } from './base.ts'
import type { ElementLu } from './contenu.ts'
import type { Garde } from './controle.ts'

/**
 * Une source de rattachements (`NOTAK_RATTACHEMENTS`) : un autre outil, dont chaque fiche (un client, un projet…) peut
 * avoir son dossier ici. L'outil ouvre `/relier?source=…&cle=…` ; Notak y trouve le dossier de la fiche, ou le crée
 * quand on le lui demande, rangé dans celui de la source. Rien de propre à cet outil n'est écrit dans Notak : seulement
 * ce que dit l'environnement.
 */
export interface SourceRattachement {
  /** Ce que l'outil écrit dans l'adresse, en lettres simples. */
  source: string
  /** Son nom, tel que les gens le lisent (« Ouvrir la fiche dans … »). */
  nom: string
  /** Le titre du dossier qui range ceux de la source. */
  dossier: string
  /** L'origine des fiches : l'adresse de retour doit y être, et seules ses pages lisent un dossier depuis l'outil. */
  origine: string
  /** L'espace où ranger ; absent, l'espace personnel de qui crée. */
  espace?: string
  /**
   * Le secret partagé avec l'outil (32 caractères au moins) : il signe ce que l'outil demande (`POST /api/outils/…`)
   * et ce que Notak lui envoie. Sans lui, ni l'un ni l'autre. Jamais rendu par l'API.
   */
  secret?: string
  /** Où Notak prévient l'outil de ce que les gens font des dossiers (`dossier.cree`, `.jete`, `.remis`) ; avec `secret`. */
  webhook?: string
  /**
   * L'outil reçoit aussi les signalements de bugs (⇧⌘S) : chacun lui est annoncé (`signalement.depose`), il le relit
   * (`lire_signalement`), en fait un ticket, puis le classe (`classer_signalement`). Avec `secret` et `webhook`.
   */
  signalements?: true
}

/** Ce que Notak envoie à un outil, et rien d'autre (docs/AUTO-HEBERGER.md, « Le catalogue »). */
export type TypeEnvoi = 'dossier.cree' | 'dossier.jete' | 'dossier.remis' | 'signalement.depose'
/** Ce qu'un outil peut demander à Notak, et rien d'autre. `fusionner` est réservé : refusé tant qu'il n'est pas écrit. */
export const ACTIONS_OUTIL = ['lire', 'jeter', 'remettre', 'fusionner', 'lire_signalement', 'classer_signalement'] as const
/** Les actions qui portent sur un signalement, et non sur la fiche d'un dossier : `cle` vaut `signalement:<id>`. */
export const ACTIONS_SIGNALEMENT: readonly ActionOutil[] = ['lire_signalement', 'classer_signalement']
export type ActionOutil = (typeof ACTIONS_OUTIL)[number]
/** L'identifiant d'une demande d'un outil : ce qui la rend sûre à renvoyer. */
export const ID_DEMANDE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const SECRET_MIN = 32

const NOM_SOURCE = /^[a-z0-9][a-z0-9-]{0,31}$/
/** La clé d'une fiche dans l'outil (`societe:42`) : courte, et sans rien qui se lise autrement dans une adresse. */
export const CLE_FICHE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/
const TITRE_MAX = 200

/**
 * Les sources que décrit `NOTAK_RATTACHEMENTS`, une liste JSON. Une entrée illisible est signalée, puis laissée de
 * côté : le reste du serveur démarre.
 */
export function sourcesDe(valeur: string | undefined, signaler: (message: string) => void = console.warn): SourceRattachement[] {
  const brute = valeur?.trim()
  if (!brute) return []
  let liste: unknown
  try {
    liste = JSON.parse(brute)
  } catch {
    signaler('Notak : NOTAK_RATTACHEMENTS n’est pas du JSON : aucun rattachement')
    return []
  }
  if (!Array.isArray(liste)) {
    signaler('Notak : NOTAK_RATTACHEMENTS doit être une liste ([{"source": …}]) : aucun rattachement')
    return []
  }
  const lues = new Map<string, SourceRattachement>()
  for (const [i, e] of liste.entries()) {
    const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
    const champ = (nom: string) => (typeof o[nom] === 'string' ? (o[nom] as string).trim() : '')
    const source = champ('source')
    const origine = normaliserOrigine(champ('origine'))
    const refus = !NOM_SOURCE.test(source)
      ? '« source » en minuscules, chiffres et tirets'
      : !champ('nom')
        ? '« nom » manque'
        : !champ('dossier')
          ? '« dossier » manque'
          : !origine || !/^https?:\/\//.test(origine)
            ? '« origine » doit être une adresse en http(s)'
            : lues.has(source)
              ? `la source « ${source} » est déjà déclarée`
              : null
    if (refus) {
      signaler(`Notak : NOTAK_RATTACHEMENTS, entrée ${i + 1} ignorée : ${refus}`)
      continue
    }
    const espace = champ('espace')
    // Le secret et le webhook : facultatifs ; écrits de travers, ils sont oubliés (et dits), pas la source.
    const secret = champ('secret')
    const secretLu = secret && secret.length >= SECRET_MIN ? secret : undefined
    if (secret && !secretLu) signaler(`Notak : NOTAK_RATTACHEMENTS, « ${source} » : le secret doit faire ${SECRET_MIN} caractères au moins ; il est ignoré`)
    const webhook = adresseDeWebhook(champ('webhook'))
    if (champ('webhook') && !webhook) signaler(`Notak : NOTAK_RATTACHEMENTS, « ${source} » : le webhook doit être une adresse en https ; il est ignoré`)
    else if (webhook && !secretLu) signaler(`Notak : NOTAK_RATTACHEMENTS, « ${source} » : un webhook sans secret ne reçoit rien`)
    const signalements = o.signalements === true && Boolean(webhook && secretLu)
    if (o.signalements === true && !signalements) signaler(`Notak : NOTAK_RATTACHEMENTS, « ${source} » : les signalements demandent un secret et un webhook ; ils ne lui sont pas envoyés`)
    lues.set(source, {
      source,
      nom: champ('nom').slice(0, 60),
      dossier: champ('dossier').slice(0, TITRE_MAX),
      origine: origine!,
      ...(espace ? { espace } : {}),
      ...(secretLu ? { secret: secretLu } : {}),
      ...(webhook && secretLu ? { webhook } : {}),
      ...(signalements ? { signalements: true as const } : {}),
    })
  }
  return [...lues.values()]
}

/**
 * Un dossier compte-t-il pour sa source ? Une source qui nomme son espace (l'espace de l'équipe) n'a ses dossiers que
 * là : ceux rangés avant dans l'espace personnel de quelqu'un, du temps où elle n'en nommait pas, restent à qui les a
 * créés, comme n'importe quel dossier, mais l'outil ne les lit plus et n'en est plus prévenu. Sans espace nommé, chacun
 * a les siens dans son espace personnel, et tous comptent.
 */
export function dossierDeLaSource(sources: readonly SourceRattachement[], r: Pick<Rattachement, 'source' | 'espace'>): boolean {
  const s = sources.find((x) => x.source === r.source)
  return Boolean(s) && (!s!.espace || s!.espace === r.espace)
}

/**
 * Les dossiers qu'un outil a générés et qui comptent pour lui (celui de chaque fiche, et celui qui les range), avec le
 * nom de l'outil : ils restent tels qu'il les a faits, là où il les a mis, comme ses fiches chez lui. On range dedans ce
 * qu'on veut. Un ancien, qu'il ne lit plus, redevient un dossier comme un autre.
 */
export function dossiersGeneres(sources: readonly SourceRattachement[], rattachements: readonly Pick<Rattachement, 'source' | 'espace' | 'tableau'>[]): Map<string, string> {
  return new Map(
    rattachements.flatMap((r) => {
      const s = sources.find((x) => x.source === r.source)
      return s && dossierDeLaSource(sources, r) ? [[r.tableau, s.nom] as const] : []
    }),
  )
}

/**
 * Ce que la synchro garde d'un document, lu à son ouverture : le dossier généré qu'il est (son `meta`), et les cartes
 * de dossiers générés qu'il porte. `null` : il n'a rien à garder, et ses mises à jour passent sans contrôle. Ce qu'un
 * outil demande, et ce que Notak fait lui-même, ne passe pas par là.
 */
export function gardeDesDossiers(o: { base: Base; sources: () => readonly SourceRattachement[] }): (tableau: string) => Garde | null {
  const genere = (id: string) => dossiersGeneres(o.sources(), o.base.rattachementsDe([id])).has(id)
  return (tableau) => {
    const sources = o.sources()
    if (sources.length === 0) return null
    const ligne = o.base.contenus([tableau]).find((l) => l.genre === 'toile')
    const lu = ligne ? (JSON.parse(ligne.resume) as { cartes?: string[]; jetees?: string[] }) : {}
    const portees = [...(lu.cartes ?? []), ...(lu.jetees ?? [])]
    const generes = dossiersGeneres(sources, o.base.rattachementsDe([tableau, ...portees]))
    if (!generes.has(tableau) && !portees.some((id) => generes.has(id))) return null
    // La carte se juge à chaque geste : un dossier généré depuis l'ouverture (une fiche neuve) est gardé aussitôt.
    return { meta: generes.has(tableau), carte: genere }
  }
}

/** Le titre d'un dossier : sans blancs autour, borné, et à défaut la clé de la fiche. */
export const titreDuDossier = (titre: unknown, cle: string) => (typeof titre === 'string' ? titre.trim().slice(0, TITRE_MAX) : '') || cle

/**
 * L'adresse de la fiche, si elle est bien chez l'outil : une autre ferait du lien « Ouvrir la fiche » une porte vers
 * n'importe où. `undefined` : pas d'adresse ; `null` : refusée.
 */
export function adresseDeLaFiche(adresse: unknown, source: SourceRattachement): string | null | undefined {
  if (adresse === undefined || adresse === null || adresse === '') return undefined
  if (typeof adresse !== 'string' || adresse.length > 2000) return null
  try {
    const u = new URL(adresse)
    return u.origin === source.origine ? u.href : null
  } catch {
    return null
  }
}

/** Le document d'une toile neuve qui se montre en dossier : son titre, et la marque du dossier. */
export function ecrireDossierNeuf(doc: Y.Doc, titre: string): void {
  const meta = doc.getMap<unknown>('meta')
  doc.transact(() => {
    meta.set('titre', titre)
    meta.set('dossier', true)
  })
}

/** La largeur d'une carte de toile, celle que pose la bibliothèque (`rangement.ts`). */
const LARGEUR_CARTE = 10

/**
 * Pose sur une toile la carte d'une autre, à droite de ce qu'elle porte déjà (en haut du contenu), au-dessus de tout,
 * comme la bibliothèque le fait de ses dossiers neufs : c'est la carte qui range la toile dans l'autre. Écrite à même
 * le document, comme `poserDansNonTries` : le magasin de la toile ne se charge pas sous Node.
 */
export function poserCarteDeToile(doc: Y.Doc, cible: string, maintenant: number): void {
  const stockes = doc.getMap<ElementLu & { plan?: string }>('elements')
  doc.transact(() => {
    let plan = ''
    const posables: ElementLu[] = []
    stockes.forEach((e) => {
      if (typeof e.plan === 'string' && e.plan > plan) plan = e.plan
      if (!e.parent && e.corbeille === undefined && e.nonTrie === undefined && e.contenu?.type !== 'ligne' && Number.isFinite(e.x) && Number.isFinite(e.y)) posables.push(e)
    })
    const x = posables.length === 0 ? 5 : Math.max(...posables.map((e) => e.x + (Number.isFinite(e.largeur) ? e.largeur : 0))) + 4
    const y = posables.length === 0 ? 5 : Math.min(...posables.map((e) => e.y))
    const id = nouvelId(maintenant)
    stockes.set(id, { id, x, y, largeur: LARGEUR_CARTE, contenu: { type: 'tableau', cible }, plan: planApres(plan) })
  })
}

/** Une adresse de webhook : en https, ou en http vers cette machine (un essai). */
function adresseDeWebhook(brute: string): string | null {
  if (!brute) return null
  try {
    const u = new URL(brute)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
    return u.protocol === 'https:' || (u.protocol === 'http:' && local) ? u.href : null
  } catch {
    return null
  }
}

// ---- La signature : `Notak-Signature: t=<secondes>,v1=<hex>`, l'HMAC-SHA256 de `<t>.<corps>` ----

/** L'en-tête qui signe `corps` à l'instant `maintenant` (ms). */
export function signer(secret: string, corps: string, maintenant: number): string {
  const t = Math.floor(maintenant / 1000)
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex')}`
}

/**
 * L'en-tête signe-t-il ce corps, à `tolerance` secondes près de `maintenant` (ms) ? Plusieurs `v1` passent, comme
 * pendant le changement d'un secret. Une demande captée ne se rejoue donc pas plus tard ; avant, l'identifiant de la
 * demande la rend sans effet.
 */
export function signatureValable(secret: string, corps: string, entete: string | null | undefined, maintenant: number, tolerance = 300): boolean {
  if (!entete) return false
  let t: string | null = null
  const signatures: string[] = []
  for (const morceau of entete.split(',')) {
    const [cle, ...reste] = morceau.trim().split('=')
    const valeur = reste.join('=').trim()
    if (cle === 't' && /^\d+$/.test(valeur)) t = valeur
    else if (cle === 'v1' && /^[0-9a-f]{64}$/i.test(valeur)) signatures.push(valeur.toLowerCase())
  }
  if (t === null || signatures.length === 0 || Math.abs(maintenant / 1000 - Number(t)) > tolerance) return false
  const attendue = Buffer.from(createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex'))
  return signatures.some((v) => timingSafeEqual(attendue, Buffer.from(v)))
}

// ---- Les gestes des personnes sur les dossiers rattachés ----

/** Les cartes de toiles qu'un enregistrement vient de jeter à la corbeille, ou d'en remettre (`indexerDocument`). */
export interface ChangementDeCartes {
  jetees: string[]
  remises: string[]
}
export const AUCUNE_CARTE: ChangementDeCartes = { jetees: [], remises: [] }

/** D'un résumé de toile à l'autre : une carte qui part à la corbeille, une qui en revient. Une carte effacée (corbeille vidée) n'y est pas. */
export function changementDeCartes(
  avant: { cartes?: readonly string[]; jetees?: readonly string[] } | null,
  apres: { cartes?: readonly string[]; jetees?: readonly string[] } | null,
): ChangementDeCartes {
  const [ca, ja, cp, jp] = [avant?.cartes, avant?.jetees, apres?.cartes, apres?.jetees].map((l) => new Set(l ?? []))
  return {
    jetees: [...jp!].filter((id) => ca!.has(id) && !cp!.has(id)),
    remises: [...cp!].filter((id) => ja!.has(id) && !ca!.has(id)),
  }
}

/**
 * Ce que deviennent les dossiers rattachés quand une personne jette ou remet leur carte : la table le retient (elle
 * fait foi, même la corbeille vidée), et l'outil en est prévenu. Un geste que l'outil a demandé lui-même est déjà dans
 * la table : il n'y change rien, et rien ne lui revient.
 */
export function suivreLesDossiers(o: { base: Base; sources: () => readonly SourceRattachement[]; maintenant: () => number }) {
  return (changement: ChangementDeCartes, par: { nom: string } | undefined): void => {
    const touchees = [...changement.jetees, ...changement.remises]
    if (touchees.length === 0) return
    const jetees = new Set(changement.jetees)
    for (const r of o.base.rattachementsDe(touchees)) {
      if (!r.cle || !dossierDeLaSource(o.sources(), r)) continue
      const jete = jetees.has(r.tableau)
      if (jete === (r.corbeille !== null)) continue
      const quand = o.maintenant()
      o.base.marquerCorbeille(r, jete ? quand : null, jete ? 'personne' : null)
      mettreEnFile(o.base, o.sources(), r.source, jete ? 'dossier.jete' : 'dossier.remis', r.cle, quand, par?.nom ?? null)
    }
  }
}

/**
 * Annonce un signalement à chaque outil qui les reçoit. L'envoi porte un identifiant tiré du signalement : annoncé
 * deux fois (au dépôt, puis au démarrage tant qu'il attend), il n'entre qu'une fois dans la file, et l'outil reçoit le
 * même `id` à chaque essai.
 */
export function annoncerSignalement(base: Base, sources: readonly SourceRattachement[], signalement: string, quand: number, par: string | null): void {
  for (const s of sources) {
    if (!s.signalements || !s.webhook || !s.secret) continue
    const id = `signalement:${signalement}`
    const charge = JSON.stringify({ id, type: 'signalement.depose', cle: id, quand, par })
    base.mettreEnvoiEnFile({ id: `${s.source}:${id}`, source: s.source, type: 'signalement.depose', charge, cree: quand, prochain: quand })
  }
}

/** Met un envoi dans la file, si la source a de quoi le recevoir. */
export function mettreEnFile(base: Base, sources: readonly SourceRattachement[], source: string, type: TypeEnvoi, cle: string, quand: number, par: string | null): void {
  const s = sources.find((x) => x.source === source)
  if (!s?.webhook || !s.secret) return
  const id = nouvelId(quand)
  base.mettreEnvoiEnFile({ id, source, type, charge: JSON.stringify({ id, type, cle, quand, par }), cree: quand, prochain: quand })
}

/** Pose ou retire la marque de la corbeille sur la carte d'une toile, dans le document qui la porte. Rend s'il l'a trouvée. */
export function marquerCarte(doc: Y.Doc, cible: string, corbeille: number | null): boolean {
  const stockes = doc.getMap<ElementLu & { plan?: string }>('elements')
  let trouvee = false
  doc.transact(() => {
    for (const [id, e] of [...stockes.entries()]) {
      if (e.contenu?.type !== 'tableau' || e.contenu.cible !== cible || e.contenu.raccourci) continue
      trouvee = true
      if (corbeille === null) {
        if (e.corbeille === undefined) continue
        const { corbeille: _c, ...reste } = e
        stockes.set(id, reste)
      } else if (e.corbeille === undefined) stockes.set(id, { ...e, corbeille })
    }
  })
  return trouvee
}

// ---- La file d'envoi ----

/** Le délai avant le prochain essai : une minute, puis le double, une heure au plus. */
export const delaiDEssai = (essais: number) => Math.min(60_000 * 2 ** Math.max(0, essais - 1), 3_600_000)
/** Au-delà, l'envoi est abandonné : environ une semaine d'essais. */
export const ESSAIS_MAX = 180

/**
 * Envoie ce qui attend dans la file, signé, à chaque outil ; relance plus tard ce qui échoue. `envoyer` : `fetch`, sauf
 * dans les essais. Rend combien sont partis.
 */
export async function viderLaFile(o: {
  base: Base
  sources: readonly SourceRattachement[]
  maintenant: () => number
  envoyer?: typeof fetch
}): Promise<number> {
  const envoyer = o.envoyer ?? fetch
  let partis = 0
  for (const e of o.base.envoisAFaire(o.maintenant(), 20)) {
    const s = o.sources.find((x) => x.source === e.source)
    if (!s?.webhook || !s.secret) {
      o.base.envoiManque(e.id, e.essais, null, 'la source n’a plus de webhook')
      continue
    }
    let erreur: string | null = null
    try {
      const r = await envoyer(s.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'notak-signature': signer(s.secret, e.charge, o.maintenant()) },
        body: e.charge,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      if (r.ok) {
        o.base.envoiLivre(e.id, o.maintenant())
        partis++
        continue
      }
      erreur = `réponse ${r.status}`
    } catch (x) {
      erreur = (x as Error).message || 'injoignable'
    }
    const essais = e.essais + 1
    o.base.envoiManque(e.id, essais, essais >= ESSAIS_MAX ? null : o.maintenant() + delaiDEssai(essais), erreur)
  }
  return partis
}
