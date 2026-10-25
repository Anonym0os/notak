// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { act, createRef } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { Poignee } from './Poignee'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let editeur: Editor | null = null
beforeEach(() => {
  definirLangue('fr')
  // jsdom ne mesure aucun texte : une plage n'a pas de rectangles, le bloc donne les siens.
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
  hote = document.createElement('div')
  hote.className = 'notak-espace'
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  editeur?.destroy()
  editeur = null
  hote.remove()
})

const attendre = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))
const bulle = () => document.querySelector('.notak-blocs-aide')

/** Une poignée montrée sur le premier bloc : on l'y pose par le survol de la zone, en donnant à jsdom les mesures qui lui manquent. */
async function monter(): Promise<{ plus: HTMLElement; tenir: HTMLElement }> {
  const ed = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }] as NoeudTexte[] } })
  editeur = ed
  const ids = poserIds(ed.state)
  if (ids) ed.view.dispatch(ids)
  const zone = createRef<HTMLDivElement>()
  await act(async () => {
    racine.render(
      <div ref={zone} style={{ position: 'relative' }}>
        <Poignee editeur={ed} zone={zone} ouvrirMenu={() => {}} />
      </div>,
    )
  })
  const z = zone.current!
  const rect = (r: Partial<DOMRect>) => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...r }) as DOMRect
  z.getBoundingClientRect = () => rect({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 })
  const dom = ed.view.dom as HTMLElement
  hote.append(dom)
  dom.getBoundingClientRect = () => rect({ left: 100, top: 0, right: 700, bottom: 600, width: 600, height: 600 })
  const bloc = dom.firstElementChild as HTMLElement
  bloc.getBoundingClientRect = () => rect({ left: 106, top: 100, right: 700, bottom: 124, width: 594, height: 24 })
  bloc.getClientRects = () => [bloc.getBoundingClientRect()] as unknown as DOMRectList
  await act(async () => {
    z.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 110 }))
  })
  await attendre(100)
  const plus = z.querySelector<HTMLElement>('.notak-blocs-poignee-plus')
  const tenir = z.querySelector<HTMLElement>('.notak-blocs-poignee-tenir')
  if (!plus || !tenir) throw new Error('la poignée n’est pas montrée')
  return { plus, tenir }
}

const entrer = (b: HTMLElement) => act(async () => void b.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
const sortir = (b: HTMLElement) => act(async () => void b.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })))

describe('NOTION.md § 6 : la bulle d’aide de la poignée', () => {
  it('le survol de ⋮⋮ la montre après 150 ms, avec ses deux lignes ; l’infobulle native a disparu', async () => {
    const { tenir } = await monter()
    expect(tenir.getAttribute('title')).toBeNull()
    expect(tenir.getAttribute('aria-label')).toBeTruthy()
    await entrer(tenir)
    expect(bulle()).toBeNull()
    await attendre(190)
    const b = bulle()!
    expect(b).not.toBeNull()
    expect(b.textContent).toBe('Glisser pour déplacerCliquer ou ⌘/ pour ouvrir le menu')
    expect([...b.querySelectorAll('b')].map((x) => x.textContent)).toEqual(['Glisser', 'Cliquer', '⌘/'])
  })

  it('celle de + parle d’ajouter un bloc dessous, et dessus avec ⌥', async () => {
    const { plus } = await monter()
    await entrer(plus)
    await attendre(190)
    expect(bulle()!.textContent).toBe('Cliquer pour ajouter un bloc dessous⌥-clic pour l’ajouter au-dessus')
  })

  it('quitter le bouton avant le délai ne la montre jamais ; le quitter après la ferme', async () => {
    const { tenir } = await monter()
    await entrer(tenir)
    await attendre(60)
    await sortir(tenir)
    await attendre(200)
    expect(bulle()).toBeNull()
    await entrer(tenir)
    await attendre(190)
    expect(bulle()).not.toBeNull()
    await sortir(tenir)
    expect(bulle()).toBeNull()
  })

  it('un clic la ferme, et elle ne revient pas tant qu’on n’a pas quitté puis retrouvé le bouton', async () => {
    const { plus } = await monter()
    await entrer(plus)
    await attendre(190)
    expect(bulle()).not.toBeNull()
    await act(async () => void plus.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(bulle()).toBeNull()
    await attendre(200)
    expect(bulle()).toBeNull()
  })

  it('elle se range dans l’hôte des menus', async () => {
    const { tenir } = await monter()
    await entrer(tenir)
    await attendre(190)
    expect(bulle()!.parentElement).toBe(hote)
  })
})
