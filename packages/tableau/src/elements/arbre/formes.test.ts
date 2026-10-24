import { describe, expect, it } from 'vitest'
import type { FormeSujet } from '../../coeur/tableau'
import { FORMES, FORMES_LIMITE, FORMES_RESUME, GROUPES_FORMES, cheminResume, contourForme, contourLimite, formeCarree, formeDepuisXmind, margesForme, xmindDeForme } from './formes'
import { POINTES, cheminPointe, pointeDepuisXmind, xmindDePointe } from './trace/pointes'

describe('les formes de sujet', () => {
  it('comptent quatre groupes (12, 13, 7 et 15 formes), sans doublon', () => {
    expect(GROUPES_FORMES).toEqual(['basique', 'avance', 'ponctuation', 'organigramme'])
    expect(GROUPES_FORMES.map((g) => FORMES.filter((f) => f.groupe === g).length)).toEqual([12, 13, 7, 15])
    expect(new Set(FORMES.map((f) => f.id)).size).toBe(FORMES.length)
    expect(new Set(FORMES.map((f) => f.xmind)).size).toBe(FORMES.length)
  })

  it('se dessinent toutes, dans un cadre de 120 × 40, avec des chemins sans nombre perdu', () => {
    for (const f of FORMES) {
      if (f.id === 'souligne' || f.id === 'double-souligne') continue
      const { d, trait } = contourForme(f.id, 120, 40)
      expect(d ?? trait, f.id).toMatch(/^M/)
      expect(`${d}${trait}`, f.id).not.toMatch(/NaN|undefined|Infinity/)
    }
  })

  it('un signe de ponctuation se compose d’un fond et de traits', () => {
    const { d, trait } = contourForme('parentheses', 100, 30)
    expect(d).toBe('M0 0H100V30H0Z')
    expect(trait).toMatch(/Q/)
  })

  it('le cercle et le double cercle tiennent dans un carré', () => {
    expect(formeCarree('cercle')).toBe(true)
    expect(formeCarree('double-cercle')).toBe(true)
    expect(formeCarree('ellipse')).toBe(false)
  })

  it('une ellipse élargit les marges du texte, un rectangle non', () => {
    expect(margesForme('rectangle', [8, 14])).toEqual([8, 14])
    const [v, h] = margesForme('ellipse', [8, 14])
    expect(v).toBeGreaterThan(8)
    expect(h).toBeGreaterThan(14)
  })

  it('font l’aller-retour avec les classes du format .xmind', () => {
    expect(xmindDeForme('arrondi')).toBe('org.xmind.topicShape.roundedRect')
    expect(xmindDeForme('trapeze-inverse')).toBe('org.xmind.topicShape.trapezoid.inverse')
    for (const f of FORMES) expect(formeDepuisXmind(xmindDeForme(f.id)), f.id).toBe(f.id)
    expect(formeDepuisXmind('org.xmind.topicShape.inconnue')).toBeUndefined()
    expect(formeDepuisXmind(undefined)).toBeUndefined()
  })
})

describe('les formes de limite et de résumé', () => {
  it('se dessinent toutes', () => {
    expect(FORMES_LIMITE.map((f) => f.id)).toEqual(['rectangle', 'arrondi', 'polygone', 'festons', 'vagues', 'tension', 'polygone-arrondi', 'focus', 'croix'])
    for (const f of FORMES_LIMITE) {
      const { d } = contourLimite(f.id, 10, 20, 200, 90)
      expect(d, f.id).toMatch(/^M/)
      expect(d, f.id).not.toMatch(/NaN/)
    }
    expect(contourLimite('focus', 0, 0, 100, 50).equerres).toMatch(/^M/)
  })

  it('une accolade de résumé change de forme, et sa pointe regarde le sujet', () => {
    const chemins = FORMES_RESUME.map((f) => cheminResume(f.id, 100, 0, 80, 1))
    expect(new Set(chemins).size).toBe(5)
    expect(cheminResume('droite', 100, 0, 80, 1)).toContain('V80')
    // Le sujet est à droite de la plage (sens -1) : la tige part vers la droite.
    expect(cheminResume('carre', 100, 0, 80, -1)).toMatch(/H110$/)
  })
})

describe('les pointes de trait', () => {
  it('sont onze, dans l’ordre du panneau de Xmind', () => {
    expect(POINTES.map((p) => p.xmind)).toEqual(['none', 'dot', 'triangle', 'spearhead', 'square', 'diamond', 'herringbone', 'doublearrow', 'antiTriangle', 'attached', 'hook'])
  })

  it('« aucune » ne dessine rien ; les autres finissent à l’endroit demandé', () => {
    expect(cheminPointe('aucune', 10, 10, 0, 9)).toBeNull()
    const t = cheminPointe('triangle', 100, 50, 0, 10)!
    expect(t.plein).toBe(true)
    expect(t.d).toMatch(/^M100 50L90 45L90 55Z$/)
    // Tournée d’un quart de tour : la pointe regarde vers le bas.
    expect(cheminPointe('triangle', 100, 50, Math.PI / 2, 10)!.d).toMatch(/^M100 50L105 40L95 40Z$/)
    expect(cheminPointe('chevrons', 0, 0, 0, 10)!.plein).toBe(false)
    for (const p of POINTES.slice(1)) expect(cheminPointe(p.id, 5, 5, 1, 9)!.d, p.id).not.toMatch(/NaN/)
  })

  it('font l’aller-retour avec arrow-end-class', () => {
    expect(xmindDePointe('fer-de-lance')).toBe('org.xmind.arrowShape.spearhead')
    for (const p of POINTES) expect(pointeDepuisXmind(xmindDePointe(p.id))).toBe(p.id)
    expect(pointeDepuisXmind('org.xmind.arrowShape.inconnue')).toBeUndefined()
  })
})

// Pour qu'un oubli d'identifiant se voie à la compilation.
const _tous: FormeSujet[] = FORMES.map((f) => f.id)
void _tous
