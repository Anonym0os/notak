// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bandeauxEmpiles, useBandeau } from './bandeaux'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Bandeau({ texte, hauteur }: { texte: string; hauteur: number }) {
  const bandeau = useBandeau<HTMLElement>()
  return (
    <aside ref={(el) => { if (el) Object.defineProperty(el, 'offsetHeight', { configurable: true, value: hauteur }); return bandeau(el) }} className="bandeau" data-texte={texte}>
      {texte}
    </aside>
  )
}

let hote: HTMLDivElement
let racine: Root
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const bas = (texte: string) => hote.querySelector<HTMLElement>(`[data-texte="${texte}"]`)!.style.bottom

describe('les bandeaux du bas', () => {
  it('se posent chacun au-dessus des précédents, à leur hauteur réelle', () => {
    act(() => racine.render(<><Bandeau texte="accueil" hauteur={64} /><Bandeau texte="recu" hauteur={40} /><Bandeau texte="maj" hauteur={40} /></>))
    expect(bas('accueil')).toBe('16px')
    // 16 + 64 + 8 : le bandeau de deux lignes ne cache pas celui du dessus.
    expect(bas('recu')).toBe('88px')
    expect(bas('maj')).toBe('136px')
  })

  it('redescendent quand un bandeau du dessous s’en va', () => {
    act(() => racine.render(<><Bandeau texte="accueil" hauteur={64} /><Bandeau texte="maj" hauteur={40} /></>))
    expect(bas('maj')).toBe('88px')
    act(() => racine.render(<Bandeau key="m" texte="maj" hauteur={40} />))
    expect(bandeauxEmpiles()).toHaveLength(1)
    expect(bas('maj')).toBe('16px')
  })
})
