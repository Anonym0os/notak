// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type ActionsBarreSujet, BarreSujet, type PropsBarreSujet } from './BarreSujet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

const NOMS: (keyof ActionsBarreSujet)[] = ['relation', 'lienWeb', 'image', 'note', 'tache', 'style']

function monter(props: Partial<PropsBarreSujet> = {}, surAppui = vi.fn()) {
  const actions = Object.fromEntries(NOMS.map((n) => [n, vi.fn()])) as unknown as Record<keyof ActionsBarreSujet, ReturnType<typeof vi.fn>>
  const zone = document.createElement('div')
  document.body.append(zone)
  const racine = createRoot(zone)
  racines.push(racine)
  act(() =>
    racine.render(
      <div onPointerDown={surAppui}>
        <BarreSujet x={500} y={300} actions={actions as unknown as ActionsBarreSujet} {...props} />
      </div>,
    ),
  )
  const barre = document.querySelector<HTMLElement>('.notak-arbre-sujet-barre')!
  const boutons = [...barre.querySelectorAll<HTMLButtonElement>('button')]
  return { barre, boutons, actions, surAppui }
}

describe('la barre du sujet', () => {
  it('six boutons : relation, lien web, image, note, tâche, pinceau de style ; pas « Grow Ideas »', () => {
    const { barre, boutons } = monter()
    expect(barre.getAttribute('role')).toBe('toolbar')
    expect(boutons.map((b) => b.getAttribute('aria-label'))).toEqual(['Créer un lien entre deux sujets.', 'Lien web', 'Image locale', 'Note', 'Tâches à faire', 'Pinceau de style'])
    expect(barre.textContent).toBe('')
    // Chaque bouton porte son icône, et un filet sépare le pinceau.
    for (const b of boutons) expect(b.querySelector('svg')).toBeTruthy()
    expect(barre.querySelectorAll('.notak-arbre-sujet-filet')).toHaveLength(1)
    expect(barre.querySelector('.notak-arbre-sujet-filet + .notak-arbre-sujet-bouton')!.getAttribute('aria-label')).toBe('Pinceau de style')
  })

  it('chaque bouton déclenche son action', () => {
    const { boutons, actions } = monter()
    boutons.forEach((b) => act(() => void b.dispatchEvent(new MouseEvent('click', { bubbles: true }))))
    for (const n of NOMS) expect(actions[n], n).toHaveBeenCalledTimes(1)
  })

  it('un bouton grisé n’agit pas', () => {
    const { boutons, actions } = monter({ inactifs: { image: true } })
    expect(boutons[2]!.disabled).toBe(true)
    act(() => void boutons[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(actions.image).not.toHaveBeenCalled()
  })

  it('se pose à la position donnée (sans mesure : centrée sur x, 8 au-dessus de y)', () => {
    const { barre } = monter({ x: 500, y: 300 })
    // jsdom ne mesure rien : une barre de largeur nulle, centrée sur x, au-dessus de y.
    expect(barre.style.left).toBe('500px')
    expect(barre.style.top).toBe('292px')
  })

  it('un appui sur la barre ne traverse pas : il ne désélectionne pas la carte', () => {
    const { barre, surAppui } = monter()
    act(() => void barre.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(surAppui).not.toHaveBeenCalled()
  })

  it('un appui souris ne prend pas le focus', () => {
    const { barre } = monter()
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => void barre.dispatchEvent(e))
    expect(e.defaultPrevented).toBe(true)
  })
})
