// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'
import { Sommaire } from './Sommaire'
import { elementVisible, titresDuRendu } from './sommaireTitres'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let editeur: Editor | null = null
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  editeur?.destroy()
  editeur = null
  hote.remove()
})

const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })
const h = (niveau: number, text: string, attrs: Record<string, unknown> = {}) => b('heading', text, { level: niveau, ...attrs })
const image = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => r(null)))))

/** La zone qui défile, avec le texte (un éditeur) et le sommaire ; jsdom ne mesure rien, on donne les hauts des titres. */
async function monter(blocs: NoeudTexte[], hauts: number[] = []) {
  const zone = document.createElement('div')
  zone.className = 'notak-document-corps'
  const texte = document.createElement('div')
  zone.append(texte)
  const monte = document.createElement('div')
  zone.append(monte)
  hote.append(zone)
  const ed = new Editor({ element: texte, extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs }, editorProps: { attributes: { class: 'notak-texte notak-blocs' } } })
  editeur = ed
  const ids = poserIds(ed.state)
  if (ids) ed.view.dispatch(ids)
  const titres = [...ed.view.dom.querySelectorAll<HTMLElement>('h1, h2, h3')]
  titres.forEach((el, i) => (el.getBoundingClientRect = () => ({ top: hauts[i] ?? 0 }) as DOMRect))
  const defilements: unknown[] = []
  zone.scrollTo = ((o: unknown) => void defilements.push(o)) as typeof zone.scrollTo
  const enfant = createRoot(monte)
  await act(async () => enfant.render(<Sommaire editeur={ed} />))
  return { zone, ed, titres, defilements, nav: () => zone.querySelector<HTMLElement>('nav.notak-sommaire')!, demonter: () => act(() => enfant.unmount()) }
}

const trois = [h(1, 'Un'), b('paragraph', 'a'), h(2, 'Deux'), b('paragraph', 'b'), h(3, 'Trois')]

describe('NOTION.md § 9 : le composant du sommaire', () => {
  it('un trait par titre, de la longueur de son niveau, le titre courant en plein', async () => {
    const { nav, demonter } = await monter(trois, [-300, -20, 400])
    const traits = [...nav().querySelectorAll<HTMLElement>('.notak-sommaire-trait')]
    expect(traits.map((t) => t.style.width)).toEqual(['16px', '12px', '8px'])
    expect(traits.map((t) => t.hasAttribute('data-courant'))).toEqual([false, true, false])
    expect(nav().getAttribute('aria-label')).toBe('Sommaire')
    await demonter()
  })

  it('une page à un seul titre n’a pas de sommaire', async () => {
    const { nav, demonter } = await monter([h(1, 'Seul'), b('paragraph', 'a')])
    expect(nav().hidden).toBe(true)
    await demonter()
  })

  it('le sommaire suit le texte : un deuxième titre le fait paraître', async () => {
    const { nav, ed, demonter } = await monter([h(1, 'Seul'), b('paragraph', 'a')])
    expect(nav().hidden).toBe(true)
    await act(async () => void ed.commands.insertContentAt(ed.state.doc.content.size, h(2, 'Neuf')))
    expect(nav().hidden).toBe(false)
    expect(nav().querySelectorAll('.notak-sommaire-trait')).toHaveLength(2)
    await demonter()
  })

  it('le panneau s’ouvre au survol, liste les titres avec leur retrait, et se ferme à la sortie', async () => {
    const { nav, demonter } = await monter(trois)
    expect(nav().hasAttribute('data-ouvert')).toBe(false)
    await act(async () => void nav().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(nav().hasAttribute('data-ouvert')).toBe(true)
    const lignes = [...nav().querySelectorAll<HTMLElement>('.notak-sommaire-ligne')]
    expect(lignes.map((l) => l.textContent)).toEqual(['Un', 'Deux', 'Trois'])
    expect(lignes.map((l) => l.parentElement!.style.paddingLeft)).toEqual(['6px', '18px', '30px'])
    await act(async () => {
      nav().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
      await new Promise((r) => setTimeout(r, 250))
    })
    expect(nav().hasAttribute('data-ouvert')).toBe(false)
    await demonter()
  })

  it('un clic sur une ligne défile jusqu’au titre, un peu sous le haut, et ferme le panneau', async () => {
    const { nav, zone, defilements, demonter } = await monter(trois, [-300, 520, 900])
    zone.getBoundingClientRect = () => ({ top: 44 }) as DOMRect
    zone.scrollTop = 1000
    await act(async () => void nav().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    const lignes = nav().querySelectorAll<HTMLElement>('.notak-sommaire-ligne')
    await act(async () => void lignes[1]!.click())
    // 1000 de défilement + (520 - 44) d'écart - 56 de décalage.
    expect(defilements).toEqual([{ top: 1420, behavior: 'smooth' }])
    expect(nav().hasAttribute('data-ouvert')).toBe(false)
    await demonter()
  })

  it('le défilement met à jour le titre courant, une lecture par image', async () => {
    const { nav, zone, titres, demonter } = await monter(trois, [-300, 520, 900])
    const courant = () => [...nav().querySelectorAll('.notak-sommaire-trait')].findIndex((t) => t.hasAttribute('data-courant'))
    expect(courant()).toBe(0)
    titres.forEach((el, i) => (el.getBoundingClientRect = () => ({ top: [-900, -400, 20][i]! }) as DOMRect))
    await act(async () => {
      zone.dispatchEvent(new Event('scroll'))
      zone.dispatchEvent(new Event('scroll'))
    })
    await image()
    expect(courant()).toBe(2)
    await demonter()
  })

  it('un titre caché par un dépliant fermé compte ; cliquer amène au dépliant', async () => {
    const { nav, zone, titres, defilements, demonter } = await monter(
      [h(1, 'Un'), h(2, 'Dépliant', { depliant: true, ouvert: false }), h(3, 'Caché', { retrait: 1 })],
      [-100, 700, 0],
    )
    zone.getBoundingClientRect = () => ({ top: 44 }) as DOMRect
    expect(nav().hidden).toBe(false)
    expect(nav().querySelectorAll('.notak-sommaire-trait')).toHaveLength(3)
    expect(titres[2]!.classList.contains('notak-cache')).toBe(true)
    await act(async () => void nav().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    await act(async () => void nav().querySelectorAll<HTMLElement>('.notak-sommaire-ligne')[2]!.click())
    expect(defilements).toEqual([{ top: 600, behavior: 'smooth' }])
    await demonter()
  })

  it('en lecture, les titres se lisent dans le rendu', async () => {
    const zone = document.createElement('div')
    zone.className = 'notak-document-corps'
    zone.innerHTML = '<div class="notak-blocs"><h1>Un</h1><p>a</p><h3>Trois</h3></div><div id="sommaire"></div>'
    hote.append(zone)
    const monte = createRoot(zone.querySelector('#sommaire')!)
    await act(async () => monte.render(<Sommaire lecture />))
    expect([...zone.querySelectorAll('.notak-sommaire-ligne')].map((l) => l.textContent)).toEqual(['Un', 'Trois'])
    expect(titresDuRendu(zone.querySelector('.notak-blocs')).map((t) => t.niveau)).toEqual([1, 3])
    await act(async () => monte.unmount())
  })

  it('l’élément à atteindre est le dernier bloc visible avant un bloc caché', () => {
    const page = document.createElement('div')
    page.innerHTML = '<h2 id="a">D</h2><p id="b" class="notak-cache"></p><h3 id="c" class="notak-cache"></h3>'
    expect(elementVisible(page.querySelector<HTMLElement>('#c')!).id).toBe('a')
    expect(elementVisible(page.querySelector<HTMLElement>('#a')!).id).toBe('a')
  })
})
