import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import type { Hocuspocus } from '@hocuspocus/server'
import type { Hono } from 'hono'
import { creerApp } from './app.ts'
import { type Fournisseur, type Identifiants, creerAuth } from './auth.ts'
import { type Autorisation, ouvrirAutorisation } from './autorisation.ts'
import { ouvrirBase } from './base.ts'
import type { Cle } from './chiffrement.ts'
import { creerCourrier } from './courriel.ts'
import { creerLimiteur } from './debit.ts'
import { creerExpiration } from './echeances.ts'
import { indexerLesAbsents } from './indexation.ts'
import type { Instance } from './instance.ts'
import { brancherSynchro, creerHocuspocus, nomDuDocument } from './synchro.ts'

export interface OptionsServeur {
  port: number
  dossier: string
  relaisFiable?: boolean
  cookieSecurise?: boolean
  dossierWeb?: string
  /** Le secret qui signe les cookies de session (voir `secretDe`). */
  secret: string
  /** L'adresse publique du serveur ; à défaut, `http://localhost:<port>`. */
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
}

export interface ServeurDemarre {
  port: number
  fermer(): Promise<void>
}

export async function demarrer(options: OptionsServeur): Promise<ServeurDemarre> {
  mkdirSync(options.dossier, { recursive: true })
  const cle = options.cle ?? null
  const base = ouvrirBase(join(options.dossier, 'notak.db'), cle)
  indexerLesAbsents(base)
  let hocuspocus: Hocuspocus | null = null
  // L'application naît une fois le port connu (le port 0 en tire un au hasard) : l'origine par défaut en dépend.
  let app: Hono | null = null
  const http = await new Promise<Server>((resoudre, rejeter) => {
    const s = serve({ fetch: (requete, env) => app!.fetch(requete, env), port: options.port }, () => resoudre(s as Server))
    s.once('error', rejeter)
  })
  const port = (http.address() as AddressInfo).port
  const origine = options.origine ?? `http://localhost:${port}`
  const courrier = creerCourrier(options.smtp, options.expediteur ?? `Notak <notak@${new URL(origine).hostname}>`)
  const auth = creerAuth({
    base,
    secret: options.secret,
    origine,
    autresOrigines: options.autresOrigines,
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
  // Un accès arrivé à échéance tombe aussi sans requête : les connexions ouvertes sur son tableau se ferment.
  const expirer = creerExpiration(base, autorisation, () => hocuspocus, Date.now)
  const echeances = setInterval(() => void expirer().catch(() => {}), 30_000)
  echeances.unref()

  app = creerApp({
    base,
    auth,
    autorisation,
    moyens: { fournisseurs: Object.keys(options.fournisseurs ?? {}) as Fournisseur[], courriel: courrier.actif },
    idpInternes: options.idpInternes,
    dossierFichiers: join(options.dossier, 'fichiers'),
    limiteur: creerLimiteur(10, 60_000),
    limiteurArrivee: creerLimiteur(30, 60_000),
    limiteurVisiteurs: creerLimiteur(90, 60_000),
    maintenant: Date.now,
    synchro: () => hocuspocus,
    relaisFiable: options.relaisFiable ?? false,
    cookieSecurise: options.cookieSecurise ?? false,
    dossierWeb: options.dossierWeb,
    ...(options.instance ? { instance: options.instance } : {}),
    cle,
    dossierSignalements: options.dossierSignalements ?? null,
    courrier,
    origine,
    expirer,
  })

  hocuspocus = creerHocuspocus(base, auth, autorisation, Date.now, expirer)
  const synchro = brancherSynchro(http, hocuspocus, [origine, ...(options.autresOrigines ?? [])])

  return {
    port,
    async fermer() {
      clearInterval(relance)
      clearInterval(echeances)
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
