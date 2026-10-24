import { describe, expect, it } from 'vitest'
import { docDepuisTexte } from '../../../coeur/tableau'
import { comptes, contient, notesDe, notesFiltrees, ordreDeLecture, reperesDe, sujetsMisEnEvidence } from './listes'
import { porter } from './elements'
import { ajouterEnfant, lire, nouvelArbre } from './sujets'

function exemple() {
  let a = nouvelArbre('Projet')
  const c = lire(a).central
  let x, y, z
  ;[a, x] = ajouterEnfant(a, c, 'Idées neuves')
  ;[a, y] = ajouterEnfant(a, x, 'Une')
  ;[a, z] = ajouterEnfant(a, c, 'Deux')
  a = porter(a, [x], 'note', docDepuisTexte('La première note\nsur deux lignes'))
  a = porter(a, [z], 'note', docDepuisTexte('Autre'))
  a = porter(a, [y, z], 'etiquettes', ['urgent'])
  a = porter(a, [x], 'etiquettes', ['bientôt'])
  a = porter(a, [y], 'tache', 'faite')
  a = porter(a, [z], 'tache', 'a-faire')
  return { a, c, x, y, z }
}

describe('ce que le panneau de gauche et la barre du bas lisent d’une carte', () => {
  it('l’ordre de lecture : le central, les branches, puis les flottants', () => {
    const { a, c, x, y, z } = exemple()
    expect(ordreDeLecture(lire(a))).toEqual([c, x, y, z])
  })

  it('les comptes du popover : sujets, mots et caractères des titres et des notes', () => {
    const { a } = exemple()
    const n = comptes(lire(a))
    expect(n.sujets).toBe(4)
    // Projet(1) Idées neuves(2) Une(1) Deux(1) + note 1 (6 mots) + note 2 (1 mot)
    expect(n.mots).toBe(12)
    expect(n.caracteres).toBeGreaterThan(40)
  })

  it('les notes, dans l’ordre de lecture, avec le titre du sujet', () => {
    const { a, x, z } = exemple()
    expect(notesDe(lire(a)).map((n) => [n.id, n.titre, n.texte])).toEqual([
      [x, 'Idées neuves', 'La première note\nsur deux lignes'],
      [z, 'Deux', 'Autre'],
    ])
  })

  it('la recherche ignore accents et capitales ; « mots entiers » et « casse » la resserrent', () => {
    expect(contient('Idées neuves', 'IDEES')).toBe(true)
    expect(contient('Idées neuves', 'idee', { motsEntiers: true })).toBe(false)
    expect(contient('Idées neuves', 'neuves', { motsEntiers: true })).toBe(true)
    expect(contient('Idées neuves', 'idées', { casse: true })).toBe(false)
    expect(contient('Idées neuves', 'Idées', { casse: true })).toBe(true)
    expect(contient('n’importe', '')).toBe(true)
    const { a } = exemple()
    expect(notesFiltrees(notesDe(lire(a)), 'autre')).toHaveLength(1)
    expect(notesFiltrees(notesDe(lire(a)), 'deux lignes')).toHaveLength(1)
    expect(notesFiltrees(notesDe(lire(a)), 'zzz')).toHaveLength(0)
  })

  it('les repères : étiquettes triées, tâches à faire d’abord, chacun avec ses sujets', () => {
    const { a, x, y, z } = exemple()
    const r = reperesDe(lire(a))
    expect(r.etiquettes.map((g) => [g.cle, g.ids])).toEqual([
      ['bientôt', [x]],
      ['urgent', [y, z]],
    ])
    expect(r.taches.map((g) => g.cle)).toEqual(['a-faire', 'faite'])
  })

  it('cocher un repère met en évidence ses sujets', () => {
    const { a, x, y, z } = exemple()
    const r = reperesDe(lire(a))
    expect([...sujetsMisEnEvidence(r, new Set(['etiquette:urgent']))].sort()).toEqual([y, z].sort())
    expect([...sujetsMisEnEvidence(r, new Set(['etiquette:bientôt', 'tache:faite']))].sort()).toEqual([x, y].sort())
    expect(sujetsMisEnEvidence(r, new Set()).size).toBe(0)
  })
})
