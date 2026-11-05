// @vitest-environment jsdom
import { type GenreNeuf, textesEn, textesFr } from '@notak/tableau'
import { describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from './api'
import { RUBRIQUES, type Tri } from './Bibliotheque'
import './langue'

/**
 * Les clés bâties par modèle (`t(`biblio.genre.${g}`)`) échappent aux essais qui lisent les clés écrites en toutes
 * lettres : un genre ou une rubrique de plus, sans son texte, afficherait la clé à l'écran. Les listes ci-dessous
 * doivent couvrir leur type : `tsc` le vérifie (`Exhaustif`).
 */
type Exhaustif<T, L extends readonly T[]> = [Exclude<T, L[number]>] extends [never] ? true : never

const GENRES_NEUFS = ['toile', 'arbre', 'document'] as const satisfies readonly GenreNeuf[]
const GENRES_ENTREES = ['toile', 'arbre', 'document', 'image', 'lien', 'fichier'] as const satisfies readonly EntreeBibliotheque['genre'][]
const TRIS = ['date', 'dossier'] as const satisfies readonly Tri[]
const couverts: [Exhaustif<GenreNeuf, typeof GENRES_NEUFS>, Exhaustif<EntreeBibliotheque['genre'], typeof GENRES_ENTREES>, Exhaustif<Tri, typeof TRIS>] = [
  true,
  true,
  true,
]

describe('les clés bâties par modèle', () => {
  it('la bibliothèque a un texte pour chaque rubrique, chaque tri et chaque genre, dans les deux langues', () => {
    expect(couverts).toEqual([true, true, true])
    const cles = [
      ...RUBRIQUES.flatMap((r) => [`biblio.rubrique.${r}`, `biblio.vide.${r}`, `biblio.vide.${r}.aide`]),
      ...TRIS.map((x) => `biblio.tri.${x}`),
      ...GENRES_NEUFS.flatMap((g) => [`biblio.neuf.${g}`, `biblio.neuf.${g}.aide`, `biblio.neufAide.${g}`]),
      ...GENRES_ENTREES.map((g) => `biblio.genre.${g}`),
    ]
    expect(cles.filter((k) => !textesFr[k]?.trim())).toEqual([])
    expect(cles.filter((k) => !textesEn[k]?.trim())).toEqual([])
  })

  it('toute famille de clés bâtie dans le code, ici ou dans la toile, a des textes', () => {
    const sources: Record<string, string> = {
      ...import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob(['../../../packages/tableau/src/**/*.{ts,tsx}', '!../../../packages/tableau/src/**/*.test.{ts,tsx}'], {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
    }
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    const cles = Object.keys(textesFr)
    const orphelines: string[] = []
    let familles = 0
    for (const [f, source] of Object.entries(sources)) {
      // `t(`biblio.genre.${g}`)`, `tn(`…${x}…`)` : ce qui est écrit avant et après la valeur. Une clé faite tout entière
      // d'une valeur (`${cle}.${forme}`) ne dit rien de sa famille.
      for (const m of source.matchAll(/(?<![\w.$])(tn?)\(\s*`([\w.]*)\$\{[^`}]*\}([\w.]*)`/g)) {
        const [, fonction, debut, fin] = m as unknown as [string, string, string, string]
        if (!debut) continue
        familles++
        const suffixe = fonction === 'tn' ? `${fin}.one` : fin
        if (!cles.some((k) => k.startsWith(debut) && k.endsWith(suffixe) && k.length > debut.length + suffixe.length))
          orphelines.push(`${f}: ${debut}…${fin}`)
      }
    }
    expect(familles).toBeGreaterThan(50)
    expect(orphelines).toEqual([])
  })
})
