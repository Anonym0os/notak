// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SERVEUR, acces, alerte, appelsDe, bouton, coque, poserCoque, retirerCoque } from '../bureau/essai'
import { ServeurTelephone } from './ServeurTelephone'

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

async function monter() {
  act(() => racine.render(<ServeurTelephone />))
  await attendre()
}

/** Écrit dans un champ contrôlé par React, comme le clavier. */
function saisir(champ: HTMLInputElement, valeur: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, valeur)
  champ.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('« Sur un serveur », dans la bibliothèque de l’app iPhone', () => {
  it('hors de l’app, rien : un navigateur n’a pas de coque pour joindre un serveur', async () => {
    await monter()
    expect(hote.textContent).toBe('')
  })

  it('sans serveur retenu : une ligne ouvre la feuille, et l’adresse tapée part à la coque, retenue', async () => {
    poserCoque({ acces: () => acces(), joindre_serveur: () => new Promise(() => {}) })
    await monter()
    expect(hote.querySelector('h2')?.textContent).toBe('Sur un serveur')
    expect(bouton(/Ouvrir/)).toBeUndefined()
    act(() => bouton(/^Se connecter à un serveur Notak/)!.click())
    const feuille = document.querySelector('.notak-tiroir-bas.biblio-serveur-feuille')
    expect(feuille).not.toBeNull()
    const champ = feuille!.querySelector<HTMLInputElement>('input[name="adresse"]')!
    // Le clavier d'une adresse, sans majuscule ni correction.
    expect(champ.inputMode).toBe('url')
    expect(champ.getAttribute('autocapitalize')).toBe('none')
    act(() => saisir(champ, 'notak.exemple.fr'))
    act(() => feuille!.querySelector('form')!.requestSubmit())
    await attendre()
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: 'notak.exemple.fr', garder: true }])
    expect(bouton('Connexion…')).toBeDefined()
  })

  it('un serveur retenu s’ouvre d’un toucher ; la feuille sert alors à en changer ou à l’oublier', async () => {
    poserCoque({ acces: () => acces({ ouvrir: 'serveur', serveur: SERVEUR }), joindre_serveur: () => new Promise(() => {}) })
    await monter()
    act(() => bouton(/^Ouvrir notak\.exemple\.fr/)!.click())
    await attendre()
    expect(appelsDe('joindre_serveur')).toEqual([{ adresse: SERVEUR, garder: true }])
    expect(bouton(/^Connexion à notak\.exemple\.fr…/)?.getAttribute('aria-busy')).toBe('true')
    // Pendant qu'on part, on ne lance pas autre chose.
    expect(bouton(/^Un autre serveur/)?.disabled).toBe(true)
  })

  it('un serveur retenu qui ne répond pas le dit sous la ligne, avec quoi faire, et se retente', async () => {
    poserCoque({
      acces: () => acces({ ouvrir: 'serveur', serveur: SERVEUR }),
      joindre_serveur: () => Promise.reject({ code: 'injoignable' }),
    })
    await monter()
    act(() => bouton(/^Ouvrir notak\.exemple\.fr/)!.click())
    await attendre()
    expect(alerte()).toContain('démarré')
    expect(bouton(/^Un autre serveur/)?.disabled).toBe(false)
    coque.joindre_serveur = () => new Promise(() => {})
    act(() => bouton(/^Ouvrir notak\.exemple\.fr/)!.click())
    await attendre()
    expect(alerte()).toBeNull()
  })

  it('renoncer (la personne a ouvert les toiles d’ici entre-temps) ne se reproche pas', async () => {
    poserCoque({ acces: () => acces({ ouvrir: 'serveur', serveur: SERVEUR }), joindre_serveur: () => Promise.reject({ code: 'annule' }) })
    await monter()
    act(() => bouton(/^Ouvrir notak\.exemple\.fr/)!.click())
    await attendre()
    expect(alerte()).toBeNull()
  })
})
