// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { adressePour } from './adresse'

describe('adressePour', () => {
  beforeEach(() => history.replaceState(null, '', '/'))

  it('l’édition locale : l’accueil est `/`, les autres toiles `/t/<id>`', () => {
    const a = adressePour('racine')
    expect(a.lire()).toBe('racine')
    a.ecrire('voyage')
    expect(location.pathname).toBe('/t/voyage')
    a.ecrire('racine')
    expect(location.pathname).toBe('/')
  })

  it('l’édition serveur : `/` est la bibliothèque, l’accueil a son adresse comme les autres', () => {
    const a = adressePour('racine', { accueilAPart: true })
    a.ecrire('racine')
    expect(location.pathname).toBe('/t/racine')
    expect(a.lire()).toBe('racine')
    a.ecrireElement!('racine', 'carte')
    expect(location.pathname).toBe('/t/racine/e/carte')
    expect(a.lireElement!()).toBe('carte')
  })

  it('fermer un élément ouvert par son adresse ramène à sa toile, jamais à la bibliothèque', () => {
    history.replaceState(null, '', '/t/racine/e/carte')
    adressePour('racine', { accueilAPart: true }).ecrireElement!('racine', null)
    expect(location.pathname).toBe('/t/racine')
  })
})
