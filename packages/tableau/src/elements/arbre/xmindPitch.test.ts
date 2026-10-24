import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'
import { poserDiapo, poserPitch } from './modele/pitch'
import { ecrireXmind, lireXmind } from './xmind'
import { ajouterDiapo, extraireDiapo } from './xmindPitch'

describe('les réglages du mode Pitch dans un .xmind', () => {
  it('lit et écrit les propriétés de style de Xmind, telles quelles', () => {
    const lu = extraireDiapo(
      {
        id: 's1',
        properties: {
          'topic-slide-visibility': 'skip',
          'list-slide-visibility': 'show',
          'list-slide-delivery': 'one-by-one-drill-in',
          'list-slide-layout': 'lyric-list',
          'topic-slide-image-placement': 'aboveTitle',
          'fo:font-size': '20pt',
        },
      },
      false,
    )
    expect(lu.diapo).toEqual({ sujet: 'masque', liste: 'visible', livraison: 'percer', miseEnPage: 'paroles', image: 'dessus' })
    // Ce que Notak ne lit pas reste dans le style.
    expect(lu.style).toEqual({ id: 's1', properties: { 'fo:font-size': '20pt' } })
    const retour = ajouterDiapo(lu.style, lu.diapo, undefined) as { properties: Record<string, string> }
    expect(retour.properties).toMatchObject({
      'topic-slide-visibility': 'skip',
      'list-slide-visibility': 'show',
      'list-slide-delivery': 'one-by-one-drill-in',
      'list-slide-layout': 'lyric-list',
      'topic-slide-image-placement': 'aboveTitle',
      'fo:font-size': '20pt',
    })
  })

  it('le thème et le rapport sont lus sur le sujet central seulement ; Auto et le thème par défaut n’écrivent rien', () => {
    const central = extraireDiapo({ properties: { 'slide-appearance': 'hand-drawn', 'slide-aspect-ratio': '4:3' } }, true)
    expect(central.pitch).toEqual({ theme: 'hand-drawn', ratio: '4:3' })
    expect(central.style).toBeUndefined()
    expect(extraireDiapo({ properties: { 'slide-appearance': 'default', 'slide-aspect-ratio': 'Auto' } }, true).pitch).toBeUndefined()
    // Sur un autre sujet, ces deux propriétés ne sont pas à Notak.
    expect(extraireDiapo({ properties: { 'slide-appearance': 'hand-drawn' } }, false).pitch).toBeUndefined()
  })

  it('une valeur inconnue reste dans le style, intacte', () => {
    const lu = extraireDiapo({ properties: { 'list-slide-layout': 'spiral-list', 'topic-slide-visibility': 'show' } }, false)
    expect(lu.diapo).toEqual({ sujet: 'visible' })
    expect(lu.style).toEqual({ properties: { 'list-slide-layout': 'spiral-list' } })
  })

  it('une carte de Notak fait l’aller-retour avec ses diapositives et son thème', () => {
    let a = nouvelArbre('Cours')
    const c = lire(a).central
    let p, q
    ;[a, p] = ajouterEnfant(a, c, 'Chapitre')
    ;[a, q] = ajouterEnfant(a, p, 'Point')
    a = poserDiapo(a, [p], { liste: 'visible', livraison: 'tout', miseEnPage: 'chronologie', image: 'fond' })
    a = poserDiapo(a, [q], { sujet: 'visible' })
    a = poserPitch(a, { theme: 'midnight-rose', ratio: '9:16' })
    const octets = ecrireXmind([{ titre: 'Cours', arbre: a }])
    // Dans le fichier : des propriétés de style, aux clés de Xmind.
    const feuilles = JSON.parse(strFromU8(unzipSync(octets)['content.json']!)) as { rootTopic: { style: { properties: Record<string, string> }; children: { attached: { id: string; style: { properties: Record<string, string> } }[] } } }[]
    expect(feuilles[0]!.rootTopic.style.properties).toMatchObject({ 'slide-appearance': 'midnight-rose', 'slide-aspect-ratio': '9:16' })
    expect(feuilles[0]!.rootTopic.children.attached[0]!.style.properties).toMatchObject({ 'list-slide-delivery': 'all-at-once', 'list-slide-layout': 'timeline', 'topic-slide-image-placement': 'full', 'list-slide-visibility': 'show' })
    const relu = lireXmind(octets)[0]!.arbre
    expect(relu.pitch).toEqual({ theme: 'midnight-rose', ratio: '9:16' })
    expect(relu.sujets[p]!.diapo).toEqual({ liste: 'visible', livraison: 'tout', miseEnPage: 'chronologie', image: 'fond' })
    expect(relu.sujets[q]!.diapo).toEqual({ sujet: 'visible' })
    expect(relu.sujets[c]!.xmind?.style).toBeUndefined()
  })

  it('un fichier de Xmind garde son style en passant par Notak', () => {
    const feuille = {
      id: 'f1',
      class: 'sheet',
      title: 'Démo',
      rootTopic: {
        id: 'r',
        title: 'Racine',
        style: { id: 'st', properties: { 'fo:font-family': 'Georgia', 'slide-appearance': 'innocence' } },
        children: { attached: [{ id: 'a', title: 'A', style: { id: 'sa', properties: { 'topic-slide-visibility': 'skip', 'svg:fill': '#FF0000' } } }] },
      },
    }
    const zip = zipSync({ 'content.json': strToU8(JSON.stringify([feuille])), 'metadata.json': strToU8('{}'), 'manifest.json': strToU8('{"file-entries":{}}') })
    const lu = lireXmind(zip)[0]!.arbre
    expect(lu.pitch).toEqual({ theme: 'innocence' })
    expect(lu.sujets['a']!.diapo).toEqual({ sujet: 'masque' })
    const sorti = JSON.parse(strFromU8(unzipSync(ecrireXmind([{ titre: 'Démo', arbre: lu }]))['content.json']!)) as (typeof feuille)[]
    // L'identifiant du style se refait à l'écriture ; ses propriétés reviennent telles quelles.
    expect(sorti[0]!.rootTopic.style.properties).toEqual(feuille.rootTopic.style.properties)
    expect(sorti[0]!.rootTopic.children.attached[0]!.style.properties).toEqual(feuille.rootTopic.children.attached[0]!.style.properties)
  })
})
