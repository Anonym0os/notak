// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TitreTableau } from './TitreTableau'
import { TITRE_MAX } from './titreValide'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const champ = () => hote.querySelector<HTMLInputElement>('input')!
const monter = (renommer?: (t: string) => void) => act(() => racine.render(<TitreTableau titre="Voyage" {...(renommer ? { renommer } : {})} />))
function ecrire(valeur: string) {
  act(() => {
    champ().focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ(), valeur)
    champ().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const touche = (key: string) => act(() => void champ().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))

describe('le titre du tableau', () => {
  it('Entrée valide le nouveau titre', () => {
    const renommer = vi.fn()
    monter(renommer)
    ecrire('  Voyage au Japon ')
    touche('Enter')
    expect(renommer).toHaveBeenCalledExactlyOnceWith('Voyage au Japon')
    expect(champ().value).toBe('Voyage au Japon')
  })

  it('Échap valide aussi (il ne restaure pas)', () => {
    const renommer = vi.fn()
    monter(renommer)
    ecrire('Japon')
    touche('Escape')
    expect(renommer).toHaveBeenCalledExactlyOnceWith('Japon')
  })

  it('quitter le champ valide', () => {
    const renommer = vi.fn()
    monter(renommer)
    ecrire('Japon')
    act(() => champ().blur())
    expect(renommer).toHaveBeenCalledExactlyOnceWith('Japon')
  })

  it('un titre vide rend l’ancien et n’écrit rien', () => {
    const renommer = vi.fn()
    monter(renommer)
    ecrire('   ')
    touche('Enter')
    expect(renommer).not.toHaveBeenCalled()
    expect(champ().value).toBe('Voyage')
  })

  it('un titre inchangé n’écrit rien', () => {
    const renommer = vi.fn()
    monter(renommer)
    ecrire('Voyage')
    touche('Enter')
    expect(renommer).not.toHaveBeenCalled()
  })

  it('le champ plafonne à 100 caractères, et la validation aussi', () => {
    const renommer = vi.fn()
    monter(renommer)
    expect(champ().maxLength).toBe(TITRE_MAX)
    ecrire('z'.repeat(TITRE_MAX + 20))
    touche('Enter')
    expect(renommer.mock.calls[0]![0]).toHaveLength(TITRE_MAX)
  })

  it('sans droit d’écriture, il se lit seulement', () => {
    monter()
    expect(champ().readOnly).toBe(true)
  })

  it('reprend le titre changé ailleurs, hors saisie', () => {
    monter(() => {})
    act(() => racine.render(<TitreTableau titre="Autre" renommer={() => {}} />))
    expect(champ().value).toBe('Autre')
  })
})
