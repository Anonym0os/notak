import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Arbre } from '../../coeur/tableau'
import { docDepuisTexte } from '../../coeur/tableau'
import { porter } from './modele/elements'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'
import { ecrireXmind, lireXmind } from './xmind'

/** Une carte à deux sujets, avec une note ; `reglages` : ce que l'onglet Carte y a posé. */
function carte(reglages: Partial<Arbre> = {}): Arbre {
  let a = nouvelArbre('Centre')
  const c = lire(a).central
  let p: string
  ;[a, p] = ajouterEnfant(a, c, 'Un')
  a = porter(a, [p], 'note', docDepuisTexte('Une note'))
  return { ...a, ...reglages }
}

/** La feuille écrite pour une carte, telle que Xmind la lirait. */
function feuille(a: Arbre): Record<string, unknown> {
  const zip = unzipSync(ecrireXmind([{ titre: 'T', arbre: a }]))
  return (JSON.parse(strFromU8(zip['content.json']!)) as Record<string, unknown>[])[0]!
}

const relire = (a: Arbre): Arbre => lireXmind(ecrireXmind([{ titre: 'T', arbre: a }]))[0]!.arbre
const proprietes = (o: unknown): Record<string, unknown> => ((o as { properties?: Record<string, unknown> } | undefined)?.properties ?? {})

describe('les clés de l’onglet Carte dans un .xmind', () => {
  it('une carte sans réglage n’écrit aucune de ces clés', () => {
    const f = feuille(carte())
    for (const cle of ['topicPositioning', 'compactLayoutModeLevel', 'topicOverlapping', 'floatingTopicFlexible', 'relationshipAutoColor', 'floatingTopicAutoColor', 'topicNotesDisplay', 'style', 'theme'])
      expect(f, cle).not.toHaveProperty(cle)
    expect(proprietes((f.rootTopic as Record<string, unknown>).style)).toEqual({})
    expect(relire(carte()).options).toBeUndefined()
  })

  it('chaque réglage tout ou rien s’écrit avec la clé et la valeur de Xmind', () => {
    const f = feuille(
      carte({ options: { libre: true, compacte: true, chevauchement: true, flottantSouple: true, relationsColorees: true, flottantsColores: true, toutesNotes: true, uniforme: true } }),
    )
    expect(f.topicPositioning).toBe('free')
    expect(f.compactLayoutModeLevel).toBe('Second')
    expect(f.topicOverlapping).toBe('overlap')
    expect(f.floatingTopicFlexible).toBe(true)
    expect(f.relationshipAutoColor).toBe('follow-target-topic')
    expect(f.floatingTopicAutoColor).toBe('follow-color-theme')
    expect(f.topicNotesDisplay).toBe('block')
    const racine = f.rootTopic as { style: unknown; children: { attached: { notesDisplay?: string }[] } }
    expect(proprietes(racine.style)['alignment-by-level']).toBe('actived')
    expect(racine.children.attached[0]!.notesDisplay).toBe('block')
  })

  it('et se relit à l’identique', () => {
    const options = { libre: true, compacte: true, chevauchement: true, flottantSouple: true, relationsColorees: true, flottantsColores: true, toutesNotes: true, uniforme: true }
    expect(relire(carte({ options })).options).toEqual(options)
  })

  it('le fond, les polices, la largeur, l’effilement et le jeu de couleurs sont écrits dans le style de la feuille', () => {
    const f = feuille(carte({ fond: '#ffeecc', police: 'Verdana', policeCjk: 'Yu Gothic', largeurBranche: 5, effile: true, jeuCouleurs: ['#111111', '#222222', '#333333'] }))
    expect(proprietes(f.style)).toMatchObject({ 'svg:fill': '#ffeecc', 'cjk-font-family': 'Yu Gothic', 'line-tapered': 'tapered', 'multi-line-colors': '#111111 #222222 #333333' })
    expect(proprietes((f.theme as { global: unknown }).global)).toEqual({ 'fo:font-family': 'Verdana', 'line-width': '5pt' })
  })

  it('et se relisent à l’identique', () => {
    const reglages = { fond: '#ffeecc80', police: 'Verdana', policeCjk: 'Yu Gothic', largeurBranche: 5, effile: true, jeuCouleurs: ['#111111', '#222222', '#333333'] }
    const r = relire(carte(reglages))
    for (const [cle, valeur] of Object.entries(reglages)) expect(r[cle as keyof Arbre], cle).toEqual(valeur)
  })

  it('sans branches de couleur : « none » dans la feuille, et la couleur de ligne sur le central', () => {
    const f = feuille(carte({ options: { uneCouleur: true }, couleurLigne: '#abcdef' }))
    expect(proprietes(f.style)['multi-line-colors']).toBe('none')
    expect(proprietes((f.rootTopic as { style: unknown }).style)['line-color']).toBe('#abcdef')
    const r = relire(carte({ options: { uneCouleur: true }, couleurLigne: '#abcdef' }))
    expect(r.options?.uneCouleur).toBe(true)
    expect(r.couleurLigne).toBe('#abcdef')
  })

  it('allumer de nouveau les branches de couleur retire « none »', () => {
    expect(proprietes(feuille(carte()).style)).not.toHaveProperty('multi-line-colors')
  })
})

/** Un fichier de Xmind : une feuille écrite à la main, avec les clés de l'onglet Map. */
function fichier(feuilleXmind: Record<string, unknown>): Uint8Array {
  const f = { id: 's1', class: 'sheet', title: 'Feuille', rootTopic: { id: 'r', class: 'topic', title: 'Centre', structureClass: 'org.xmind.ui.map.clockwise', children: { attached: [{ id: 'a', title: 'Un', notes: { plain: { content: 'N' } } }] } }, ...feuilleXmind }
  return zipSync({ 'content.json': strToU8(JSON.stringify([f])), 'metadata.json': strToU8('{}'), 'manifest.json': strToU8('{"file-entries":{"content.json":{}}}') })
}

describe('lire une feuille de Xmind', () => {
  it('une feuille sans réglage : tout est éteint, branches de couleur comprises', () => {
    const a = lireXmind(fichier({}))[0]!.arbre
    expect(a.options).toBeUndefined()
    expect(a.fond).toBeUndefined()
    expect(a.police).toBeUndefined()
  })

  it('« Third » veut dire carte normale, « Second » carte compacte ; un 1 des premiers fichiers de Notak aussi', () => {
    expect(lireXmind(fichier({ compactLayoutModeLevel: 'Third' }))[0]!.arbre.options?.compacte).toBeUndefined()
    expect(lireXmind(fichier({ compactLayoutModeLevel: 'Second' }))[0]!.arbre.options?.compacte).toBe(true)
    expect(lireXmind(fichier({ compactLayoutModeLevel: 1 }))[0]!.arbre.options?.compacte).toBe(true)
  })

  it('lit chaque réglage de l’onglet Map', () => {
    const a = lireXmind(
      fichier({
        topicPositioning: 'free',
        topicOverlapping: 'overlap',
        floatingTopicFlexible: true,
        relationshipAutoColor: 'follow-target-topic',
        floatingTopicAutoColor: 'follow-color-theme',
        topicNotesDisplay: 'block',
        style: { id: 'x', properties: { 'svg:fill': '#102030', 'multi-line-colors': 'none', 'line-tapered': 'tapered', 'cjk-font-family': 'SimSun' } },
        theme: { global: { id: 'g', properties: { 'fo:font-family': 'Arvo', 'line-width': '8pt' } } },
      }),
    )[0]!.arbre
    expect(a).toMatchObject({ fond: '#102030', police: 'Arvo', policeCjk: 'SimSun', largeurBranche: 8, effile: true })
    expect(a.options).toEqual({ libre: true, chevauchement: true, flottantSouple: true, relationsColorees: true, flottantsColores: true, toutesNotes: true, uneCouleur: true })
  })

  it('le jeu de couleurs des branches vient de « multi-line-colors » ; une valeur qui n’est pas une couleur est ignorée', () => {
    expect(lireXmind(fichier({ style: { id: 'x', properties: { 'multi-line-colors': '#aa0000 #00aa00 #0000aa' } } }))[0]!.arbre.jeuCouleurs).toEqual(['#aa0000', '#00aa00', '#0000aa'])
    const mauvais = lireXmind(fichier({ style: { id: 'x', properties: { 'svg:fill': 'rouge', 'multi-line-colors': 'nimportequoi' } } }))[0]!.arbre
    expect(mauvais.fond).toBeUndefined()
    expect(mauvais.jeuCouleurs).toBeUndefined()
  })

  it('« Uniform Topic Length » vient du style du sujet central', () => {
    const racine = { id: 'r', class: 'topic', title: 'C', style: { id: 's', properties: { 'alignment-by-level': 'actived' } } }
    expect(lireXmind(fichier({ rootTopic: racine }))[0]!.arbre.options?.uniforme).toBe(true)
  })
})

describe('un aller-retour n’abîme pas ce que Notak ne lit pas', () => {
  const theme = { id: 't', global: { id: 'g', properties: { 'fo:font-family': 'Arvo', color: 'red' } }, mainTopic: { id: 'm', properties: { 'fo:font-size': '20pt' } }, colorThemeId: 'Dawn-#ffffff-MULTI_LINE_COLORS' }
  const style = { id: 'x', properties: { 'svg:fill': '#102030', 'color-list': '#111111 #222222' } }
  const entree = { theme, style, extensions: [{ provider: 'perso', content: 1 }], topicPositioning: 'free' }

  it('le thème, le style et les extensions de la feuille ressortent', () => {
    const f = feuille(lireXmind(fichier(entree))[0]!.arbre)
    expect((f.theme as { mainTopic: unknown }).mainTopic).toEqual({ id: 'm', properties: { 'fo:font-size': '20pt' } })
    expect((f.theme as { colorThemeId: string }).colorThemeId).toBe('Dawn-#ffffff-MULTI_LINE_COLORS')
    expect(proprietes((f.theme as { global: unknown }).global)).toEqual({ 'fo:font-family': 'Arvo', color: 'red' })
    expect(proprietes(f.style)).toMatchObject({ 'color-list': '#111111 #222222', 'svg:fill': '#102030' })
    expect(f.extensions).toEqual([{ provider: 'perso', content: 1 }])
  })

  it('ce que Notak règle l’emporte sur le sac : une police ôtée ne revient pas', () => {
    let a = lireXmind(fichier(entree))[0]!.arbre
    const { police: _p, fond: _f, ...sans } = a
    a = sans
    const f = feuille(a)
    expect(proprietes((f.theme as { global: unknown }).global)).toEqual({ color: 'red' })
    expect(proprietes(f.style)).not.toHaveProperty('svg:fill')
  })

  it('le sac d’une feuille qui change n’est pas modifié par l’écriture', () => {
    const a = lireXmind(fichier(entree))[0]!.arbre
    const avant = JSON.stringify(a.xmind)
    feuille({ ...a, fond: '#ffffff', police: 'Georgia' })
    expect(JSON.stringify(a.xmind)).toBe(avant)
  })
})
