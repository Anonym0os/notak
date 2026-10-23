import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { Database } from '@hocuspocus/extension-database'
import { Hocuspocus } from '@hocuspocus/server'
import { WebSocketServer } from 'ws'
import { type Acteur, suivreActivite } from './activite.ts'
import type { Base } from './base.ts'
import { roleHerite } from './droits.ts'
import { indexerDocument } from './indexation.ts'
import { NOM_COOKIE, empreinteDe, lireCookie } from './sessions.ts'

const PREFIXE = 'tableau:'

export function idDuDocument(nom: string): string | null {
  return nom.startsWith(PREFIXE) && nom.length > PREFIXE.length ? nom.slice(PREFIXE.length) : null
}

export function nomDuDocument(tableau: string): string {
  return PREFIXE + tableau
}

export function creerHocuspocus(base: Base, maintenant: () => number = Date.now): Hocuspocus {
  const activite = suivreActivite(base, maintenant)
  return new Hocuspocus({
    extensions: [
      new Database({
        fetch: async ({ documentName }) => base.document(documentName),
        store: async ({ documentName, state, document }) => {
          base.enregistrerDocument(documentName, state)
          const id = idDuDocument(documentName)
          const titre = document.getMap('meta').get('titre')
          if (id && typeof titre === 'string') base.changerTitre(id, titre.slice(0, 200))
          // La recherche dans tous les tableaux suit ce qui vient d'être enregistré.
          if (id && base.tableau(id)) indexerDocument(base, id, document)
        },
      }),
    ],
    // Un tableau dont le document n'a pas encore de titre (un accueil, créé à l'inscription) prend celui de la base,
    // pour que les autres le voient nommé.
    async afterLoadDocument({ documentName, document }) {
      const id = idDuDocument(documentName)
      const meta = document.getMap('meta')
      const titre = id ? base.tableau(id)?.titre : undefined
      if (titre && !meta.get('titre')) document.transact(() => meta.set('titre', titre))
      // Après ce réglage du serveur : seul ce que font les personnes entre dans l'activité.
      activite.suivre(document)
    },
    // Qui a envoyé la mise à jour : la session, posée par `onAuthenticate`. Le serveur seul n'a pas de contexte.
    async onChange({ documentName, document, context }) {
      activite.noter(idDuDocument(documentName), document, (context as { utilisateur?: Acteur } | undefined)?.utilisateur)
    },
    async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
      const id = idDuDocument(documentName)
      const jeton = lireCookie(requestHeaders.get('cookie'), NOM_COOKIE)
      const utilisateur = id && jeton ? base.utilisateurDeSession(empreinteDe(jeton), maintenant()) : null
      const droit = utilisateur && id ? roleHerite((t) => base.acces(t), (t) => base.tableau(t)?.parent ?? null, utilisateur.id, id) : null
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
