import { describe, expect, it } from 'vitest'
import type { Arbre, Id, StructureArbre } from '../../../coeur/tableau'
import { ajouterEnfant, basculerRepli, changerSujet, lire, nouvelArbre } from '../modele/sujets'
import { type Boite, ECARTS, ECARTS_COMPACTS, disposer, ecartsDe } from './index'

const TAILLE = { l: 80, h: 24 }

/** Un central, `n` principaux, chacun avec `k` enfants. */
function carte(n: number, k: number, structure: StructureArbre = 'carte'): { a: Arbre; principaux: Id[] } {
  let a = nouvelArbre('C')
  const c = lire(a).central
  a = changerSujet(a, c, (s) => ({ ...s, structure }))
  const principaux: Id[] = []
  for (let i = 0; i < n; i++) {
    let p: Id
    ;[a, p] = ajouterEnfant(a, c, `P${i}`)
    principaux.push(p)
    for (let j = 0; j < k; j++) [a] = ajouterEnfant(a, p, `S${i}.${j}`)
  }
  return { a, principaux }
}

const chevauchent = (a: Boite, b: Boite) => a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.h && b.y < a.y + a.h

function sansChevauchement(boites: Map<Id, Boite>) {
  const l = [...boites.values()]
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) expect(chevauchent(l[i]!, l[j]!)).toBe(false)
}

describe('disposer une carte', () => {
  it('centre le central en (0, 0)', () => {
    const { a } = carte(0, 0)
    const d = disposer(lire(a), () => TAILLE)
    expect([...d.boites.values()]).toEqual([{ x: -40, y: -12, ...TAILLE }])
  })

  it('équilibrée : la première moitié à droite, le reste à gauche, sans rien qui se chevauche', () => {
    const { a, principaux } = carte(5, 3)
    const d = disposer(lire(a), () => TAILLE)
    const x = (id: Id) => d.boites.get(id)!.x
    expect(principaux.slice(0, 3).every((p) => x(p) > 0)).toBe(true)
    expect(principaux.slice(3).every((p) => x(p) < 0)).toBe(true)
    sansChevauchement(d.boites)
  })

  it('un enfant est toujours plus loin du central que son parent', () => {
    const l = lire(carte(4, 3).a)
    const d = disposer(l, () => TAILLE)
    for (const lien of d.liens) {
      const [p, e] = [d.boites.get(lien.de)!, d.boites.get(lien.vers)!]
      expect(Math.abs(e.x + e.l / 2)).toBeGreaterThan(Math.abs(p.x + p.l / 2))
    }
  })

  it('horaire : la gauche se lit de bas en haut', () => {
    const { a, principaux } = carte(4, 0, 'carte-horaire')
    const d = disposer(lire(a), () => TAILLE)
    const y = (id: Id) => d.boites.get(id)!.y
    expect(y(principaux[0]!)).toBeLessThan(y(principaux[1]!))
    expect(y(principaux[2]!)).toBeGreaterThan(y(principaux[3]!))
  })

  it('logique droite : tous les principaux à droite', () => {
    const { a, principaux } = carte(4, 2, 'logique-droite')
    const d = disposer(lire(a), () => TAILLE)
    expect(principaux.every((p) => d.boites.get(p)!.x > 0)).toBe(true)
    sansChevauchement(d.boites)
  })

  it('un sujet replié ne dispose pas ses enfants', () => {
    const { a, principaux } = carte(1, 3)
    const d = disposer(lire(basculerRepli(a, principaux[0]!)), () => TAILLE)
    expect(d.boites.size).toBe(2)
  })

  it('tient 2 000 sujets en peu de temps', () => {
    const { a } = carte(40, 49)
    const debut = performance.now()
    const d = disposer(lire(a), () => TAILLE)
    expect(d.boites.size).toBe(1 + 40 * 50)
    expect(performance.now() - debut).toBeLessThan(200)
  })

  const TOUTES: StructureArbre[] = [
    'carte', 'carte-libre', 'carte-horaire', 'carte-antihoraire', 'logique-droite', 'logique-gauche', 'accolade-droite',
    'accolade-gauche', 'organigramme-bas', 'organigramme-haut', 'arbre-droite', 'arbre-gauche', 'chronologie-horizontale',
    'chronologie-verticale', 'arete-gauche', 'arete-droite', 'matrice-lignes', 'matrice-colonnes',
  ]
  for (const s of TOUTES)
    it(`${s} : chaque sujet a sa place, sans chevauchement`, () => {
      const { a } = carte(4, 3, s)
      const d = disposer(lire(a), () => TAILLE)
      expect(d.boites.size).toBe(1 + 4 * 4)
      sansChevauchement(d.boites)
    })

  it('organigramme vers le bas : les principaux sous le central, côte à côte', () => {
    const { a, principaux } = carte(3, 0, 'organigramme-bas')
    const d = disposer(lire(a), () => TAILLE)
    const b = principaux.map((p) => d.boites.get(p)!)
    expect(b.every((x) => x.y > 12)).toBe(true)
    expect(b[0]!.x).toBeLessThan(b[1]!.x)
    expect(new Set(b.map((x) => x.y)).size).toBe(1)
  })

  it('une structure déclarée sur un sujet ne vaut que pour sa branche', () => {
    const { a, principaux } = carte(2, 2)
    const b = changerSujet(a, principaux[0]!, (s) => ({ ...s, structure: 'organigramme-bas' }))
    const l = lire(b)
    const d = disposer(l, () => TAILLE)
    const p0 = d.boites.get(principaux[0]!)!
    for (const x of l.enfants.get(principaux[0]!)!) expect(d.boites.get(x)!.y).toBeGreaterThan(p0.y + p0.h)
    const p1 = d.boites.get(principaux[1]!)!
    for (const x of l.enfants.get(principaux[1]!)!) expect(d.boites.get(x)!.x + 80).toBeLessThanOrEqual(p1.x)
  })

  it('placement libre : le décalage d’une branche ne compte que si la carte le permet', () => {
    const { a, principaux } = carte(2, 1)
    const b = changerSujet(a, principaux[0]!, (s) => ({ ...s, decalage: { x: 30, y: -50 } }))
    const avant = disposer(lire(a), () => TAILLE).boites.get(principaux[0]!)!
    expect(disposer(lire(b), () => TAILLE).boites.get(principaux[0]!)).toEqual(avant)
    expect(disposer(lire(b), () => TAILLE, undefined, true).boites.get(principaux[0]!)).toEqual({ ...avant, x: avant.x + 30, y: avant.y - 50 })
  })
})

describe('les écarts de Xmind, selon la classe du parent', () => {
  /** Un central, deux principaux à droite, chacun avec deux enfants, eux-mêmes avec deux enfants (logique à droite). */
  function arbre() {
    let a = nouvelArbre('C')
    const c = lire(a).central
    a = changerSujet(a, c, (s) => ({ ...s, structure: 'logique-droite' }))
    const [P, E, F] = [[] as Id[], [] as Id[], [] as Id[]]
    for (let i = 0; i < 2; i++) {
      let p: Id
      ;[a, p] = ajouterEnfant(a, c, `P${i}`)
      P.push(p)
      for (let j = 0; j < 2; j++) {
        let e: Id
        ;[a, e] = ajouterEnfant(a, p, `E${i}${j}`)
        E.push(e)
        for (let k = 0; k < 2; k++) {
          let f: Id
          ;[a, f] = ajouterEnfant(a, e, `F${i}${j}${k}`)
          F.push(f)
        }
      }
    }
    return { a, c, P, E, F }
  }
  const T = { l: 80, h: 20 }

  it('le central s’écarte de ses principaux de 50 et de 35 entre eux ; un principal, de 26 et de 6 ; un sous-sujet, de 26 et de 8', () => {
    const { a, c, P, E, F } = arbre()
    const d = disposer(lire(a), () => T)
    const b = (id: Id) => d.boites.get(id)!
    // Majeur : l'espace horizontal entre le bord du parent et celui de l'enfant.
    expect(b(P[0]!).x - (b(c).x + b(c).l)).toBe(50)
    expect(b(E[0]!).x - (b(P[0]!).x + b(P[0]!).l)).toBe(26)
    expect(b(F[0]!).x - (b(E[0]!).x + b(E[0]!).l)).toBe(26)
    // Mineur : l'espace vertical entre deux frères sans descendance. Les feuilles de F : 8 ; les enfants de P0 (blocs de 2 feuilles) : 6.
    expect(b(F[1]!).y - (b(F[0]!).y + b(F[0]!).h)).toBe(8)
    const bloc = (e: Id, fs: Id[]) => ({ haut: Math.min(b(e).y, ...fs.map((f) => b(f).y)), bas: Math.max(b(e).y + b(e).h, ...fs.map((f) => b(f).y + b(f).h)) })
    const [e0, e1] = [bloc(E[0]!, [F[0]!, F[1]!]), bloc(E[1]!, [F[2]!, F[3]!])]
    expect(e1.haut - e0.bas).toBe(6)
    const [p0, p1] = [bloc(P[0]!, [...E.slice(0, 2), ...F.slice(0, 4)]), bloc(P[1]!, [...E.slice(2), ...F.slice(4)])]
    expect(p1.haut - p0.bas).toBe(35)
  })

  it('la carte compacte : 28 et 10 du central, 22 et 5 ensuite', () => {
    const { a, c, P, E } = arbre()
    const d = disposer(lire(a), () => T, ECARTS_COMPACTS)
    const b = (id: Id) => d.boites.get(id)!
    expect(b(P[0]!).x - (b(c).x + b(c).l)).toBe(28)
    expect(b(E[0]!).x - (b(P[0]!).x + b(P[0]!).l)).toBe(22)
  })

  it('une courbe, une droite, une anse ou un pli doublent le majeur hors du central ; un coude le garde', () => {
    expect(ecartsDe('coudee').principal).toBe(26)
    expect(ecartsDe('coudee-arrondie').principal).toBe(26)
    expect(ecartsDe(undefined).principal).toBe(26)
    for (const f of ['courbe', 'droite', 'anse', 'pli', 'pli-arrondi'] as const) expect(ecartsDe(f)).toEqual({ ...ECARTS, principal: 52 })
    expect(ecartsDe('courbe', true)).toEqual({ ...ECARTS_COMPACTS, principal: 44 })
    expect(ecartsDe('courbe').central).toBe(50)
  })

  it('un principal sans structure à lui prend celle que son squelette prescrit ; la sienne passe avant', () => {
    const { a, principaux } = carte(2, 2, 'logique-droite')
    // Avec des principaux en organigramme, les enfants de chacun sont rangés dessous, pas à droite.
    const org = disposer(lire(a), () => TAILLE, ECARTS, false, [], 'organigramme-bas')
    const [pp, fils] = [org.boites.get(principaux[0]!)!, lire(a).enfants.get(principaux[0]!)!.map((x) => org.boites.get(x)!)]
    expect(fils.every((b) => b.y > pp.y)).toBe(true)
    const propre = changerSujet(a, principaux[0]!, (s) => ({ ...s, structure: 'logique-droite' }))
    const d = disposer(lire(propre), () => TAILLE, ECARTS, false, [], 'organigramme-bas')
    const fils0 = lire(propre).enfants.get(principaux[0]!)!.map((x) => d.boites.get(x)!)
    expect(fils0.every((b) => b.x > d.boites.get(principaux[0]!)!.x)).toBe(true)
  })

  it('l’organique double le majeur comme la courbe', () => {
    expect(ecartsDe('organique')).toEqual({ ...ECARTS, principal: 52 })
  })

  it('une carte aux écarts sans mineurs retombe sur l’écart secondaire (l’aperçu des thèmes)', () => {
    const { a, P } = arbre()
    const d = disposer(lire(a), () => T, { principal: 14, secondaire: 4, central: 20 })
    const b = (id: Id) => d.boites.get(id)!
    expect(b(P[1]!).y).toBeGreaterThan(b(P[0]!).y)
  })
})
