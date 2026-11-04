// @vitest-environment jsdom
import { definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EspaceLocal } from './espace'
import type { EtatSynchro } from './synchro'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m = vi.hoisted(() => ({ etat: { mode: 'aucune' } as EtatSynchro }))
vi.mock('./synchro', async (origine) => ({
  ...(await origine<typeof import('./synchro')>()),
  lireEtatSynchro: () => m.etat,
  ecouterSynchro: () => () => {},
}))

const { Rangement } = await import('./Rangement')

/** Un espace qui n'a jamais été copié. */
const el = { index: { ecouter: () => () => {}, derniereCopie: () => undefined } } as unknown as EspaceLocal

describe('la pastille « Où sont mes toiles ? »', () => {
  let hote: HTMLElement
  let racine: Root
  beforeEach(() => {
    definirLangue('fr')
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
    m.etat = { mode: 'aucune' }
  })

  const monter = () => act(() => racine.render(<Rangement el={el} enregistrer={() => {}} rouvrir={() => {}} message={null} />))
  const pastille = () => hote.querySelector<HTMLButtonElement>('.rangement-pastille')!
  const ouvrir = () => act(() => pastille().click())
  const panneau = () => hote.querySelector('.rangement-panneau')!.textContent ?? ''

  it('sans synchro, dit où elles sont et ce qui les effacerait', () => {
    monter()
    expect(pastille().textContent).toBe('Dans ce navigateur')
    ouvrir()
    expect(panneau()).toContain('Rien ne quitte votre appareil')
  })

  it('synchronisées avec iCloud, le dit, sans prétendre que rien ne quitte l’appareil', () => {
    m.etat = { mode: 'active', nom: 'iCloud Drive', nuage: true, meneur: true, derniere: Date.now() }
    monter()
    expect(pastille().textContent).toBe('Dans iCloud')
    expect(pastille().dataset.alerte).toBeUndefined()
    ouvrir()
    expect(panneau()).toContain('dans votre iCloud Drive')
    expect(panneau()).toContain('nulle part ailleurs qu’iCloud')
    expect(panneau()).toContain('celles d’iCloud Drive restent')
    expect(panneau()).not.toContain('Rien ne quitte votre appareil')
  })

  it('synchronisées avec un dossier, nomme le dossier', () => {
    m.etat = { mode: 'active', nom: 'Notak', meneur: true }
    monter()
    expect(pastille().textContent).toBe('Synchronisé')
    ouvrir()
    expect(panneau()).toContain('recopiées dans le dossier « Notak »')
  })

  it('une synchro qui bute se signale dans la pastille', () => {
    m.etat = { mode: 'active', nom: 'iCloud Drive', nuage: true, meneur: true, erreur: 'iCloud plein' }
    monter()
    expect(pastille().textContent).toBe('Synchro à vérifier')
    expect(pastille().dataset.alerte).toBe('true')
  })
})
