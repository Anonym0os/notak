import { describe, expect, it } from 'vitest'
import { CLE_RECENTES, COULEUR_DEPART, MAX_RECENTES, avecRecente, lireRecentes, retenirCouleur } from './menuCouleurs'

const memoire = (valeur?: string) => {
  const m = new Map<string, string>(valeur ? [[CLE_RECENTES, valeur]] : [])
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('NOTION.md § 7.3 : les couleurs récentes', () => {
  it('au départ, le fond jaune', () => {
    expect(lireRecentes(memoire())).toEqual([COULEUR_DEPART])
    expect(COULEUR_DEPART).toEqual({ nom: 'jaune', fond: true })
  })

  it('la plus récente en tête, sans doublon, cinq au plus ; la couleur par défaut n’y entre pas', () => {
    let l = avecRecente([], { nom: 'rouge', fond: false })
    l = avecRecente(l, { nom: 'bleu', fond: true })
    l = avecRecente(l, { nom: 'rouge', fond: false })
    expect(l).toEqual([{ nom: 'rouge', fond: false }, { nom: 'bleu', fond: true }])
    for (const nom of ['gris', 'brun', 'orange', 'jaune', 'vert'] as const) l = avecRecente(l, { nom, fond: false })
    expect(l).toHaveLength(MAX_RECENTES)
    expect(avecRecente(l, { nom: 'defaut', fond: false })).toEqual(l)
  })

  it('se gardent, et se relisent', () => {
    const m = memoire()
    retenirCouleur({ nom: 'rose', fond: true }, m)
    retenirCouleur({ nom: 'vert', fond: false }, m)
    expect(lireRecentes(m)[0]).toEqual({ nom: 'vert', fond: false })
    expect(lireRecentes(m)[1]).toEqual({ nom: 'rose', fond: true })
  })

  it('un stockage abîmé redonne la couleur de départ', () => {
    expect(lireRecentes(memoire('pas du json'))).toEqual([COULEUR_DEPART])
    expect(lireRecentes(memoire('["fuchsia", 3]'))).toEqual([COULEUR_DEPART])
  })
})
