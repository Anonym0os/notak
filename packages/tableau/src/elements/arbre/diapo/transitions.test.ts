import { describe, expect, it } from 'vitest'
import type { Effet } from '../modele/gabarits'
import type { Mot, Rect } from './morphing'
import { type Instantane, type Piste, type VueBoite, demander, etatsInitiaux, fileVide, liberer, minutage, pisteDeDecor, planAffichage, planifier, valeursA } from './transitions'

const effet = (nom: Effet['nom'], duree: number, animationsDiapo = true): Effet => ({ nom, duree, animationsDiapo })
const FONDU = effet('fondu', 400)
const MORPHING = effet('morphing', 1000)
const DANS = effet('dans-la-diapo', 600)

const rect = (x: number, y: number, l = 100, h = 50): Rect => ({ x, y, l, h })
const mot = (texte: string, r: Rect, police = 'p', couleur = 'rgb(255, 255, 255)'): Mot => ({ texte, rect: r, ligne: 0, police, couleur })

let n = 0
/** Une boîte ; sa référence change d'un instantané à l'autre, comme dans la vraie mesure. */
const boite = (cle: string, r: Rect, o: Partial<VueBoite> = {}): VueBoite => ({ ref: `b${n++}`, cle, genre: 'bloc', rect: r, opacite: 1, visible: 1, ...o })

const diapo = (boites: VueBoite[], o: Partial<Instantane> = {}): Instantane => ({ l: 1600, h: 900, theme: 'default', sujet: 'X', type: 'sujet', gabarit: 'sujet', niveau: 'principal', boites, decors: [], bandes: [], correspondances: {}, ...o })

const de = (plan: { pistes: Piste[] }, ref: string) => plan.pistes.filter((p) => p.ref === ref)

describe('le plan d’une transition', () => {
  it('reculer, l’animation coupée : aucun effet, rien à jouer', () => {
    const p = planifier(effet('aucun', 0, false), diapo([]), diapo([boite('X:titre', rect(0, 0))]))
    expect(p.pistes).toEqual([])
    expect(p.minutage.total).toBe(0)
  })

  it('les trois temps se suivent : sortie, effet, entrée', () => {
    expect(minutage(0, 1000, 700)).toEqual({ avant: 0, pendant: 1000, apres: 700, total: 1700 })
  })

  it('le fondu : la source s’efface en easeOutQuad, la cible paraît en easeInQuad, sur toute la durée', () => {
    const p = planifier(FONDU, diapo([]), diapo([]))
    expect(de(p, 'contenu').map((x) => [x.cote, x.courbe, x.debut, x.duree])).toEqual([
      ['source', 'easeOutQuad', 0, 400],
      ['cible', 'easeInQuad', 0, 400],
    ])
    expect(p.fondTransparent).toBe(true)
  })

  it('au démarrage, rien dessous : toute la diapositive paraît, son fond compris', () => {
    const p = planifier(FONDU, null, diapo([]))
    expect(de(p, 'cadre')).toMatchObject([{ cote: 'cible', de: { opacite: 0 }, a: { opacite: 1 }, duree: 400 }])
    expect(p.fondTransparent).toBe(false)
  })

  it('dans la diapositive : chaque boîte commune glisse de sa place à la nouvelle en easeInOutCubic, 600 ms', () => {
    const s = diapo([boite('A:titre', rect(100, 100), { etat: 'courant' }), boite('B:titre', rect(100, 200), { etat: 'cache', opacite: 0 })], { type: 'liste', gabarit: 'puces' })
    const c = diapo([boite('A:titre', rect(100, 50), { etat: 'passe' }), boite('B:titre', rect(100, 150), { etat: 'courant' })], { type: 'liste', gabarit: 'puces' })
    const p = planifier(DANS, s, c)
    const a = de(p, c.boites[0]!.ref)[0]!
    expect(a).toMatchObject({ cote: 'cible', courbe: 'easeInOutCubic', debut: 0, duree: 600, de: { x: 0, y: 50, sx: 1, sy: 1, opacite: 1 }, a: { x: 0, y: 0, sx: 1, sy: 1, opacite: 1 } })
    expect(p.caches).toContainEqual({ cote: 'source', ref: s.boites[0]!.ref })
    // B était caché : il paraît, sur toute la durée.
    expect(de(p, c.boites[1]!.ref)).toMatchObject([{ de: { opacite: 0 }, a: { opacite: 1 }, debut: 0, duree: 600 }])
  })

  it('le morphing découpe le texte en unités ; une unité qui change de police se relaie à 300 ms, en 120 ms', () => {
    const s = diapo([boite('X:titre', rect(0, 0), { genre: 'texte', mots: [mot('Chapitre', rect(0, 0, 80, 20)), mot('A', rect(90, 0, 10, 20))] })], { type: 'liste', gabarit: 'puces' })
    const c = diapo([boite('X:titre', rect(0, 0), { genre: 'texte', mots: [mot('Chapitre', rect(100, 300, 160, 40), 'grand'), mot('A', rect(280, 300, 20, 40), 'grand')] })], { type: 'sujet', gabarit: 'sujet' })
    const p = planifier(MORPHING, s, c)
    expect(p.caches).toEqual(expect.arrayContaining([{ cote: 'source', ref: s.boites[0]!.ref }, { cote: 'cible', ref: c.boites[0]!.ref }]))
    // Une seule unité (même texte, une ligne de chaque côté), en deux exemplaires.
    expect(p.copies.map((x) => x.genre === 'mots' && x.cote)).toEqual(['source', 'cible'])
    const [A, B] = p.copies.map((x) => x.id)
    expect(de(p, A!).map((x) => [x.debut, x.duree, x.courbe])).toEqual([
      [0, 1000, 'easeInOutQuart'],
      [300, 120, 'easeInQuart'],
    ])
    expect(de(p, B!).map((x) => [x.debut, x.duree, x.courbe])).toEqual([
      [0, 1000, 'easeInOutQuart'],
      [300, 120, 'easeOutQuart'],
    ])
    // L'ancien exemplaire va de sa boîte (0, 0, 100 × 20) à la nouvelle (100, 300, 200 × 40).
    expect(de(p, A!)[0]!.a).toMatchObject({ x: 100, y: 300, sx: 2, sy: 2 })
    expect(de(p, B!)[0]!.de).toMatchObject({ x: -100, y: -300, sx: 0.5, sy: 0.5 })
  })

  it('au morphing, ce qui part s’efface sur la première moitié, ce qui arrive paraît sur la seconde', () => {
    const s = diapo([boite('A:note', rect(0, 0))])
    const c = diapo([boite('B:note', rect(0, 0))], { type: 'liste', gabarit: 'puces' })
    const p = planifier(effet('morphing', 1000, false), s, c)
    expect(de(p, s.boites[0]!.ref)).toMatchObject([{ cote: 'source', debut: 0, duree: 500, a: { opacite: 0 } }])
    expect(de(p, c.boites[0]!.ref)).toMatchObject([{ cote: 'cible', debut: 500, duree: 500, de: { opacite: 0 } }])
  })

  it('une image glisse et garde son rapport ; deux sources différentes se croisent', () => {
    const img = (src: string, r: Rect) => boite('X:image', r, { genre: 'image', image: src })
    const s = diapo([img('a.png', rect(0, 0, 100, 100))])
    const c = diapo([img('a.png', rect(200, 100, 300, 200))])
    const p = planifier(effet('morphing', 1000, false), s, c)
    expect(de(p, c.boites[0]!.ref)[0]).toMatchObject({ de: { x: -200, y: -100, sx: 1 / 3, sy: 1 / 3 }, a: { x: 0, y: 0, sx: 1, sy: 1 } })
    const c2 = diapo([img('b.png', rect(200, 100, 300, 200))])
    const q = planifier(effet('morphing', 1000, false), s, c2)
    expect(de(q, s.boites[0]!.ref).map((x) => x.cote)).toEqual(['source', 'source'])
    expect(de(q, c2.boites[0]!.ref)).toHaveLength(2)
  })

  it('les formes communes se transforment, tracé par tracé', () => {
    const trace = (y: number) => ({ points: [[0, y] as const, [100, y] as const], ferme: false, trait: 4, contour: 'rgb(255, 255, 255)', remplissage: 'none', opacite: 1 })
    const s = diapo([boite('X:filet', rect(0, 0), { genre: 'forme', traces: [trace(0)] })])
    const c = diapo([boite('X:filet', rect(0, 0), { genre: 'forme', traces: [trace(50), trace(60)] })])
    const p = planifier(effet('morphing', 1000, false), s, c)
    expect(p.copies.map((x) => x.genre)).toEqual(['trace', 'trace'])
    expect(de(p, p.copies[0]!.id)).toMatchObject([{ de: { morph: 0 }, a: { morph: 1 }, duree: 1000 }])
    expect(de(p, p.copies[1]!.id)).toMatchObject([{ debut: 500, duree: 500 }])
  })
})

describe('les entrées des gabarits', () => {
  it('le central : chaque bloc monte d’un cinquième de sa hauteur, 1 050 / 1 500 ms, 450 ms après le précédent', () => {
    const c = diapo([boite('X:titre', rect(0, 400, 100, 100)), boite('X:note', rect(0, 600, 100, 50))], { niveau: 'central' })
    const p = planifier(effet('fondu', 600), null, c)
    const titre = de(p, c.boites[0]!.ref)
    expect(titre.map((x) => [x.debut, x.duree])).toEqual([
      [0, 1050],
      [0, 1500],
    ])
    expect(titre[0]!.de).toEqual({ y: 20 })
    expect(de(p, c.boites[1]!.ref).map((x) => x.debut)).toEqual([450, 450])
    expect(p.minutage.total).toBe(450 + 1500)
  })

  it('un autre sujet : tout sauf le titre paraît après l’effet, 300 ms puis 400 ms easeOutQuad', () => {
    const s = diapo([boite('X:titre', rect(0, 0))], { type: 'liste', gabarit: 'puces' })
    const c = diapo([boite('X:titre', rect(0, 0)), boite('X:etiquettes', rect(0, 100))])
    const p = planifier(MORPHING, s, c)
    expect(de(p, c.boites[1]!.ref)).toMatchObject([{ debut: 1000 + 300, duree: 400, courbe: 'easeOutQuad' }])
    expect(p.minutage).toEqual({ avant: 0, pendant: 1000, apres: 700, total: 1700 })
  })

  it('en remontant au parent : l’effet sans les entrées', () => {
    const c = diapo([boite('X:titre', rect(0, 0)), boite('X:etiquettes', rect(0, 100))])
    const p = planifier(effet('morphing', 1000, false), diapo([boite('X:titre', rect(0, 0))]), c)
    expect(de(p, c.boites[1]!.ref)).toMatchObject([{ debut: 500, duree: 500 }])
  })

  it('la première étape d’une liste : les enfants paraissent après l’effet, l’accolade se dessine', () => {
    const s = diapo([boite('X:titre', rect(0, 0))])
    const c = diapo([boite('X:titre', rect(0, 0)), boite('X:accolade', rect(200, 0), { genre: 'forme' }), boite('A:titre', rect(400, 0), { etat: 'courant' }), boite('B:titre', rect(400, 100), { etat: 'cache', opacite: 0 })], { type: 'liste', gabarit: 'accolade', premiere: true })
    const p = planifier(MORPHING, s, c)
    expect(de(p, c.boites[2]!.ref)).toMatchObject([{ debut: 1300, duree: 400, courbe: 'easeOutQuad' }])
    expect(de(p, `trace:${c.boites[1]!.ref}`)).toMatchObject([{ de: { dessin: 0 }, a: { dessin: 1 }, debut: 1000 + 500 }])
    expect(de(p, c.boites[3]!.ref)).toEqual([])
  })

  it('une étape d’arête : l’arête se dessine en 600 ms, puis l’étiquette paraît', () => {
    const s = diapo([boite('A:titre', rect(0, 0), { etat: 'courant' }), boite('B:arete', rect(0, 0), { genre: 'forme', etat: 'cache', opacite: 0 }), boite('B:titre', rect(0, 0), { etat: 'cache', opacite: 0 })], { type: 'liste', gabarit: 'arete' })
    const c = diapo([boite('A:titre', rect(0, 0), { etat: 'passe' }), boite('B:arete', rect(0, 0), { genre: 'forme', etat: 'courant' }), boite('B:titre', rect(0, 0), { etat: 'courant' })], { type: 'liste', gabarit: 'arete' })
    const p = planifier(DANS, s, c)
    expect(de(p, `trace:${c.boites[1]!.ref}`)).toMatchObject([{ debut: 0, duree: 600 }])
    expect(de(p, c.boites[2]!.ref)).toMatchObject([{ debut: 600, duree: 400 }])
  })
})

describe('les décors', () => {
  it('une forme arrive du coin le plus proche ; le ressort impose sa durée', () => {
    const p = pisteDeDecor({ theme: 'hubble-bubble', quand: 'entree', cible: '[data-decor][data-rang]', propriete: 'translate', de: 'hors-champ', a: 'place', duree: { fois: 1 }, delai: { fois: 1 }, courbe: 'spring(0.3, 20, 3, 0)' }, { ref: 'g', rect: rect(100, 100), t: { cx: 150, cy: 125, rotation: 0, sx: 1, sy: 1 } }, 600, { l: 1600, h: 900 })
    expect(p).toMatchObject({ de: { cx: 150 - 200, cy: 125 - 150 }, a: { cx: 150, cy: 125 }, debut: 600 })
    expect(p!.duree).toBeCloseTo(1667, -1)
  })

  it('Midnight Rose : le contenu se fond sur 1,67 × d après 0,33 × d', () => {
    const p = planifier(effet('fondu', 600), diapo([]), diapo([], { theme: 'midnight-rose', niveau: 'central' }))
    const contenu = de(p, 'contenu').find((x) => x.cote === 'cible')!
    expect(contenu.debut).toBeCloseTo(198)
    expect(contenu.duree).toBeCloseTo(1002)
  })

  it('au morphing, les décors communs glissent ; les bandes de Hubble Bubble suivent après 300 ms, élastiques', () => {
    const t = (cx: number) => ({ cx, cy: 0, rotation: 0, sx: 1, sy: 1 })
    const decor = (ref: string, cx: number) => ({ ref, interne: `${ref}i`, nom: 'bulle', rang: 0, t: t(cx), rect: rect(cx, 0), opacite: 1 })
    const s = diapo([], { theme: 'hubble-bubble', decors: [decor('d0', 0)], bandes: [{ ref: 'bande0', rect: rect(0, 0, 1600, 100) }] })
    const c = diapo([], { theme: 'hubble-bubble', decors: [decor('d0', 300)], bandes: [{ ref: 'bande0', rect: rect(0, 0, 1600, 200) }] })
    const p = planifier(effet('morphing', 1000, false), s, c)
    expect(de(p, 'd0').find((x) => x.cote === 'cible')).toMatchObject({ de: { cx: 0 }, a: { cx: 300 }, duree: 1500 })
    expect(de(p, 'bande0').find((x) => x.cote === 'cible')).toMatchObject({ debut: 300, duree: 500, courbe: 'easeOutElastic(1, 1.5)', a: { bh: 200 } })
  })

  it('l’affichage de Hubble Bubble : chaque bulle gonfle de 25 px en 2 s et revient', () => {
    const c = diapo([], { theme: 'hubble-bubble', correspondances: { '[data-decor*="Bulle"]:not([data-hors-champ]) > g': [{ ref: 's0', rect: rect(0, 0, 250, 250), t: { cx: 0, cy: 0, rotation: 0, sx: 1, sy: 1 } }] } })
    const p = planAffichage(c)
    expect(p.map((x) => [x.debut, x.duree, x.courbe])).toEqual([
      [0, 2000, 'easeInQuart'],
      [2000, 2000, 'easeOutQuart'],
    ])
    expect(p[0]!.a.sx).toBeCloseTo(1.1)
  })
})

describe('l’exécution', () => {
  it('les valeurs d’une piste à son avancée : les nombres et les couleurs s’interpolent', () => {
    expect(valeursA({ de: { x: 0, opacite: 1, couleur: 'rgb(0, 0, 0)' }, a: { x: 100, opacite: 0, couleur: 'rgb(200, 100, 0)' } }, 0.5)).toEqual({ x: 50, opacite: 0.5, couleur: 'rgba(100, 50, 0, 1)' })
  })

  it('avant la première image, chaque élément prend le départ de sa première piste ; les éléments masqués, 0', () => {
    const etats = etatsInitiaux({
      pistes: [
        { cote: 'cible', ref: 'a', de: { opacite: 0.2 }, a: { opacite: 1 }, debut: 500, duree: 100, courbe: 'linear' },
        { cote: 'cible', ref: 'a', de: { opacite: 0, y: 10 }, a: { opacite: 0.2, y: 0 }, debut: 0, duree: 100, courbe: 'linear' },
      ],
      caches: [{ cote: 'source', ref: 'b' }],
    })
    expect(etats.get('cible|a')!.valeurs).toEqual({ opacite: 0, y: 10 })
    expect(etats.get('source|b')!.valeurs).toEqual({ opacite: 0 })
  })
})

describe('la file des demandes', () => {
  it('rien ne joue : la demande part ; une transition joue : une seule attend, les autres sont ignorées', () => {
    let f = fileVide<string>()
    let r = demander(f, 'avancer')
    expect(r.jouer).toBe('avancer')
    f = r.file
    r = demander(f, 'reculer')
    expect(r.jouer).toBeNull()
    f = r.file
    r = demander(f, 'passer')
    expect(r.file.attente).toBe('reculer')
    f = r.file
    const l = liberer(f)
    expect(l.jouer).toBe('reculer')
    expect(l.file.occupee).toBe(true)
    expect(liberer(l.file)).toEqual({ file: { occupee: false, attente: null }, jouer: null })
  })
})
