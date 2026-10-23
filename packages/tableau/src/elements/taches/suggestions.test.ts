import { describe, expect, it } from 'vitest'
import type { NoeudTexte, Taches } from '../../coeur/tableau'
import { ecartee, nombreEnHaut, suggestionA } from './suggestions'

const tache = (texte: string, faite = false): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: faite },
  content: [texte ? { type: 'paragraph', content: [{ type: 'text', text: texte }] } : { type: 'paragraph' }],
})
const liste = (taches: NoeudTexte[], plus: Partial<Taches> = {}): Taches => ({ type: 'taches', texte: { type: 'doc', content: [{ type: 'taskList', content: taches }] }, ...plus })

describe('suggestionA', () => {
  it('propose le titre quand la liste vient de gagner sa deuxième tâche, sans titre', () => {
    expect(suggestionA(liste([tache('a'), tache('b')]), true, 0)).toBe('titre')
    // À l'ouverture d'une liste qui en avait déjà deux : non.
    expect(suggestionA(liste([tache('a'), tache('b')]), false, 0)).toBeNull()
    expect(suggestionA(liste([tache('a')]), true, 0)).toBeNull()
  })

  it('ne propose pas le titre à une liste titrée, ni écartée, ni après trois refus', () => {
    expect(suggestionA(liste([tache('a'), tache('b')], { titre: 'T' }), true, 0)).toBeNull()
    expect(suggestionA(liste([tache('a'), tache('b')], { refus: ['titre'] }), true, 0)).toBeNull()
    expect(suggestionA(liste([tache('a'), tache('b')]), true, 3)).toBeNull()
    expect(suggestionA(liste([tache('a'), tache('b')]), true, 2)).toBe('titre')
  })

  it('propose d’effacer les faites dès deux, à toute profondeur', () => {
    expect(suggestionA(liste([tache('a', true), tache('b')]), false, 0)).toBeNull()
    expect(suggestionA(liste([tache('a', true), tache('b', true)]), false, 0)).toBe('faites')
    const sous: NoeudTexte = { ...tache('a', true), content: [...tache('a', true).content!, { type: 'taskList', content: [tache('x', true)] }] }
    expect(suggestionA(liste([sous]), false, 0)).toBe('faites')
  })

  it('un « Non merci » la fait taire pour cette liste', () => {
    const c = liste([tache('a', true), tache('b', true)])
    const apres = ecartee(c, 'faites')
    expect(apres.refus).toEqual(['faites'])
    expect(suggestionA(apres, false, 0)).toBeNull()
    expect(ecartee(apres, 'faites').refus).toEqual(['faites'])
  })

  it('le titre passe avant les faites', () => {
    expect(suggestionA(liste([tache('a', true), tache('b', true)]), true, 0)).toBe('titre')
  })

  it('compte les tâches de premier niveau', () => {
    expect(nombreEnHaut(liste([tache('a'), tache('b'), tache('c')]))).toBe(3)
  })
})
