import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import { diapositives, livraisonDe, miseEnPageDe, pasApresBranche, pasDe, pasDeDepart, pasParent, visibilite } from './diapositives'
import { ajouterEnfant, lire, nouvelArbre } from './sujets'
import { ajouterResume } from './elements'
import { poserDiapo } from './pitch'

/** Central → A (A1, A2 (A2a)), B. */
function exemple() {
  let a: Arbre = nouvelArbre('C')
  const c = lire(a).central
  let A: Id, B: Id, A1: Id, A2: Id, A2a: Id
  ;[a, A] = ajouterEnfant(a, c, 'A')
  ;[a, B] = ajouterEnfant(a, c, 'B')
  ;[a, A1] = ajouterEnfant(a, A, 'A1')
  ;[a, A2] = ajouterEnfant(a, A, 'A2')
  ;[a, A2a] = ajouterEnfant(a, A2, 'A2a')
  return { a, c, A, B, A1, A2, A2a }
}

describe('les diapositives d’une carte (mode Pitch)', () => {
  it('Auto : le central et les principaux sont des diapositives, les sous-sujets non', () => {
    const { a, c, A, B, A1 } = exemple()
    const l = lire(a)
    expect(visibilite(l, c, 'sujet')).toEqual({ valeur: 'visible', auto: true })
    expect(visibilite(l, A, 'sujet').valeur).toBe('visible')
    expect(visibilite(l, A1, 'sujet')).toEqual({ valeur: 'masque', auto: true })
    // Une liste existe quand le sujet est une diapositive et a des sous-sujets.
    expect(visibilite(l, A, 'liste').valeur).toBe('visible')
    expect(visibilite(l, B, 'liste').valeur).toBe('masque')
    expect(visibilite(l, A1, 'liste').valeur).toBe('masque')
  })

  it('l’ordre : le sujet puis sa liste, puis la branche suivante', () => {
    const { a, c, A, B } = exemple()
    const d = diapositives(lire(a))
    expect(d.map((x) => `${x.type}:${x.sujet}`)).toEqual([`sujet:${c}`, `liste:${c}`, `sujet:${A}`, `liste:${A}`, `sujet:${B}`])
  })

  it('la liste d’un sujet déroule ses sous-sujets, et s’arrête à ceux qui ont leur propre diapositive', () => {
    const { a, A, A1, A2, A2a } = exemple()
    const liste = diapositives(lire(a)).find((x) => x.type === 'liste' && x.sujet === A)
    expect(liste?.type === 'liste' && liste.items.map((i) => [i.id, i.niveau])).toEqual([
      [A1, 0],
      [A2, 0],
      [A2a, 1],
    ])
    // A2 devient une diapositive : sa liste ne descend plus chez lui.
    const b = poserDiapo(a, [A2], { sujet: 'visible' })
    const l2 = diapositives(lire(b)).find((x) => x.type === 'liste' && x.sujet === A)
    expect(l2?.type === 'liste' && l2.items.map((i) => i.id)).toEqual([A1, A2])
  })

  it('la livraison compte les étapes : tout d’un coup, un par un, ou en descendant dans chacun', () => {
    const { a, A } = exemple()
    const etapes = (b: Arbre) => {
      const x = diapositives(lire(b)).find((d) => d.type === 'liste' && d.sujet === A)!
      return [x.etapes, x.type === 'liste' ? x.items.map((i) => i.etape) : []]
    }
    expect(etapes(a)).toEqual([2, [1, 2, 2]]) // un par un (défaut) : A2a vient avec A2
    expect(etapes(poserDiapo(a, [A], { livraison: 'tout' }))).toEqual([1, [1, 1, 1]])
    expect(etapes(poserDiapo(a, [A], { livraison: 'percer' }))).toEqual([3, [1, 2, 3]])
  })

  it('les réglages explicites l’emportent sur Auto', () => {
    const { a, c, A1, B } = exemple()
    expect(diapositives(lire(poserDiapo(a, [B], { sujet: 'masque' }))).some((d) => d.sujet === B)).toBe(false)
    expect(diapositives(lire(poserDiapo(a, [A1], { sujet: 'visible' }))).some((d) => d.type === 'sujet' && d.sujet === A1)).toBe(true)
    expect(diapositives(lire(poserDiapo(a, [c], { liste: 'masque' }))).some((d) => d.type === 'liste' && d.sujet === c)).toBe(false)
    expect(livraisonDe(lire(a), c)).toEqual({ valeur: 'un-par-un', auto: true })
    expect(miseEnPageDe(lire(poserDiapo(a, [c], { miseEnPage: 'arete' })), c)).toEqual({ valeur: 'arete', auto: false })
  })

  it('tout masquer laisse quand même le central', () => {
    const { a, c, A, B } = exemple()
    const b = poserDiapo(a, [c, A, B], { sujet: 'masque', liste: 'masque' })
    expect(diapositives(lire(b))).toEqual([{ type: 'sujet', sujet: c, etapes: 1 }])
  })

  it('un résumé est une diapositive après les frères qu’il résume', () => {
    const { a, A, B } = exemple()
    const [b, resume] = ajouterResume(a, [A, B], 'En bref')
    const ordre = diapositives(lire(b)).map((x) => x.sujet)
    expect(ordre.at(-1)).toBe(resume)
    expect(visibilite(lire(b), resume!, 'sujet').valeur).toBe('visible')
    expect(visibilite(lire(poserDiapo(b, [resume!], { resume: 'masque' })), resume!, 'sujet').valeur).toBe('masque')
  })

  it('les pas, le départ, passer la branche et revenir au parent', () => {
    const { a, c, A, B } = exemple()
    const l = lire(a)
    const diapos = diapositives(l)
    const pas = pasDe(diapos)
    // central, liste du central (1 étape par principal : 2), A, liste de A (2 étapes), B.
    expect(pas.length).toBe(1 + 2 + 1 + 2 + 1)
    expect(pasDeDepart(l, diapos, pas, undefined)).toBe(0)
    expect(diapos[pas[pasDeDepart(l, diapos, pas, A)]!.diapo]).toMatchObject({ type: 'sujet', sujet: A })
    expect(diapos[pas[pasDeDepart(l, diapos, pas, B)]!.diapo]).toMatchObject({ type: 'sujet', sujet: B })
    // Depuis la diapositive de A, passer la branche mène à B ; depuis B, il n’y a plus rien.
    const deA = pasDeDepart(l, diapos, pas, A)
    expect(diapos[pas[pasApresBranche(l, diapos, pas, deA)!]!.diapo]).toMatchObject({ sujet: B })
    expect(pasApresBranche(l, diapos, pas, pas.length - 1)).toBeNull()
    // Depuis la liste de A, le parent est la diapositive de A ; depuis la diapositive de A, c’est le central.
    const listeA = pas.findIndex((p) => diapos[p.diapo]!.type === 'liste' && diapos[p.diapo]!.sujet === A)
    expect(pasParent(l, diapos, pas, listeA)).toBe(deA)
    expect(diapos[pas[pasParent(l, diapos, pas, deA)]!.diapo]).toMatchObject({ sujet: c })
  })
})
