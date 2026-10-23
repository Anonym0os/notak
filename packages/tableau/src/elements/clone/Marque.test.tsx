// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import { type Element, nouvelleNote } from '../../coeur/tableau'
import '../index'
import type { ContexteToile } from '../types'
import { MarqueClone } from './Marque'
import { nouveauClone } from './original'

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

describe('la marque de copie', () => {
  const note: Element = { ...nouvelleNote(0, 0, 'Une idée'), id: 'n' }
  const [c1, c2] = [{ ...nouveauClone(20, 0, 'n', 30), id: 'c1' }, { ...nouveauClone(40, 0, 'n', 30), id: 'c2' }]
  const montres: string[] = []
  const contexte = {
    magasin: creerMagasin({ titre: '', etiquettes: [], elements: [note, c1, c2] }),
    montrer: (id: string) => void montres.push(id),
  } as unknown as ContexteToile

  it('un clic compte les copies et les liste, l’original en tête ; une rangée la montre', () => {
    act(() => racine.render(<MarqueClone cible="n" contexte={contexte} />))
    act(() => hote.querySelector<HTMLButtonElement>('.notak-clone-marque')!.click())
    expect(hote.querySelector('.notak-clone-bulle-texte')!.textContent).toBe('3 copies sur ce tableau')
    const rangees = [...hote.querySelectorAll<HTMLButtonElement>('.notak-clone-rangee')]
    expect(rangees.map((r) => r.querySelector('.notak-clone-rangee-nom')!.textContent)).toEqual(['Original', 'Copie 1', 'Copie 2'])
    act(() => rangees[2]!.click())
    expect(montres).toEqual(['c2'])
    expect(hote.querySelector('.notak-clone-bulle')).toBeNull()
  })

  it('sur un original sans clone, la marque n’y est pas', () => {
    const seul = { magasin: creerMagasin({ titre: '', etiquettes: [], elements: [note] }), montrer: () => {} } as unknown as ContexteToile
    act(() => racine.render(<MarqueClone cible="n" contexte={seul} />))
    expect(hote.querySelector('.notak-clone-marque')).toBeNull()
  })
})
