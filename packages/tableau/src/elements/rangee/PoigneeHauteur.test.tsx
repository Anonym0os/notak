// @vitest-environment jsdom
import { act, createRef } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import { type Element, nouvelleColonne, nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { PoigneeHauteur } from './PoigneeHauteur'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  // jsdom ne met rien en page : une carte de 100 px, dont le contenu (son premier enfant, ici la poignée) en demande 300.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-poignee-hauteur') ? 300 : 100
    },
  })
  Element.prototype.setPointerCapture ??= () => {}
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

function monter() {
  const colonne = nouvelleColonne(0, 0)
  const note: Element = { ...nouvelleNote(0, 0, 'Un mot'), parent: colonne.id, ordre: 'a' }
  const magasin = creerMagasin({ titre: '', elements: [colonne, note] })
  const contexte = { magasin, services: {} } as unknown as ContexteToile
  const carte = createRef<HTMLDivElement>()
  act(() =>
    racine.render(
      <div ref={carte}>
        <PoigneeHauteur element={note} carte={carte} contexte={contexte} />
      </div>,
    ),
  )
  const poignee = hote.querySelector<HTMLElement>('[data-poignee-hauteur]')!
  const hauteur = () => magasin.lire().elements.find((e) => e.id === note.id)!.hauteur
  const evt = (type: string, y: number) =>
    act(() => {
      poignee.dispatchEvent(new MouseEvent(type, { bubbles: true, clientY: y, button: 0 }) as PointerEvent)
    })
  return { magasin, hauteur, evt, poignee }
}

describe('la poignée de hauteur d’un élément rangé', () => {
  it('tirée vers le bas, elle garde de la place sous le contenu ; le geste est un seul pas', () => {
    const { magasin, hauteur, evt } = monter()
    evt('pointerdown', 0)
    evt('pointermove', 60)
    evt('pointermove', 300)
    expect(hauteur()).toEqual({ min: 40 })
    evt('pointerup', 300)
    magasin.annuler()
    expect(hauteur()).toBeUndefined()
  })

  it('moins haute que son contenu, elle le borne sous un voile, jamais sous une ligne', () => {
    const { hauteur, evt } = monter()
    evt('pointerdown', 100)
    evt('pointermove', 150)
    expect(hauteur()).toEqual({ max: 15 })
    evt('pointermove', -400)
    expect(hauteur()).toEqual({ max: 9 })
    evt('pointerup', -400)
  })

  it('un geste sans effet n’entre pas dans l’historique', () => {
    const { magasin, evt } = monter()
    evt('pointerdown', 0)
    evt('pointerup', 0)
    expect(magasin.annuler()).toBe(false)
  })

  it('un double-clic rend la hauteur au contenu', () => {
    const { magasin, hauteur, evt, poignee } = monter()
    evt('pointerdown', 0)
    evt('pointermove', 300)
    evt('pointerup', 300)
    expect(hauteur()).toBeDefined()
    act(() => {
      poignee.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(hauteur()).toBeUndefined()
    magasin.annuler()
    expect(hauteur()).toEqual({ min: 40 })
  })
})
