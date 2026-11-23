// @vitest-environment jsdom
import { demanderAMontrer, montrerDemande } from '@notak/tableau'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { allerDansLApp, cheminDansLApp, retenirAdresseDuServeur, suivreAdresse } from './naviguer'

const clic = (m: Partial<{ button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => {
  const e = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...m, preventDefault: () => void (e.defaultPrevented = true) }
  return e
}

describe('les liens de Notak restent dans l’application', () => {
  beforeEach(() => history.replaceState(null, '', '/t/ici'))
  afterEach(() => {
    retenirAdresseDuServeur(undefined)
    demanderAMontrer(null)
  })

  it('reconnaît une toile, un élément, la bibliothèque et un dossier de ce serveur, en lien entier ou en chemin', () => {
    const o = location.origin
    expect(cheminDansLApp(`${o}/t/voyage`)).toBe('/t/voyage')
    expect(cheminDansLApp(`${o}/t/voyage/e/page/`)).toBe('/t/voyage/e/page')
    expect(cheminDansLApp('/t/voyage')).toBe('/t/voyage')
    expect(cheminDansLApp(`${o}/?dossier=clients&element=fiche&utm=x`)).toBe('/?dossier=clients&element=fiche')
    expect(cheminDansLApp(`${o}/`)).toBe('/')
    expect(cheminDansLApp(`${o}/t/${encodeURIComponent('é t é')}`)).toBe(`/t/${encodeURIComponent('é t é')}`)
  })

  it('laisse au navigateur un autre site, une page publiée, l’API et ce qui n’est pas une page', () => {
    expect(cheminDansLApp('https://crm.exemple.fr/t/voyage')).toBeNull()
    expect(cheminDansLApp(`${location.origin}/p/jeton`)).toBeNull()
    expect(cheminDansLApp(`${location.origin}/api/tableaux`)).toBeNull()
    expect(cheminDansLApp(`${location.origin}/t/a/b/c`)).toBeNull()
    expect(cheminDansLApp('javascript:alert(1)')).toBeNull()
    expect(cheminDansLApp('mailto:samy@exemple.fr')).toBeNull()
  })

  it('reconnaît l’adresse que le serveur déclare, d’où l’agent tire ses liens, et un lien notak:// vers lui', () => {
    // La page est jointe par une autre adresse (le réseau de la maison) : le lien vise pourtant ce serveur.
    expect(cheminDansLApp('https://notak.exemple.fr/t/voyage')).toBeNull()
    retenirAdresseDuServeur('https://notak.exemple.fr')
    expect(cheminDansLApp('https://notak.exemple.fr/t/voyage')).toBe('/t/voyage')
    expect(cheminDansLApp('notak://notak.exemple.fr/?dossier=clients')).toBe('/?dossier=clients')
    expect(cheminDansLApp('notak://autre.exemple.fr/t/voyage')).toBeNull()
  })

  it('un clic simple y va sans recharger ; ⌘, Maj ou le bouton du milieu laissent faire le navigateur', () => {
    for (const m of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const e = clic(m)
      expect(suivreAdresse(e, '/t/voyage')).toBe(false)
      expect(e.defaultPrevented).toBe(false)
    }
    expect(location.pathname).toBe('/t/ici')
    const e = clic()
    expect(suivreAdresse(e, `${location.origin}/t/voyage`)).toBe(true)
    expect(e.defaultPrevented).toBe(true)
    expect(location.pathname).toBe('/t/voyage')
    // Un autre site : le clic est au navigateur.
    expect(suivreAdresse(clic(), 'https://crm.exemple.fr/societes/42')).toBe(false)
  })

  it('un élément porte son entrée d’historique, que le refermer défait ; déjà là, il se remontre', () => {
    allerDansLApp('/t/voyage/e/note')
    expect(location.pathname).toBe('/t/voyage/e/note')
    expect(history.state).toEqual({ element: 'note' })
    expect(montrerDemande()).toBeNull()
    allerDansLApp('/t/voyage/e/note')
    expect(montrerDemande()).toBe('note')
  })
})
