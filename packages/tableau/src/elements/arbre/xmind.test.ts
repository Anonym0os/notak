import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ajouterLimite, ajouterRelation, ajouterResume, porter } from './modele/elements'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './modele/sujets'
import { strFromU8, unzipSync } from 'fflate'
import { appliquerSquelette } from './modele/reglages'
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

  const feuilleEcrite = (octets: Uint8Array) => (JSON.parse(strFromU8(unzipSync(octets)['content.json']!)) as Record<string, unknown>[])[0]!

  it('le squelette de la carte s’écrit dans la feuille (identifiant, structures, style de chaque rang) et se relit', () => {
    let a = nouvelArbre('Projet')
    ;[a] = ajouterEnfant(a, lire(a).central, 'Idées')
    a = appliquerSquelette(a, 'carte-2')
    const octets = ecrireXmind([{ titre: 'Projet', arbre: a }])
    const f = feuilleEcrite(octets) as { theme: Record<string, any>; extensions: { provider: string; content: Record<string, string> }[]; style: { properties: Record<string, string> } }
    expect(f.theme.skeletonThemeId).toBe('6e8a0060db4a430f98c8d89f66')
    expect(f.theme.centralTopic.properties).toMatchObject({ 'line-class': 'org.xmind.branchConnection.roundedfold', 'line-width': '3pt', 'fo:font-size': '30pt', 'fo:font-family': 'Roboto' })
    expect(f.theme.mainTopic.properties).toMatchObject({ 'shape-class': 'org.xmind.topicShape.underline', 'line-class': 'org.xmind.branchConnection.bight' })
    expect(f.extensions.find((e) => e.provider === 'org.xmind.ui.skeleton.structure.style')!.content.centralTopic).toBe('org.xmind.ui.map.clockwise')
    expect(f.style.properties['line-tapered']).toBe('tapered')
    const relu = lireXmind(octets)[0]!.arbre
    expect(relu.squelette).toBe('carte-2')
    expect(relu.effile).toBe(true)
  })

  it('un identifiant de squelette inconnu n’en fait pas un squelette ; un squelette effilé sans « line-tapered » l’effile', () => {
    const feuille = { id: 's', class: 'sheet', title: 'x', rootTopic: { id: 'r', title: 'C' }, theme: { skeletonThemeId: 'inconnu' } }
    const octets = (f: unknown) => zipSync({ 'content.json': strToU8(JSON.stringify([f])), 'metadata.json': strToU8('{}'), 'manifest.json': strToU8('{"file-entries":{}}') })
    expect(lireXmind(octets(feuille))[0]!.arbre.squelette).toBeUndefined()
    const effile = lireXmind(octets({ ...feuille, theme: { skeletonThemeId: '6e8a0060db4a430f98c8d89f66' } }))[0]!.arbre
    expect(effile.squelette).toBe('carte-2')
    expect(effile.effile).toBe(true)
  })

  it('un squelette qu’une feuille avait déjà garde les styles de classe de la feuille', () => {
    const feuille = { id: 's', class: 'sheet', title: 'x', rootTopic: { id: 'r', title: 'C' }, theme: { skeletonThemeId: '8f137afe-a0f3-4f25-b56a-cfd05993ef4b', centralTopic: { properties: { 'fo:font-size': '99pt' } } } }
    const octets = zipSync({ 'content.json': strToU8(JSON.stringify([feuille])), 'metadata.json': strToU8('{}'), 'manifest.json': strToU8('{"file-entries":{}}') })
    const relu = lireXmind(octets)
    const f = feuilleEcrite(ecrireXmind(relu.map((x) => ({ titre: x.titre, arbre: x.arbre })))) as { theme: Record<string, any> }
    expect(f.theme.centralTopic.properties['fo:font-size']).toBe('99pt')
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
