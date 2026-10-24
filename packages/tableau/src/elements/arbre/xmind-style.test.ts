import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../coeur/tableau'
import { ajouterLimite, ajouterRelation, ajouterResume } from './modele/elements'
import { appliquerGeste } from './modele/gestes'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'
import { ecrireXmind, lireXmind } from './xmind'
import { couleurDepuis, ecrireStyleSujet, lireStyleSujet } from './xmind-style'

const titre = () => 'x'

/** Le contenu d'un fichier écrit : la première feuille. */
const feuille = (octets: Uint8Array) => (JSON.parse(strFromU8(unzipSync(octets)['content.json']!)) as Record<string, unknown>[])[0]!

describe('les propriétés de style d’un sujet', () => {
  it('se lisent dans les champs de Notak, et ce qu’on ne lit pas reste à part', () => {
    const { style, restes } = lireStyleSujet({
      'shape-class': 'org.xmind.topicShape.heart.compact',
      'fill-pattern': 'hachure-thin',
      'svg:fill': '#FF6B6BCC',
      'border-line-pattern': 'handdrawn-dash',
      'border-line-width': '3pt',
      'border-line-color': '#00F',
      'fo:font-family': 'Georgia, serif',
      'fo:font-size': '22pt',
      'fo:font-weight': 'bold',
      'fo:font-style': 'italic',
      'fo:text-decoration': 'line-through underline',
      'fo:text-transform': 'capitalize',
      'fo:text-align': 'right',
      'fo:color': '#112233',
      'line-class': 'org.xmind.branchConnection.roundedfold',
      'line-pattern': 'dash-dot-dot',
      'line-width': '5pt',
      'line-tapered': 'tapered',
      'line-color': '#abcdef',
      'arrow-end-class': 'org.xmind.arrowShape.herringbone',
      'multi-line-colors': '#FF0000 #00FF00 nope',
      'svg:opacity': '0.5',
    })
    expect(style).toEqual({
      forme: 'coeur',
      motifRemplissage: 'diagonales-fines',
      remplissage: '#ff6b6bcc',
      motifBordure: 'tirets-main',
      epaisseurBordure: 3,
      bordure: '#0000ff',
      police: 'Georgia, serif',
      taille: 22,
      graisse: 700,
      italique: true,
      barre: true,
      souligne: true,
      casse: 'capitales',
      alignement: 'droite',
      couleurTexte: '#112233',
      branche: 'pli-arrondi',
      motif: 'tiret-point-point',
      epaisseurBranche: 5,
      effilee: true,
      couleurBranche: '#abcdef',
      pointeBranche: 'chevrons',
      serieCouleurs: ['#ff0000', '#00ff00'],
    })
    expect(restes).toEqual({ 'svg:opacity': '0.5' })
  })

  it('la police NeverMind de Xmind ne passe pas : Notak garde la sienne, ou la suivante de la pile', () => {
    expect(lireStyleSujet({ 'fo:font-family': 'NeverMind' }).style.police).toBeUndefined()
    expect(lireStyleSujet({ 'fo:font-family': "'NeverMind','Microsoft YaHei','sans-serif'" }).style.police).toBe("'Microsoft YaHei', 'sans-serif'")
    expect(lireStyleSujet({ 'fo:font-family': "'Montserrat','NeverMind',sans-serif" }).style.police).toBe("'Montserrat', sans-serif")
    expect(lireStyleSujet({ 'fo:font-family': 'Fira Sans' }).style.police).toBe('"Fira Sans", ui-sans-serif, system-ui, sans-serif')
  })

  it('une valeur illisible reste dans le fichier au lieu d’être perdue', () => {
    const { style, restes } = lireStyleSujet({ 'svg:fill': 'rgb(1,2,3)', 'line-width': 'beaucoup', 'shape-class': 'org.xmind.topicShape.inconnue' })
    expect(style).toEqual({})
    expect(Object.keys(restes)).toEqual(['svg:fill', 'line-width', 'shape-class'])
  })

  it('s’écrivent comme Xmind les écrit : points, majuscules, classes', () => {
    expect(ecrireStyleSujet({ forme: 'arrondi', remplissage: '#ff6b6b', taille: 18, graisse: 500, barre: true, souligne: true, motifBordure: 'aucun', pointeBranche: 'fer-de-lance', effilee: true, serieCouleurs: ['#aabbcc', '#112233'] })).toEqual({
      'shape-class': 'org.xmind.topicShape.roundedRect',
      'svg:fill': '#FF6B6B',
      'border-line-pattern': 'none',
      'line-tapered': 'tapered',
      'arrow-end-class': 'org.xmind.arrowShape.spearhead',
      'multi-line-colors': '#AABBCC #112233',
      'fo:font-size': '18pt',
      'fo:font-weight': '500',
      'fo:text-decoration': 'line-through underline',
    })
  })

  it('les couleurs courtes se développent', () => {
    expect(couleurDepuis('#0f0')).toBe('#00ff00')
    expect(couleurDepuis('#ABCDEF12')).toBe('#abcdef12')
    expect(couleurDepuis('rouge')).toBeUndefined()
  })
})

describe('l’aller-retour .xmind du style', () => {
  function carte() {
    let a: Arbre = nouvelArbre('Centre')
    const c = lire(a).central
    let p: Id, q: Id
    ;[a, p] = ajouterEnfant(a, c, 'Alpha')
    ;[a, q] = ajouterEnfant(a, c, 'Beta')
    a = appliquerGeste(a, { type: 'style', ids: [p], style: { forme: 'nuage', remplissage: '#ffcc00cc', motifRemplissage: 'horizontales', taille: 24, graisse: 300, italique: true, casse: 'majuscules', alignement: 'droite', motif: 'tirets', pointeBranche: 'diamant', epaisseurBranche: 3 } }, titre)!.arbre
    a = appliquerGeste(a, { type: 'largeur', ids: [p], largeur: 210 }, titre)!.arbre
    a = appliquerGeste(a, { type: 'porter', ids: [p], champ: 'numerotation', valeur: { motif: 'arabe', paliers: true, debut: true } }, titre)!.arbre
    return { a, c, p, q }
  }

  it('un sujet, sa largeur et sa numérotation reviennent tels quels', () => {
    const { a, p } = carte()
    const relu = lireXmind(ecrireXmind([{ titre: 't', arbre: a }]))[0]!.arbre
    expect(relu.sujets[p]!.style).toEqual(a.sujets[p]!.style)
    expect(relu.sujets[p]!.largeur).toBe(210)
    expect(relu.sujets[p]!.numerotation).toEqual({ motif: 'arabe', paliers: true, debut: true })
  })

  it('un style vide n’écrit pas de propriétés', () => {
    const { a, q } = carte()
    const t = (feuille(ecrireXmind([{ titre: 't', arbre: a }])).rootTopic as { children: { attached: Record<string, unknown>[] } }).children.attached
    expect(t.find((x) => x.id === q)!.style).toBeUndefined()
  })

  it('une relation, une limite et un résumé gardent leur style', () => {
    const { a, p, q } = carte()
    let b: Arbre, r: Id | null, x: Id | null
    ;[b, r] = ajouterRelation(a, p, q)
    ;[b, x] = ajouterLimite(b, [p])
    b = appliquerGeste(b, { type: 'styleObjet', ids: [r!], style: { forme: 'zigzag-souple', motif: 'tiret-point', epaisseur: 4, couleur: '#aa00aa', pointeDepart: 'point', pointeArrivee: 'crochet', taille: 15, graisse: 700 } }, titre)!.arbre
    b = appliquerGeste(b, { type: 'styleObjet', ids: [x!], style: { forme: 'vagues', remplissage: '#00ff0033', motifRemplissage: 'plein-main', motif: 'main', epaisseur: 2, couleur: '#0000ff', casse: 'minuscules' } }, titre)!.arbre
    ;[b] = ajouterResume(b, [p, q], 'R')
    const rid = Object.keys(b.resumes!)[0]!
    b = appliquerGeste(b, { type: 'styleObjet', ids: [rid], style: { forme: 'angle', motif: 'tirets-main', epaisseur: 6, couleur: '#101010' } }, titre)!.arbre
    const relu = lireXmind(ecrireXmind([{ titre: 't', arbre: b }]))[0]!.arbre
    expect(relu.relations![r!]!.style).toEqual(b.relations![r!]!.style)
    expect(relu.limites![x!]!.style).toEqual(b.limites![x!]!.style)
    expect(relu.resumes![rid]!.style).toEqual(b.resumes![rid]!.style)
  })

  it('un seul couleur de branche : multi-line-colors vaut none, et revient comme tel', () => {
    const { a } = carte()
    const b = appliquerGeste(a, { type: 'options', options: { uneCouleur: true } }, titre)!.arbre
    const c = feuille(ecrireXmind([{ titre: 't', arbre: b }])).rootTopic as { style: { properties: Record<string, string> } }
    expect(c.style.properties['multi-line-colors']).toBe('none')
    expect(lireXmind(ecrireXmind([{ titre: 't', arbre: b }]))[0]!.arbre.options?.uneCouleur).toBe(true)
  })

  it('les propriétés qu’on ne lit pas restent dans le fichier, même après un changement de style', () => {
    const contenu = [
      {
        id: 'f1',
        class: 'sheet',
        title: 'T',
        rootTopic: {
          id: 'r',
          class: 'topic',
          title: 'Racine',
          customWidth: 180,
          style: { id: 's1', properties: { 'svg:fill': '#112233', 'fo:letter-spacing': '2pt', 'svg:opacity': '0.4' } },
          children: { attached: [{ id: 'e', title: 'Enfant' }] },
        },
      },
    ]
    const octets = zipSync({ 'content.json': strToU8(JSON.stringify(contenu)), 'metadata.json': strToU8('{}'), 'manifest.json': strToU8('{}') })
    const [lue] = lireXmind(octets)
    const racine = lue!.arbre.sujets.r!
    expect(racine.style).toEqual({ remplissage: '#112233' })
    expect(racine.largeur).toBe(180)
    expect(racine.xmind?.style).toEqual({ id: 's1', properties: { 'fo:letter-spacing': '2pt', 'svg:opacity': '0.4' } })
    // On change la couleur : l’inconnu repart avec.
    const modifie = appliquerGeste(lue!.arbre, { type: 'style', ids: ['r'], style: { remplissage: '#abcdef', taille: 20 } }, titre)!.arbre
    const sortie = feuille(ecrireXmind([{ titre: 'T', arbre: modifie }])).rootTopic as { customWidth: number; style: { id: string; properties: Record<string, string> } }
    expect(sortie.customWidth).toBe(180)
    expect(sortie.style.id).toBe('s1')
    expect(sortie.style.properties).toEqual({ 'svg:fill': '#ABCDEF', 'fo:font-size': '20pt', 'fo:letter-spacing': '2pt', 'svg:opacity': '0.4' })
    // On réinitialise : le style de Notak part, l’inconnu reste.
    const remis = appliquerGeste(modifie, { type: 'style', ids: ['r'], style: null }, titre)!.arbre
    const nu = feuille(ecrireXmind([{ titre: 'T', arbre: remis }])).rootTopic as { style: { properties: Record<string, string> } }
    expect(nu.style.properties).toEqual({ 'fo:letter-spacing': '2pt', 'svg:opacity': '0.4' })
  })

  it('un ancien sujet importé garde ses propriétés dans son sac (rien n’est perdu à l’export)', () => {
    const contenu = [{ id: 'f', class: 'sheet', title: 'T', rootTopic: { id: 'r', class: 'topic', title: 'R', style: { properties: { 'svg:fill': '#112233' } } } }]
    const octets = zipSync({ 'content.json': strToU8(JSON.stringify(contenu)) })
    const [lue] = lireXmind(octets)
    // Un fichier d'avant l'onglet Style : son sujet n'a que son sac.
    const ancien: Arbre = { ...lue!.arbre, sujets: { r: { ...lue!.arbre.sujets.r!, style: undefined, xmind: { style: { properties: { 'svg:fill': '#112233' } } } } } }
    const sortie = feuille(ecrireXmind([{ titre: 'T', arbre: ancien }])).rootTopic as { style: { properties: Record<string, string> } }
    expect(sortie.style.properties).toEqual({ 'svg:fill': '#112233' })
  })
})

/** La copie locale de Xmind (docs/XMIND.md), hors du dépôt : ses modèles servent d'épreuve. */
const XMIND = join(process.env.HOME ?? '', 'Documents/CODE/notak-chantiers/xmind-26.05/static')
function fichiersXmind(dossier: string): string[] {
  if (!existsSync(dossier)) return []
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n)
    return statSync(p).isDirectory() ? fichiersXmind(p) : n.endsWith('.xmind') ? [p] : []
  })
}

describe('les modèles livrés avec Xmind', () => {
  const modeles = fichiersXmind(XMIND)
  it.skipIf(modeles.length === 0)('se lisent avec leur style, et le relisent identique après un aller-retour', () => {
    let stylises = 0
    for (const chemin of modeles) {
      const feuilles = lireXmind(new Uint8Array(readFileSync(chemin)))
      const relues = lireXmind(ecrireXmind(feuilles.map((f) => ({ titre: f.titre, arbre: f.arbre }))))
      feuilles.forEach((f, i) => {
        const [avant, apres] = [f.arbre, relues[i]!.arbre]
        for (const [id, s] of Object.entries(avant.sujets)) {
          expect(apres.sujets[id]?.style, chemin).toEqual(s.style)
          expect(apres.sujets[id]?.largeur, chemin).toEqual(s.largeur)
          if (s.style) stylises++
        }
        expect(apres.relations, chemin).toEqual(avant.relations)
        expect(apres.limites, chemin).toEqual(avant.limites)
        expect(apres.resumes, chemin).toEqual(avant.resumes)
        expect(apres.options, chemin).toEqual(avant.options)
      })
    }
    // Au moins quelques sujets de ces modèles portent un style que Notak lit.
    expect(stylises).toBeGreaterThan(0)
  })
})
