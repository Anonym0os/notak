// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { adressePour } from './adresse'
import { allerA } from './chemin'

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

  it('dans les deux éditions de l’app, toute toile et tout élément en grand sont sous `/t/<toile>` : la coque d’iOS y reconnaît une toile', () => {
    // `GardeDuBord.swift` : sur une toile, le geste du bord ne ramène en arrière que juste après l’arrivée ; ensuite,
    // le doigt qui part du bord tire la toile. Une toile ailleurs que sous `/t/` garderait le geste, et le pouce qui la
    // tire depuis le bord ramènerait à la bibliothèque.
    const toile = /^\/t\/[^/]+(?:\/e\/[^/]+)?$/
    const a = adressePour('racine', { accueilAPart: true })
    const vus: string[] = []
    for (const id of ['racine', 'voyage', 'é t é']) {
      a.ecrire(id)
      vus.push(location.pathname)
      a.ecrireElement!(id, 'carte')
      vus.push(location.pathname)
    }
    expect(vus.filter((c) => !toile.test(c))).toEqual([])
  })

  it('fermer un élément ouvert par son adresse ramène à sa toile, jamais à la bibliothèque', () => {
    history.replaceState(null, '', '/t/racine/e/carte')
    adressePour('racine', { accueilAPart: true }).ecrireElement!('racine', null)
    expect(location.pathname).toBe('/t/racine')
  })

  it('suit `allerA` vers une toile ou un élément, comme un retour ; vers la bibliothèque, il n’y a rien à suivre', () => {
    // Une notification, un fichier rouvert ou un lien de l'agent, pendant qu'une toile est ouverte : elle doit y aller.
    history.replaceState(null, '', '/t/racine')
    const vus: [string | null, string | null | undefined][] = []
    const fin = adressePour('racine', { accueilAPart: true }).ecouter((id, element) => vus.push([id, element]))
    allerA('/t/voyage')
    allerA('/t/voyage/e/page')
    allerA('/?dossier=clients')
    allerA('/')
    expect(vus).toEqual([
      ['voyage', null],
      ['voyage', 'page'],
    ])
    fin()
    allerA('/t/plus-tard')
    expect(vus).toHaveLength(2)
  })

  it('sans bibliothèque à part, `allerA(\'/\')` ouvre la toile d’accueil', () => {
    history.replaceState(null, '', '/t/voyage')
    const vus: (string | null)[] = []
    const fin = adressePour('racine').ecouter((id) => vus.push(id))
    allerA('/')
    fin()
    expect(vus).toEqual([null])
  })
})
