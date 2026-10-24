// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { marquerBureau } from './bureau'

const fenetre = (tauri: boolean, largeur: number, ecran: number) => {
  const document = window.document.implementation.createHTMLDocument('')
  const ecoutes: (() => void)[] = []
  return {
    ...(tauri ? { __TAURI_INTERNALS__: {} } : {}),
    document,
    innerWidth: largeur,
    innerHeight: 800,
    screen: { width: ecran, height: 800 },
    addEventListener: (_: string, f: () => void) => ecoutes.push(f),
    ecoutes,
  }
}

describe("l'application de bureau", () => {
  it('se signale à la racine, et dit le plein écran quand la fenêtre couvre l’écran', () => {
    const f = fenetre(true, 1280, 1440)
    marquerBureau(f as unknown as Window)
    const racine = f.document.documentElement
    expect(racine.hasAttribute('data-bureau')).toBe(true)
    expect(racine.hasAttribute('data-plein-ecran')).toBe(false)
    f.innerWidth = 1440
    f.ecoutes.forEach((e) => e())
    expect(racine.hasAttribute('data-plein-ecran')).toBe(true)
  })

  it('ne touche à rien dans un navigateur', () => {
    const f = fenetre(false, 1280, 1440)
    marquerBureau(f as unknown as Window)
    expect(f.document.documentElement.hasAttribute('data-bureau')).toBe(false)
  })
})
