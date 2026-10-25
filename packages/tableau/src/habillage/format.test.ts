import { describe, expect, it } from 'vitest'
import { ErreurHabillage, lireHabillage, lireHabillageTexte, pileCss, POIDS_HABILLAGE_MAX } from './format'

const base = { notak: 'habillage', version: 1, id: 'essai', nom: 'Essai' }

const refus = (brut: unknown) => {
  try {
    lireHabillage(brut)
  } catch (e) {
    if (e instanceof ErreurHabillage) return { raison: e.raison, champ: e.champ }
    throw e
  }
  return null
}

describe('lireHabillage', () => {
  it('lit un habillage complet', () => {
    const h = lireHabillage({
      ...base,
      auteur: 'Samy',
      couleurs: { clair: { fond: '#f5f2ee', accent: 'oklch(48% 0.057 218)' }, sombre: { fond: 'rgb(0 12 18)' } },
      rayons: { carte: 10, controle: 10.04, panneau: 20 },
      polices: { texte: ['Inter', 'system-ui'], code: ['Fragment Mono', 'monospace'] },
      fontes: [{ famille: 'Fragment Mono', source: 'https://exemple.fr/fragment.woff2', graisse: '400' }],
      pitch: { fond: '#000c12', texte: '#eaf8fc', surbrillance: '#d8a173', graisseTitre: 700 },
      carte: { palette: ['#356673', '#d8a173', '#3fc168'] },
    })
    expect(h.couleurs?.clair?.accent).toBe('oklch(48% 0.057 218)')
    expect(h.rayons).toEqual({ carte: 10, controle: 10, panneau: 20 })
    expect(h.fontes?.[0]?.graisse).toBe('400')
    expect(h.pitch?.graisseTitre).toBe(700)
    expect(h.carte?.palette).toHaveLength(3)
  })

  it('se contente de l’en-tête, et ignore les clés inconnues', () => {
    expect(lireHabillage({ ...base, plusTard: { x: 1 } })).toEqual({ id: 'essai', nom: 'Essai' })
  })

  it('refuse ce qui n’est pas un habillage, ou d’une version plus récente', () => {
    expect(refus({ notak: 'autre' })?.raison).toBe('format')
    expect(refus([])?.raison).toBe('format')
    expect(refus({ ...base, version: 2 })?.raison).toBe('version')
  })

  it('refuse un identifiant qui n’est pas sûr, ou celui de Notak', () => {
    for (const id of ['Silak', 'a b', "x']{}", 'notak', '']) expect(refus({ ...base, id })?.champ).toBe('id')
  })

  it('nomme la valeur mal formée', () => {
    expect(refus({ ...base, couleurs: { clair: { fond: 'rouge' } } })?.champ).toBe('couleurs.clair.fond')
    expect(refus({ ...base, rayons: { panneau: 200 } })?.champ).toBe('rayons.panneau')
    expect(refus({ ...base, polices: { titre: ['Inter', 'x"; }'] } })?.champ).toBe('polices.titre.1')
    expect(refus({ ...base, carte: { palette: ['#fff'] } })?.champ).toBe('carte.palette')
    expect(refus({ ...base, pitch: { fond: '#000' } })?.champ).toBe('pitch.texte')
  })

  it('ne laisse rien sortir d’une valeur CSS', () => {
    for (const fond of ['#fff;}body{display:none', 'rgb(0 0 0);x', 'rgb(0 0 0) url(x)', 'var(--x)', 'oklch(1 1 1)}'])
      expect(refus({ ...base, couleurs: { clair: { fond } } })?.champ).toBe('couleurs.clair.fond')
  })

  it('ne charge une fonte que d’une adresse https ou embarquée', () => {
    const fonte = (source: string) => refus({ ...base, fontes: [{ famille: 'X', source }] })
    expect(fonte('https://exemple.fr/x.woff2')).toBeNull()
    expect(fonte('data:font/woff2;base64,d09GMgABAAAA')).toBeNull()
    for (const source of ['http://exemple.fr/x.woff2', 'javascript:alert(1)', 'https://x.fr/a")', 'data:text/css;base64,AAAA'])
      expect(fonte(source)?.champ).toBe('fontes.0.source')
  })
})

describe('lireHabillageTexte', () => {
  it('refuse un JSON abîmé ou un fichier trop lourd', () => {
    expect(() => lireHabillageTexte('{')).toThrow(expect.objectContaining({ raison: 'json' }))
    expect(() => lireHabillageTexte(' '.repeat(POIDS_HABILLAGE_MAX + 1))).toThrow(expect.objectContaining({ raison: 'poids' }))
  })
})

describe('pileCss', () => {
  it('met les familles entre guillemets, pas les mots-clés génériques', () => {
    expect(pileCss(['Familjen Grotesk', 'Inter', 'sans-serif'])).toBe('"Familjen Grotesk", "Inter", sans-serif')
  })
})
