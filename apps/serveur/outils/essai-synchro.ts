// Essai à la main de /sync : node apps/serveur/outils/essai-synchro.ts [http://localhost:3005]
// Inscrit un compte, écrit dans `elements`, se déconnecte, se reconnecte et relit ; puis vérifie qu'une page d'un
// autre site, même avec le cookie, n'ouvre pas la synchro.
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'

const origine = process.argv[2] ?? 'http://localhost:3005'
const suffixe = Date.now().toString(36)

async function api(chemin: string, json: unknown, cookie?: string) {
  const r = await fetch(origine + chemin, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: origine, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(json),
  })
  return { statut: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], corps: (await r.json().catch(() => null)) as Record<string, unknown> | null }
}

function ouvrir(nom: string, cookie: string, depuis = origine): Promise<{ doc: Y.Doc; fermer(): void; lectureSeule: boolean }> {
  const doc = new Y.Doc()
  const Ws = class extends WebSocket {
    constructor(url: string, protocoles?: string | string[]) {
      super(url, protocoles, { headers: { cookie, origin: depuis } })
    }
  }
  const socket = new HocuspocusProviderWebsocket({ url: origine.replace(/^http/, 'ws') + '/sync', WebSocketPolyfill: Ws })
  return new Promise((resoudre, rejeter) => {
    const provider: HocuspocusProvider = new HocuspocusProvider({
      websocketProvider: socket,
      name: nom,
      document: doc,
      onSynced: () => resoudre({ doc, fermer: () => { provider.destroy(); socket.destroy() }, lectureSeule: provider.authorizedScope === 'readonly' }),
      onAuthenticationFailed: ({ reason }) => rejeter(new Error('refusé : ' + reason)),
    })
    provider.attach()
    setTimeout(() => rejeter(new Error('délai dépassé')), 8000)
  })
}

const compte = await api('/api/auth/sign-up/email', { email: `essai-${suffixe}@exemple.fr`, password: 'motdepasse', name: 'Essai' })
if (!compte.cookie) throw new Error('inscription ratée : ' + JSON.stringify(compte))
const cookie = compte.cookie
const tableau = `essai-${suffixe}-tableau`
console.log('inscription', compte.statut, 'tableau', (await api('/api/tableaux', { id: tableau, titre: 'Essai' }, cookie)).statut)

const nom = `tableau:${tableau}`
const a = await ouvrir(nom, cookie)
a.doc.getMap('meta').set('titre', 'Titre depuis Yjs')
a.doc.getMap<unknown>('elements').set('e1', { id: 'e1', type: 'note', plan: 'a0' })
await new Promise((r) => setTimeout(r, 500))
a.fermer()
console.log('écrit puis déconnecté')

const b = await ouvrir(nom, cookie)
const relu = b.doc.getMap<unknown>('elements').get('e1')
console.log('relu après reconnexion :', JSON.stringify(relu))
b.fermer()
if (!relu) throw new Error('élément perdu')

const liste = await fetch(origine + '/api/tableaux', { headers: { cookie } }).then((r) => r.json())
console.log('GET /api/tableaux :', JSON.stringify(liste))

const sansDroit = await ouvrir(nom, 'notak.session_token=faux').then(() => 'ouvert (anormal)', (e: Error) => e.message)
console.log('sans session :', sansDroit)
const ailleurs = await ouvrir(nom, cookie, 'https://malveillant.exemple').then(() => 'ouvert (anormal)', (e: Error) => e.message)
console.log('depuis un autre site, avec le cookie :', ailleurs)
process.exit(0)
