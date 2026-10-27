import { textesEn, textesFr } from '@notak/tableau'
import { describe, expect, it } from 'vitest'
import '../langue'

/** Le code de l'app de bureau, hors essais : les écrans d'ici, et ce qu'ils ont ajouté à l'édition locale. */
const sources: Record<string, string> = import.meta.glob(['./*.{ts,tsx}', '!./*.test.{ts,tsx}', '../edition/locale.tsx', '../local/Rangement.tsx', '../MiseAJour.tsx', '../main.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('les textes de l’app de bureau', () => {
  it('chaque clé employée dans le code existe, en français comme en anglais', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    const inconnues: string[] = []
    for (const [f, source] of Object.entries(sources)) {
      const cles = [...source.matchAll(/(?<![\w.$])t\(\s*'([\w.]+)'/g)].map((m) => m[1]!)
      for (const k of cles) if (!(k in textesFr) || !(k in textesEn)) inconnues.push(`${f}: ${k}`)
      for (const m of source.matchAll(/(?<![\w.$])tn\(\s*'([\w.]+)'/g))
        for (const forme of ['one', 'other']) if (!(`${m[1]}.${forme}` in textesFr)) inconnues.push(`${f}: ${m[1]}.${forme}`)
    }
    expect(inconnues).toEqual([])
  })

  it('toute clé « bureau.* » est employée quelque part, et dite dans les mêmes termes dans les deux langues', () => {
    const tout = Object.values(sources).join('\n')
    const variables = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    const orphelines: string[] = []
    for (const k of Object.keys(textesFr).filter((k) => k.startsWith('bureau.'))) {
      if (!tout.includes(`'${k}'`)) orphelines.push(k)
      expect(textesEn[k]?.trim(), k).toBeTruthy()
      expect(variables(textesEn[k]!), k).toEqual(variables(textesFr[k]!))
    }
    expect(orphelines).toEqual([])
  })
})
