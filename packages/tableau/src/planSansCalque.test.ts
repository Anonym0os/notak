import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * Rien de ce qui est dessiné dans `.notak-plan` ne doit demander un calque au compositeur. `.notak-plan` porte l'échelle
 * de la vue sans calque à lui : il est peint net, à la bonne taille, dans le calque de `.notak-glisse`. Dès qu'un de ses
 * descendants a un calque, WebKit (Notak.app, Safari) en donne un à `.notak-plan` aussi, le rastérise à 100 % puis
 * l'agrandit : toute la toile floute au zoom, le temps d'un fondu au survol, d'un rebond, d'un glisser.
 *
 * Demandent un calque : une transition ou une animation d'`opacity`, `transform`, `scale`, `translate`, `rotate` ou
 * `filter` ; `will-change` ; `backdrop-filter` ; une transformation 3D. On anime à la place une propriété enregistrée
 * (--notak-paraitre, --notak-opacite, --notak-echelle…, toile.css) que la vraie suit, repeinte.
 */

const ICI = new URL('./', import.meta.url)

/** Ce qui vit hors de `.notak-plan` dans les feuilles des éléments : surcouches, panneaux, poignées posées sur la toile. */
const HORS_DU_PLAN: RegExp[] = [
  /^\.notak-croquis-(barre|fond)\b/, // la feuille de croquis, dans une surcouche sous document.body (Surcouche)
  /^\.notak-dessin-libre\b/, // la couche de dessin, posée sur .notak-toile (ouvrirDessinLibre)
  /^\.notak-banque-/, // la banque d'images, un panneau
  /^\.notak-visionneuse-/, // la visionneuse d'images, en surcouche
  /^\.notak-ligne-rapide/, // la poignée de la ligne rapide, par un portail dans .notak-toile (LigneRapide)
  /^\.notak-glisse-apercu\b/, // la tâche qu'on glisse, posée sur .notak-toile (taches/glisse.ts)
]

/** Dans toile.css, qui décrit aussi l'interface autour, seules ces règles touchent ce qui est dans le plan. */
const DANS_LE_PLAN = /\.notak-plan\b|\.notak-carte\b|\.notak-poignee\b|\.notak-curseur\b|\[data-hors-recherche\]|\.notak-pastille-autre|\.notak-calque-lignes/

const COMPOSE = /\b(opacity|transform|filter|scale|translate|rotate|all)\b/
const TROIS_D = /\b(perspective|rotate[XY3]d?|rotate[XY]|translate3d|translateZ|scale3d|matrix3d|preserve-3d)\b/

/** Les commentaires effacés (les lignes gardées), puis les @keyframes à part. */
function lire(texte: string) {
  const brut = texte.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const animees = new Set<string>()
  const KEYFRAMES = /@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g
  for (const m of brut.matchAll(KEYFRAMES)) {
    if (/(?:^|[;{\s])(opacity|transform|scale|translate|rotate|filter)\s*:/.test(m[2]!)) animees.add(m[1]!)
  }
  return { css: brut.replace(KEYFRAMES, (k) => k.replace(/[^\n]/g, ' ')), animees }
}

/** Les règles qui demandent un calque, « fichier:ligne | sélecteur | pourquoi ». */
function fautes(chemin: string, filtre?: RegExp): string[] {
  return analyser(readFileSync(new URL(chemin, ICI), 'utf8'), chemin, filtre)
}

function analyser(texte: string, chemin: string, filtre?: RegExp): string[] {
  const { css, animees } = lire(texte)
  const trouvees: string[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = m[1]!.trim().replace(/\s+/g, ' ')
    const corps = m[2]!
    if (filtre && !filtre.test(selecteur)) continue
    const raisons: string[] = []
    for (const [, valeur] of corps.matchAll(/(?:^|[;\s])transition(?:-property)?\s*:\s*([^;]+)/g)) {
      const v = valeur!.trim()
      if (COMPOSE.test(v.replace(/--[\w-]+/g, '')) || /^[\d.]+m?s\b/.test(v)) raisons.push(`transition: ${v}`)
    }
    for (const [, valeur] of corps.matchAll(/(?:^|[;\s])animation(?:-name)?\s*:\s*([^;]+)/g)) {
      const noms = valeur!.match(/[\w-]+/g)?.filter((n) => animees.has(n)) ?? []
      if (noms.length) raisons.push(`animation: ${noms.join(', ')}`)
    }
    if (/(?:^|[;\s])will-change\s*:/.test(corps)) raisons.push('will-change')
    if (/(?:^|[;\s])(-webkit-)?backdrop-filter\s*:\s*(?!none\b)[^\s;]/.test(corps)) raisons.push('backdrop-filter')
    if (TROIS_D.test(corps)) raisons.push('transformation 3D')
    if (!raisons.length) continue
    const horsDuPlan = selecteur.split(',').every((s) => HORS_DU_PLAN.some((r) => r.test(s.trim())))
    if (horsDuPlan) continue
    const ligne = css.slice(0, m.index! + m[0].indexOf('{')).split('\n').length
    trouvees.push(`${chemin}:${ligne} | ${selecteur} | ${raisons.join(' ; ')}`)
  }
  return trouvees
}

/** Les feuilles des éléments dessinés dans le plan (la carte mentale et le document s'ouvrent en grand, à part). */
function feuillesDesElements(): string[] {
  const dossiers = readdirSync(new URL('elements/', ICI), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'arbre' && d.name !== 'document')
    .map((d) => d.name)
  return [
    ...readdirSync(new URL('elements/', ICI)).filter((f) => f.endsWith('.css')).map((f) => `elements/${f}`),
    ...dossiers.flatMap((d) => readdirSync(new URL(`elements/${d}/`, ICI)).filter((f) => f.endsWith('.css')).map((f) => `elements/${d}/${f}`)),
  ]
}

describe('ce qui est dessiné dans le plan ne demande pas de calque (sinon la toile floute dans WebKit)', () => {
  it('les feuilles des éléments, et la case à cocher', () => {
    const feuilles = [...feuillesDesElements(), 'communs/case.css']
    expect(feuilles.length).toBeGreaterThan(15)
    expect(feuilles.flatMap((f) => fautes(f))).toEqual([])
  })

  it('les règles de toile.css qui touchent les cartes, les poignées, les pointeurs des autres', () => {
    expect(fautes('toile.css', DANS_LE_PLAN)).toEqual([])
  })

  it('l’analyse voit ce qui demande un calque, et laisse passer les propriétés enregistrées', () => {
    // Sans ce contrôle, une analyse cassée laisserait tout passer.
    const css = `
      @keyframes rebond { 50% { transform: scale(0.8); } }
      @keyframes rebond-sage { 50% { --notak-echelle: 0.8; } }
      .a { opacity: 0; transition: opacity 100ms; }
      .b { transition: 0.2s; }
      .c { animation: rebond 150ms ease-out; }
      .d { will-change: transform; }
      .e { backdrop-filter: blur(8px); }
      .f { transform: perspective(2000px) rotateX(3deg); }
      @media (hover: none) { .g { transition: scale 0.1s; } }
      .h { opacity: var(--notak-paraitre); transition: --notak-paraitre 100ms, background 0.2s; }
      .i { scale: var(--notak-echelle); animation: rebond-sage 150ms; }
      .j { backdrop-filter: none; transform: translateX(-50%); }
      .notak-visionneuse-image { will-change: transform; }
    `
    expect(analyser(css, 'essai.css').map((f) => f.split(' | ')[1])).toEqual(['.a', '.b', '.c', '.d', '.e', '.f', '.g'])
  })
})
