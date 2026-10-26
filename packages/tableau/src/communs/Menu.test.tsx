// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Entree, LigneMenu, MenuContextuel, Touches, touchesDe } from './Menu'

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

const monter = (noeud: React.ReactNode) => act(() => racine.render(noeud))
const touche = (cible: Element, key: string) => act(() => void cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
const lignes = () => [...hote.querySelectorAll<HTMLElement>('.notak-menu-ctx > .notak-e, .notak-menu-ctx > .notak-menu-sous > .notak-e')]
const libelle = (l: Element) => l.querySelector('.notak-e-libelle')!.textContent

describe('Touches', () => {
  it('une pastille par touche : ⇧⌘Z donne ⇧, ⌘, Z', () => {
    expect(touchesDe('⇧⌘Z')).toEqual(['⇧', '⌘', 'Z'])
    expect(touchesDe('Échap')).toEqual(['Échap'])
    monter(<Touches touches="⌘⇧K" />)
    expect([...hote.querySelectorAll('kbd.notak-kbd')].map((k) => k.textContent)).toEqual(['⌘', '⇧', 'K'])
    expect(hote.querySelector('.notak-touches')!.getAttribute('aria-label')).toBe('⌘⇧K')
  })
})

describe('LigneMenu', () => {
  it('icône, libellé, raccourci, coche en fin de ligne ; une coche définie en fait une case', () => {
    monter(<LigneMenu icone="menuCopier" libelle="Copier" raccourci="⌘C" coche />)
    const l = hote.querySelector('button.notak-e')!
    expect(l.getAttribute('role')).toBe('menuitemcheckbox')
    expect(l.getAttribute('aria-checked')).toBe('true')
    expect([...l.children].map((c) => c.className.replace(/ notak-ico.*/, ''))).toEqual(['notak-e-icone', 'notak-e-libelle', 'notak-touches', 'notak-e-coche'])
    expect(l.querySelector('.notak-e-icone svg')).not.toBeNull()
    expect(l.querySelector('.notak-e-coche svg')).not.toBeNull()
  })

  it('rouge quand elle détruit, grisée quand elle est désactivée ; sur un div, aria-disabled', () => {
    monter(
      <>
        <LigneMenu libelle="Supprimer" danger />
        <LigneMenu libelle="Coller" desactive />
        <LigneMenu as="div" role="option" libelle="Choix" desactive />
      </>,
    )
    const [a, b, c] = [...hote.querySelectorAll('.notak-e')]
    expect(a!.hasAttribute('data-danger')).toBe(true)
    expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(c!.tagName).toBe('DIV')
    expect(c!.getAttribute('aria-disabled')).toBe('true')
  })

  it('une ligne sans icône garde la place de celle des autres quand on le demande', () => {
    monter(<LigneMenu libelle="Seule" reserverIcone />)
    expect(hote.querySelector('.notak-e-icone')).not.toBeNull()
  })
})

describe('MenuContextuel', () => {
  const faire = vi.fn()
  const entrees = (): Entree[] => [
    { libelle: 'Couper', icone: 'menuCouper', raccourci: '⌘X', faire },
    { libelle: 'Coller', icone: 'menuColler', desactive: true, faire },
    null,
    { libelle: 'Fond', icone: 'palette', faire: () => {}, sous: [{ libelle: 'Gris', faire }, { libelle: 'Bleu', coche: true, faire }] },
    { libelle: 'Supprimer', icone: 'corbeille', danger: true, faire },
  ]
  const fermer = vi.fn()
  beforeEach(() => {
    faire.mockClear()
    fermer.mockClear()
    monter(
      <div>
        <MenuContextuel x={20} y={30} entrees={entrees()} fermer={fermer} />
      </div>,
    )
  })

  it('prend le focus sur la première ligne ; les flèches sautent les lignes grisées, en boucle', () => {
    const l = lignes()
    expect(document.activeElement).toBe(l[0])
    touche(l[0]!, 'ArrowDown')
    expect(libelle(document.activeElement!)).toBe('Fond')
    touche(document.activeElement!, 'ArrowDown')
    expect(libelle(document.activeElement!)).toBe('Supprimer')
    touche(document.activeElement!, 'ArrowDown')
    expect(libelle(document.activeElement!)).toBe('Couper')
    touche(document.activeElement!, 'ArrowUp')
    expect(libelle(document.activeElement!)).toBe('Supprimer')
  })

  it('une lettre va à la ligne qui commence par elle', () => {
    touche(lignes()[0]!, 's')
    expect(libelle(document.activeElement!)).toBe('Supprimer')
  })

  it('flèche droite ouvre le sous-menu et y pose le focus, flèche gauche en revient', async () => {
    const fond = lignes().find((l) => libelle(l) === 'Fond')!
    fond.focus()
    touche(fond, 'ArrowRight')
    await act(async () => void (await new Promise((r) => requestAnimationFrame(r))))
    expect(hote.querySelector('.notak-menu-sous-liste')).not.toBeNull()
    expect(libelle(document.activeElement!)).toBe('Gris')
    // Les flèches restent dans le sous-menu.
    touche(document.activeElement!, 'ArrowDown')
    expect(libelle(document.activeElement!)).toBe('Bleu')
    expect(document.activeElement!.getAttribute('role')).toBe('menuitemcheckbox')
    touche(document.activeElement!, 'ArrowLeft')
    expect(document.activeElement).toBe(fond)
    expect(hote.querySelector('.notak-menu-sous-liste')).toBeNull()
  })

  it('un choix ferme le menu et fait son geste ; Échap et un clic dehors le ferment', () => {
    act(() => void lignes()[0]!.click())
    expect(fermer).toHaveBeenCalledTimes(1)
    expect(faire).toHaveBeenCalledTimes(1)
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(fermer).toHaveBeenCalledTimes(2)
    act(() => void document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(fermer).toHaveBeenCalledTimes(3)
  })

  it('un séparateur entre les lignes, des icônes partout, la ligne qui détruit en rouge', () => {
    expect(hote.querySelectorAll('.notak-menu-ctx > .notak-sep')).toHaveLength(1)
    expect(hote.querySelectorAll('.notak-menu-ctx .notak-e .notak-e-icone svg')).toHaveLength(4)
    expect(hote.querySelector('.notak-e[data-danger]')!.textContent).toBe('Supprimer')
  })
})
