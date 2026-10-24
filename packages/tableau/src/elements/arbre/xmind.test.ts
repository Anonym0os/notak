import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ajouterLimite, ajouterRelation, ajouterResume, porter } from './modele/elements'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './modele/sujets'
import { ecrireXmind, lireXmind, resumeDeCarte, structureDepuis } from './xmind'

/** La copie locale de Xmind (docs/XMIND.md), hors du dépôt : ses modèles servent d'épreuve d'aller-retour. */
const XMIND = join(process.env.HOME ?? '', 'Documents/CODE/notak-chantiers/xmind-26.05/static')

function fichiersXmind(dossier: string): string[] {
  if (!existsSync(dossier)) return []
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n)
    return statSync(p).isDirectory() ? fichiersXmind(p) : n.endsWith('.xmind') ? [p] : []
  })
}

describe('le format .xmind', () => {
  it('lit les structures de Xmind, et la famille la plus proche pour une variante inconnue', () => {
    expect(structureDepuis('org.xmind.ui.map.clockwise')).toBe('carte-horaire')
    expect(structureDepuis('org.xmind.ui.logic-chart.left')).toBe('logique-gauche')
    expect(structureDepuis('org.xmind.ui.tree.branch-aligned.right')).toBe('arbre-droite')
    expect(structureDepuis('org.xmind.ui.grid')).toBeUndefined()
  })

  it('un ancien fichier (content.xml seul) est refusé en le disant', () => {
    expect(() => lireXmind(zipSync({ 'content.xml': strToU8('<xmap-content/>') }))).toThrow('xmind-ancien')
  })

  it('une carte de Notak fait l’aller-retour sans rien perdre de ce que Xmind sait garder', () => {
    let a = nouvelArbre('Projet')
    const c = lire(a).central
    let x, y, z
    ;[a, x] = ajouterEnfant(a, c, 'Idées')
    ;[a, y] = ajouterEnfant(a, x, 'Une')
    ;[a, z] = ajouterEnfant(a, x, 'Deux')
    ;[a] = ajouterFlottant(a, { x: 300, y: -120 }, 'Libre')
    ;[a] = ajouterRelation(a, y, z)
    ;[a] = ajouterLimite(a, [y, z])
    ;[a] = ajouterResume(a, [y, z], 'En bref')
    a = porter(a, [y], 'etiquettes', ['à faire'])
    a = porter(a, [x], 'numerotation', { motif: 'romain' })
    a = porter(a, [z], 'tache', 'faite')
    a = porter(a, [z], 'lien', `sujet:${y}`)
    const relu = lireXmind(ecrireXmind([{ titre: 'Projet', arbre: a }]))[0]!
    expect(resumeDeCarte(relu.arbre)).toEqual(resumeDeCarte(a))
    expect(relu.arbre.sujets[y]!.etiquettes).toEqual(['à faire'])
    expect(relu.arbre.sujets[x]!.numerotation).toEqual({ motif: 'romain' })
    expect(relu.arbre.sujets[z]!.tache).toBe('faite')
    expect(relu.arbre.sujets[z]!.lien).toBe(`sujet:${y}`)
  })

  const modeles = fichiersXmind(XMIND)
  it.skipIf(modeles.length === 0)(`les ${modeles.length || 'quelques'} modèles livrés avec Xmind se lisent, et font l’aller-retour à l’identique`, () => {
    for (const chemin of modeles) {
      const feuilles = lireXmind(new Uint8Array(readFileSync(chemin)))
      expect(feuilles.length, chemin).toBeGreaterThan(0)
      const relues = lireXmind(ecrireXmind(feuilles.map((f) => ({ titre: f.titre, arbre: f.arbre }))))
      expect(relues.map((f) => resumeDeCarte(f.arbre)), chemin).toEqual(feuilles.map((f) => resumeDeCarte(f.arbre)))
    }
  })
})
