import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import { basculerMarqueur, porter } from './elements'
import {
  MARGE_ZONE,
  TITRE_ZONE,
  aligner,
  ajouterMarqueurPerso,
  ajouterZone,
  basculerLegende,
  choisirParGenre,
  coller,
  contenuZone,
  creerGroupe,
  deplacerMarqueursPerso,
  deplacerZone,
  direMarqueur,
  effacerContenuZone,
  etiqueter,
  extraire,
  groupesDe,
  marqueurPerso,
  marqueursUtilises,
  normaliserPlanning,
  rectAutour,
  replierSousBranches,
  resumePlanning,
  supprimerGroupe,
  supprimerMarqueursPerso,
  zonesValides,
} from './insertions'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './sujets'

/** Une carte : Central → A (→ A1, A2), B ; deux flottants. */
function carte() {
  let a: Arbre = nouvelArbre('Central')
  const c = lire(a).central
  let x: Id, a1: Id, a2: Id, b: Id, f1: Id, f2: Id
  ;[a, x] = ajouterEnfant(a, c, 'A')
  ;[a, a1] = ajouterEnfant(a, x, 'A1')
  ;[a, a2] = ajouterEnfant(a, x, 'A2')
  ;[a, b] = ajouterEnfant(a, c, 'B')
  ;[a, f1] = ajouterFlottant(a, { x: 300, y: 100 }, 'Libre 1')
  ;[a, f2] = ajouterFlottant(a, { x: 420, y: 160 }, 'Libre 2')
  return { a, c, x, a1, a2, b, f1, f2 }
}

describe('les zones', () => {
  it('une zone entoure des boîtes avec une marge et la place de son titre', () => {
    const r = rectAutour([{ x: 100, y: 50, l: 40, h: 20 }, { x: 200, y: 90, l: 40, h: 20 }])
    expect(r).toEqual({ x: 100 - MARGE_ZONE, y: 50 - MARGE_ZONE - TITRE_ZONE, l: 140 + 2 * MARGE_ZONE, h: 60 + 2 * MARGE_ZONE + TITRE_ZONE })
  })

  it('elle contient les flottants dont le centre est dedans, et se déplace avec eux', () => {
    const { a, f1, f2 } = carte()
    const boites = new Map([[f1, { x: 280, y: 90, l: 40, h: 20 }], [f2, { x: 400, y: 150, l: 40, h: 20 }]])
    const l = lire(a)
    const [a2, id] = ajouterZone(a, { x: 250, y: 60, l: 100, h: 100 }, 'Zone')
    expect(contenuZone(l, boites, a2.zones![id]!)).toEqual([f1])
    const deplacee = deplacerZone(a2, id, { x: 10, y: -20 }, [f1])
    expect(deplacee.zones![id]).toMatchObject({ x: 260, y: 40 })
    expect(deplacee.sujets[f1]!.position).toEqual({ x: 310, y: 80 })
    expect(deplacee.sujets[f2]!.position).toEqual({ x: 420, y: 160 })
  })

  it('effacer le contenu retire les flottants et leurs branches, pas la zone', () => {
    const { a, f1, f2 } = carte()
    const [a2, id] = ajouterZone(a, { x: 0, y: 0, l: 500, h: 500 })
    const vide = effacerContenuZone(a2, [f1])
    expect(vide.sujets[f1]).toBeUndefined()
    expect(vide.sujets[f2]).toBeDefined()
    expect(vide.zones![id]).toBeDefined()
  })

  it('une zone mal formée ne se dessine pas', () => {
    const a: Arbre = { ...nouvelArbre('x'), zones: { bonne: { x: 0, y: 0, l: 80, h: 80 }, nan: { x: Number.NaN, y: 0, l: 80, h: 80 }, plate: { x: 0, y: 0, l: 0, h: 10 } } }
    expect(zonesValides(a).map(([id]) => id)).toEqual(['bonne'])
  })
})

describe('la tâche planifiée', () => {
  it('le début et la durée donnent la fin, la fin et le début donnent la durée', () => {
    expect(normaliserPlanning({ debut: '2026-03-02', duree: 5 }, 'duree')).toEqual({ debut: '2026-03-02', duree: 5, fin: '2026-03-06' })
    expect(normaliserPlanning({ debut: '2026-03-02', fin: '2026-03-10' }, 'fin')).toEqual({ debut: '2026-03-02', fin: '2026-03-10', duree: 9 })
    // Changer le début déplace la fin, la durée restant.
    expect(normaliserPlanning({ debut: '2026-03-09', fin: '2026-03-10', duree: 9 }, 'debut')).toEqual({ debut: '2026-03-09', duree: 9, fin: '2026-03-17' })
  })

  it('une fin avant le début ramène la fin au début ; l’avancement reste entre 0 et 100 ; rien : rien', () => {
    expect(normaliserPlanning({ debut: '2026-03-09', fin: '2026-03-01' }, 'fin')).toMatchObject({ fin: '2026-03-09', duree: 1 })
    expect(normaliserPlanning({ progression: 140 })!.progression).toBe(100)
    expect(normaliserPlanning({ progression: -5 })!.progression).toBe(0)
    expect(normaliserPlanning({})).toBeUndefined()
    expect(normaliserPlanning({ debut: 'pas une date', duree: 0 })).toBeUndefined()
  })

  it('se résume en une ligne', () => {
    expect(resumePlanning({ duree: 7, progression: 40 })).toBe('7 j · 40 %')
    expect(resumePlanning({ debut: '2026-03-02', fin: '2026-03-08' })).toContain('→')
  })
})

describe('les étiquettes', () => {
  it('s’ajoutent sans doublon, se retirent, se remplacent', () => {
    const { a, x, b } = carte()
    let r = etiqueter(a, [x, b], { ajouter: ['urgent', ' urgent ', ''] })
    expect(r.sujets[x]!.etiquettes).toEqual(['urgent'])
    expect(r.sujets[b]!.etiquettes).toEqual(['urgent'])
    r = etiqueter(r, [x], { ajouter: ['idée'] })
    r = etiqueter(r, [x], { retirer: ['urgent'] })
    expect(r.sujets[x]!.etiquettes).toEqual(['idée'])
    expect(etiqueter(r, [x], { tout: ['a', 'b'] }).sujets[x]!.etiquettes).toEqual(['a', 'b'])
    expect(etiqueter(r, [x], { retirer: ['idée'] }).sujets[x]!.etiquettes).toBeUndefined()
  })
})

describe('les marqueurs', () => {
  it('un par groupe : un marqueur en remplace un autre du même groupe, pas d’un autre groupe', () => {
    const { a, x } = carte()
    let r = basculerMarqueur(a, [x], 'priority-1')
    r = basculerMarqueur(r, [x], 'tag-red')
    r = basculerMarqueur(r, [x], 'priority-3')
    expect(r.sujets[x]!.marqueurs).toEqual(['tag-red', 'priority-3'])
    r = basculerMarqueur(r, [x], 'task-half')
    r = basculerMarqueur(r, [x], 'task-7oct')
    expect(r.sujets[x]!.marqueurs).toEqual(['tag-red', 'priority-3', 'task-7oct'])
    // La même touche l'ôte.
    expect(basculerMarqueur(r, [x], 'tag-red').sujets[x]!.marqueurs).toEqual(['priority-3', 'task-7oct'])
  })

  it('les marqueurs d’un groupe à soi se cumulent, et partent avec leur groupe ou leur image', () => {
    const { a, x, b } = carte()
    let r: Arbre
    let g: Id
    ;[r, g] = creerGroupe(a, 'Mes marqueurs')
    let m1: string | null, m2: string | null
    ;[r, m1] = ajouterMarqueurPerso(r, g, { nom: 'un', fichier: 'f1' })
    ;[r, m2] = ajouterMarqueurPerso(r, g, { nom: 'deux', fichier: 'f2' })
    expect(m1).toMatch(/^perso-/)
    r = basculerMarqueur(r, [x], m1!)
    r = basculerMarqueur(r, [x], m2!)
    r = basculerMarqueur(r, [b], m2!)
    expect(r.sujets[x]!.marqueurs).toEqual([m1, m2])
    expect(marqueurPerso(r, m1!)).toEqual({ nom: 'un', fichier: 'f1', groupe: g })

    const sans1 = supprimerMarqueursPerso(r, [m1!])
    expect(sans1.sujets[x]!.marqueurs).toEqual([m2])
    expect(groupesDe(sans1)[0]![1].marqueurs.map((m) => m.nom)).toEqual(['deux'])

    const sansGroupe = supprimerGroupe(r, g)
    expect(sansGroupe.groupes).toBeUndefined()
    expect(sansGroupe.sujets[x]!.marqueurs).toBeUndefined()
    expect(sansGroupe.sujets[b]!.marqueurs).toBeUndefined()
  })

  it('déplacer un marqueur à soi vers un autre groupe ; les groupes gardent leur ordre de création', () => {
    const { a } = carte()
    let r: Arbre
    let g1: Id, g2: Id
    ;[r, g1] = creerGroupe(a, 'Premier')
    ;[r, g2] = creerGroupe(r, 'Second')
    let m: string | null
    ;[r, m] = ajouterMarqueurPerso(r, g1, { nom: 'x', fichier: 'f' })
    r = deplacerMarqueursPerso(r, [m!], g2)
    expect(r.groupes![g1]!.marqueurs).toHaveLength(0)
    expect(r.groupes![g2]!.marqueurs.map((x) => x.nom)).toEqual(['x'])
    expect(groupesDe(r).map(([, g]) => g.nom)).toEqual(['Premier', 'Second'])
  })

  it('la légende : se montre, dit ce que chaque marqueur veut dire, liste ceux que la carte porte dans l’ordre du panneau', () => {
    const { a, x, b } = carte()
    let r = basculerMarqueur(a, [x], 'priority-2')
    r = basculerMarqueur(r, [b], 'tag-blue')
    r = basculerMarqueur(r, [b], 'symbol-heart')
    expect(marqueursUtilises(r)).toEqual(['tag-blue', 'priority-2', 'symbol-heart'])
    expect(r.legende).toBeUndefined()
    r = basculerLegende(r)
    expect(r.legende).toEqual({ visible: true })
    r = direMarqueur(r, 'priority-2', ' À faire vite ')
    expect(r.legende).toEqual({ visible: true, textes: { 'priority-2': 'À faire vite' } })
    r = direMarqueur(r, 'priority-2', '')
    expect(r.legende).toEqual({ visible: true })
    expect(basculerLegende(r).legende).toBeUndefined()
  })
})

describe('porter : l’image et la vignette se disputent la place', () => {
  it('poser un autocollant retire l’image, et l’inverse ; l’équation, la pièce et la tâche planifiée vivent avec', () => {
    const { a, x } = carte()
    let r = porter(a, [x], 'image', { fichier: 'f', l: 100, h: 80 })
    r = porter(r, [x], 'equation', 'x^2')
    r = porter(r, [x], 'vignette', { genre: 'autocollant', id: '😀', l: 64, h: 64 })
    expect(r.sujets[x]!.image).toBeUndefined()
    expect(r.sujets[x]!.vignette).toMatchObject({ id: '😀' })
    expect(r.sujets[x]!.equation).toBe('x^2')
    r = porter(r, [x], 'image', { fichier: 'g', l: 10, h: 10 })
    expect(r.sujets[x]!.vignette).toBeUndefined()
    r = porter(r, [x], 'image', undefined)
    expect(r.sujets[x]!.image).toBeUndefined()
  })
})

describe('copier, couper, coller', () => {
  it('extrait les branches, une seule fois si un ancêtre est aussi choisi, jamais le central ni un résumé', () => {
    const { a, c, x, a1, b } = carte()
    expect(extraire(a, [c])).toBeNull()
    const f = extraire(a, [x, a1, b])!
    expect(f.racines.sort()).toEqual([x, b].sort())
    expect(Object.keys(f.sujets)).toHaveLength(4)
  })

  it('colle sous un sujet avec des identifiants neufs, à la suite de ses enfants', () => {
    const { a, b, x } = carte()
    const f = extraire(a, [x])!
    const [r, collees] = coller(a, f, { parent: b })
    expect(collees).toHaveLength(1)
    const l = lire(r)
    const copie = collees[0]!
    expect(copie).not.toBe(x)
    expect(l.sujets.get(copie)!.titre).toBe('A')
    expect(l.sujets.get(copie)!.parent).toBe(b)
    // Ses deux enfants ont suivi, sous la copie.
    expect(l.enfants.get(copie)!.map((e) => l.sujets.get(e)!.titre)).toEqual(['A1', 'A2'])
    // L'original reste.
    expect(l.sujets.get(x)!.titre).toBe('A')
  })

  it('colle en flottants à un point, un peu décalés l’un de l’autre', () => {
    const { a, x, b } = carte()
    const f = extraire(a, [x, b])!
    const [r, collees] = coller(a, f, { position: { x: 50, y: 60 } })
    const l = lire(r)
    expect(collees).toHaveLength(2)
    expect(collees.every((x) => l.sujets.get(x)!.genre === 'detache')).toBe(true)
    expect(l.sujets.get(collees[0]!)!.position).toEqual({ x: 50, y: 60 })
    expect(l.sujets.get(collees[1]!)!.position).toEqual({ x: 74, y: 84 })
  })

  it('un flottant collé sous un sujet s’y rattache', () => {
    const { a, f1, b } = carte()
    const f = extraire(a, [f1])!
    const [r, collees] = coller(a, f, { parent: b })
    expect(lire(r).sujets.get(collees[0]!)).toMatchObject({ parent: b })
    expect(lire(r).sujets.get(collees[0]!)!.genre).toBeUndefined()
  })
})

describe('aligner des flottants', () => {
  const tailles = (ids: Id[]) => new Map(ids.map((id, i) => [id, { l: 40 + 20 * i, h: 20 }]))

  it('à gauche, au centre, en haut, en bas', () => {
    const { a, f1, f2 } = carte()
    const t = tailles([f1, f2])
    // f1 : centre 300, largeur 40, bord gauche 280 ; f2 : centre 420, largeur 60, bord gauche 390.
    expect(aligner(a, [f1, f2], 'gauche', t).sujets[f2]!.position).toEqual({ x: 310, y: 160 })
    expect(aligner(a, [f1, f2], 'droite', t).sujets[f1]!.position).toEqual({ x: 430, y: 100 })
    expect(aligner(a, [f1, f2], 'centre', t).sujets[f1]!.position!.x).toBe(360)
    expect(aligner(a, [f1, f2], 'haut', t).sujets[f2]!.position!.y).toBe(100)
    expect(aligner(a, [f1, f2], 'bas', t).sujets[f1]!.position!.y).toBe(160)
    expect(aligner(a, [f1, f2], 'milieu', t).sujets[f1]!.position!.y).toBe(130)
  })

  it('répartit à égalité, et n’agit que sur des flottants (au moins deux)', () => {
    let { a, f1, f2 } = carte()
    let f3: Id
    ;[a, f3] = ajouterFlottant(a, { x: 900, y: 0 }, 'Libre 3')
    const t = new Map([[f1, { l: 40, h: 20 }], [f2, { l: 40, h: 20 }], [f3, { l: 40, h: 20 }]])
    const r = aligner(a, [f1, f2, f3], 'distribuerH', t)
    const xs = [f1, f2, f3].map((id) => r.sujets[id]!.position!.x)
    expect(xs[1]! - xs[0]!).toBe(xs[2]! - xs[1]!)
    expect(aligner(a, [f1], 'gauche', t)).toBe(a)
    expect(aligner(a, [lire(a).central, f1], 'gauche', t)).toBe(a)
  })
})

describe('sélectionner', () => {
  it('les sous-sujets, les frères, les sujets du même niveau, tout', () => {
    const { a, c, x, a1, a2, b, f1 } = carte()
    const l = lire(a)
    expect(choisirParGenre(a, l, x, 'sousSujets').sort()).toEqual([a1, a2].sort())
    expect(choisirParGenre(a, l, a1, 'freres')).toEqual([a2])
    expect(choisirParGenre(a, l, x, 'freres')).toEqual([b])
    expect(choisirParGenre(a, l, a1, 'memeNiveau')).toEqual([a2])
    expect(choisirParGenre(a, l, x, 'memeNiveau')).toEqual([b])
    expect(choisirParGenre(a, l, null, 'tout')).toHaveLength(l.sujets.size)
    expect(choisirParGenre(a, l, null, 'flottants')).toHaveLength(2)
    expect(choisirParGenre(a, l, c, 'freres')).toEqual([])
    expect(f1).toBeTruthy()
  })

  it('les objets de la carte : relations, limites, images, équations, zones', () => {
    let { a, x, b } = carte()
    a = { ...a, relations: { r: { de: x, vers: b } }, limites: { m: { de: x } } }
    a = porter(a, [x], 'equation', 'e=mc^2')
    a = porter(a, [b], 'vignette', { genre: 'autocollant', id: '🎉', l: 64, h: 64 })
    const [a2, z] = ajouterZone(a, { x: 0, y: 0, l: 100, h: 100 })
    const l = lire(a2)
    expect(choisirParGenre(a2, l, null, 'relations')).toEqual(['r'])
    expect(choisirParGenre(a2, l, null, 'limites')).toEqual(['m'])
    expect(choisirParGenre(a2, l, null, 'equations')).toEqual([x])
    expect(choisirParGenre(a2, l, null, 'images')).toEqual([b])
    expect(choisirParGenre(a2, l, null, 'zones')).toEqual([z])
  })
})

describe('replier', () => {
  it('replie toutes les sous-branches d’un sujet, pas lui', () => {
    const { a, c, x, a1 } = carte()
    let r = ajouterEnfant(a, a1, 'A11')[0]
    r = replierSousBranches(r, c, true)
    expect(r.sujets[x]!.replie).toBe(true)
    expect(r.sujets[a1]!.replie).toBe(true)
    expect(r.sujets[c]!.replie).toBeUndefined()
    r = replierSousBranches(r, c, false)
    expect(r.sujets[x]!.replie).toBeUndefined()
  })
})
