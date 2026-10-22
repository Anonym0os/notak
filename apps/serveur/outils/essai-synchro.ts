// Essai à la main de /sync : node apps/serveur/outils/essai-synchro.ts [http://localhost:3005]
// Inscrit un compte, écrit dans `elements`, se déconnecte, se reconnecte et relit.
import { HocuspocusProvider } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'

const origine = process.argv[2] ?? 'http://localhost:3005'
const suffixe = Date.now().toString(36)

async function api(chemin: string, json: unknown, cookie?: string) {
  const r = await fetch(origine + chemin, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(json),
  })
  return { statut: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], corps: (await r.json().catch(() => null)) as Record<string, unknown> | null }
}

function ouvrir(nom: string, cookie: string): Promise<{ doc: Y.Doc; fermer(): void; lectureSeule: boolean }> {
  const doc = new Y.Doc()
  const Ws = class extends WebSocket {
    constructor(url: string, protocoles?: string | string[]) {
      super(url, protocoles, { headers: { cookie } })
    }
  }
  return new Promise((resoudre, rejeter) => {
    const provider = new HocuspocusProvider({
      url: origine.replace(/^http/, 'ws') + '/sync',
      WebSocketPolyfill: Ws,
      name: nom,
      document: doc,
      onSynced: () => resoudre({ doc, fermer: () => provider.destroy(), lectureSeule: provider.authorizedScope === 'readonly' }),
      onAuthenticationFailed: ({ reason }) => rejeter(new Error('refusé : ' + reason)),
    })
    setTimeout(() => rejeter(new Error('délai dépassé')), 8000)
  })
}

const compte = await api('/api/inscription', { email: `essai-${suffixe}@exemple.fr`, motDePasse: 'motdepasse', nom: 'Essai' })
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

const sansDroit = await ouvrir(nom, 'notak_session=faux').then(() => 'ouvert (anormal)', (e: Error) => e.message)
console.log('sans session :', sansDroit)
process.exit(0)
