import { afterEach, describe, expect, it } from 'vitest'
import { definirLangue, en, fr, langue, resoudreLangue, t, tn } from './langue'

afterEach(() => definirLangue('fr'))

describe('dictionnaires', () => {
  it('chaque clé du français existe en anglais, et l’inverse', () => {
    const f = Object.keys(fr)
    const e = Object.keys(en)
    expect(f.filter((k) => !(k in en))).toEqual([])
    expect(e.filter((k) => !(k in fr))).toEqual([])
  })

  it('aucune traduction n’est vide, et les {valeurs} sont les mêmes des deux côtés', () => {
    const variables = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const k of Object.keys(fr)) {
      expect(en[k]?.trim(), k).toBeTruthy()
      expect(variables(en[k]!), k).toEqual(variables(fr[k]!))
    }
  })

  it('toute clé employée dans le code existe', () => {
    // `glob` est celui de Vite (Vitest le sert) ; ce paquet n'en charge pas les types.
    const sources: Record<string, string> = (import.meta as unknown as { glob(m: string[], o: object): Record<string, string> }).glob(
      ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'],
      { query: '?raw', import: 'default', eager: true },
    )
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    const inconnues: string[] = []
    // Les clés qu'on range dans des tableaux de données : tout texte entre guillemets qui commence par un préfixe connu.
    const prefixes = [...new Set(Object.keys(fr).map((k) => k.split('.')[0]))].join('|')
    for (const [f, source] of Object.entries(sources)) {
      if (f === './langue.ts') continue
      for (const m of source.matchAll(new RegExp(`'((?:${prefixes})\\.[\\w.]+)'`, 'g')))
        if (!(m[1]! in fr) && !(`${m[1]}.one` in fr)) inconnues.push(`${f}: ${m[1]}`)
      for (const m of source.matchAll(/(?<![\w.$])t\(\s*'([\w.]+)'/g)) if (!(m[1]! in fr)) inconnues.push(`${f}: ${m[1]}`)
      for (const m of source.matchAll(/(?<![\w.$])tn\(\s*'([\w.]+)'/g))
        for (const forme of ['one', 'other']) if (!(`${m[1]}.${forme}` in fr)) inconnues.push(`${f}: ${m[1]}.${forme}`)
    }
    expect(inconnues).toEqual([])
  })
})

describe('t', () => {
  it('parle français par défaut dans les tests', () => {
    expect(langue()).toBe('fr')
    expect(t('reglages.titre')).toBe('Réglages')
  })

  it('suit la langue choisie', () => {
    definirLangue('en')
    expect(t('reglages.titre')).toBe('Settings')
  })

  it('« auto » suit le navigateur, qui est français ici', () => {
    expect(resoudreLangue('auto')).toBe('fr')
    expect(resoudreLangue('en')).toBe('en')
  })

  it('remplace les valeurs, et retombe sur la clé si elle manque', () => {
    expect(t('clé.inconnue')).toBe('clé.inconnue')
    expect(t('reglages.titre', { x: 1 })).toBe('Réglages')
  })

  it('accorde en nombre', () => {
    fr['essai.n.one'] = '{n} chose'
    fr['essai.n.other'] = '{n} choses'
    en['essai.n.one'] = '{n} thing'
    en['essai.n.other'] = '{n} things'
    try {
      expect(tn('essai.n', 1)).toBe('1 chose')
      expect(tn('essai.n', 0)).toBe('0 chose')
      expect(tn('essai.n', 2)).toBe('2 choses')
      definirLangue('en')
      expect(tn('essai.n', 0)).toBe('0 things')
      expect(tn('essai.n', 1)).toBe('1 thing')
    } finally {
      for (const k of ['essai.n.one', 'essai.n.other']) {
        delete fr[k]
        delete en[k]
      }
    }
  })
})

describe('textes des éléments en anglais', () => {
  it('compte, résume et date dans la langue choisie', async () => {
    const { composition } = await import('./elements/composition')
    const { tailleLisible } = await import('./elements/fichier/genre')
    const { libelleEcheance, puces } = await import('./elements/taches/puces')
    const { resume } = await import('./elements/croquis/trace')
    const note = { id: 'a', x: 0, y: 0, largeur: 10, contenu: { type: 'note' } } as never
    expect(composition([note, note])).toBe('2 notes')
    definirLangue('en')
    expect(composition([note])).toBe('1 note')
    expect(composition([note, note])).toBe('2 notes')
    expect(tailleLisible(812)).toBe('812 B')
    expect(tailleLisible(2400)).toBe('2.4 kB')
    expect(libelleEcheance('2026-10-23', '2026-10-23')).toBe('Today')
    expect(libelleEcheance('2026-10-12', '2026-10-23')).toBe('Oct 12')
    expect(puces({}, '2026-10-23')[0]?.texte).toBe('Due date')
    expect(resume({ traits: [] } as never)).toBe('Empty sketch')
  })
})
