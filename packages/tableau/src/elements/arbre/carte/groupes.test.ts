import { describe, expect, it } from 'vitest'
import type { StructureArbre } from '../../../coeur/tableau'
import { fr } from '../../../langue'
import { THEMES, variantesDe } from '../themes'
import { GROUPES_SQUELETTES, accentCourant, choixDe, groupeCourant, groupeDeStructure, groupesThemes, nomDeSquelette, squeletteDeCarte, themeDuGroupe, varianteActive, varianteSuivante } from './groupes'
import { SQUELETTES } from './squelettes'

const TOUTES: StructureArbre[] = [
  'carte', 'carte-libre', 'carte-horaire', 'carte-antihoraire', 'logique-droite', 'logique-gauche', 'accolade-droite', 'accolade-gauche', 'organigramme-bas', 'organigramme-haut',
  'arbre-droite', 'arbre-gauche', 'chronologie-horizontale', 'chronologie-verticale', 'arete-gauche', 'arete-droite', 'matrice-lignes', 'matrice-colonnes',
]

describe('les squelettes', () => {
  it('chaque squelette est dans un groupe, une seule fois, et chaque groupe en a au moins un', () => {
    const vus = GROUPES_SQUELETTES.flatMap((g) => g.squelettes.map((s) => s.id))
    expect(new Set(vus).size).toBe(vus.length)
    expect(vus).toHaveLength(SQUELETTES.length)
    for (const g of GROUPES_SQUELETTES) expect(g.squelettes.length, g.id).toBeGreaterThan(0)
  })

  it('chaque groupe a un nom, chaque structure le sien, et chaque squelette un nom qui le numérote', () => {
    for (const g of GROUPES_SQUELETTES) expect(fr[`arbre.carte.g.${g.id}`], g.id).toBeTruthy()
    for (const s of TOUTES) expect(fr[`arbre.s.${s}`], s).toBeTruthy()
    expect(nomDeSquelette(SQUELETTES.find((s) => s.id === 'logique-3')!)).toBe('Diagramme logique 3')
  })

  it('la carte du squelette nomme le groupe de la structure', () => {
    expect(groupeDeStructure('carte-antihoraire')).toBe('carte')
    expect(groupeDeStructure('arete-droite')).toBe('arete')
    expect(groupeDeStructure('matrice-colonnes')).toBe('matrice')
    expect(groupeDeStructure('organigramme-haut')).toBe('organigramme')
  })

  it('le squelette d’une carte : celui qu’elle désigne, ou aucun', () => {
    expect(squeletteDeCarte({ squelette: 'arbre-2' })?.groupe).toBe('arbre')
    expect(squeletteDeCarte({})).toBeUndefined()
    expect(squeletteDeCarte({ squelette: 'inconnu' })).toBeUndefined()
  })
})

describe('les groupes de thèmes', () => {
  const perso = [{ id: 'perso:a', nom: 'Mien', palette: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] }]

  it('nos thèmes d’abord, puis ceux qu’on s’est faits, rangés à part', () => {
    const g = groupesThemes(perso)
    expect(g.slice(0, THEMES.length).map((x) => x.id)).toEqual(THEMES.map((x) => x.id))
    expect(g.at(-1)).toMatchObject({ id: 'perso:a', nom: 'Mien', categorie: 'perso' })
    expect(g.filter((x) => x.categorie === 'colore').length).toBeGreaterThan(0)
    expect(g.filter((x) => x.categorie === 'classique').length).toBeGreaterThan(0)
  })

  it('le groupe d’une carte : le sien, le classique par défaut, un thème à soi lu dans la carte', () => {
    const g = groupesThemes([])
    expect(groupeCourant({}, g).id).toBe('classique')
    expect(groupeCourant({ theme: 'ocean' }, g).id).toBe('ocean')
    const venu = groupeCourant({ theme: 'perso:z', themePerso: { nom: 'Venu', palette: ['#111111'] } }, g)
    expect(venu).toMatchObject({ id: 'perso:z', nom: 'Venu', categorie: 'perso' })
    expect(venu.palette).toHaveLength(6)
    expect(groupeCourant({ theme: 'inconnu' }, g).id).toBe('classique')
  })

  it('la variante active : celle à branches de couleur, ou celle dont la couleur est l’accent', () => {
    const g = groupesThemes([])
    const ocean = g.find((x) => x.id === 'ocean')!
    const accent = variantesDe(themeDuGroupe(ocean))[2]!
    expect(varianteActive({ theme: 'ocean' }, ocean, undefined)).toBe(true)
    expect(varianteActive({ theme: 'ocean' }, ocean, accent)).toBe(false)
    expect(varianteActive({ theme: 'ocean', options: { uneCouleur: true }, couleurLigne: accent.toUpperCase() }, ocean, accent)).toBe(true)
    expect(varianteActive({ theme: 'ocean', options: { uneCouleur: true }, couleurLigne: accent }, ocean, undefined)).toBe(false)
    expect(varianteActive({ theme: 'foret' }, ocean, undefined)).toBe(false)
    expect(accentCourant({ options: { uneCouleur: true }, couleurLigne: '#123456' })).toBe('#123456')
    expect(accentCourant({ couleurLigne: '#123456' })).toBeUndefined()
  })

  it('la variante suivante : on boucle, de la dernière à la première', () => {
    const g = groupesThemes([]).find((x) => x.id === 'foret')!
    const vs = variantesDe(themeDuGroupe(g))
    let a: { options?: { uneCouleur?: boolean }; couleurLigne?: string } = {}
    const vus: (string | undefined)[] = []
    for (let i = 0; i < vs.length; i++) {
      const s = varianteSuivante(g, a)
      vus.push(s)
      a = s ? { options: { uneCouleur: true }, couleurLigne: s } : {}
    }
    expect(vus).toEqual([...vs.slice(1), vs[0]])
  })

  it('le choix envoyé au geste porte les données d’un thème à soi', () => {
    const g = groupesThemes(perso).at(-1)!
    expect(choixDe(g, '#111111')).toEqual({ theme: 'perso:a', accent: '#111111', perso: { nom: 'Mien', palette: g.palette } })
    expect(choixDe(groupesThemes([])[0]!, undefined).perso).toBeUndefined()
  })
})
