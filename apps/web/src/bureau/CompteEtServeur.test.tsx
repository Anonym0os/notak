// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompteEtServeur, ResumeCompte } from './CompteEtServeur'
import { SERVEUR, acces, alerte, appelsDe, bouton, coque, poserCoque, retirerCoque } from './essai'

let racine: Root
let hote: HTMLElement

beforeEach(() => {
  definirLangue('fr')
  vi.stubEnv('VITE_EDITION', 'locale')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  document.body.innerHTML = ''
  retirerCoque()
  vi.unstubAllEnvs()
})

/** Laisse passer les promesses et les rendus qui les suivent. */
const attendre = () => act(() => new Promise((fin) => setTimeout(fin, 0)))

async function monter(compte?: Parameters<typeof CompteEtServeur>[0]['compte']) {
  act(() => racine.render(<CompteEtServeur compte={compte} />))
  await attendre()
}

/** Écrit dans un champ contrôlé par React, comme le clavier. */
function saisir(champ: HTMLInputElement, valeur: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, valeur)
  champ.dispatchEvent(new Event('input', { bubbles: true }))
}

const tete = () => [...hote.querySelectorAll('.compte-serveur-tete strong, .compte-serveur-tete small')].map((n) => n.textContent)

describe('le compte et le serveur, dans l’app d’un iPhone', () => {
  it('sans serveur : « Pas de compte », ce qu’un serveur apporte, et le formulaire à la place ; l’adresse part à la coque, retenue', async () => {
    poserCoque({ acces: () => acces(), joindre_serveur: () => new Promise(() => {}) })
    await monter()
    expect(tete()).toEqual(['Pas de compte', 'Vos toiles sont sur cet appareil'])
    expect(hote.querySelector('.compte-serveur-phrase')!.textContent).toContain('en ligne')
    expect(hote.querySelector('.compte-serveur-rond')!.hasAttribute('data-initiale')).toBe(false)
    act(() => bouton(/^Se connecter à un serveur Notak/)!.click())
    const champ = hote.querySelector<HTMLInputElement>('.compte-serveur-formulaire input[name="adresse"]')!
    // Le clavier d'une adresse, sans majuscule ni correction.
    expect(champ.inputMode).toBe('url')
    expect(champ.getAttribute('autocapitalize')).toBe('none')
    act(() => saisir(champ, 'notak.exemple.fr'))
    act(() => hote.querySelector('form')!.requestSubmit())
    await attendre()
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: 'notak.exemple.fr', garder: true }])
    // La croix du formulaire ramène au compte.
    act(() => hote.querySelector<HTMLButtonElement>('.acces-tete button')!.click())
    expect(tete()[0]).toBe('Pas de compte')
  })

  it('avec un serveur retenu : son adresse et son initiale ; « Ouvrir » y emmène, et pendant qu’on part, rien d’autre', async () => {
    poserCoque({ acces: () => acces({ ouvrir: 'serveur', serveur: SERVEUR }), joindre_serveur: () => new Promise(() => {}) })
    await monter()
    expect(tete()).toEqual(['notak.exemple.fr', 'Serveur Notak'])
    expect(hote.querySelector('.compte-serveur-rond')!.textContent).toBe('N')
    act(() => bouton(/^Ouvrir les toiles du serveur/)!.click())
    await attendre()
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: SERVEUR, garder: true }])
    expect(bouton(/^Connexion à notak\.exemple\.fr…/)?.getAttribute('aria-busy')).toBe('true')
    expect(bouton('Changer de serveur')?.disabled).toBe(true)
    expect(bouton('Oublier ce serveur')?.disabled).toBe(true)
  })

  it('un serveur qui ne répond pas le dit, avec quoi faire, et se retente ; renoncer ne se reproche pas', async () => {
    poserCoque({ acces: () => acces({ ouvrir: 'serveur', serveur: SERVEUR }), joindre_serveur: () => Promise.reject({ code: 'injoignable' }) })
    await monter()
    act(() => bouton(/^Ouvrir les toiles du serveur/)!.click())
    await attendre()
    expect(alerte()).toContain('démarré')
    coque.joindre_serveur = () => Promise.reject({ code: 'annule' })
    act(() => bouton(/^Ouvrir les toiles du serveur/)!.click())
    await attendre()
    expect(alerte()).toBeNull()
  })

  it('« Oublier ce serveur » demande d’abord ; oublié, on revient à « Pas de compte »', async () => {
    let retenu: string | null = SERVEUR
    poserCoque({ acces: () => acces({ ouvrir: retenu ? 'serveur' : 'local', serveur: retenu }), oublier_serveur: () => void (retenu = null) })
    await monter()
    act(() => bouton('Oublier ce serveur')!.click())
    expect(hote.querySelector('.compte-serveur-confirme')!.textContent).toContain('Oublier notak.exemple.fr ?')
    act(() => bouton('Annuler')!.click())
    expect(appelsDe('oublier_serveur')).toEqual([])
    act(() => bouton('Oublier ce serveur')!.click())
    act(() => bouton('Oui, oublier')!.click())
    await attendre()
    await attendre()
    expect(appelsDe('oublier_serveur')).toHaveLength(1)
    expect(tete()[0]).toBe('Pas de compte')
  })

  it('hors de l’app, sans coque : rien à joindre, aucune ligne', async () => {
    await monter()
    expect(hote.querySelector('.compte-serveur-groupe')).toBeNull()
  })
})

describe('le compte, sur la page d’un serveur', () => {
  const compte = { nom: 'Ada Lovelace', email: 'ada@exemple.test', couleur: '#2f6feb', photo: null }

  it('le nom et le serveur ; dans l’app, changer de serveur ou revenir aux toiles de l’appareil passent par la coque', async () => {
    vi.stubEnv('VITE_EDITION', 'serveur')
    poserCoque({ acces: () => acces({ serveur: location.origin }), revenir_ici: () => new Promise(() => {}) })
    ;(window as unknown as { __NOTAK_PLATEFORME__?: string }).__NOTAK_PLATEFORME__ = 'ios'
    try {
      await monter(compte)
      expect(tete()).toEqual(['Ada Lovelace', location.host])
      expect([...hote.querySelectorAll('.compte-serveur-ligne')].map((b) => b.textContent)).toEqual([
        'Changer de serveur',
        'Toiles de cet appareilPour cette fois, sans serveur ni compte',
        'Se déconnecter',
      ])
      act(() => bouton(/^Toiles de cet appareil/)!.click())
      await attendre()
      expect(appelsDe('revenir_ici')).toEqual([{ ecran: 'local' }])
    } finally {
      delete (window as unknown as { __NOTAK_PLATEFORME__?: string }).__NOTAK_PLATEFORME__
    }
  })

  it('dans un navigateur : le compte et la déconnexion seulement', async () => {
    vi.stubEnv('VITE_EDITION', 'serveur')
    await monter(compte)
    expect([...hote.querySelectorAll('.compte-serveur-ligne')].map((b) => b.textContent)).toEqual(['Se déconnecter'])
  })

  it('la carte des réglages : le rond, puis le nom et le serveur dessous', async () => {
    vi.stubEnv('VITE_EDITION', 'serveur')
    act(() => racine.render(<ResumeCompte compte={compte} />))
    expect(hote.querySelector('strong')!.textContent).toBe('Ada Lovelace')
    expect(hote.querySelector('small')!.textContent).toBe(location.host)
  })
})
