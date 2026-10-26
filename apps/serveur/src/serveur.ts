import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import type { Hocuspocus } from '@hocuspocus/server'
import type { Hono } from 'hono'
import { creerApp } from './app.ts'
import { type Fournisseur, type Identifiants, creerAuth, normaliserOrigine } from './auth.ts'
import { type Autorisation, ouvrirAutorisation } from './autorisation.ts'
import { ouvrirBase } from './base.ts'
import type { Cle } from './chiffrement.ts'
import { creerCourrier } from './courriel.ts'
import { creerLimiteur } from './debit.ts'
import { indexerLesAbsents } from './indexation.ts'
import type { Instance } from './instance.ts'
import { type Verificateur, creerVerificateur } from './misesAJour.ts'
import { brancherSynchro, creerHocuspocus, nomDuDocument } from './synchro.ts'
import { VERSION_NOTAK } from '../../../packages/tableau/src/version.ts'

export interface OptionsServeur {
  port: number
  dossier: string
  /** Combien de relais de confiance sont devant le serveur (`NOTAK_RELAIS`) ; à défaut, aucun. */
  relais?: number
  cookieSecurise?: boolean
  dossierWeb?: string
  /** Le secret qui signe les cookies de session (voir `secretDe`). */
  secret: string
  /** L'adresse publique du serveur ; à défaut, `http://localhost:<port>`. Prise sous sa forme d'origine (`normaliserOrigine`). */
  origine?: string
  autresOrigines?: readonly string[]
  fournisseurs?: Partial<Record<Fournisseur, Identifiants>>
  /** L'adresse d'OpenFGA, qui évalue les droits (`http://openfga:8080`). */
  openfga: string
  /** Le nom du magasin OpenFGA créé s'il n'y en a pas : un par base. */
  magasinOpenfga?: string
  /** Les origines des fournisseurs d'identité du réseau interne, qu'un espace peut déclarer en SSO. */
  idpInternes?: readonly string[]
  /** L'adresse du SMTP (`smtps://compte:motdepasse@hote:465`) ; sans elle, les courriels vont au journal. */
  smtp?: string
  expediteur?: string
  instance?: Instance
  /** La clé du chiffrement au repos (`NOTAK_CLE` ou `NOTAK_CLE_FICHIER`) ; sans elle, rien n'est chiffré. */
  cle?: Cle | null
  /** Où ranger les signalements de bugs ; absent, on ne les reçoit pas. */
  dossierSignalements?: string | null
  /** Les adresses des admins du serveur (`NOTAK_ADMINS`). */
  admins?: readonly string[]
  /** Chercher les nouvelles versions de Notak (`NOTAK_VERIFIER_MAJ`, jamais en développement), ou le vérificateur à prendre. */
  misesAJour?: boolean | Verificateur
}

export interface ServeurDemarre {
  port: number
  fermer(): Promise<void>
}

export async function demarrer(options: OptionsServeur): Promise<ServeurDemarre> {
  if (options.origine !== undefined && !normaliserOrigine(options.origine)) throw new Error(`« ${options.origine} » n'est pas une adresse`)
  mkdirSync(options.dossier, { recursive: true })
  const cle = options.cle ?? null
  const base = ouvrirBase(join(options.dossier, 'notak.db'), cle)
  indexerLesAbsents(base)
  // Les codes de connexion d'avant l'arrêt ne servent plus : ils ne restent pas dans la base jusqu'à la prochaine demande.
  base.oublierDemandesAppareilExpirees(Date.now())
  let hocuspocus: Hocuspocus | null = null
  // L'application naît une fois le port connu (le port 0 en tire un au hasard) : l'origine par défaut en dépend.
  let app: Hono | null = null
  const http = await new Promise<Server>((resoudre, rejeter) => {
    const s = serve({ fetch: (requete, env) => app!.fetch(requete, env), port: options.port }, () => resoudre(s as Server))
    s.once('error', rejeter)
  })
  const port = (http.address() as AddressInfo).port
  // Comparées à l'en-tête `Origin` (connexion, synchro, CSP) : écrites comme l'écrit un navigateur.
  const origine = normaliserOrigine(options.origine ?? `http://localhost:${port}`)!
  const autresOrigines = (options.autresOrigines ?? []).map((o) => normaliserOrigine(o) ?? o)
  const courrier = creerCourrier(options.smtp, options.expediteur ?? `Notak <notak@${new URL(origine).hostname}>`)
  const auth = creerAuth({
    base,
    secret: options.secret,
    origine,
    autresOrigines,
    cookieSecurise: options.cookieSecurise ?? false,
    courrier,
    fournisseurs: options.fournisseurs,
    idpInternes: options.idpInternes,
    inscriptionsFermees: options.instance?.inscriptions === 'fermees',
  })

  const autorisation = ouvrirAutorisation({ base, url: options.openfga, nom: options.magasinOpenfga })
  // OpenFGA reçoit tout ce qui l'attend avant la première requête : au premier démarrage, toutes les relations.
  await attendreOpenfga(autorisation)
  // Ce qui n'a pas pu partir (OpenFGA un moment injoignable) repart de lui-même.
  const relance = setInterval(() => {
    autorisation.vider().then(
      (espaces) => {
        for (const e of espaces) for (const t of base.tableauxDeLEspace(e)) hocuspocus?.closeConnections(nomDuDocument(t))
      },
      () => {},
    )
  }, 5000)
  relance.unref()
  const misesAJour =
    typeof options.misesAJour === 'object' ? options.misesAJour : creerVerificateur({ actuelle: VERSION_NOTAK, active: options.misesAJour === true })

  app = creerApp({
    base,
    auth,
    autorisation,
    moyens: { fournisseurs: Object.keys(options.fournisseurs ?? {}) as Fournisseur[], courriel: courrier.actif },
    idpInternes: options.idpInternes,
    dossierFichiers: join(options.dossier, 'fichiers'),
    limiteur: creerLimiteur(10, 60_000),
    limiteurArrivee: creerLimiteur(30, 60_000),
    // Dix essais par compte et par quart d'heure : assez pour qui se trompe, trop peu pour deviner.
    limiteurCompte: creerLimiteur(10, 15 * 60_000),
    // L'app de bureau redemande son jeton toutes les cinq secondes : de quoi en attendre plusieurs derrière une même adresse.
    limiteurJeton: creerLimiteur(60, 60_000),
    maintenant: Date.now,
    synchro: () => hocuspocus,
    relais: options.relais ?? 0,
    cookieSecurise: options.cookieSecurise ?? false,
    origine,
    dossierWeb: options.dossierWeb,
    ...(options.instance ? { instance: options.instance } : {}),
    cle,
    dossierSignalements: options.dossierSignalements ?? null,
    admins: options.admins ?? [],
    misesAJour,
  })

  hocuspocus = creerHocuspocus(base, auth, autorisation)
  const synchro = brancherSynchro(http, hocuspocus, [origine, ...autresOrigines])

  return {
    port,
    async fermer() {
      clearInterval(relance)
      misesAJour.arreter()
      synchro.fermer()
      hocuspocus?.flushPendingStores()
      await new Promise<void>((fini) => {
        http.close(() => fini())
        http.closeAllConnections()
      })
      base.fermer()
    },
  }
}

/** Attend qu'OpenFGA réponde et soit à jour, une minute au plus : au démarrage d'une pile, il peut venir après. */
async function attendreOpenfga(autorisation: Autorisation): Promise<void> {
  for (let essai = 0; ; essai++) {
    try {
      await autorisation.vider()
      return
    } catch (e) {
      if (essai >= 60) throw new Error(`OpenFGA ne répond pas : ${(e as Error).message}`, { cause: e })
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}
