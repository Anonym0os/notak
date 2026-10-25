import { describe, expect, it } from 'vitest'
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
})
