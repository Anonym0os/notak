// @vitest-environment jsdom
import { act, useState } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Case } from './Case'

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

const bouton = () => hote.querySelector<HTMLButtonElement>('button')!

describe('la case commune', () => {
  it('est une case à cocher au clavier : un bouton, role checkbox, aria-checked', () => {
    act(() => racine.render(<Case cochee={false} aria-label="Fait" />))
    expect(bouton().getAttribute('role')).toBe('checkbox')
    expect(bouton().getAttribute('aria-checked')).toBe('false')
    expect(bouton().tabIndex).toBe(0)
    act(() => racine.render(<Case cochee />))
    expect(bouton().getAttribute('aria-checked')).toBe('true')
    act(() => racine.render(<Case cochee="mixte" />))
    expect(bouton().getAttribute('aria-checked')).toBe('mixed')
  })

  it('au clic : donne la valeur que prend la case et joue l’animation', () => {
    const surChangement = vi.fn()
    function Essai() {
      const [v, setV] = useState(false)
      return <Case cochee={v} onChange={(c, e) => (surChangement(c, e.shiftKey), setV(c))} />
    }
    act(() => racine.render(<Essai />))
    act(() => bouton().click())
    expect(surChangement).toHaveBeenLastCalledWith(true, false)
    expect(bouton().dataset.anime).toBe('coche')
    act(() => bouton().click())
    expect(surChangement).toHaveBeenLastCalledWith(false, false)
    expect(bouton().dataset.anime).toBe('decoche')
  })

  it('un changement d’état venu d’ailleurs n’anime rien', () => {
    act(() => racine.render(<Case cochee={false} />))
    act(() => racine.render(<Case cochee />))
    expect(bouton().dataset.anime).toBeUndefined()
  })

  it('cochée « en partie », un clic la coche', () => {
    const surChangement = vi.fn()
    act(() => racine.render(<Case cochee="mixte" onChange={surChangement} />))
    act(() => bouton().click())
    expect(surChangement).toHaveBeenCalledWith(true, expect.anything())
  })

  it('en lecture seule, un clic ne change rien et n’anime rien', () => {
    const surChangement = vi.fn()
    act(() => racine.render(<Case cochee={false} aria-readonly onChange={surChangement} />))
    act(() => bouton().click())
    expect(surChangement).not.toHaveBeenCalled()
    expect(bouton().dataset.anime).toBeUndefined()
  })

  it('la variante option et la zone large se lisent dans les classes', () => {
    act(() => racine.render(<Case cochee option large />))
    expect(bouton().className).toBe('notak-case notak-case-large notak-case-option')
  })

  it('dans une étiquette, un clic sur le texte coche la case', () => {
    const surChangement = vi.fn()
    act(() =>
      racine.render(
        <label>
          <Case option cochee={false} onChange={surChangement} />
          <span>Option</span>
        </label>,
      ),
    )
    act(() => hote.querySelector('span')!.click())
    expect(surChangement).toHaveBeenCalledTimes(1)
  })
})
