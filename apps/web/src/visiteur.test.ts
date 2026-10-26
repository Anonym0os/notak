import { type Element, type Tableau } from '@notak/tableau'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangementVisiteur } from './api'
import { magasinVisiteur } from './visiteur'

const note: Element = { id: 'note-1', x: 0, y: 0, largeur: 34, contenu: { type: 'note', texte: { type: 'doc', content: [] } } } as Element
const epingle = (messages: { id: string; texte: string }[]): Element =>
  ({
    id: 'pin-1',
    x: 4,
    y: 4,
    largeur: 34,
    contenu: { type: 'commentaire', messages: messages.map((m) => ({ ...m, auteur: { id: 'visiteur:moi', nom: 'Paul' }, date: 1 })) },
  }) as Element
const initial: Tableau = { titre: 'Revue', elements: [note] }

/** Un serveur qui accepte tout et rend la vue avec ce qu'on lui a porté. */
function monde() {
  const envois: ChangementVisiteur[][] = []
  let vue = initial
  const envoyer = vi.fn(async (changements: ChangementVisiteur[]) => {
    envois.push(changements)
    const ids = new Set(changements.map((c) => c.id))
    vue = { ...vue, elements: [...vue.elements.filter((e) => !ids.has(e.id)), ...changements.flatMap((c) => (c.apres ? [c.apres] : []))] }
    return vue
  })
  const v = magasinVisiteur(initial, envoyer, () => {}, () => {}, 100)
  return { v, envois, envoyer }
}
const attendre = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('le magasin d’un visiteur', () => {
  it('un fil neuf encore vide reste ici ; son premier message part', async () => {
    const { v, envois } = monde()
    v.magasin.faire([{ type: 'creer', element: epingle([]) }])
    await attendre()
    expect(envois).toEqual([])
    v.magasin.faire([{ type: 'contenu', id: 'pin-1', avant: epingle([]).contenu, apres: epingle([{ id: 'm1', texte: 'Bonjour' }]).contenu }])
    await attendre()
    expect(envois).toHaveLength(1)
    expect(envois[0]![0]!.id).toBe('pin-1')
  })

  it('ce qu’on écrit part après une pause, en un seul envoi', async () => {
    const { v, envois } = monde()
    v.magasin.faire([{ type: 'creer', element: epingle([]) }])
    await attendre()
    for (const texte of ['B', 'Bo', 'Bon']) {
      v.magasin.appliquerSeulement([{ type: 'contenu', id: 'pin-1', avant: epingle([]).contenu, apres: epingle([{ id: 'm1', texte }]).contenu }])
      await vi.advanceTimersByTimeAsync(50)
    }
    expect(envois).toEqual([])
    expect(v.occupe()).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(envois).toHaveLength(1)
    expect((envois[0]![0]!.apres!.contenu as { messages: { texte: string }[] }).messages[0]!.texte).toBe('Bon')
  })

  it('la page qui se cache porte tout de suite ce qui attendait', async () => {
    const { v, envois } = monde()
    v.magasin.faire([{ type: 'creer', element: epingle([]) }])
    v.magasin.appliquerSeulement([{ type: 'contenu', id: 'pin-1', avant: epingle([]).contenu, apres: epingle([{ id: 'm1', texte: 'Au revoir' }]).contenu }])
    v.vider()
    await attendre()
    expect(envois).toHaveLength(1)
  })

  it('une relecture garde ce qu’on n’a pas encore porté, et le fil vide qu’on ouvre', async () => {
    const { v } = monde()
    v.magasin.faire([{ type: 'creer', element: epingle([]) }])
    v.recevoir({ titre: 'Revue', elements: [note] })
    expect(v.magasin.lire().elements.map((e) => e.id)).toEqual(['note-1', 'pin-1'])
  })

  it('annuler n’existe pas : ce qui est parti appartient au serveur', () => {
    const { v } = monde()
    v.magasin.faire([{ type: 'creer', element: epingle([{ id: 'm1', texte: 'x' }]) }])
    expect(v.magasin.peutAnnuler()).toBe(false)
    expect(v.magasin.annuler()).toBe(false)
  })
})
