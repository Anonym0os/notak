// @vitest-environment jsdom
import { act, useRef } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Surcouche } from './elements/surcouche'
import { lireReglages, useReglages } from './reglages'
import { themeEffectif, useSombre, useSystemeSombre, useThemeALaRacine } from './themeVivant'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  localStorage.clear()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  delete (globalThis as { matchMedia?: unknown }).matchMedia
})

/** Un système qu'on bascule à la main, comme macOS dans ses réglages. */
function systeme(sombre: boolean) {
  const ecouteurs = new Set<() => void>()
  const m = {
    get matches() {
      return sombre
    },
    addEventListener: (_: string, f: () => void) => ecouteurs.add(f),
    removeEventListener: (_: string, f: () => void) => ecouteurs.delete(f),
  }
  ;(globalThis as { matchMedia?: unknown }).matchMedia = () => m
  return (s: boolean) => {
    sombre = s
    ecouteurs.forEach((f) => f())
  }
}

describe('le mode Système', () => {
  it('donne le thème du système, et laisse clair et sombre tels quels', () => {
    expect(themeEffectif('systeme', true)).toBe('sombre')
    expect(themeEffectif('systeme', false)).toBe('clair')
    expect(themeEffectif('clair', true)).toBe('clair')
    expect(themeEffectif('sombre', false)).toBe('sombre')
  })

  it('suit le système en direct', () => {
    const basculer = systeme(false)
    function Banc() {
      return <p>{themeEffectif('systeme', useSystemeSombre())}</p>
    }
    act(() => racine.render(<Banc />))
    expect(hote.textContent).toBe('clair')
    act(() => basculer(true))
    expect(hote.textContent).toBe('sombre')
  })

  it('sans matchMedia (jsdom, un vieux navigateur), le système est clair', () => {
    expect(themeEffectif('systeme')).toBe('clair')
  })

  it('se relit des réglages enregistrés', () => {
    localStorage.setItem('notak:reglages', JSON.stringify({ theme: 'systeme' }))
    expect(lireReglages().theme).toBe('systeme')
    localStorage.setItem('notak:reglages', JSON.stringify({ theme: 'nuit' }))
    expect(lireReglages().theme).toBe('clair')
  })
})

describe('le thème de l’espace, suivi en direct', () => {
  it('une table ou une ligne voit le changement sans être redessinée', async () => {
    function Lecteur() {
      const ref = useRef<HTMLSpanElement>(null)
      return <span ref={ref}>{useSombre(ref) ? 'sombre' : 'clair'}</span>
    }
    act(() =>
      racine.render(
        <div className="notak-espace" data-theme="clair">
          <Lecteur />
        </div>,
      ),
    )
    expect(hote.textContent).toBe('clair')
    // L'observateur répond dans la microtâche qui suit le changement.
    await act(async () => {
      hote.querySelector('.notak-espace')!.setAttribute('data-theme', 'sombre')
      await Promise.resolve()
    })
    expect(hote.textContent).toBe('sombre')
  })

  it('la carte et le document ouverts en grand reprennent le nouveau thème', async () => {
    act(() =>
      racine.render(
        <div className="notak-espace" data-theme="clair">
          <div className="notak-toile">
            <Surcouche etiquette="Carte" className="essai-surcouche" fermer={() => {}}>
              contenu
            </Surcouche>
          </div>
        </div>,
      ),
    )
    const surcouche = () => document.querySelector('.essai-surcouche')
    expect(surcouche()?.getAttribute('data-theme')).toBe('clair')
    await act(async () => {
      hote.querySelector('.notak-espace')!.setAttribute('data-theme', 'sombre')
      await Promise.resolve()
    })
    expect(surcouche()?.getAttribute('data-theme')).toBe('sombre')
  })
})

describe('le thème sur la racine du document', () => {
  it('suit le thème affiché : la bibliothèque posée sur la toile et la coque iOS le lisent là', () => {
    function Hote({ theme }: { theme: 'clair' | 'sombre' }) {
      useThemeALaRacine(theme)
      return null
    }
    act(() => racine.render(<Hote theme="clair" />))
    expect(document.documentElement.dataset.theme).toBe('clair')
    act(() => racine.render(<Hote theme="sombre" />))
    expect(document.documentElement.dataset.theme).toBe('sombre')
  })
})

describe('un autre onglet', () => {
  it('change les réglages : celui-ci les reprend', () => {
    let vus: string[] = []
    function Banc() {
      const [r] = useReglages()
      vus.push(r.theme)
      return null
    }
    act(() => racine.render(<Banc />))
    vus = []
    localStorage.setItem('notak:reglages', JSON.stringify({ theme: 'sombre' }))
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: 'notak:reglages' })))
    expect(vus.at(-1)).toBe('sombre')
  })
})
