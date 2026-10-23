/**
 * Engendre `packages/tableau/src/elements/decor/emojisUnicode.ts` depuis les données publiques d'Emojibase
 * (paquet npm `emojibase-data`, licence MIT) : noms anglais et français, mots-clés, teintes de peau.
 *
 *   npm pack emojibase-data && tar xzf emojibase-data-*.tgz     # donne ./package
 *   bun scripts/emojis.ts ./package
 *
 * Une ligne par émoji, champs séparés par une tabulation : l'émoji, son nom anglais, son nom français, ses mots-clés
 * (anglais puis français), et les cinq variantes de teinte (de la plus claire à la plus foncée) quand il en a.
 */
const dossier = process.argv[2]
if (!dossier) throw new Error('Usage : bun scripts/emojis.ts <dossier du paquet emojibase-data>')

interface Brut {
  label: string
  emoji: string
  tags?: string[]
  group?: number
  order: number
  skins?: { emoji: string; tone?: number | number[] }[]
}

const lire = async (langue: string): Promise<Brut[]> => Bun.file(`${dossier}/${langue}/data.json`).json()
const [en, fr] = await Promise.all([lire('en'), lire('fr')])
const francais = new Map(fr.map((e) => [e.emoji, e]))

// Les groupes d'Emojibase, sans « composants » (2), dans l'ordre où on les montre.
const GROUPES = [0, 1, 3, 4, 5, 6, 7, 8, 9]
const propre = (s: string) => s.replace(/[\t\n]/g, ' ').trim()

const parGroupe = GROUPES.map((g) =>
  en
    .filter((e) => e.group === g)
    .sort((a, b) => a.order - b.order)
    .map((e) => {
      const f = francais.get(e.emoji)
      const teintes = (e.skins ?? []).filter((s) => typeof s.tone === 'number').sort((a, b) => (a.tone as number) - (b.tone as number))
      const mots = [...new Set([...(e.tags ?? []), ...(f?.tags ?? [])])].join(' ')
      return [e.emoji, propre(e.label), propre(f?.label ?? e.label), propre(mots), teintes.length === 5 ? teintes.map((s) => s.emoji).join(' ') : ''].join('\t')
    })
    .join('\n'),
)

const sortie = new URL('../packages/tableau/src/elements/decor/emojisUnicode.ts', import.meta.url)
await Bun.write(
  sortie,
  `// Fichier engendré par scripts/emojis.ts depuis emojibase-data (MIT, https://emojibase.dev) : ne pas modifier à la main.
// Un groupe par chaîne : une ligne par émoji, champs séparés par une tabulation (émoji, nom anglais, nom français,
// mots-clés, cinq teintes de peau).
export const EMOJIS_UNICODE: readonly string[] = [
${parGroupe.map((g) => `  ${JSON.stringify(g)},`).join('\n')}
]
`,
)
console.log(`${parGroupe.reduce((n, g) => n + g.split('\n').length, 0)} émojis écrits.`)
