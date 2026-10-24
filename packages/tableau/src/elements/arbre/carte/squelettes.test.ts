import { describe, expect, it } from 'vitest'
import type { StructureArbre } from '../../../coeur/tableau'
import { defForme } from '../formes'
import { FORMES_BRANCHE } from '../modele/style'
import { GROUPES_DE_SQUELETTES, SQUELETTES, SQUELETTE_DEFAUT, type RangSquelette, classeDe, epaisseurEntrante, pileSquelette, squeletteDe, squeletteDeXmind, squelettesDuGroupe } from './squelettes'

const STRUCTURES: StructureArbre[] = [
  'carte', 'carte-libre', 'carte-horaire', 'carte-antihoraire', 'logique-droite', 'logique-gauche', 'accolade-droite', 'accolade-gauche', 'organigramme-bas', 'organigramme-haut',
  'arbre-droite', 'arbre-gauche', 'chronologie-horizontale', 'chronologie-verticale', 'arete-gauche', 'arete-droite', 'matrice-lignes', 'matrice-colonnes',
]
const RANGS: RangSquelette[] = ['central', 'principal', 'sous', 'flottant']

describe('la table des squelettes', () => {
  it('cinquante et un squelettes, rangés dans huit groupes comme ceux de Xmind', () => {
    expect(SQUELETTES).toHaveLength(51)
    expect(GROUPES_DE_SQUELETTES.map((g) => squelettesDuGroupe(g).length)).toEqual([12, 9, 6, 6, 6, 6, 3, 3])
  })

  it('un identifiant à nous et un identifiant de Xmind, chacun unique ; le rang dans le groupe est dans l’identifiant', () => {
    expect(new Set(SQUELETTES.map((s) => s.id)).size).toBe(51)
    expect(new Set(SQUELETTES.map((s) => s.xmind)).size).toBe(51)
    for (const g of GROUPES_DE_SQUELETTES) squelettesDuGroupe(g).forEach((s, i) => expect(s.id).toBe(`${g}-${i + 1}`))
  })

  it('chacun a une structure valide, et une structure de principaux valide quand il en prescrit une', () => {
    for (const s of SQUELETTES) {
      expect(STRUCTURES, s.id).toContain(s.structure)
      if (s.principaux) {
        expect(STRUCTURES, s.id).toContain(s.principaux)
        expect(s.principaux, s.id).not.toBe(s.structure)
      }
    }
  })

  it('chaque rang a des formes que Notak connaît : sujet, branche, motifs', () => {
    for (const s of SQUELETTES)
      for (const r of RANGS) {
        const c = classeDe(s, r)
        expect(defForme(c.forme) !== undefined || c.forme === 'souligne', `${s.id} ${r} ${c.forme}`).toBe(true)
        expect([...FORMES_BRANCHE, 'aucune'], `${s.id} ${r} ${c.branche}`).toContain(c.branche)
        expect(c.taille, `${s.id} ${r}`).toBeGreaterThan(8)
        expect(c.graisse, `${s.id} ${r}`).toBeGreaterThanOrEqual(100)
        expect(['gauche', 'centre']).toContain(c.alignement)
        if (c.epaisseur !== undefined) expect(c.epaisseur, `${s.id} ${r}`).toBeGreaterThanOrEqual(0)
      }
  })

  it('l’épaisseur de la ligne est résolue pour le central et pour chaque rang qui en hérite', () => {
    for (const s of SQUELETTES) for (const r of RANGS) expect(classeDe(s, r).epaisseur, `${s.id} ${r}`).toBeDefined()
  })

  it('le squelette par défaut est le premier de Xmind : courbe organique depuis le central, coudes arrondis ensuite', () => {
    const d = squeletteDe(SQUELETTE_DEFAUT)!
    expect(d.id).toBe('carte-1')
    expect(d.xmind).toBe('8f137afe-a0f3-4f25-b56a-cfd05993ef4b')
    expect(d.central.branche).toBe('organique')
    expect(d.principal.branche).toBe('coudee-arrondie')
    expect(d.sous.branche).toBe('coudee-arrondie')
    expect(d.central).toMatchObject({ taille: 30, graisse: 800, remplissage: 'aucun', epaisseur: 2 })
    expect(d.principal).toMatchObject({ taille: 18, graisse: 500, remplissage: 'plein' })
    expect(d.fondNiveau2).toBe(true)
    expect(d.effile).toBeUndefined()
  })

  it('trois squelettes effilés, quatre dessinés à la main dans la carte mentale', () => {
    expect(SQUELETTES.filter((s) => s.effile).map((s) => s.id)).toEqual(['carte-2', 'carte-6', 'organigramme-6'])
    expect(squelettesDuGroupe('carte').filter((s) => s.main)).toHaveLength(4)
    // Un squelette dessiné à la main trace ses branches à main levée.
    expect(squeletteDe('carte-10')!.central.motif).toBe('main')
  })

  it('le squelette à soulignés (le 5e) : branches coudées d’épaisseur 1, principaux soulignés de 5', () => {
    const s = squeletteDe('carte-5')!
    expect(s.central).toMatchObject({ branche: 'coudee', epaisseur: 1, taille: 28, graisse: 600 })
    expect(s.principal).toMatchObject({ forme: 'souligne', bordure: 5, epaisseur: 1 })
    expect(s.sous).toMatchObject({ forme: 'souligne', epaisseur: 1 })
    // Un sous-sujet souligné sans bordure à lui : le trait est celui de la branche qui arrive.
    expect(s.sous.bordure).toBeUndefined()
    expect(epaisseurEntrante(s, 'sous')).toBe(1)
  })

  it('la correspondance avec les identifiants de Xmind va dans les deux sens', () => {
    for (const s of SQUELETTES) expect(squeletteDeXmind(s.xmind)).toBe(s)
    expect(squeletteDeXmind('inconnu')).toBeUndefined()
    expect(squeletteDe(undefined)).toBeUndefined()
  })

  it('la police : celle de Xmind devient une pile du système, NeverMind celle de la carte', () => {
    expect(pileSquelette(undefined)).toBeUndefined()
    expect(pileSquelette('NeverMind Hand')).toContain('cursive')
    expect(pileSquelette('Montserrat')).toBe('"Montserrat", sans-serif')
  })
})
