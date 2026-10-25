// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { garderLesLiens, marquerBureau } from './bureau'

const fenetre = (tauri: boolean, largeur: number, ecran: number) => {
  const document = window.document.implementation.createHTMLDocument('')
  const ecoutes: (() => void)[] = []
  return {
    ...(tauri ? { __TAURI_INTERNALS__: {} } : {}),
    document,
    innerWidth: largeur,
    innerHeight: 800,
    screen: { width: ecran, height: 800 },
    addEventListener: (type: string, f: () => void) => type === 'resize' && ecoutes.push(f),
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

describe('les liens dans l’app de bureau', () => {
  const monter = (html: string) => {
    document.body.innerHTML = html
    const ouvertes: string[] = []
    const fenetre = Object.assign(Object.create(window), {
      addEventListener: window.addEventListener.bind(window),
      location: window.location,
      open: (u: string) => void ouvertes.push(u),
    })
    return { ouvertes, fenetre }
  }
  // Un seul écouteur sur `window` pour tout le fichier : ses fenêtres d'essai se succèdent.
  const { ouvertes, fenetre } = monter('')
  garderLesLiens(fenetre as Window)
  // Après lui, on relève ce qu'il a décidé, puis on empêche jsdom de suivre le lien.
  let retenu = false
  window.addEventListener('click', (e) => {
    retenu = e.defaultPrevented
    e.preventDefault()
  })
  const cliquer = (selecteur: string) => {
    document.querySelector(selecteur)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    return { defaultPrevented: retenu }
  }

  it('un lien vers un autre site part dans le navigateur, la fenêtre reste sur Notak', () => {
    ouvertes.length = 0
    document.body.innerHTML = '<a id="l" href="https://exemple.fr/page">x</a><a id="m" href="mailto:a@b.fr">m</a>'
    expect(cliquer('#l').defaultPrevented).toBe(true)
    expect(cliquer('#m').defaultPrevented).toBe(true)
    expect(ouvertes).toEqual(['https://exemple.fr/page', 'mailto:a@b.fr'])
  })

  it('un lien de l’application, un téléchargement ou un texte en écriture restent à la page', () => {
    ouvertes.length = 0
    document.body.innerHTML =
      '<a id="ici" href="/t/abc">t</a><a id="dl" href="https://exemple.fr/f.png" download>d</a><div contenteditable="true"><a id="ed" href="https://exemple.fr">e</a></div>'
    expect(cliquer('#ici').defaultPrevented).toBe(false)
    expect(cliquer('#dl').defaultPrevented).toBe(false)
    expect(cliquer('#ed').defaultPrevented).toBe(false)
    expect(ouvertes).toEqual([])
  })

  it('un lien d’une autre sorte ne s’ouvre nulle part', () => {
    ouvertes.length = 0
    document.body.innerHTML = '<a id="js" href="javascript:alert(1)">j</a><a id="f" href="file:///etc/passwd">f</a>'
    expect(cliquer('#js').defaultPrevented).toBe(true)
    expect(cliquer('#f').defaultPrevented).toBe(true)
    expect(ouvertes).toEqual([])
  })
})
