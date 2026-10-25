import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { THEMES_PITCH, themePitchDe } from '../themesPitch'
import { ANIMATIONS_DE_DECOR, DecorDiapo, type DemandeDecor, FORMES_DE_DECOR, auRatio, decorDe, jeuDe, melange } from './decor'
import { FORMES_PAR_DEFAUT, type FormesDiapo } from './formes'
import { TACHES_D_ENCRE, trainee } from './formesDesThemes'

const demande = (o: Partial<DemandeDecor> & { theme: string }): DemandeDecor => ({ ratio: '16:9', niveau: 'central', gabarit: 'sujet', branche: 0, graine: 7, ...o })

describe('le décor des diapositives', () => {
  it('le sombre et le clair n’ont aucun décor', () => {
    for (const theme of ['default', 'light']) {
      const d = decorDe(demande({ theme }))
      expect([d.formes, d.bandes, d.cadre]).toEqual([[], [], null])
      expect(renderToStaticMarkup(<DecorDiapo theme={theme} ratio="16:9" niveau="central" gabarit="sujet" branche={0} graine={0} />)).toBe('')
    }
  })

  it('innocence : le sujet central reprend les positions du relevé, en % de la diapo de base', () => {
    const d = decorDe(demande({ theme: 'innocence' }))
    const onde = d.formes.find((f) => f.forme === 'onde')!
    expect([onde.x, onde.y, onde.couleur]).toEqual([-59.2, 575.1, '#FF9A9A'])
    const boucle = d.formes.find((f) => f.forme === 'boucle')!
    expect([boucle.x, boucle.y]).toEqual([1219.2, -80.1])
    // En 9:16, les formes se resserrent ; le 3:4 prend celles du 9:16.
    const portrait = decorDe(demande({ theme: 'innocence', ratio: '9:16' })).formes.find((f) => f.forme === 'onde')!
    expect([portrait.x, portrait.y]).toEqual([-85.5, 1280])
    const tq = decorDe(demande({ theme: 'innocence', ratio: '3:4' })).formes.find((f) => f.forme === 'onde')!
    expect([tq.x, tq.y]).toEqual([-85.5, 960])
  })

  it('le repli des ratios : 4:3 prend le 16:9, 3:4 le 9:16', () => {
    const p = { '16:9': 'a', '9:16': 'b' }
    expect(['16:9', '4:3', '9:16', '3:4'].map((r) => auRatio(p, r as '16:9'))).toEqual(['a', 'a', 'b', 'b'])
    expect(auRatio({ '16:9': 'a', '4:3': 'c' }, '4:3')).toBe('c')
  })

  it('shape-for-you : la grande étoile déborde en haut à gauche du central, échelle 4,7 (5,27 tournée en 9:16)', () => {
    const [etoile] = decorDe(demande({ theme: 'shape-for-you' })).formes
    expect([etoile!.forme, etoile!.x, etoile!.y, etoile!.sx, etoile!.couleur]).toEqual(['fleuron', 360, 119.7, 4.7, '#F4B7B8'])
    const [p] = decorDe(demande({ theme: 'shape-for-you', ratio: '9:16' })).formes
    expect([p!.sx, p!.rotation]).toEqual([5.27, 10.78])
    // Une diapo sujet ailleurs : une tache derrière le titre (échelle 4), une autre décalée et tournée.
    const s = decorDe(demande({ theme: 'shape-for-you', niveau: 'principal', branche: 2 })).formes
    expect(s.map((f) => [f.sx, f.rotation])).toEqual([
      [4, 0],
      [2.15, -27.75],
    ])
    // Chaque sous-sujet reçoit sa tache, échelle 0,8, centrée sur lui.
    const l = decorDe(demande({ theme: 'shape-for-you', niveau: 'principal', gabarit: 'accolade', sousSujets: [[70, 30], [70, 60]] })).formes
    expect(l.filter((f) => f.sx === 0.8).map((f) => [f.x + f.l / 2, f.y + f.h / 2])).toEqual([
      [1120, 270],
      [1120, 540],
    ])
  })

  it('midnight-rose : la bande nuit couvre le central, 55 % en accolade, rien ailleurs ; le trio tourne de 165° sur un principal', () => {
    const bande = (o: Partial<DemandeDecor>) => decorDe(demande({ theme: 'midnight-rose', ...o })).bandes[0]!
    expect(bande({}).l).toBe(1600)
    expect(bande({ niveau: 'epilogue', gabarit: 'sujet' }).l).toBe(1600)
    expect(bande({ niveau: 'principal', gabarit: 'accolade' }).l).toBe(880)
    expect(bande({ niveau: 'principal', gabarit: 'puces' }).l).toBe(0)
    expect(bande({ niveau: 'principal', gabarit: 'puces', ratio: '9:16' })).toMatchObject({ l: 900, h: 0 })
    const central = decorDe(demande({ theme: 'midnight-rose' })).formes
    expect(central.map((f) => f.forme)).toEqual(['grandHexagone', 'moyenHexagone', 'petitHexagone'])
    // Les trois hexagones sont concentriques, au centre de la diapo (à quelques px près).
    for (const f of central) {
      expect(Math.abs(f.x + f.l / 2 - 800)).toBeLessThan(15)
      expect(Math.abs(f.y + f.h / 2 - 450)).toBeLessThan(15)
    }
    expect(decorDe(demande({ theme: 'midnight-rose', niveau: 'principal' })).formes.every((f) => f.rotation === 165)).toBe(true)
  })

  it('hubble-bubble : la grande bulle du central en bas à gauche, à −10 % en 4:3 ; les bulles inutiles restent hors champ', () => {
    const d = decorDe(demande({ theme: 'hubble-bubble' }))
    const grande = d.formes.find((f) => f.forme === 'grandeBulleJaune')!
    expect([grande.x, grande.y, grande.sx]).toEqual([160, 360, 1.87])
    expect(decorDe(demande({ theme: 'hubble-bubble', ratio: '4:3' })).formes.find((f) => f.forme === 'grandeBulleJaune')!.x).toBe(-120)
    expect(d.formes.filter((f) => f.horsChamp).every((f) => f.x + f.l * f.sx < 0 || f.x > 1600)).toBe(true)
    // La bande du bas paraît en paroles.
    expect(decorDe(demande({ theme: 'hubble-bubble', niveau: 'principal', gabarit: 'paroles' })).bandes[0]).toMatchObject({ y: 666, h: 234, couleur: '#279452' })
    expect(d.bandes[0]!.h).toBe(0)
  })

  it('hand-drawn : le cadre partout ; zigzag, soulignement et fleur sur les diapos sujet ; feuilles en 16:9 seulement', () => {
    expect(decorDe(demande({ theme: 'hand-drawn', gabarit: 'puces' })).formes).toEqual([])
    expect(decorDe(demande({ theme: 'hand-drawn', gabarit: 'puces' })).cadre?.trait).toBe(42)
    const d = decorDe(demande({ theme: 'hand-drawn' }))
    expect(d.formes.map((f) => f.forme)).toEqual(['zigzag', 'pli', 'fleur', 'feuilleGauche', 'feuilleMilieu', 'feuilleDroite'])
    expect(d.formes.slice(0, 3).map((f) => [f.forme, f.x, f.y]).filter(([n]) => n !== 'pli')).toEqual([
      ['zigzag', 1216, -50],
      ['fleur', 137, 671],
    ])
    const q = decorDe(demande({ theme: 'hand-drawn', ratio: '4:3' }))
    expect(q.formes.map((f) => [f.forme, f.x, f.y]).filter(([n]) => n !== 'pli')).toEqual([
      ['zigzag', 816, -50],
      ['fleur', 87, 672],
    ])
    expect(decorDe(demande({ theme: 'hand-drawn', ratio: '3:4' })).formes.find((f) => f.forme === 'fleur')).toMatchObject({ x: 67, y: 1000 })
    // Le soulignement s'ancre en bas à droite du titre.
    const titre = { x: 400, y: 380, l: 800, h: 140 }
    const pli = decorDe(demande({ theme: 'hand-drawn', titre })).formes.find((f) => f.forme === 'pli')!
    expect([pli.x, pli.y]).toEqual([675, 460])
  })

  it('le jeu tourne avec la branche principale, mélangé par la graine : même graine, même jeu', () => {
    expect(melange(42, 5)).toEqual(melange(42, 5))
    expect([...melange(42, 5)].sort()).toEqual([0, 1, 2, 3, 4])
    const jeux = Array.from({ length: 10 }, (_, b) => jeuDe(42, 5, b))
    expect(jeux.slice(0, 5)).toEqual(jeux.slice(5))
    expect(new Set(jeux).size).toBe(5)
    // Deux graines finissent par donner deux ordres différents.
    expect(Array.from({ length: 20 }, (_, g) => melange(g, 5).join()).some((o) => o !== melange(0, 5).join())).toBe(true)
    const a = decorDe(demande({ theme: 'innocence', niveau: 'principal', branche: 3, graine: 9 }))
    expect(decorDe(demande({ theme: 'innocence', niveau: 'principal', branche: 3, graine: 9 }))).toEqual(a)
    expect(decorDe(demande({ theme: 'innocence', niveau: 'principal', branche: 8, graine: 9 }))).toEqual(a)
  })

  it('le SVG se pose à la taille de base, chaque forme nommée et rangée pour les transitions', () => {
    const html = renderToStaticMarkup(<DecorDiapo theme={themePitchDe('midnight-rose')} ratio="9:16" niveau="central" gabarit="sujet" branche={0} graine={1} />)
    expect(html).toContain('viewBox="0 0 900 1600"')
    expect(html).toContain('data-decor="grandHexagone" data-rang="0"')
    expect(html).toContain('data-decor="bande"')
    expect(html).toMatch(/<radialGradient id="d[^"]*-hexagone"/)
    for (const nom of FORMES_DE_DECOR) expect(nom).toMatch(/^[a-zA-Z0-9]+$/)
  })

  it('les animations visent des décors qui existent', () => {
    for (const a of ANIMATIONS_DE_DECOR) {
      expect(THEMES_PITCH.some((x) => x.id === a.theme)).toBe(true)
      const nom = /data-decor[\^*]?="([^"]+)"/.exec(a.cible)?.[1]
      if (nom && nom !== 'bande' && nom !== 'cadre') expect(FORMES_DE_DECOR.some((f) => f === nom || f.startsWith(nom) || f.includes(nom))).toBe(true)
    }
    const carnet = ANIMATIONS_DE_DECOR.filter((a) => a.theme === 'hand-drawn' && a.propriete === 'strokeDashoffset')
    expect(Math.max(...carnet.map((a) => (a.delai as number) + (a.duree as number)))).toBe(2300)
  })
})

describe('les formes des thèmes', () => {
  const p = { l: 120, h: 300, trait: 8, couleur: '#123456', graine: 3 }
  const appels: { [K in keyof FormesDiapo]: (f: FormesDiapo[K]) => unknown } = {
    accolade: (f) => f({ ...p, bec: 150 }),
    accoladeResume: (f) => f({ ...p, bec: 150 }),
    puce: (f) => f({ ...p, l: 20, h: 20, niveau: 1 }),
    arete: (f) => f({ ...p, angle: 30 }),
    epine: (f) => f(p),
    axe: (f) => f(p),
    point: (f) => f({ ...p, l: 20, h: 20 }),
    filet: (f) => f(p),
    branche: (f) => f({ ...p, points: [[10, 0], [10, 200], [100, 200]] }),
  }
  const dessiner = (formes: Partial<FormesDiapo>) =>
    Object.fromEntries(
      (Object.keys(formes) as (keyof FormesDiapo)[]).map((k) => [k, renderToStaticMarkup(<svg>{(appels[k] as (f: unknown) => React.ReactNode)(formes[k])}</svg>)]),
    )

  it('chaque thème ne remplace que des formes de l’interface, chacune rendue dans un <g>', () => {
    for (const th of THEMES_PITCH) {
      for (const [nom, html] of Object.entries(dessiner(th.formes ?? {}))) {
        expect(Object.keys(FORMES_PAR_DEFAUT)).toContain(nom)
        expect(html).toMatch(/^<svg><g[ >]/)
      }
    }
  })

  it('les formes propres : pinceau, équerres, parenthèse, hexagone, pastille cerclée ; midnight-rose sans accolade ni arête', () => {
    const f = (id: string) => dessiner(themePitchDe(id).formes ?? {})
    expect(f('innocence').accolade).toContain('data-forme="accolade-pinceau"')
    expect(f('shape-for-you').accolade).toContain('data-forme="accolade-equerre"')
    expect(f('shape-for-you').branche).toContain('stroke-linecap="square"')
    expect(f('hubble-bubble').accolade).toContain('A60 147 0 0 0 60 150')
    expect(f('hubble-bubble').puce).toContain('fill="#BADD96" stroke="#FDFF8C" stroke-width="6"')
    expect(f('midnight-rose').puce).toContain('fill="#0C1548"')
    expect(f('midnight-rose').accolade).toBe('<svg><g></g></svg>')
    expect(f('midnight-rose').branche).toBe('<svg><g></g></svg>')
  })

  it('hand-drawn : le trait à main levée est le même d’une fois sur l’autre, et change avec la graine', () => {
    const carnet = themePitchDe('hand-drawn').formes!
    const une = renderToStaticMarkup(<svg>{carnet.accolade!({ ...p, bec: 150 })}</svg>)
    expect(renderToStaticMarkup(<svg>{carnet.accolade!({ ...p, bec: 150 })}</svg>)).toBe(une)
    expect(renderToStaticMarkup(<svg>{carnet.accolade!({ ...p, graine: 4, bec: 150 })}</svg>)).not.toBe(une)
    expect(une).toContain('data-rough')
    // Les puces sont quatre taches prises tour à tour.
    const puces = [0, 1, 2, 3, 4].map((graine) => renderToStaticMarkup(<svg>{carnet.puce!({ ...p, l: 20, h: 20, graine, niveau: 0 })}</svg>))
    expect(new Set(puces).size).toBe(4)
    expect(puces[4]).toBe(puces[0])
    expect(TACHES_D_ENCRE).toHaveLength(4)
  })

  it('une traînée de pinceau est une surface fermée, pure', () => {
    const d = trainee(
      [
        [0, 0],
        [50, 0],
        [100, 0],
      ],
      () => 10,
    )
    expect(d).toBe('M0 5L50 5L100 5L100 -5L50 -5L0 -5Z')
  })
})
