import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import type { DroitsTableau } from '../../../packages/tableau/src/coeur/reglesDroits.ts'
import { type Garde, controler, miseAJourDuMessage } from './controle.ts'
import { openfgaEssai } from './essai.ts'
import { demarrer } from './serveur.ts'

const message = (id: string, auteur: string, texte: string) => ({ id, auteur: { id: auteur, nom: auteur }, date: 1, texte })
const fil = (messages: unknown[]) => ({ id: 'fil', x: 0, y: 0, largeur: 300, plan: 'a1', contenu: { type: 'commentaire', messages } })
const note = (id: string, x = 0) => ({ id, x, y: 0, largeur: 200, plan: 'a0', contenu: { type: 'note', texte: { type: 'doc', content: [] } } })

/** Un serveur et un client qui partent du même état ; `envoyer` passe un changement du client par le contrôle. */
function paire(droits: DroitsTableau, auteur = 'bob', garde?: Garde) {
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
    const passe = controler(serveur, Y.encodeStateAsUpdate(client, vecteur), droits, auteur, {}, garde)
    // Le client reçoit ce que le serveur a fait depuis (dont l'annulation éventuelle).
    Y.applyUpdate(client, Y.encodeStateAsUpdate(serveur, Y.encodeStateVector(client)))
    return passe
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

  it('un commentateur écrit dans le fil d’un sujet de carte mentale, pas dans ses sujets ni dans les messages des autres', () => {
    const { serveur, client, envoyer } = paire({ role: 'commentaire', elements: {} })
    const arbres = (d: Y.Doc) => d.getMap<unknown>('arbres')
    const cle = (champ: string, id: string) => `carte\u001f${champ}\u001f${id}`
    serveur.transact(() => {
      arbres(serveur).set(cle('sujets', 's1'), { titre: 'Sujet central' })
      arbres(serveur).set(cle('fils', 's1'), { type: 'commentaire', messages: [message('m1', 'ana', 'Une question')] })
    })
    Y.applyUpdate(client, Y.encodeStateAsUpdate(serveur, Y.encodeStateVector(client)))
    const filDe = (d: Y.Doc, id: string) => arbres(d).get(cle('fils', id)) as { messages: unknown[] } | undefined

    // Répondre, et ouvrir le fil d'un autre sujet.
    expect(envoyer((d) => arbres(d).set(cle('fils', 's1'), { type: 'commentaire', messages: [message('m1', 'ana', 'Une question'), message('m2', 'bob', 'Ma réponse')] }))).toBe(true)
    expect(envoyer((d) => arbres(d).set(cle('fils', 's2'), { type: 'commentaire', messages: [message('m3', 'bob', 'Et ici ?')] }))).toBe(true)
    expect(filDe(serveur, 's1')!.messages).toHaveLength(2)
    expect(filDe(serveur, 's2')!.messages).toHaveLength(1)

    // Corriger le message d'un autre, ou toucher un sujet : annulé, chez lui aussi.
    expect(envoyer((d) => arbres(d).set(cle('fils', 's1'), { type: 'commentaire', messages: [message('m1', 'ana', 'Volé'), message('m2', 'bob', 'Ma réponse')] }))).toBe(false)
    expect((filDe(serveur, 's1')!.messages[0] as { texte: string }).texte).toBe('Une question')
    expect((filDe(client, 's1')!.messages[0] as { texte: string }).texte).toBe('Une question')
    expect(envoyer((d) => arbres(d).set(cle('sujets', 's1'), { titre: 'Renommé' }))).toBe(false)
    expect(arbres(serveur).get(cle('sujets', 's1'))).toEqual({ titre: 'Sujet central' })
  })

  it('un lecteur n’écrit pas dans le fil d’un sujet', () => {
    const { serveur, envoyer } = paire({ role: 'lecture', elements: {} })
    expect(envoyer((d) => d.getMap('arbres').set('carte\u001ffils\u001fs1', { type: 'commentaire', messages: [message('m1', 'bob', 'Bonjour')] }))).toBe(false)
    expect(serveur.getMap('arbres').size).toBe(0)
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

  describe('ce que le serveur garde en mémoire, et enregistre', () => {
    const lu = (d: Y.Doc) => new TextDecoder().decode(Y.encodeStateAsUpdate(d))
    const doc = (texte: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }] })

    it('un élément parti pour une autre toile n’y laisse rien de son texte, ni dans l’élément ni dans son fragment', () => {
      const { serveur, envoyer } = paire({ role: 'edition', elements: { n2: { ecrire: false, commenter: true } } })
      envoyer((d) =>
        d.transact(() => {
          elements(d).set('n1', { ...note('n1'), contenu: { type: 'note', texte: doc('Pamplemousses confidentiels') } })
          const fragment = new Y.XmlFragment()
          d.getMap('textes').set('n1', fragment)
          fragment.insert(0, [new Y.XmlText('Mangues confidentielles')])
        }),
      )
      expect(lu(serveur)).toContain('Mangues')
      // Ce qu'écrit le magasin quand l'élément part (`transferer`) : l'élément, son texte, et la clé scellée.
      const parti = envoyer((d) =>
        d.transact(() => {
          elements(d).delete('n1')
          d.getMap('textes').delete('n1')
          elements(d).set('n1', null as never)
          elements(d).delete('n1')
        }),
      )
      expect(parti).toBe(true)
      expect(lu(serveur)).not.toContain('Pamplemousses')
      expect(lu(serveur)).not.toContain('Mangues')
    })

    it('ce qu’un refus écarte n’y reste pas, ce qu’il rend s’efface ensuite comme le reste, et un refus s’annule toujours', () => {
      const { serveur, client, envoyer } = paire({ role: 'edition', elements: { n2: { ecrire: false, commenter: false } } })
      const griffonner = (d: Y.Doc) => {
        const fragment = new Y.XmlFragment()
        d.getMap('textes').set('n2', fragment)
        fragment.insert(0, [new Y.XmlText('Griffonnage interdit')])
      }
      expect(envoyer(griffonner)).toBe(false)
      expect(lu(serveur)).not.toContain('Griffonnage')
      expect(envoyer((d) => elements(d).set('n1', { ...note('n1'), contenu: { type: 'note', texte: doc('Kiwis') } }))).toBe(true)
      // Refusé en entier (n2 est figé), et deux fois de suite : n1 revient chaque fois, chez tous.
      for (let i = 0; i < 2; i++) {
        expect(envoyer((d) => d.transact(() => [elements(d).delete('n1'), elements(d).delete('n2')]))).toBe(false)
        for (const d of [serveur, client]) expect([...elements(d).keys()].sort()).toEqual(['fil', 'n1', 'n2'])
        expect(elements(serveur).get('n1')!.contenu).toEqual({ type: 'note', texte: doc('Kiwis') })
      }
      // Ce que le refus a rendu s'efface ensuite comme le reste, même par une connexion qu'on ne contrôle pas.
      serveur.transact(() => elements(serveur).delete('n1'))
      expect(lu(serveur)).not.toContain('Kiwis')
    })
  })

  describe('les dossiers générés par un outil', () => {
    const carte = (id: string, cible: string, en: Record<string, unknown> = {}) => ({ id, x: 0, y: 0, largeur: 10, plan: 'a2', contenu: { type: 'tableau', cible, ...en } })
    /** Un éditeur, sur un dossier généré qui porte la carte d'un autre (« Clients » et celle de « Dupont »). */
    const editeur = (meta: boolean) => {
      const p = paire({ role: 'proprietaire', elements: {} }, 'ana', { meta, carte: (cible) => cible === 'dupont' })
      p.serveur.getMap('elements').set('c-dupont', carte('c-dupont', 'dupont'))
      Y.applyUpdate(p.client, Y.encodeStateAsUpdate(p.serveur, Y.encodeStateVector(p.client)))
      return p
    }

    it('ni renommé, ni jeté, ni retiré, ni changé, ni doublé : chaque geste revient, chez son auteur aussi', () => {
      const { serveur, client, envoyer } = editeur(true)
      expect(envoyer((d) => d.getMap('meta').set('titre', 'Volé'))).toBe(false)
      expect(envoyer((d) => d.getMap('meta').set('couleur', 'rouge'))).toBe(false)
      expect([client.getMap('meta').get('titre'), client.getMap('meta').has('couleur')]).toEqual(['Atelier', false])
      expect(envoyer((d) => elements(d).set('c-dupont', { ...carte('c-dupont', 'dupont'), corbeille: 5 }))).toBe(false)
      expect(envoyer((d) => elements(d).set('c-dupont', carte('c-dupont', 'dupont', { titre: 'Autre' })))).toBe(false)
      expect(envoyer((d) => elements(d).delete('c-dupont'))).toBe(false)
      expect(envoyer((d) => elements(d).set('c-double', carte('c-double', 'dupont')))).toBe(false)
      expect([elements(serveur).get('c-dupont'), elements(client).get('c-dupont')]).toEqual([carte('c-dupont', 'dupont'), carte('c-dupont', 'dupont')])
      expect(elements(client).has('c-double')).toBe(false)
    })

    it('ce qu’on range dedans, la place de sa carte et un raccourci vers lui passent', () => {
      const { serveur, envoyer } = editeur(true)
      expect(envoyer((d) => elements(d).set('n3', note('n3')))).toBe(true)
      expect(envoyer((d) => elements(d).set('c-dupont', { ...carte('c-dupont', 'dupont'), x: 40, y: 12, plan: 'a5' }))).toBe(true)
      expect(envoyer((d) => elements(d).set('r-dupont', carte('r-dupont', 'dupont', { raccourci: true })))).toBe(true)
      expect([...elements(serveur).keys()].sort()).toEqual(['c-dupont', 'fil', 'n1', 'n2', 'n3', 'r-dupont'])
      expect(elements(serveur).get('c-dupont')!.x).toBe(40)
      // Sur une toile qui n'est pas elle-même générée, son titre se change.
      expect(editeur(false).envoyer((d) => d.getMap('meta').set('titre', 'Mon accueil'))).toBe(true)
    })
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
      const partage = await post('/api/tableaux/tableau-controle/partage', { email: 'bob@exemple.fr', role: 'commentaire' }, ana)
      expect(partage.status).toBe(200)
      // Sans courriel, l'adresse de Bob n'est pas prouvée : il entre par le lien de l'invitation.
      const { jeton } = (await partage.json()) as { jeton: string }
      expect((await post(`/api/invitations/${jeton}/accepter`, {}, bob)).status).toBe(200)
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
