import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { Database } from '@hocuspocus/extension-database'
import { Hocuspocus } from '@hocuspocus/server'
import { WebSocketServer } from 'ws'
import { type Acteur, suivreActivite } from './activite.ts'
import { type Auth, utilisateurDeSession } from './auth.ts'
import type { Base } from './base.ts'
import type { Autorisation } from './autorisation.ts'
import { indexerDocument } from './indexation.ts'
import { verrouPar } from './verrou.ts'

const PREFIXE = 'tableau:'

export function idDuDocument(nom: string): string | null {
  return nom.startsWith(PREFIXE) && nom.length > PREFIXE.length ? nom.slice(PREFIXE.length) : null
}

export function nomDuDocument(tableau: string): string {
  return PREFIXE + tableau
}

export function creerHocuspocus(base: Base, auth: Auth, autorisation: Autorisation, maintenant: () => number = Date.now): Hocuspocus {
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
    async onAuthenticate({ documentName, requestHeaders, connectionConfig, token }) {
      const id = idDuDocument(documentName)
      if (!id) throw new Error('refusé')
      // La session se lit sur les en-têtes de la requête de mise à niveau : le cookie y voyage comme pour l'API.
      const utilisateur = await utilisateurDeSession(auth, base, requestHeaders)
      if (utilisateur) {
        const droit = await autorisation.roleSur(`user:${utilisateur.id}`, id)
        if (!droit) throw new Error('refusé')
        // Un tableau protégé ne se synchronise qu'une fois son mot de passe donné.
        if (verrouPar(base, utilisateur.id, id) !== null) throw new Error('verrouillé')
        // Écrire demande l'édition ; le commentaire seul passera par le contrôle des mises à jour élément par élément.
        if (droit === 'lecture' || droit === 'commentaire') connectionConfig.readOnly = true
        return { utilisateur: { id: utilisateur.id, nom: utilisateur.nom, couleur: utilisateur.couleur }, role: droit }
      }
      // Sans compte, par un lien public : son jeton arrive en `token`. Un lien protégé par un mot de passe ne se
      // synchronise pas (son accès vit dans un cookie limité aux adresses du lien).
      const jeton = typeof token === 'string' && token.startsWith('lien:') ? token.slice(5) : null
      if (!jeton || base.tableauDuJeton(jeton) !== id || base.motDePasse(id, 'public') !== null) throw new Error('refusé')
      const droit = await autorisation.roleSur(`lien:${jeton}`, id)
      if (!droit) throw new Error('refusé')
      if (droit !== 'edition') connectionConfig.readOnly = true
      return { lien: jeton, role: droit }
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

/**
 * Une page d'un autre site ne doit pas ouvrir la synchro avec le cookie de la personne : un navigateur envoie
 * toujours `Origin` sur une mise à niveau, et il faut qu'elle soit ce serveur même (l'hôte demandé) ou une origine
 * de confiance. Sans `Origin`, ce n'est pas un navigateur (un script, un outil d'essai) : il n'a pas ce cookie.
 */
export function origineAdmise(origine: string | undefined, hote: string | undefined, confiance: readonly string[]): boolean {
  if (!origine) return true
  if (confiance.includes(origine)) return true
  try {
    return hote !== undefined && new URL(origine).host === hote
  } catch {
    return false
  }
}

/** Branche `/sync` sur un serveur HTTP existant. */
export function brancherSynchro(http: Server, hocuspocus: Hocuspocus, confiance: readonly string[] = []): { fermer(): void } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 })

  const surMiseANiveau = (req: IncomingMessage, socket: Duplex, tete: Buffer) => {
    const chemin = new URL(req.url ?? '/', 'http://local').pathname
    if (chemin !== '/sync') return socket.destroy()
    if (!origineAdmise(req.headers.origin, req.headers.host, confiance)) return socket.destroy()
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
