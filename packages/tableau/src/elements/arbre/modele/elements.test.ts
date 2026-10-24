import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import { disposer } from '../disposition'
import { ajouterLimite, ajouterRelation, ajouterResume, basculerMarqueur, limitesValides, numeroDe, plage, porter, relationsValides, resumesValides, retirer, sujetsDePlage } from './elements'
import { appliquerGeste } from './gestes'
import { ajouterEnfant, lire, nouvelArbre, supprimerBranches } from './sujets'

// Central ; A (A1, A2, A3), B.
let a: Arbre = nouvelArbre('C')
const c = lire(a).central
const ids: Record<string, Id> = {}
;[a, ids.A!] = ajouterEnfant(a, c, 'A')
;[a, ids.B!] = ajouterEnfant(a, c, 'B')
for (const n of ['A1', 'A2', 'A3']) [a, ids[n]!] = ajouterEnfant(a, ids.A!, n)
const titre = () => 'X'

describe('relations', () => {
  it('relient deux sujets, jamais un sujet à lui-même', () => {
    const [b, r] = ajouterRelation(a, ids.A1!, ids.B!)
    expect(b.relations?.[r!]).toEqual({ de: ids.A1, vers: ids.B })
    expect(ajouterRelation(a, ids.A!, ids.A!)[1]).toBeNull()
  })

  it('une relation dont un bout est effacé ne se dessine plus', () => {
    const [b] = ajouterRelation(a, ids.A1!, ids.B!)
    const sans = supprimerBranches(b, [ids.B!])
    expect(relationsValides(sans, lire(sans))).toEqual([])
  })
})

describe('limites et résumés', () => {
  it('une plage de frères va du premier au dernier choisi, dans l’ordre', () => {
    expect(plage(lire(a), [ids.A3!, ids.A1!])).toEqual({ de: ids.A1, a: ids.A3 })
    expect(plage(lire(a), [ids.A1!, ids.B!])).toBeNull()
    expect(plage(lire(a), [ids.A!])).toEqual({ de: ids.A })
  })

  it('une limite entoure sa plage ; retirée, elle disparaît', () => {
    const [b, l] = ajouterLimite(a, [ids.A1!, ids.A2!])
    expect(sujetsDePlage(lire(b), b.limites![l!]!)).toEqual([ids.A1, ids.A2])
    expect(limitesValides(retirer(b, l!), lire(a))).toEqual([])
  })

  it('un résumé crée son sujet, posé à côté de sa plage', () => {
    const [b, sujet] = ajouterResume(a, [ids.A1!, ids.A3!], 'Résumé')
    const l = lire(b)
    expect(l.resumes).toEqual([sujet])
    expect(resumesValides(b, l)).toHaveLength(1)
    const d = disposer(l, () => ({ l: 80, h: 24 }), undefined, false, [{ sujet: sujet!, plage: sujetsDePlage(l, { de: ids.A1!, a: ids.A3! }) }])
    const [r, a3] = [d.boites.get(sujet!)!, d.boites.get(ids.A3!)!]
    expect(r.x).toBeGreaterThan(a3.x + a3.l)
  })

  it('supprimer le sujet d’un résumé emporte le résumé', () => {
    const [b, sujet] = ajouterResume(a, [ids.A1!], 'Résumé')
    const apres = appliquerGeste(b, { type: 'supprimer', ids: [sujet!] }, titre)!.arbre
    expect(apres.resumes).toBeUndefined()
    expect(apres.sujets[sujet!]).toBeUndefined()
  })
})

describe('ce qu’un sujet porte', () => {
  it('un seul marqueur par groupe ; la même touche l’ôte', () => {
    let b = basculerMarqueur(a, [ids.A!], 'priority-1')
    b = basculerMarqueur(b, [ids.A!], 'priority-3')
    b = basculerMarqueur(b, [ids.A!], 'flag-red')
    expect(b.sujets[ids.A!]!.marqueurs).toEqual(['priority-3', 'flag-red'])
    expect(basculerMarqueur(b, [ids.A!], 'flag-red').sujets[ids.A!]!.marqueurs).toEqual(['priority-3'])
  })

  it('porter et retirer', () => {
    const b = porter(a, [ids.A!], 'etiquettes', ['un', 'deux'])
    expect(b.sujets[ids.A!]!.etiquettes).toEqual(['un', 'deux'])
    expect(porter(b, [ids.A!], 'etiquettes', []).sujets[ids.A!]!.etiquettes).toBeUndefined()
  })

  it('la numérotation des enfants, avec ou sans paliers', () => {
    let b = porter(a, [ids.A!], 'numerotation', { motif: 'romain' })
    expect(numeroDe(lire(b), ids.A3!)).toBe('III')
    b = porter(b, [c], 'numerotation', { motif: 'arabe' })
    b = porter(b, [ids.A!], 'numerotation', { motif: 'minuscule', paliers: true })
    expect(numeroDe(lire(b), ids.A2!)).toBe('1.b')
  })

  it('Cmd+Alt+T met la case de tâche, puis l’ôte', () => {
    const b = appliquerGeste(a, { type: 'tache', ids: [ids.A!] }, titre)!.arbre
    expect(b.sujets[ids.A!]!.tache).toBe('a-faire')
    expect(appliquerGeste(b, { type: 'tache', ids: [ids.A!] }, titre)!.arbre.sujets[ids.A!]!.tache).toBeUndefined()
  })
})
