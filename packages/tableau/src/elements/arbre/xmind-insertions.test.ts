import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../coeur/tableau'
import { cleVignette, fichiersDeLaCarte } from './exporter'
import { porter } from './modele/elements'
import { ajouterZone, ajouterMarqueurPerso, basculerLegende, creerGroupe, direMarqueur } from './modele/insertions'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './modele/sujets'
import { type ImageAExporter, ecrireXmind, lireXmind } from './xmind'

const lireZip = (o: Uint8Array) => unzipSync(o)
const octets = (s: string) => new TextEncoder().encode(s)

function carte() {
  let a: Arbre = nouvelArbre('Projet')
  const c = lire(a).central
  let x: Id, y: Id
  ;[a, x] = ajouterEnfant(a, c, 'Idées')
  ;[a, y] = ajouterEnfant(a, c, 'Suite')
  return { a, c, x, y }
}
const allerRetour = (a: Arbre, fichiers: ImageAExporter[] = []) =>
  lireXmind(ecrireXmind([{ titre: 'Projet', arbre: a }], new Map(fichiers.map((f) => [f.fichier, f]))))[0]!

describe('ce que la barre d’outils pose fait l’aller-retour .xmind', () => {
  it('la tâche planifiée, l’équation, la case annulée', () => {
    let { a, x, y } = carte()
    a = porter(a, [x], 'planning', { debut: '2026-03-02', fin: '2026-03-06', duree: 5, progression: 40 })
    a = porter(a, [x], 'equation', '\\frac{a}{b}')
    a = porter(a, [y], 'tache', 'annulee')
    const r = allerRetour(a)
    expect(r.arbre.sujets[x]!.planning).toEqual({ debut: '2026-03-02', fin: '2026-03-06', duree: 5, progression: 40 })
    expect(r.arbre.sujets[x]!.equation).toBe('\\frac{a}{b}')
    expect(r.arbre.sujets[y]!.tache).toBe('annulee')
  })

  it('les zones, la légende et les groupes de marqueurs à soi, avec leurs images', () => {
    let { a, x } = carte()
    let g: Id
    let m: string | null
    ;[a, g] = creerGroupe(a, 'Mes icônes')
    ;[a, m] = ajouterMarqueurPerso(a, g, { nom: 'logo', fichier: 'img1' })
    a = { ...a, sujets: { ...a.sujets, [x]: { ...a.sujets[x]!, marqueurs: [m!, 'flag-red'] } } }
    a = basculerLegende(a)
    a = direMarqueur(a, 'flag-red', 'Important')
    let z: Id
    ;[a, z] = ajouterZone(a, { x: 10, y: 20, l: 300, h: 200 }, 'Zone')
    const r = allerRetour(a, [{ fichier: 'img1', octets: octets('PNG'), extension: 'png' }])
    expect(r.arbre.zones![z]).toEqual({ x: 10, y: 20, l: 300, h: 200, titre: 'Zone' })
    expect(r.arbre.legende).toEqual({ visible: true, textes: { 'flag-red': 'Important' } })
    expect(r.arbre.groupes![g]).toMatchObject({ nom: 'Mes icônes', marqueurs: [{ id: m!.slice(6), nom: 'logo', fichier: '' }] })
    expect(r.arbre.sujets[x]!.marqueurs).toEqual([m, 'flag-red'])
    // L'image du marqueur est rendue pour être rangée dans les fichiers.
    expect(r.marqueurs).toHaveLength(1)
    expect(r.marqueurs[0]).toMatchObject({ groupe: g, marqueur: m!.slice(6) })
    expect(new TextDecoder().decode(r.marqueurs[0]!.octets)).toBe('PNG')
  })

  it('une pièce jointe et une note audio reviennent avec leur fichier ; le href est celui d’une pièce de Xmind', () => {
    let { a, x, y } = carte()
    a = porter(a, [x], 'piece', { fichier: 'doc1', nom: 'Cahier des charges.pdf', type: 'application/pdf', taille: 3 })
    a = porter(a, [y], 'piece', { fichier: 'voix1', nom: 'Note audio.webm', type: 'audio/webm', taille: 4, audio: true })
    const r = allerRetour(a, [
      { fichier: 'doc1', octets: octets('PDF'), extension: 'pdf' },
      { fichier: 'voix1', octets: octets('OGG!'), extension: 'webm' },
    ])
    expect(r.pieces).toHaveLength(2)
    const doc = r.pieces.find((p) => p.sujet === x)!
    expect(doc).toMatchObject({ nom: 'Cahier des charges.pdf', type: 'application/pdf', audio: false })
    expect(new TextDecoder().decode(doc.octets)).toBe('PDF')
    expect(r.pieces.find((p) => p.sujet === y)).toMatchObject({ audio: true, nom: 'Note audio.webm' })
    // Une pièce n'est pas un lien web.
    expect(r.arbre.sujets[x]!.lien).toBeUndefined()
  })

  it('une pièce jointe dans un fichier venu de Xmind (href xap:attachments/…) se lit', () => {
    let { a, x } = carte()
    a = porter(a, [x], 'piece', { fichier: 'doc1', nom: 'a.pdf', type: 'application/pdf', taille: 3 })
    // On retire notre extension : il ne reste que ce que Xmind écrit.
    const brut = JSON.parse(new TextDecoder().decode((lireZip(ecrireXmind([{ titre: 'P', arbre: a }], new Map([['doc1', { fichier: 'doc1', octets: octets('PDF'), extension: 'pdf' }]])))['content.json']!)))
    expect(brut[0].rootTopic.children.attached[0].href).toMatch(/^xap:attachments\/doc1\.pdf$/)
  })

  it('un autocollant garde sa nature à la relecture, et part en SVG pour que Xmind le voie ; une illustration de même', () => {
    let { a, x, y } = carte()
    a = porter(a, [x], 'vignette', { genre: 'autocollant', id: '🎉', l: 64, h: 64 })
    a = porter(a, [y], 'vignette', { genre: 'illustration', id: 'minimaliste.voyage.0', l: 64, h: 64 })
    const svgs = [x, y].map((id) => {
      const v = a.sujets[id]!.vignette!
      return { fichier: cleVignette(v), octets: octets('<svg/>'), extension: 'svg' }
    })
    const ecrit = ecrireXmind([{ titre: 'P', arbre: a }], new Map(svgs.map((f) => [f.fichier, f])))
    const fichiers = lireZip(ecrit)
    expect(Object.keys(fichiers).filter((n) => n.startsWith('resources/'))).toHaveLength(2)
    const r = lireXmind(ecrit)[0]!
    expect(r.arbre.sujets[x]!.vignette).toEqual({ genre: 'autocollant', id: '🎉', l: 64, h: 64 })
    expect(r.arbre.sujets[y]!.vignette!.genre).toBe('illustration')
    // L'image écrite pour Xmind ne devient pas une image de plus.
    expect(r.images).toHaveLength(0)
    expect(r.arbre.sujets[x]!.image).toBeUndefined()
  })

  it('les fichiers qu’une carte demande à l’export : images, pièces, images de marqueurs', () => {
    let { a, x, y } = carte()
    let g: Id
    a = porter(a, [x], 'image', { fichier: 'i1', l: 10, h: 10 })
    a = porter(a, [y], 'piece', { fichier: 'p1', nom: 'a.txt', type: 'text/plain', taille: 1 })
    ;[a, g] = creerGroupe(a, 'G')
    ;[a] = ajouterMarqueurPerso(a, g, { nom: 'm', fichier: 'm1' })
    expect(fichiersDeLaCarte(a).map((f) => f.fichier).sort()).toEqual(['i1', 'm1', 'p1'])
  })

  it('une carte sans rien de tout cela s’écrit comme avant : pas d’extension de feuille', () => {
    const { a } = carte()
    const brut = JSON.parse(new TextDecoder().decode(lireZip(ecrireXmind([{ titre: 'P', arbre: a }]))['content.json']!))
    expect(brut[0].extensions).toBeUndefined()
    const [b] = ajouterFlottant(a, { x: 1, y: 2 }, 'L')
    expect(allerRetour(b).arbre.zones).toBeUndefined()
  })
})
