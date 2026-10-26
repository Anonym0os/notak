// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Moi } from '../api'
import { Compte } from '../Compte'
import { AnnoncesServeur } from './annonces'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ana: Moi = { id: 'u1', email: 'ana@exemple.fr', nom: 'Ana', couleur: '#336699', racine: 'r', photo: null }
const invoke = vi.fn()
let racine: Root
let hote: HTMLElement

beforeEach(() => {
  definirLangue('fr')
  invoke.mockReset().mockResolvedValue(undefined)
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
})

const dansLApp = () => {
  ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke }
}
const monter = async () => {
  await act(async () =>
    racine.render(
      <>
        <Compte moi={ana} deconnexion={vi.fn()} aide={vi.fn()} />
        <AnnoncesServeur />
      </>,
    ),
  )
  await act(async () => hote.querySelector<HTMLButtonElement>('.compte-nom')!.click())
}
const lignes = () => [...hote.querySelectorAll('[role=menuitem]')].map((l) => l.textContent)
const ligne = (texte: RegExp) => [...hote.querySelectorAll<HTMLElement>('[role=menuitem]')].find((l) => texte.test(l.textContent ?? ''))!

describe('le menu du compte', () => {
  it('dans un navigateur : ses lignes d’avant, rien de l’app de bureau', async () => {
    await monter()
    expect(lignes()).toEqual([
      'BibliothèqueToiles, cartes, documents⌥⌘O',
      'Espaces d’équipeMembres, rôles, SSO',
      'Envoyer vers NotakiPhone, favori',
      'AideRaccourcis clavier',
      'Se déconnecter',
    ])
  })

  it('dans l’app de bureau : changer de serveur, et les toiles de cet ordinateur, avant « Se déconnecter »', async () => {
    dansLApp()
    await monter()
    const l = lignes()
    expect(l).toHaveLength(7)
    expect(l[4]).toBe('Changer de serveur…localhost:3000')
    expect(l[5]).toBe('Toiles de cet ordinateurSans serveur ni compte')
    expect(l[6]).toBe('Se déconnecter')
  })

  it('« Changer de serveur… » et « Toiles de cet ordinateur » demandent à la coque l’écran d’accès, ou les toiles locales', async () => {
    dansLApp()
    await monter()
    await act(async () => ligne(/Changer de serveur/).click())
    expect(invoke).toHaveBeenLastCalledWith('revenir_ici', { ecran: 'acces' }, undefined)
    // Le menu s'est refermé : on le rouvre.
    expect(hote.querySelector('[role=menu]')).toBeNull()
    await act(async () => hote.querySelector<HTMLButtonElement>('.compte-nom')!.click())
    await act(async () => ligne(/Toiles de cet ordinateur/).click())
    expect(invoke).toHaveBeenLastCalledWith('revenir_ici', { ecran: 'local' }, undefined)
  })

  it('si la coque refuse, un mot en bas de la page', async () => {
    dansLApp()
    invoke.mockRejectedValue({ code: 'interdit' })
    await monter()
    await act(async () => ligne(/Changer de serveur/).click())
    expect(hote.querySelector('.bandeau')?.textContent).toContain('Impossible de quitter ce serveur pour le moment.')
  })
})
