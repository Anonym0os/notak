// @vitest-environment jsdom
import { creerIndexEspace, definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { BandeauRecu } from './BandeauRecu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent === texte)

describe('le bandeau d’une toile venue d’une copie reçue', () => {
  it('n’est là que pour une toile marquée, et le dit', () => {
    const index = creerIndexEspace(new Y.Doc())
    index.noterRecus(['recue'])
    act(() => racine.render(<BandeauRecu index={index} tableau="mienne" />))
    expect(hote.querySelector('.bandeau')).toBeNull()
    act(() => racine.render(<BandeauRecu index={index} tableau="recue" />))
    expect(hote.querySelector('.bandeau')?.getAttribute('role')).toBe('status')
    expect(hote.textContent).toContain('copie reçue')
    expect(hote.textContent).toContain('attendent votre accord')
  })

  it('« Tout afficher pour cette toile » retire la marque, durablement : le bandeau s’en va', () => {
    const index = creerIndexEspace(new Y.Doc())
    index.noterRecus(['recue', 'autre'])
    act(() => racine.render(<BandeauRecu index={index} tableau="recue" />))
    act(() => bouton('Tout afficher pour cette toile')!.click())
    expect(index.recu('recue')).toBe(false)
    // Rien d'autre n'est permis pour autant.
    expect(index.recu('autre')).toBe(true)
    expect(hote.querySelector('.bandeau')).toBeNull()
  })

  it('« Fermer » tait le bandeau pour cette visite sans rien permettre : rien ne se charge pour autant', () => {
    const index = creerIndexEspace(new Y.Doc())
    index.noterRecus(['recue', 'autre'])
    act(() => racine.render(<BandeauRecu index={index} tableau="recue" />))
    act(() => bouton('Fermer')!.click())
    expect(hote.querySelector('.bandeau')).toBeNull()
    expect(index.recu('recue')).toBe(true)
    // Il reste pour une autre toile reçue.
    act(() => racine.render(<BandeauRecu index={index} tableau="autre" />))
    expect(hote.querySelector('.bandeau')).not.toBeNull()
  })

  it('suit la marque venue d’ailleurs : posée ou retirée par un autre appareil, il apparaît ou s’efface', () => {
    const index = creerIndexEspace(new Y.Doc())
    act(() => racine.render(<BandeauRecu index={index} tableau="recue" />))
    expect(hote.querySelector('.bandeau')).toBeNull()
    act(() => index.noterRecus(['recue']))
    expect(hote.querySelector('.bandeau')).not.toBeNull()
    act(() => index.retirerRecu('recue'))
    expect(hote.querySelector('.bandeau')).toBeNull()
  })

  it('se lit en anglais aussi, avec les mêmes boutons', () => {
    definirLangue('en')
    const index = creerIndexEspace(new Y.Doc())
    index.noterRecus(['recue'])
    act(() => racine.render(<BandeauRecu index={index} tableau="recue" />))
    expect(bouton('Show everything for this board')).toBeDefined()
    expect(bouton('Dismiss')).toBeDefined()
  })
})
