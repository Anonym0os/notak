import { describe, expect, it } from 'vitest'
import type { Arbre, Id, StructureArbre } from '../../../coeur/tableau'
import { ajouterEnfant, basculerRepli, changerSujet, lire, nouvelArbre } from '../modele/sujets'
import { type Boite, disposer } from './index'

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
})
