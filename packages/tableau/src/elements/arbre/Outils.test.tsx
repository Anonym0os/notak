// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionsInsertion } from './actionsMenu'
import { Outils } from './Outils'
import { lire, nouvelArbre, ajouterEnfant } from './modele/sujets'
import { largeurPilule } from './repliBarre'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

const AGIR: (keyof ActionsInsertion)[] = ['zone', 'etiquettes', 'tache', 'aFaire', 'note', 'lienWeb', 'lienSujet', 'pieceJointe', 'noteAudio', 'marqueur', 'autocollant', 'illustration', 'imageLocale', 'equation']

/** La fenêtre de la carte telle que la barre la voit : l'en-tête (maison, panneau, titre) et le bloc de droite à côté d'elle. */
function monter(choisir = true) {
  const arbre = nouvelArbre('Central')
  const [a, x] = ajouterEnfant(arbre, lire(arbre).central, 'Idée')
  const actions = Object.fromEntries(AGIR.map((n) => [n, vi.fn()])) as unknown as Record<keyof ActionsInsertion, ReturnType<typeof vi.fn>>
  const relier = vi.fn()
  const faire = vi.fn()
  const fenetre = document.createElement('div')
  fenetre.className = 'notak-arbre-fenetre'
  document.body.append(fenetre)
  const racine = createRoot(fenetre)
  racines.push(racine)
  act(() =>
    racine.render(
      <div className="notak-arbre-scene">
        <div className="notak-arbre-entete">
          <div className="notak-arbre-nom">Titre</div>
        </div>
        <Outils arbre={a} lecture={lire(a)} choisis={choisir ? [x] : []} courant={x} faire={faire} relier={relier} actions={actions as unknown as ActionsInsertion} />
        <div className="notak-arbre-droite" />
      </div>,
    ),
  )
  const q = <T extends Element>(s: string) => document.querySelector<T>(s)
  const barre = q<HTMLElement>('.notak-arbre-outils')!
  /** Donne à la zone, au titre et au bloc de droite les mesures qu'une fenêtre de cette largeur leur donnerait, puis prévient la barre. */
  const mesurer = (largeur: number, titre = 100) => {
    const rect = (left: number, w: number) => () => ({ left, right: left + w, width: w, top: 0, bottom: 36, height: 36, x: left, y: 0, toJSON() {} }) as DOMRect
    const scene = q<HTMLElement>('.notak-arbre-scene')!
    scene.getBoundingClientRect = rect(0, largeur)
    // Titre replié : il n'est plus affiché, donc plus mesuré, et l'en-tête se referme sur la maison et le bouton du panneau.
    const replie = () => barre.dataset.titre === 'replie'
    q<HTMLElement>('.notak-arbre-entete')!.getBoundingClientRect = () => (replie() ? rect(8, 96)() : rect(8, 108 + titre)())
    q<HTMLElement>('.notak-arbre-nom')!.getBoundingClientRect = () => (replie() ? rect(0, 0)() : rect(116, titre)())
    q<HTMLElement>('.notak-arbre-droite')!.getBoundingClientRect = rect(largeur - 138, 138)
    act(() => void window.dispatchEvent(new Event('resize')))
  }
  const boutons = () => [...barre.querySelectorAll<HTMLButtonElement>(':scope > .notak-arbre-bouton:not(.notak-arbre-plus)')].map((b) => b.getAttribute('aria-label'))
  const plus = () => q<HTMLButtonElement>('.notak-arbre-plus')!
  const clic = (e: Element) => act(() => void e.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  const menu = () => [...document.querySelectorAll('.notak-arbre-ctx > button, .notak-arbre-ctx > hr, .notak-arbre-ctx > .notak-arbre-menu-hote > button')].map((b) => (b.tagName === 'HR' ? '—' : b.querySelector('.notak-arbre-entree-libelle')!.textContent))
  return { q, barre, mesurer, boutons, plus, clic, menu, actions, relier, faire }
}

describe('la barre d’outils', () => {
  it('six boutons, puis le « + » de 48 de large avec son plus et son chevron', () => {
    const m = monter()
    expect(m.boutons()).toHaveLength(6)
    expect(m.plus().querySelectorAll('svg')).toHaveLength(2)
    expect(m.plus().getAttribute('aria-expanded')).toBe('false')
    expect(m.barre.className).not.toContain('notak-arbre-barre')
  })

  it('un bouton agit : la relation, la zone', () => {
    const m = monter()
    m.clic(m.q('.notak-arbre-outils [aria-label^="Créer une zone"]')!)
    expect(m.actions.zone).toHaveBeenCalledTimes(1)
    m.clic(m.q('.notak-arbre-outils [aria-label^="Créer un lien"]')!)
    expect(m.relier).toHaveBeenCalledTimes(1)
  })

  it('le « + » ouvre son menu, qui sort de la pilule ; un second clic le ferme', () => {
    const m = monter()
    m.clic(m.plus())
    expect(m.plus().getAttribute('aria-expanded')).toBe('true')
    expect(m.menu()).toEqual(['Note', 'Tâches à faire', 'Lien', '—', 'Pièce jointe', 'Note audio', '—', 'Autocollant', 'Illustration', 'Image locale', 'Équation'])
    // Posé dans la fenêtre de la carte, pas dans la pilule : son flou voit la carte.
    expect(m.barre.querySelector('.notak-arbre-ctx')).toBeNull()
    expect(m.q('.notak-arbre-fenetre > .notak-arbre-ctx')).toBeTruthy()
    // Chaque entrée porte son icône.
    expect(document.querySelectorAll('.notak-arbre-ctx button .notak-arbre-entree-icone svg')).toHaveLength(9)
    m.clic(m.plus())
    expect(m.q('.notak-arbre-ctx')).toBeNull()
  })

  it('une entrée du menu fait son geste et ferme le menu', () => {
    const m = monter()
    m.clic(m.plus())
    m.clic([...document.querySelectorAll('.notak-arbre-ctx > button')].find((b) => b.textContent!.startsWith('Note audio'))!)
    expect(m.actions.noteAudio).toHaveBeenCalledTimes(1)
    expect(m.q('.notak-arbre-ctx')).toBeNull()
  })

  it('un clic dehors, comme Échap, ferme le menu', () => {
    const m = monter()
    m.clic(m.plus())
    act(() => void document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(m.q('.notak-arbre-ctx')).toBeNull()
    m.clic(m.plus())
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(m.q('.notak-arbre-ctx')).toBeNull()
  })

  it('la barre garde ses touches : elles ne montent pas à la carte (Échap, si)', () => {
    const m = monter()
    const monte: string[] = []
    const ecouteur = (e: Event) => monte.push((e as KeyboardEvent).key)
    document.body.addEventListener('keydown', ecouteur)
    const bouton = m.barre.querySelector('button')!
    act(() => void bouton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    act(() => void bouton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    document.body.removeEventListener('keydown', ecouteur)
    // React écoute à la racine du conteneur : une touche arrêtée par la barre n'arrive pas au corps du document.
    expect(monte).toEqual(['Escape'])
  })
})

describe('le repli quand la place manque', () => {
  it('tout tient : six boutons, le titre affiché, la barre centrée', () => {
    const m = monter()
    m.mesurer(900)
    expect(m.boutons()).toHaveLength(6)
    expect(m.barre.dataset.titre).toBeUndefined()
    expect(m.barre.style.left).toBe(`${(900 - largeurPilule(6)) / 2}px`)
    expect(m.barre.hidden).toBe(false)
  })

  it('le titre cède le premier, puis les boutons de droite à gauche, qui passent en tête du menu « + »', () => {
    const m = monter()
    m.mesurer(600)
    expect(m.barre.dataset.titre).toBe('replie')
    expect(m.boutons()).toHaveLength(6)
    m.mesurer(480)
    expect(m.boutons()).toHaveLength(4)
    m.clic(m.plus())
    expect(m.menu().slice(0, 4)).toEqual(['Étiquette', 'Tâche', '—', 'Note'])
  })

  it('une entrée repliée fait ce que faisait son bouton', () => {
    const m = monter()
    m.mesurer(350)
    expect(m.boutons()).toHaveLength(0)
    m.clic(m.plus())
    expect(m.menu().slice(0, 7)).toEqual(['Relation', 'Résumé', 'Limite', 'Zone', 'Étiquette', 'Tâche', '—'])
    m.clic([...document.querySelectorAll('.notak-arbre-ctx > button')].find((b) => b.textContent!.startsWith('Zone'))!)
    expect(m.actions.zone).toHaveBeenCalledTimes(1)
  })

  it('les boutons repliés gardent leur état : grisés quand la sélection ne le permet pas', () => {
    const m = monter(false)
    m.mesurer(350)
    m.clic(m.plus())
    const entree = (nom: string) => [...document.querySelectorAll<HTMLButtonElement>('.notak-arbre-ctx > button')].find((b) => b.textContent!.startsWith(nom))!
    expect(entree('Étiquette').disabled).toBe(true)
    expect(entree('Zone').disabled).toBe(false)
  })

  it('la fenêtre s’élargit : les boutons reviennent', () => {
    const m = monter()
    m.mesurer(350)
    expect(m.boutons()).toHaveLength(0)
    m.mesurer(900)
    expect(m.boutons()).toHaveLength(6)
    expect(m.barre.dataset.titre).toBeUndefined()
  })

  it('même le « + » seul ne tient pas : la barre se retire', () => {
    const m = monter()
    m.mesurer(300)
    expect(m.barre.hidden).toBe(true)
  })
})
