import { definirLangue, textesEn, textesFr } from '@notak/tableau'
import { afterEach, describe, expect, it } from 'vitest'
import type { GroupeActivite } from './api'
import { quand } from './Activite'
import { en, fr } from './langue'
import { phraseDuGroupe } from './phrases'

afterEach(() => definirLangue('fr'))

describe('textes de l’application web', () => {
  it('chaque clé du français existe en anglais, et l’inverse', () => {
    expect(Object.keys(fr).filter((k) => !(k in en))).toEqual([])
    expect(Object.keys(en).filter((k) => !(k in fr))).toEqual([])
  })

  it('les textes d’ici et ceux de la toile, réunis, ont les mêmes clés dans les deux langues', () => {
    expect(Object.keys(textesFr).filter((k) => !(k in textesEn))).toEqual([])
    expect(Object.keys(textesEn).filter((k) => !(k in textesFr))).toEqual([])
  })

  it('toute clé employée dans le code existe, dans les textes de la toile ou ceux d’ici', () => {
    const sources: Record<string, string> = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    const connue = (k: string) => k in textesFr
    const inconnues: string[] = []
    for (const [f, source] of Object.entries(sources)) {
      if (f === './langue.ts') continue
      for (const m of source.matchAll(/(?<![\w.$])t\(\s*'([\w.]+)'/g)) if (!connue(m[1]!)) inconnues.push(`${f}: ${m[1]}`)
      for (const m of source.matchAll(/(?<![\w.$])tn\(\s*'([\w.]+)'/g))
        for (const forme of ['one', 'other']) if (!connue(`${m[1]}.${forme}`)) inconnues.push(`${f}: ${m[1]}.${forme}`)
    }
    expect(inconnues).toEqual([])
  })
})

describe('l’activité en anglais', () => {
  const groupe: GroupeActivite = {
    auteur: { id: 'a', nom: 'Ana', couleur: '#000000' },
    debut: 0,
    fin: 0,
    resume: { cree: 3, modifie: 1, titre: 1 },
    elements: [{ element: 'e', genre: 'cree', typeElement: 'note', libelle: '' }],
  }

  it('dit la phrase et le temps dans la langue choisie', () => {
    expect(phraseDuGroupe(groupe)).toBe('a créé 3 notes, modifié une note, renommé la toile')
    expect(phraseDuGroupe(groupe, true)).toBe('avez créé 3 notes, modifié une note, renommé la toile')
    definirLangue('en')
    expect(phraseDuGroupe(groupe)).toBe('created 3 notes, modified a note, renamed the board')
    expect(quand(0 + 5 * 60_000, 10 * 60_000)).toBe('5 min ago')
  })
})
