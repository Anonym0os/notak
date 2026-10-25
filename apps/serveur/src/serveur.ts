import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import type { Hocuspocus } from '@hocuspocus/server'
import { creerApp } from './app.ts'
import { ouvrirBase } from './base.ts'
import { creerLimiteur } from './debit.ts'
import { indexerLesAbsents } from './indexation.ts'
import type { Instance } from './instance.ts'
import { brancherSynchro, creerHocuspocus } from './synchro.ts'

export interface OptionsServeur {
  port: number
  dossier: string
  relaisFiable?: boolean
  cookieSecurise?: boolean
  dossierWeb?: string
  instance?: Instance
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

  const app = creerApp({
    base,
    dossierFichiers: join(options.dossier, 'fichiers'),
    limiteur: creerLimiteur(10, 60_000),
    limiteurArrivee: creerLimiteur(30, 60_000),
    maintenant: Date.now,
    synchro: () => hocuspocus,
    relaisFiable: options.relaisFiable ?? false,
    cookieSecurise: options.cookieSecurise ?? false,
    dossierWeb: options.dossierWeb,
    ...(options.instance ? { instance: options.instance } : {}),
  })

  const http = await new Promise<Server>((resoudre, rejeter) => {
    const s = serve({ fetch: app.fetch, port: options.port }, () => resoudre(s as Server))
    s.once('error', rejeter)
  })
  hocuspocus = creerHocuspocus(base)
  const synchro = brancherSynchro(http, hocuspocus)

  return {
    port: (http.address() as AddressInfo).port,
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
