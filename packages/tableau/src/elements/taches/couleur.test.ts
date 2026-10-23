import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COULEURS_NOTE, type Taches } from '../../coeur/tableau'
import { couleurDuContenu } from '../couleur'
import { docVide } from './liste'

describe('couleur de la liste', () => {
  const liste: Taches = { type: 'taches', texte: docVide() }
  const coloration = couleurDuContenu<Taches>()

  it('se pose et se retire sans toucher au reste', () => {
    const rouge = coloration.vers({ ...liste, titre: 'Courses' }, 'rouge')
    expect(rouge).toEqual({ ...liste, titre: 'Courses', couleur: 'rouge' })
    expect(coloration.vers(rouge, undefined)).toEqual({ ...liste, titre: 'Courses' })
  })

  it('a une bande dans la feuille de style pour chaque couleur de la palette, et un fond qui reste blanc', () => {
    const css = readFileSync(new URL('./taches.css', import.meta.url), 'utf8')
    for (const c of COULEURS_NOTE) expect(css).toContain(`.notak-taches[data-couleur='${c}'] { --bande: var(--notak-note-${c}); }`)
    expect(css).not.toContain('.notak-carte:has(> .notak-taches[data-couleur')
  })
})
