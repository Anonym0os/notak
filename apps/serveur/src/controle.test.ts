import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import type { DroitsTableau } from '../../../packages/tableau/src/coeur/droitsElements.ts'
import { controler, miseAJourDuMessage } from './controle.ts'
import { openfgaEssai } from './essai.ts'
import { demarrer } from './serveur.ts'

const message = (id: string, auteur: string, texte: string) => ({ id, auteur: { id: auteur, nom: auteur }, date: 1, texte })
const fil = (messages: unknown[]) => ({ id: 'fil', x: 0, y: 0, largeur: 300, plan: 'a1', contenu: { type: 'commentaire', messages } })
const note = (id: string, x = 0) => ({ id, x, y: 0, largeur: 200, plan: 'a0', contenu: { type: 'note', texte: { type: 'doc', content: [] } } })

/** Un serveur et un client qui partent du même état ; `envoyer` passe un changement du client par le contrôle. */
function paire(droits: DroitsTableau, auteur = 'bob') {
  const serveur = new Y.Doc()
  serveur.transact(() => {
    serveur.getMap('elements').set('n1', note('n1'))
    serveur.getMap('elements').set('n2', note('n2'))
    serveur.getMap('elements').set('fil', fil([message('m1', 'ana', 'Une question')]))
    serveur.getMap('meta').set('titre', 'Atelier')
  })
  const client = new Y.Doc()
  Y.applyUpdate(client, Y.encodeStateAsUpdate(serveur))
  const envoyer = (geste: (d: Y.Doc) => void) => {
    const vecteur = Y.encodeStateVector(client)
    geste(client)
    const garde = controler(serveur, Y.encodeStateAsUpdate(client, vecteur), droits, auteur, {})
    // Le client reçoit ce que le serveur a fait depuis (dont l'annulation éventuelle).
    Y.applyUpdate(client, Y.encodeStateAsUpdate(serveur, Y.encodeStateVector(client)))
    return garde
  }
  return { serveur, client, envoyer }
}

const elements = (d: Y.Doc) => d.getMap<Record<string, unknown>>('elements')

describe('le contrôle des mises à jour', () => {
  it('un commentateur répond dans un fil ; une carte qu’il bouge revient, chez lui aussi', () => {
    const { serveur, client, envoyer } = paire({ role: 'commentaire', elements: {} })
    expect(envoyer((d) => elements(d).set('fil', fil([message('m1', 'ana', 'Une question'), message('m2', 'bob', 'Ma réponse')])))).toBe(true)
    expect((elements(serveur).get('fil')!.contenu as { messages: unknown[] }).messages).toHaveLength(2)

    expect(envoyer((d) => elements(d).set('n1', note('n1', 99)))).toBe(false)
    expect(elements(serveur).get('n1')!.x).toBe(0)
    expect(elements(client).get('n1')!.x).toBe(0)
    expect(envoyer((d) => d.getMap('meta').set('titre', 'Volé'))).toBe(false)
    expect(client.getMap('meta').get('titre')).toBe('Atelier')
  })

  it('un élément figé n’est pas écrit, et un geste qui le touche est refusé en entier', () => {
    const { serveur, client, envoyer } = paire({ role: 'edition', elements: { n2: { ecrire: false, commenter: true } } })
    expect(envoyer((d) => elements(d).set('n1', note('n1', 10)))).toBe(true)
    expect(
      envoyer((d) =>
        d.transact(() => {
          elements(d).set('n1', note('n1', 20))
          elements(d).set('n2', note('n2', 20))
        }),
      ),
    ).toBe(false)
    expect([elements(serveur).get('n1')!.x, elements(serveur).get('n2')!.x]).toEqual([10, 0])
    expect([elements(client).get('n1')!.x, elements(client).get('n2')!.x]).toEqual([10, 0])
  })

  it('le texte d’un élément figé ne s’écrit pas non plus', () => {
    const { serveur, client, envoyer } = paire({ role: 'edition', elements: { n2: { ecrire: false, commenter: false } } })
    envoyer((d) => d.getMap('textes').set('n1', new Y.XmlFragment()))
    expect(envoyer((d) => (d.getMap('textes').get('n1') as Y.XmlFragment).insert(0, [new Y.XmlText('libre')]))).toBe(true)
    expect(envoyer((d) => d.getMap('textes').set('n2', new Y.XmlFragment()))).toBe(false)
    expect(serveur.getMap('textes').has('n2')).toBe(false)
    expect(client.getMap('textes').has('n2')).toBe(false)
    expect((serveur.getMap('textes').get('n1') as Y.XmlFragment).toString()).toContain('libre')
  })

  it('lit la mise à jour d’un message de synchro, et rien d’autre', () => {
    const maj = new Uint8Array([1, 2, 3])
    const msg = (type: number, genre: number) => {
      const e = [...new TextEncoder().encode('tableau:x')]
      return new Uint8Array([e.length, ...e, type, genre, maj.length, ...maj])
    }
    expect(miseAJourDuMessage(msg(0, 2))).toEqual(maj)
    expect(miseAJourDuMessage(msg(0, 1))).toEqual(maj)
    expect(miseAJourDuMessage(msg(0, 0))).toBeNull()
    expect(miseAJourDuMessage(msg(1, 2))).toBeNull()
  })
})

describe('de bout en bout, par la synchro', () => {
  it('un commentateur écrit son commentaire ; sa modification d’une carte est annulée chez lui et chez les autres', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'notak-controle-'))
    const serveur = await demarrer({ port: 0, dossier, secret: 'un-secret-d-essai-assez-long-pour-better-auth', openfga: openfgaEssai() })
    const origine = `http://localhost:${serveur.port}`
    const fermer: (() => void)[] = []
    try {
      const post = (chemin: string, corps: unknown, cookie?: string) =>
        fetch(origine + chemin, { method: 'POST', headers: { origin: origine, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(corps) })
      const compte = async (nom: string) =>
        (await post('/api/auth/sign-up/email', { email: `${nom}@exemple.fr`, password: 'motdepasse', name: nom })).headers.get('set-cookie')!.split(';')[0]!
      const ana = await compte('ana')
      const bob = await compte('bob')
      expect((await post('/api/tableaux', { id: 'tableau-controle', titre: 'Revue' }, ana)).status).toBe(201)
      expect((await post('/api/tableaux/tableau-controle/partage', { email: 'bob@exemple.fr', role: 'commentaire' }, ana)).status).toBe(200)
      const moiBob = (await (await fetch(`${origine}/api/moi`, { headers: { cookie: bob } })).json()) as { id: string }

      const ouvrir = (cookie: string) =>
        new Promise<{ doc: Y.Doc; provider: HocuspocusProvider }>((resoudre, rejeter) => {
          const doc = new Y.Doc()
          const Ws = class extends WebSocket {
            constructor(url: string, protocoles?: string | string[]) {
              super(url, protocoles, { headers: { cookie, origin: origine } })
            }
          }
          const socket = new HocuspocusProviderWebsocket({ url: `${origine.replace(/^http/, 'ws')}/sync`, WebSocketPolyfill: Ws as never })
          const provider = new HocuspocusProvider({ websocketProvider: socket, name: 'tableau:tableau-controle', document: doc, onSynced: () => resoudre({ doc, provider }), onAuthenticationFailed: () => rejeter(new Error('refusé')) })
          provider.attach()
          fermer.push(() => {
            provider.destroy()
            socket.destroy()
          })
        })
      const a = await ouvrir(ana)
      a.doc.getMap('elements').set('n1', note('n1'))
      const b = await ouvrir(bob)
      const attendre = async (vrai: () => boolean) => {
        for (let i = 0; i < 100 && !vrai(); i++) await new Promise((r) => setTimeout(r, 30))
        expect(vrai()).toBe(true)
      }
      await attendre(() => b.doc.getMap('elements').has('n1'))
      expect(b.provider.authorizedScope).not.toBe('readonly')

      // Son commentaire passe, jusque chez Ana.
      b.doc.getMap('elements').set('fil', { ...fil([message('m1', moiBob.id, 'Joli')]), id: 'fil' })
      await attendre(() => a.doc.getMap('elements').has('fil'))
      // Sa modification de la carte est annulée par le serveur : elle revient chez lui comme chez Ana.
      b.doc.getMap('elements').set('n1', note('n1', 500))
      await attendre(() => (b.doc.getMap<{ x: number }>('elements').get('n1')!.x === 0))
      expect(a.doc.getMap<{ x: number }>('elements').get('n1')!.x).toBe(0)
    } finally {
      for (const f of fermer) f()
      await serveur.fermer()
      rmSync(dossier, { recursive: true, force: true })
    }
  }, 30_000)
})
