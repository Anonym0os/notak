import { describe, expect, it } from 'vitest'
import { lireApercu } from './lireApercu'

const base = 'https://exemple.fr/blog/article'

describe('lireApercu', () => {
  it('préfère og:* et rend les adresses absolues', () => {
    const html = `<html><head>
      <title>Titre de la page</title>
      <meta property="og:title" content="Titre &amp; co">
      <meta property="og:description" content='Une "belle" page'>
      <meta property="og:image" content="/img/a.png">
      <meta property="og:site_name" content="Exemple">
      <meta name="twitter:title" content="Autre">
      <link rel="shortcut icon" href="icone.ico">
    </head><body></body></html>`
    expect(lireApercu(html, base)).toEqual({
      titre: 'Titre & co',
      description: 'Une "belle" page',
      image: 'https://exemple.fr/img/a.png',
      site: 'Exemple',
      favicon: 'https://exemple.fr/blog/icone.ico',
    })
  })
  it('se rabat sur twitter:*, <title> et /favicon.ico', () => {
    const html = `<head><meta name="twitter:image" content="https://cdn.fr/x.jpg"><meta name="description" content="D">
      <title>
        Mon   titre </title></head>`
    expect(lireApercu(html, base)).toEqual({
      titre: 'Mon titre',
      description: 'D',
      image: 'https://cdn.fr/x.jpg',
      favicon: 'https://exemple.fr/favicon.ico',
    })
  })
  it('écarte une image qui n’est pas http(s)', () => {
    expect(lireApercu('<meta property="og:image" content="javascript:x">', base).image).toBeUndefined()
  })
  it('garde la taille de l’image quand la page la donne', () => {
    const html = '<meta property="og:image" content="/a.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
    expect(lireApercu(html, base)).toMatchObject({ largeur: 1200, hauteur: 630 })
    expect(lireApercu('<meta property="og:image:width" content="1200">', base).largeur).toBeUndefined()
  })
})
