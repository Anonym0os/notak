import { describe, expect, it } from 'vitest'
import { personneAJour } from './personne'
import type { Presence } from './elements/types'

const presence = (moi: Presence['utilisateur'], autres: Presence['utilisateur'][] = []) => ({
  signaler: () => {},
  autres: () => autres.map((utilisateur, client) => ({ client, utilisateur, curseur: null, selection: [], edition: null })),
  ecouter: () => () => {},
  moi: () => moi,
})

describe('personneAJour', () => {
  const note = { id: 'samy', nom: 'Samy', couleur: '#b03050' }

  it('prend le profil du moment pour soi : couleur changée, photo posée depuis le geste', () => {
    const services = { presence: presence({ id: 'samy', nom: 'Samy Agher', couleur: '#3a9a4a', photo: 'f1' }) }
    expect(personneAJour(note, services)).toEqual({ id: 'samy', nom: 'Samy Agher', couleur: '#3a9a4a', photo: 'f1' })
  })

  it('reconnaît une personne présente, puis un membre de l’espace', () => {
    const lea = { id: 'lea', nom: 'Léa', couleur: '#000' }
    expect(personneAJour(lea, { presence: presence({ id: 'samy', nom: 'Samy', couleur: '#111' }, [{ id: 'lea', nom: 'Léa B.', couleur: '#222' }]) })).toEqual({ id: 'lea', nom: 'Léa B.', couleur: '#222' })
    expect(personneAJour(lea, { membres: () => [{ id: 'lea', nom: 'Léa', couleur: '#333' }] }).couleur).toBe('#333')
  })

  it('laisse tel quel un auteur que personne ne connaît', () => {
    expect(personneAJour(note, {})).toBe(note)
  })
})
