import { definirLangue, t, textesEn, textesFr } from '@notak/tableau'
import { afterEach, describe, expect, it } from 'vitest'
import '../langue'
import { en, fr } from '../textes/serveur'

afterEach(() => definirLangue('fr'))

describe('les textes de la piste « serveur »', () => {
  it('chaque clé du français existe en anglais, et l’inverse', () => {
    expect(Object.keys(fr).filter((k) => !(k in en))).toEqual([])
    expect(Object.keys(en).filter((k) => !(k in fr))).toEqual([])
  })

  it('les mêmes marques {…} dans les deux langues : une traduction ne perd pas la valeur qu’on y met', () => {
    const marques = (texte: string) => [...texte.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()
    for (const [cle, texte] of Object.entries(fr)) expect(marques(en[cle]!), cle).toEqual(marques(texte))
  })

  it('aucun texte ne se contente de répéter sa clé, ni n’est vide', () => {
    for (const [cle, texte] of Object.entries({ ...fr, ...en })) {
      expect(texte, cle).not.toBe(cle)
      expect(texte.trim(), cle).not.toBe('')
    }
  })

  it('toute clé que ces écrans emploient existe, dans les textes de la toile ou ceux d’ici', () => {
    // Les écrans de la piste, et ceux d'`apps/web/src` qu'elle retouche (`langue.test.ts` ne lit que le premier niveau).
    const sources: Record<string, string> = import.meta.glob(['./*.{ts,tsx}', '../edition/serveur.tsx', '!./*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    const inconnues: string[] = []
    for (const [f, source] of Object.entries(sources)) {
      // `t('clé')`, et les clés qu'un test ternaire choisit : `t(a ? 'clé' : 'autre')`.
      for (const m of source.matchAll(/(?<![\w.$])t\(\s*'([\w.]+)'/g)) if (!(m[1]! in textesFr)) inconnues.push(`${f}: ${m[1]}`)
      for (const m of source.matchAll(/'((?:serveur|erreur\.appareil)\.[\w.]+)'/g)) if (!(m[1]! in textesFr)) inconnues.push(`${f}: ${m[1]}`)
      for (const m of source.matchAll(/(?<![\w.$])tn\(\s*'([\w.]+)'/g))
        for (const forme of ['one', 'other']) if (!(`${m[1]}.${forme}` in textesFr)) inconnues.push(`${f}: ${m[1]}.${forme}`)
    }
    expect(inconnues).toEqual([])
  })

  it('se traduisent avec leurs valeurs', () => {
    definirLangue('en')
    expect(t('serveur.maj.disponible', { version: '1.2.0', actuelle: '1.0.0' })).toBe('Notak 1.2.0 is available (this server: 1.0.0).')
    expect(textesEn['serveur.code.titre']).toBe('Finish signing in in your browser')
    expect(textesFr['serveur.code.titre']).toBe('Terminez la connexion dans votre navigateur')
  })
})
