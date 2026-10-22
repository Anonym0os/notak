import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { Database } from '@hocuspocus/extension-database'
import { Hocuspocus } from '@hocuspocus/server'
import { WebSocketServer } from 'ws'
import type { Base } from './base.ts'
import { role } from './droits.ts'
import { NOM_COOKIE, empreinteDe, lireCookie } from './sessions.ts'

const PREFIXE = 'tableau:'

export function idDuDocument(nom: string): string | null {
  return nom.startsWith(PREFIXE) && nom.length > PREFIXE.length ? nom.slice(PREFIXE.length) : null
}

export function nomDuDocument(tableau: string): string {
  return PREFIXE + tableau
}

export function creerHocuspocus(base: Base, maintenant: () => number = Date.now): Hocuspocus {
  return new Hocuspocus({
    extensions: [
      new Database({
        fetch: async ({ documentName }) => base.document(documentName),
        store: async ({ documentName, state, document }) => {
          base.enregistrerDocument(documentName, state)
          const id = idDuDocument(documentName)
          const titre = document.getMap('meta').get('titre')
          if (id && typeof titre === 'string') base.changerTitre(id, titre.slice(0, 200))
        },
      }),
    ],
    async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
      const id = idDuDocument(documentName)
      const jeton = lireCookie(requestHeaders.get('cookie'), NOM_COOKIE)
      const utilisateur = id && jeton ? base.utilisateurDeSession(empreinteDe(jeton), maintenant()) : null
      const droit = utilisateur && id ? role(base.acces(id), utilisateur.id, id) : null
      if (!utilisateur || !droit) throw new Error('refusé')
      if (droit === 'lecture') connectionConfig.readOnly = true
      return { utilisateur: { id: utilisateur.id, nom: utilisateur.nom, couleur: utilisateur.couleur }, role: droit }
    },
  })
}

function requeteWeb(req: IncomingMessage): Request {
  const entetes = new Headers()
  for (const [nom, valeur] of Object.entries(req.headers)) {
    if (Array.isArray(valeur)) for (const v of valeur) entetes.append(nom, v)
    else if (valeur !== undefined) entetes.set(nom, valeur)
  }
  return new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`), { headers: entetes })
}

/** Branche `/sync` sur un serveur HTTP existant. */
export function brancherSynchro(http: Server, hocuspocus: Hocuspocus): { fermer(): void } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 })

  const surMiseANiveau = (req: IncomingMessage, socket: Duplex, tete: Buffer) => {
    const chemin = new URL(req.url ?? '/', 'http://local').pathname
    if (chemin !== '/sync') return socket.destroy()
    wss.handleUpgrade(req, socket, tete, (ws) => {
      const connexion = hocuspocus.handleConnection(ws, requeteWeb(req))
      ws.on('message', (donnees: Buffer) => connexion.handleMessage(donnees))
      ws.on('close', (code, raison) => connexion.handleClose({ code, reason: raison.toString() }))
      ws.on('error', () => {})
    })
  }
  http.on('upgrade', surMiseANiveau)

  return {
    fermer() {
      http.off('upgrade', surMiseANiveau)
      for (const ws of wss.clients) ws.terminate()
      wss.close()
    },
  }
}
