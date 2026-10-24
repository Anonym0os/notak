import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { definirLangue, en, fr, t } from '../../../langue'

/** Les fichiers de l'onglet Carte : tout ce qui est sous `elements/arbre`, sauf les tests. */
function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n)
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

const DOSSIER = decodeURIComponent(new URL('..', import.meta.url).pathname)

describe('les textes de l’onglet Carte', () => {
  it('chaque clé écrite en toutes lettres existe en français et en anglais', () => {
    const cles = new Set<string>()
    for (const f of sources(DOSSIER)) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('(arbre\.carte\.[\w.]+)'/g)) cles.add(m[1]!)
    expect(cles.size).toBeGreaterThan(60)
    for (const c of cles) {
      expect(fr[c], `fr ${c}`).toBeTruthy()
      expect(en[c], `en ${c}`).toBeTruthy()
    }
  })

  it('les deux langues ont les mêmes clés', () => {
    const [a, b] = [Object.keys(fr).filter((k) => k.startsWith('arbre.carte.')), Object.keys(en).filter((k) => k.startsWith('arbre.carte.'))]
    expect(a.length).toBeGreaterThan(60)
    expect(b.sort()).toEqual(a.sort())
  })

  it('les libellés du relevé, en anglais comme en français', () => {
    definirLangue('en')
    try {
      expect(['arbre.carte.fond', 'arbre.carte.brancheColoree', 'arbre.carte.equilibree', 'arbre.carte.uniforme', 'arbre.carte.relationSuit', 'arbre.carte.libre', 'arbre.carte.policeCjk', 'arbre.carte.themesPerso'].map((c) => t(c))).toEqual([
        'Background Color',
        'Colored Branch',
        'Balance Map',
        'Uniform Topic Length',
        'Line Color Follow Topic',
        'Free Branch Position',
        'CJK Font',
        'Custom Themes',
      ])
    } finally {
      definirLangue('fr')
    }
    expect(t('arbre.carte.uniforme')).toBe('Justifier l\'alignement du sujet')
  })
})
