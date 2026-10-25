import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import type { Hocuspocus } from '@hocuspocus/server'
import type { Hono } from 'hono'
import { creerApp } from './app.ts'
import { type Fournisseur, type Identifiants, creerAuth } from './auth.ts'
import { ouvrirBase } from './base.ts'
import { creerCourrier } from './courriel.ts'
import { creerLimiteur } from './debit.ts'
import { indexerLesAbsents } from './indexation.ts'
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
  /** Les origines des fournisseurs d'identité du réseau interne, qu'un espace peut déclarer en SSO. */
  idpInternes?: readonly string[]
  /** L'adresse du SMTP (`smtps://compte:motdepasse@hote:465`) ; sans elle, les courriels vont au journal. */
  smtp?: string
  expediteur?: string
}

export interface ServeurDemarre {
  port: number
  fermer(): Promise<void>
}

export async function demarrer(options: OptionsServeur): Promise<ServeurDemarre> {
  mkdirSync(options.dossier, { recursive: true })
  const base = ouvrirBase(join(options.dossier, 'notak.db'))
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
    // Un membre de plus, de moins, ou un rôle changé : les connexions ouvertes sur l'espace relisent leurs droits.
    surChangementDEspace: (espace) => {
      for (const t of base.tableauxDeLEspace(espace)) hocuspocus?.closeConnections(nomDuDocument(t))
    },
  })

  app = creerApp({
    base,
    auth,
    moyens: { fournisseurs: Object.keys(options.fournisseurs ?? {}) as Fournisseur[], courriel: courrier.actif },
    idpInternes: options.idpInternes,
    dossierFichiers: join(options.dossier, 'fichiers'),
    limiteur: creerLimiteur(10, 60_000),
    limiteurArrivee: creerLimiteur(30, 60_000),
    maintenant: Date.now,
    synchro: () => hocuspocus,
    relaisFiable: options.relaisFiable ?? false,
    cookieSecurise: options.cookieSecurise ?? false,
    dossierWeb: options.dossierWeb,
  })

  hocuspocus = creerHocuspocus(base, auth)
  const synchro = brancherSynchro(http, hocuspocus, [origine, ...(options.autresOrigines ?? [])])

  return {
    port,
    async fermer() {
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
