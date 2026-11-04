// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demanderAMontrer, montrerDemande } from './elements/tableau/montrer'
import { definirLangue } from './langue'
import { Recherche } from './Menus'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('la recherche de la toile, dans les autres toiles', () => {
  let hote: HTMLElement
  let racine: Root
  beforeEach(() => {
    definirLangue('fr')
    vi.useFakeTimers()
    hote = document.createElement('div')
    document.body.append(hote)
    racine = createRoot(hote)
  })
  afterEach(() => {
    act(() => racine.unmount())
    hote.remove()
    vi.useRealTimers()
    demanderAMontrer(null)
  })

  const monter = async (ouvrirTableau: (id: string) => void) => {
    const partout = async () => [
      { tableau: 'voyage', titre: 'Voyage', element: 'note-kyoto', extrait: 'Le temple de Kyoto' },
      { tableau: 'budget', titre: 'Budget', extrait: 'Budget' },
    ]
    act(() => racine.render(<Recherche requete="kyoto" appel={0} nombre={0} rang={0} changer={() => {}} aller={() => {}} fermer={() => {}} partout={partout} ouvrirTableau={ouvrirTableau} ici="accueil" />))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
  }
  const resultats = () => [...hote.querySelectorAll<HTMLButtonElement>('.notak-recherche-ailleurs button')]

  it('un passage trouvé dans un élément ouvre sa toile centrée sur lui', async () => {
    const ouvertes: string[] = []
    await monter((id) => ouvertes.push(id))
    act(() => resultats()[0]!.click())
    expect(ouvertes).toEqual(['voyage'])
    expect(montrerDemande()).toBe('note-kyoto')
  })

  it('un titre de toile trouvé ouvre la toile, sans rien viser', async () => {
    const ouvertes: string[] = []
    await monter((id) => ouvertes.push(id))
    act(() => resultats()[1]!.click())
    expect(ouvertes).toEqual(['budget'])
    expect(montrerDemande()).toBeNull()
  })
})
