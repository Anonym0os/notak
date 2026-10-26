import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { definirLangue, t, textesEn, textesFr } from '@notak/tableau'
import { afterEach, describe, expect, it } from 'vitest'
import '../langue'
import { en as enDivers, fr as frDivers } from '../textes/divers'
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
    const sources: Record<string, string> = import.meta.glob(['./*.{ts,tsx}', '../edition/serveur.tsx', '../connexion.tsx', '../Compte.tsx', '../MiseAJour.tsx', '!./*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    const inconnues: string[] = []
    for (const [f, source] of Object.entries(sources)) {
      // `t('clé')`, et les clés qu'un test ternaire choisit : `t(a ? 'clé' : 'autre')`.
      for (const m of source.matchAll(/(?<![\w.$])t\(\s*'([\w.]+)'/g)) if (!(m[1]! in textesFr)) inconnues.push(`${f}: ${m[1]}`)
      // Une clé qu'on cite sans `t(` (un tableau, une table) ; ou la base d'un pluriel (`tn('clé', n)` : `clé.one`, `clé.other`).
      for (const m of source.matchAll(/'((?:serveur|erreur\.appareil)\.[\w.]+)'/g)) if (!(m[1]! in textesFr) && !(`${m[1]}.other` in textesFr)) inconnues.push(`${f}: ${m[1]}`)
      for (const m of source.matchAll(/(?<![\w.$])tn\(\s*'([\w.]+)'/g))
        for (const forme of ['one', 'other']) if (!(`${m[1]}.${forme}` in textesFr)) inconnues.push(`${f}: ${m[1]}.${forme}`)
    }
    expect(inconnues).toEqual([])
  })

  it('se traduisent avec leurs valeurs', () => {
    definirLangue('en')
    expect(t('serveur.maj.disponible', { version: '1.2.0', actuelle: '1.0.0' })).toBe('Notak 1.2.0 is available (this server: 1.0.0).')
    expect(textesEn['serveur.code.titre']).toBe('Finish signing in using your browser')
    expect(textesFr['serveur.code.titre']).toBe('Terminez la connexion dans votre navigateur')
  })
})

/** Le code de l'application et celui de la toile, hors essais et hors fichiers de textes : là où une clé s'emploie. */
function sourcesDe(dossier: string): string[] {
  return readdirSync(dossier, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !/(^|[\\/])(textes[\\/].*|langue\.ts)$/.test(f))
    .map((f) => readFileSync(join(dossier, f), 'utf8'))
}

describe('les textes de la piste, de bout en bout', () => {
  // `serveur.*` et les clés de `textes/divers.ts` (`arrivee.*`, `importer.envoi`…) ; `externe.*` vit dans la toile, mais s'emploie des deux côtés.
  const cles = [...Object.keys(fr), ...Object.keys(frDivers), ...Object.keys(textesFr).filter((k) => k.startsWith('externe.'))]

  it('toute clé est employée quelque part : une clé qu’on retire d’un écran ne reste pas orpheline', () => {
    const tout = [...sourcesDe(join(import.meta.dirname, '..')), ...sourcesDe(join(import.meta.dirname, '../../../../packages/tableau/src'))].join('\n')
    // Un pluriel (`clé.one`, `clé.other`) s'emploie par sa base : `tn('clé', n)`.
    const orphelines = cles.filter((k) => !tout.includes(`'${k.replace(/\.(one|other)$/, '')}'`))
    expect(orphelines).toEqual([])
  })

  it('les mêmes marques {…} dans les deux langues, pour chacune de ces clés', () => {
    const marques = (texte: string) => [...texte.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()
    const francais: Record<string, string> = { ...fr, ...frDivers, ...textesFr }
    const anglais: Record<string, string> = { ...en, ...enDivers, ...textesEn }
    for (const k of cles) {
      expect(anglais[k], `${k} (en)`).toBeTruthy()
      expect(marques(anglais[k]!), k).toEqual(marques(francais[k]!))
    }
  })

  it('les clés de `divers` existent dans les deux langues', () => {
    expect(Object.keys(frDivers).filter((k) => !(k in enDivers))).toEqual([])
    expect(Object.keys(enDivers).filter((k) => !(k in frDivers))).toEqual([])
  })

  it('l’anglais est américain, et sans mot doublé (« in in »)', () => {
    const britannique = /\b(authoris|recognis|organis|colour|favour|behaviour|cancelled|centre\b|licence\b|catalogue|grey|analyse\b)/i
    for (const [cle, texte] of Object.entries({ ...en, ...enDivers, ...Object.fromEntries(cles.filter((k) => k.startsWith('externe.')).map((k) => [k, textesEn[k]!])) })) {
      expect(texte, cle).not.toMatch(britannique)
      expect(texte, cle).not.toMatch(/\b(\w+) \1\b/i)
    }
  })
})
