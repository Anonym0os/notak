import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ouvrirBase } from './base.ts'
import { authEssai, autorisationEssai, poserUtilisateur } from './essai.ts'
import { creerHocuspocus, nomDuDocument } from './synchro.ts'

describe('la synchro tient l’index à jour', () => {
  it('ce qu’on écrit dans un tableau se cherche dès qu’il est enregistré', async () => {
    const base = ouvrirBase(':memory:')
    poserUtilisateur(base, { id: 'u1', email: 'a@exemple.fr', nom: 'Ana', couleur: '#000000', racine: 'racine-1' })
    base.creerTableau({ id: 'tableau-sync-1', titre: '', proprietaire: 'u1', parent: null })
    const serveur = creerHocuspocus(base, authEssai(base), autorisationEssai(base))

    const connexion = await serveur.openDirectConnection(nomDuDocument('tableau-sync-1'))
    await connexion.transact((doc) => {
      doc.getMap('meta').set('titre', 'Courses')
      doc.getMap('elements').set('e1', {
        id: 'e1',
        x: 0,
        y: 0,
        largeur: 34,
        plan: 'a',
        contenu: { type: 'note', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pamplemousses' }] }] } },
      })
    })
    await connexion.disconnect()
    serveur.flushPendingStores()

    expect(base.chercher('"pamplemousses"*', ['tableau-sync-1'], 5)).toMatchObject([{ tableau: 'tableau-sync-1', element: 'e1' }])
    expect(base.chercher('"courses"*', ['tableau-sync-1'], 5)).toMatchObject([{ element: '' }])
    expect(base.tableau('tableau-sync-1')?.titre).toBe('Courses')
    base.fermer()
  })

  it('un message supprimé ne se cherche plus, ni ceux d’un fil jeté', async () => {
    const base = ouvrirBase(':memory:')
    poserUtilisateur(base, { id: 'u1', email: 'a@exemple.fr', nom: 'Ana', couleur: '#000000', racine: 'racine-1' })
    base.creerTableau({ id: 'tableau-sync-2', titre: 'Fil', proprietaire: 'u1', parent: null })
    const serveur = creerHocuspocus(base, authEssai(base), autorisationEssai(base))
    const message = (id: string, texte: string) => ({ id, auteur: { id: 'u1', nom: 'Ana' }, date: 1, texte })
    const fil = (champs: Record<string, unknown>, ...messages: unknown[]) => ({ id: 'fil', x: 0, y: 0, largeur: 28, plan: 'a', ...champs, contenu: { type: 'commentaire', messages } })
    const trouve = (mot: string) => base.chercher(`"${mot}"*`, ['tableau-sync-2'], 5).length
    // Se déconnecter attend l'enregistrement, qui remet l'index à jour.
    const ecrire = async (element: unknown) => {
      const connexion = await serveur.openDirectConnection(nomDuDocument('tableau-sync-2'))
      await connexion.transact((doc) => doc.getMap('elements').set('fil', element))
      await connexion.disconnect()
    }

    await ecrire(fil({}, message('m1', 'Pamplemousses regrettés'), message('m2', 'Kiwis')))
    expect([trouve('pamplemousses'), trouve('kiwis')]).toEqual([1, 1])
    await ecrire(fil({}, message('m2', 'Kiwis')))
    expect([trouve('pamplemousses'), trouve('kiwis')]).toEqual([0, 1])
    await ecrire(fil({ corbeille: 5 }, message('m2', 'Kiwis')))
    expect(trouve('kiwis')).toBe(0)

    // Accroché à une note ou dans sa marge, un message se cherche de même, et part de même.
    const note = (commentaire: unknown, fils: unknown) => ({ id: 'fil', x: 0, y: 0, largeur: 34, plan: 'a', commentaire, contenu: { type: 'note', texte: { type: 'doc', content: [] }, fils } })
    const unFil = (...messages: unknown[]) => ({ type: 'commentaire', messages })
    await ecrire(note(unFil(message('m3', 'Mangues')), { f1: unFil(message('m4', 'Papayes')) }))
    expect([trouve('mangues'), trouve('papayes')]).toEqual([1, 1])
    await ecrire(note(unFil(), { f1: unFil() }))
    expect([trouve('mangues'), trouve('papayes')]).toEqual([0, 0])
    base.fermer()
  })

  it('une page partie pour une autre toile ne s’y cherche plus, ne s’y résume plus, et son texte quitte le document', async () => {
    const base = ouvrirBase(':memory:')
    poserUtilisateur(base, { id: 'u1', email: 'a@exemple.fr', nom: 'Ana', couleur: '#000000', racine: 'racine-1' })
    base.creerTableau({ id: 'tableau-sync-3', titre: 'Équipe', proprietaire: 'u1', parent: null })
    const serveur = creerHocuspocus(base, authEssai(base), autorisationEssai(base))
    const texte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pamplemousses confidentiels' }] }] }
    const ecrire = async (f: (doc: Y.Doc) => void) => {
      const connexion = await serveur.openDirectConnection(nomDuDocument('tableau-sync-3'))
      await connexion.transact(f)
      await connexion.disconnect()
    }
    await ecrire((doc) => {
      doc.getMap('elements').set('page', { id: 'page', x: 0, y: 0, largeur: 10, plan: 'a', contenu: { type: 'document', titre: 'Budget', texte } })
      const fragment = new Y.XmlFragment()
      doc.getMap('textes').set('page', fragment)
      fragment.insert(0, [new Y.XmlText('Pamplemousses confidentiels')])
    })
    expect(base.chercher('"pamplemousses"*', ['tableau-sync-3'], 5)).toHaveLength(1)
    expect(base.contenus(['tableau-sync-3']).map((c) => c.element)).toContain('page')

    // Ce que fait le magasin quand elle part (`oublier`) : l'élément et son texte quittent le document d'un même geste.
    await ecrire((doc) => {
      doc.getMap('elements').delete('page')
      doc.getMap('textes').delete('page')
    })
    expect(base.chercher('"pamplemousses"*', ['tableau-sync-3'], 5)).toEqual([])
    expect(base.contenus(['tableau-sync-3']).map((c) => c.element)).not.toContain('page')
    expect(new TextDecoder().decode(base.document(nomDuDocument('tableau-sync-3'))!)).not.toContain('Pamplemousses')
    base.fermer()
  })
})
