import { describe, expect, it } from 'vitest'
import type { Arbre, Id, StructureArbre } from '../../../coeur/tableau'
import { disposer } from '../disposition'
import { REPERE, repereDeDepot } from './depot'
import { copierSujets, deplacerSujets, ouLacher } from './lacher'
import { ajouterEnfant, changerSujet, enfantsDe, lire, nouvelArbre } from './sujets'

// Glisser un principal d'un côté du central à l'autre : tout se raisonne à l'écran (côté, rang de haut en bas), puis
// l'ordre du modèle s'en déduit selon la structure. On relit toujours le résultat par `disposer`.

const taille = () => ({ l: 80, h: 24 })
type Structure = Extract<StructureArbre, 'carte' | 'carte-horaire' | 'carte-antihoraire' | 'carte-libre'>
const STRUCTURES: Structure[] = ['carte', 'carte-horaire', 'carte-antihoraire', 'carte-libre']

interface Carte {
  a: Arbre
  c: Id
  /** Les principaux, dans l'ordre du modèle (P0, P1…). */
  p: Id[]
}

/** Une carte de `n` principaux P0…Pn-1 (dans cet ordre dans le modèle) ; en carte libre, `aDroite` à droite. */
function carte(structure: Structure, n: number, aDroite?: number): Carte {
  let a = nouvelArbre('C')
  const c = lire(a).central
  const p: Id[] = []
  for (let i = 0; i < n; i++) {
    const [b, id] = ajouterEnfant(a, c, `P${i}`)
    a = b
    p.push(id)
  }
  a = changerSujet(a, c, (s) => ({ ...s, structure, ...(structure === 'carte-libre' ? { aDroite: aDroite ?? Math.ceil(n / 2) } : {}) }))
  return { a, c, p }
}

/** Ce qu'on voit : les titres de chaque côté du central, de haut en bas. */
function vue(a: Arbre) {
  const l = lire(a)
  const d = disposer(l, taille)
  const colonne = (cote: 'droite' | 'gauche') =>
    d.liens
      .filter((x) => x.de === l.central && x.cote === cote)
      .sort((x, y) => d.boites.get(x.vers)!.y - d.boites.get(y.vers)!.y)
      .map((x) => a.sujets[x.vers]!.titre)
  return { droite: colonne('droite'), gauche: colonne('gauche'), l, d }
}

/**
 * Le sujet `nom` s'est-il posé à la place visée dans `colonne` (avant : la colonne sans lui) ? Les sujets qui ont changé
 * de côté pour tenir l'équilibre (partis de la colonne, ou arrivés dedans) ne comptent pas : les autres gardent leur
 * ordre, et `nom` s'intercale entre les mêmes voisins.
 */
function bienPlace(avant: string[], apres: string[], nom: string, rang: number): boolean {
  const sans = avant.filter((x) => x !== nom)
  const departs = sans.filter((x) => !apres.includes(x))
  const attendu = [...sans.slice(0, rang), nom, ...sans.slice(rang)].filter((x) => !departs.includes(x))
  return JSON.stringify(apres.filter((x) => x === nom || sans.includes(x))) === JSON.stringify(attendu)
}

describe('glisser un principal d’un côté du central à l’autre', () => {
  for (const structure of STRUCTURES) {
    for (const n of [2, 3, 4, 5]) {
      it(`${structure}, ${n} principaux : il tombe du côté et au rang visés, les autres gardent côté et ordre (un seul peut basculer)`, () => {
        const k = carte(structure, n, 1)
        const avant = vue(k.a)
        for (const g of k.p) {
          const nom = k.a.sujets[g]!.titre
          for (const cote of ['droite', 'gauche'] as const) {
            const sans = avant[cote].filter((x) => x !== nom)
            for (let rang = 0; rang <= sans.length; rang++) {
              const apres = deplacerSujets(k.a, [g], { type: 'carte', parent: k.c, cote, rang })
              const v = vue(apres)
              const lieu = `${structure} n=${n} ${nom} → ${cote} rang ${rang}`
              // Le sujet glissé est du côté où on l'a lâché, entre les mêmes voisins (le rang bouge si l'un d'eux a basculé).
              expect(v[cote], lieu).toContain(nom)
              expect(bienPlace(avant[cote], v[cote], nom, rang), `${lieu} : ${v[cote].join(' ')}`).toBe(true)
              expect(v.droite.length + v.gauche.length, lieu).toBe(n)
              // Les autres : au plus un change de côté (pour tenir l'équilibre), les autres gardent côté et ordre.
              const bascules = [...v.droite.filter((x) => x !== nom && avant.gauche.includes(x)), ...v.gauche.filter((x) => x !== nom && avant.droite.includes(x))]
              expect(bascules.length, lieu).toBeLessThanOrEqual(structure === 'carte-libre' ? 0 : 1)
              for (const c of ['droite', 'gauche'] as const) {
                const fixes = (xs: string[]) => xs.filter((x) => x !== nom && !bascules.includes(x))
                expect(fixes(v[c]), lieu).toEqual(fixes(avant[c]))
              }
              // L'équilibre : ⌈n/2⌉ du côté qui se lit en premier (la gauche en antihoraire) ; en libre, `aDroite` suit.
              if (structure === 'carte-libre') expect(lire(apres).sujets.get(k.c)?.aDroite, lieu).toBe(v.droite.length)
              else expect(structure === 'carte-antihoraire' ? v.gauche.length : v.droite.length, lieu).toBe(Math.ceil(n / 2))
              // Le modèle reste complet.
              expect(enfantsDe(lire(apres), k.c).length, lieu).toBe(n)
            }
          }
        }
      })
    }
  }

  it('le voisin de bord de l’autre colonne bascule, pas le sujet glissé (équilibrée, 4 principaux)', () => {
    // Droite P0 P1, gauche P2 P3. P3 sous P1 à droite : la droite compterait 3, P1 passe à gauche (en tête).
    const k = carte('carte', 4)
    expect(vue(k.a)).toMatchObject({ droite: ['P0', 'P1'], gauche: ['P2', 'P3'] })
    const v = vue(deplacerSujets(k.a, [k.p[3]!], { type: 'carte', parent: k.c, cote: 'droite', rang: 2 }))
    expect(v.droite).toEqual(['P0', 'P3'])
    expect(v.gauche).toEqual(['P1', 'P2'])
  })

  it('seuls le sujet glissé et celui qui bascule changent de rang dans le modèle', () => {
    const k = carte('carte', 5)
    const avant = k.a.sujets
    const apres = deplacerSujets(k.a, [k.p[4]!], { type: 'carte', parent: k.c, cote: 'droite', rang: 3 }).sujets
    const changes = k.p.filter((id) => apres[id]!.ordre !== avant[id]!.ordre)
    expect(changes.length).toBeLessThanOrEqual(2)
    expect(changes).toContain(k.p[4])
  })

  it('en carte libre, aDroite suit : le sujet glissé reste du côté voulu, personne ne bascule', () => {
    const k = carte('carte-libre', 4, 1) // droite P0 ; gauche P1 P2 P3
    const apres = deplacerSujets(k.a, [k.p[2]!], { type: 'carte', parent: k.c, cote: 'droite', rang: 1 })
    expect(lire(apres).sujets.get(k.c)?.aDroite).toBe(2)
    expect(vue(apres)).toMatchObject({ droite: ['P0', 'P2'], gauche: ['P1', 'P3'] })
  })

  it('deux principaux glissés ensemble gardent leur ordre, au même endroit', () => {
    const k = carte('carte', 5) // droite P0 P1 P2 ; gauche P3 P4
    const apres = deplacerSujets(k.a, [k.p[3]!, k.p[4]!], { type: 'carte', parent: k.c, cote: 'droite', rang: 1 })
    const v = vue(apres)
    expect(v.droite.slice(1, 3)).toEqual(['P3', 'P4'])
    expect(v.droite[0]).toBe('P0')
    expect(v.droite.length).toBe(3)
  })

  it('⌥ copie : le même lieu, les originaux restent', () => {
    for (const structure of STRUCTURES) {
      const k = carte(structure, 4, 2)
      const avant = vue(k.a)
      const g = k.p[3]!
      const [apres, copies] = copierSujets(k.a, [g], { type: 'carte', parent: k.c, cote: 'droite', rang: 1 })
      const v = vue(apres)
      const copie = apres.sujets[copies[0]!]!.titre
      expect(v.droite[1], structure).toBe(copie)
      expect(v.droite.length + v.gauche.length, structure).toBe(5)
      expect([...v.droite, ...v.gauche].filter((x) => x === copie).length, structure).toBe(2) // l'original et sa copie
      for (const x of [...avant.droite, ...avant.gauche]) expect([...v.droite, ...v.gauche], structure).toContain(x)
    }
  })
})

describe('où lâcher, au pointeur (carte)', () => {
  const sous = (b: { x: number; y: number; l: number; h: number }) => ({ x: b.x + 10, y: b.y + b.h + 3 })
  const dessus = (b: { x: number; y: number; l: number; h: number }) => ({ x: b.x + 10, y: b.y - 3 })

  for (const structure of STRUCTURES) {
    for (const n of [2, 3, 4, 5]) {
      it(`${structure}, ${n} : de gauche à droite, sous le dernier de droite`, () => {
        const k = carte(structure, n, Math.ceil(n / 2))
        const v = vue(k.a)
        if (v.gauche.length === 0 || v.droite.length === 0) return
        const nom = v.gauche[0]!
        const g = k.p.find((x) => k.a.sujets[x]!.titre === nom)!
        const dernier = k.p.find((x) => k.a.sujets[x]!.titre === v.droite.at(-1))!
        const cible = ouLacher(v.l, v.d, g, sous(v.d.boites.get(dernier)!))
        expect(cible).toEqual({ type: 'carte', parent: k.c, cote: 'droite', rang: v.droite.length })
        const apres = vue(deplacerSujets(k.a, [g], cible))
        expect(bienPlace(v.droite, apres.droite, nom, v.droite.length)).toBe(true)
      })

      it(`${structure}, ${n} : de droite à gauche, sous le dernier de gauche`, () => {
        const k = carte(structure, n, Math.ceil(n / 2))
        const v = vue(k.a)
        if (v.gauche.length === 0 || v.droite.length === 0) return
        const nom = v.droite[0]!
        const g = k.p.find((x) => k.a.sujets[x]!.titre === nom)!
        const dernier = k.p.find((x) => k.a.sujets[x]!.titre === v.gauche.at(-1))!
        const cible = ouLacher(v.l, v.d, g, sous(v.d.boites.get(dernier)!))
        expect(cible).toEqual({ type: 'carte', parent: k.c, cote: 'gauche', rang: v.gauche.length })
        expect(bienPlace(v.gauche, vue(deplacerSujets(k.a, [g], cible)).gauche, nom, v.gauche.length)).toBe(true)
      })

      it(`${structure}, ${n} : de gauche à droite, entre deux de droite`, () => {
        const k = carte(structure, n, Math.ceil(n / 2))
        const v = vue(k.a)
        if (v.gauche.length === 0 || v.droite.length < 2) return
        const nom = v.gauche.at(-1)!
        const g = k.p.find((x) => k.a.sujets[x]!.titre === nom)!
        const second = k.p.find((x) => k.a.sujets[x]!.titre === v.droite[1])!
        const cible = ouLacher(v.l, v.d, g, dessus(v.d.boites.get(second)!))
        expect(cible).toEqual({ type: 'carte', parent: k.c, cote: 'droite', rang: 1 })
        const apres = vue(deplacerSujets(k.a, [g], cible))
        expect(bienPlace(v.droite, apres.droite, nom, 1)).toBe(true)
      })

      it(`${structure}, ${n} : de droite à gauche, entre deux de gauche`, () => {
        const k = carte(structure, n, Math.ceil(n / 2))
        const v = vue(k.a)
        if (v.droite.length === 0 || v.gauche.length < 2) return
        const nom = v.droite.at(-1)!
        const g = k.p.find((x) => k.a.sujets[x]!.titre === nom)!
        const second = k.p.find((x) => k.a.sujets[x]!.titre === v.gauche[1])!
        const cible = ouLacher(v.l, v.d, g, dessus(v.d.boites.get(second)!))
        expect(cible).toEqual({ type: 'carte', parent: k.c, cote: 'gauche', rang: 1 })
        const apres = vue(deplacerSujets(k.a, [g], cible))
        expect(bienPlace(v.gauche, apres.gauche, nom, 1)).toBe(true)
      })
    }
  }

  it('près du central, le côté est celui du pointeur et le rang se compte à sa hauteur', () => {
    const k = carte('carte-horaire', 5) // droite P0 P1 P2 ; gauche (haut en bas) P4 P3
    const v = vue(k.a)
    const b = v.d.boites.get(k.c)!
    const g = k.p[0]!
    // À gauche du central, à hauteur du haut de l'écran : au rang 0 de la gauche.
    expect(ouLacher(v.l, v.d, g, { x: b.x - 10, y: -500 })).toEqual({ type: 'libre' })
    const hautGauche = v.d.boites.get(k.p.find((x) => k.a.sujets[x]!.titre === v.gauche[0])!)!
    expect(ouLacher(v.l, v.d, g, { x: b.x - 10, y: hautGauche.y - 1 })).toEqual({ type: 'carte', parent: k.c, cote: 'gauche', rang: 0 })
    expect(ouLacher(v.l, v.d, g, { x: b.x - 10, y: hautGauche.y + hautGauche.h + 2 })).toEqual({ type: 'carte', parent: k.c, cote: 'gauche', rang: 1 })
    // À droite du central, à sa hauteur : la colonne de droite (P0 est glissé, il ne compte pas) ; le rang se compte au-dessus du pointeur.
    const dessus = v.droite.filter((t) => t !== 'P0').filter((t) => { const bx = v.d.boites.get(k.p.find((x) => k.a.sujets[x]!.titre === t)!)!; return bx.y + bx.h / 2 < 0 }).length
    expect(ouLacher(v.l, v.d, g, { x: b.x + b.l + 10, y: 0 })).toEqual({ type: 'carte', parent: k.c, cote: 'droite', rang: dessus })
    // Sur le central lui-même : il en devient l'enfant, comme avant.
    expect(ouLacher(v.l, v.d, g, { x: 0, y: 0 })).toEqual({ type: 'enfant', parent: k.c })
  })
})

describe('le repère de dépôt montre la place que le sujet prendra', () => {
  for (const structure of STRUCTURES) {
    it(`${structure} : du bon côté, entre les voisins que le sujet aura à l’écran`, () => {
      const k = carte(structure, 5, 3)
      const v = vue(k.a)
      for (const g of k.p) {
        const nom = k.a.sujets[g]!.titre
        for (const cote of ['droite', 'gauche'] as const) {
          const sans = v[cote].filter((x) => x !== nom)
          for (let rang = 0; rang <= sans.length; rang++) {
            const cible = { type: 'carte', parent: k.c, cote, rang } as const
            const r = repereDeDepot(v.l, v.d, cible, new Set([g]))!
            expect(r.cote).toBe(cote)
            expect(r.boite.h).toBe(REPERE.h)
            const boite = (t: string) => v.d.boites.get(k.p.find((x) => k.a.sujets[x]!.titre === t)!)!
            const dessus = rang > 0 ? boite(sans[rang - 1]!) : undefined
            const dessous = rang < sans.length ? boite(sans[rang]!) : undefined
            if (dessus) expect(r.boite.y).toBeGreaterThanOrEqual(dessus.y + dessus.h)
            if (dessous) expect(r.boite.y + r.boite.h).toBeLessThanOrEqual(dessous.y)
            // Même place que celle qu'il prend vraiment : au même rang, de haut en bas, sur la même colonne.
            const apres = vue(deplacerSujets(k.a, [g], cible))
            expect(bienPlace(v[cote], apres[cote], nom, rang)).toBe(true)
          }
        }
      }
    })
  }

  it('une colonne vide : le repère se met de ce côté, à hauteur du central', () => {
    const k = carte('carte-libre', 2, 2) // tout à droite
    const v = vue(k.a)
    expect(v.gauche).toEqual([])
    const r = repereDeDepot(v.l, v.d, { type: 'carte', parent: k.c, cote: 'gauche', rang: 0 }, new Set([k.p[0]!]))!
    const c = v.d.boites.get(k.c)!
    expect(r.cote).toBe('gauche')
    expect(r.boite.x + r.boite.l).toBeLessThanOrEqual(c.x)
    expect(r.boite.y + r.boite.h / 2).toBeCloseTo(c.y + c.h / 2)
  })
})

describe('ailleurs que sous le central : l’ordre du modèle suit le sens où la structure dessine', () => {
  /** Titres des enfants de `id`, dans l'ordre du modèle. */
  const modele = (a: Arbre, id: Id) => enfantsDe(lire(a), id).map((x) => a.sujets[x]!.titre)

  it('un organigramme se lit de gauche à droite : on insère selon le côté du pointeur, pas sa hauteur', () => {
    let a = nouvelArbre('C')
    const c = lire(a).central
    const ids: Id[] = []
    for (const t of ['P0', 'P1', 'P2', 'X']) {
      const [b, id] = ajouterEnfant(a, c, t)
      a = b
      ids.push(id)
    }
    a = changerSujet(a, c, (s) => ({ ...s, structure: 'organigramme-bas' }))
    const l = lire(a)
    const d = disposer(l, taille)
    const b = d.boites.get(ids[1]!)!
    // À droite de P1, un peu au-dessus de son milieu : X vient après P1 (avant, c'était selon la hauteur).
    const apres = ouLacher(l, d, ids[3]!, { x: b.x + b.l + 3, y: b.y + 2 })
    expect(apres).toEqual({ type: 'inserer', parent: c, index: 2 })
    const avant = ouLacher(l, d, ids[3]!, { x: b.x - 3, y: b.y + b.h - 2 })
    expect(avant).toEqual({ type: 'inserer', parent: c, index: 1 })
    expect(modele(deplacerSujets(a, [ids[3]!], apres), c)).toEqual(['P0', 'P1', 'X', 'P2'])
    // Le repère suit : entre P1 et P2.
    const r = repereDeDepot(l, d, apres, new Set([ids[3]!]))!
    const milieu = r.boite.x + r.boite.l / 2
    expect(milieu).toBeGreaterThan(b.x + b.l)
    expect(milieu).toBeLessThan(d.boites.get(ids[2]!)!.x)
  })

  it('les branches d’une chronologie qui montent se lisent de bas en haut : on insère au-dessus, c’est après dans le modèle', () => {
    let a = nouvelArbre('C')
    const c = lire(a).central
    const [a1, p0] = ajouterEnfant(a, c, 'P0')
    const [a2, p1] = ajouterEnfant(a1, c, 'P1')
    a = a2
    const enf: Id[] = []
    for (const t of ['X', 'Y', 'Z']) {
      const [b, id] = ajouterEnfant(a, p1, t)
      a = b
      enf.push(id)
    }
    const [a3, w] = ajouterEnfant(a, p0, 'W')
    a = changerSujet(a3, c, (s) => ({ ...s, structure: 'chronologie-horizontale' }))
    const l = lire(a)
    const d = disposer(l, taille)
    // P1 est le second principal : ses enfants montent (X en bas, Z en haut).
    expect(d.boites.get(enf[2]!)!.y).toBeLessThan(d.boites.get(enf[0]!)!.y)
    const z = d.boites.get(enf[2]!)!
    const cible = ouLacher(l, d, w, { x: z.x + 10, y: z.y - 3 })
    expect(cible).toEqual({ type: 'inserer', parent: p1, index: 3 })
    const apres = deplacerSujets(a, [w], cible)
    expect(modele(apres, p1)).toEqual(['X', 'Y', 'Z', 'W'])
    const d2 = disposer(lire(apres), taille)
    expect(d2.boites.get(w)!.y).toBeLessThan(d2.boites.get(enf[2]!)!.y)
    // Entre X et Y (au-dessus de X, donc sous Y).
    const x = d.boites.get(enf[0]!)!
    expect(ouLacher(l, d, w, { x: x.x + 10, y: x.y - 3 })).toEqual({ type: 'inserer', parent: p1, index: 1 })
    // Le repère se met juste au-dessus du voisin, pas en dessous.
    const r = repereDeDepot(l, d, cible, new Set([w]))!
    expect(r.boite.y + r.boite.h).toBeLessThanOrEqual(z.y)
  })
})

describe('un principal qui change de côté', () => {
  it('perd son décalage libre, qu’il soit glissé ou basculé pour l’équilibre ; les autres gardent le leur', () => {
    const { a: a0, c, p } = carte('carte', 3)
    // P0 et P1 à droite, P2 à gauche ; chacun décalé à la main.
    let a = a0
    for (const id of p) a = changerSujet(a, id, (s) => ({ ...s, decalage: { x: 40, y: 10 } }))
    // P2 glissé à droite, en tête : l'équilibre fait passer P1 à gauche.
    const b = deplacerSujets(a, [p[2]!], { type: 'carte', parent: c, cote: 'droite', rang: 0 })
    const v = vue(b)
    expect(v.droite).toContain('P2')
    expect(v.gauche).toContain('P1')
    expect(b.sujets[p[2]!]!.decalage).toBeUndefined()
    expect(b.sujets[p[1]!]!.decalage).toBeUndefined()
    expect(b.sujets[p[0]!]!.decalage).toEqual({ x: 40, y: 10 })
  })
})
