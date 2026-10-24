// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditeurEquation, EditeurEtiquettes, EditeurLienSujet, EditeurLienWeb, EditeurTache, Popover } from './Insertions'
import { MenuContextuel } from './MenuContextuel'
import { etatBarre } from './Outils'
import type { Item } from './menus'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})
function monter(noeud: ReactElement) {
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const racine = createRoot(hote)
  racines.push(racine)
  act(() => racine.render(noeud))
  return hote
}
const clic = (e: Element) => act(() => void e.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const saisir = (c: HTMLInputElement | HTMLTextAreaElement, v: string) =>
  act(() => {
    const proto = c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(c, v)
    c.dispatchEvent(new Event('input', { bubbles: true }))
  })
const touche = (c: Element, key: string, init: KeyboardEventInit = {}) => act(() => void c.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init })))

describe('ce que la barre d’outils laisse faire selon la sélection', () => {
  it('rien de choisi : rien ; un sujet : tout ; plusieurs : étiquettes, À faire, lien web, autocollant — pas la tâche ni la pièce jointe', () => {
    expect(Object.values(etatBarre([])).every((v) => v === false)).toBe(true)
    expect(Object.values(etatBarre(['a'])).every((v) => v === true)).toBe(true)
    expect(etatBarre(['a', 'b'])).toMatchObject({ etiquette: true, aFaire: true, lienWeb: true, vignette: true, tache: false, note: false, piece: false, audio: false, image: false, equation: false, lienSujet: false })
  })
})

describe('l’éditeur d’étiquettes', () => {
  it('Entrée ou virgule ajoute, la croix retire, Retour arrière sur un champ vide retire la dernière', () => {
    const ajouter = vi.fn()
    const retirer = vi.fn()
    const h = monter(<EditeurEtiquettes noms={['a', 'b']} ajouter={ajouter} retirer={retirer} multiple={false} />)
    const champ = h.querySelector('input')!
    saisir(champ, 'urgent, idée')
    touche(champ, 'Enter')
    expect(ajouter.mock.calls).toEqual([['urgent'], ['idée']])
    clic(h.querySelector('[aria-label="Retirer a"]')!)
    expect(retirer).toHaveBeenCalledWith('a')
    touche(champ, 'Backspace')
    expect(retirer).toHaveBeenLastCalledWith('b')
  })

  it('sur plusieurs sujets, le champ ajoute à tous et ne montre rien d’un seul', () => {
    const h = monter(<EditeurEtiquettes noms={[]} ajouter={() => {}} retirer={() => {}} multiple />)
    expect(h.querySelector('input')!.placeholder).toBe('Ajouter à tous les sujets choisis')
    expect(h.querySelector('ul')).toBeNull()
  })
})

describe('l’éditeur de tâche', () => {
  it('chaque champ renvoie le planning, en disant lequel a changé', () => {
    const changer = vi.fn()
    const fermer = vi.fn()
    const h = monter(<EditeurTache planning={{ debut: '2026-03-02', duree: 3 }} changer={changer} fermer={fermer} />)
    const [debut, fin, duree] = [...h.querySelectorAll<HTMLInputElement>('input')]
    saisir(fin!, '2026-03-09')
    expect(changer).toHaveBeenLastCalledWith({ debut: '2026-03-02', duree: 3, fin: '2026-03-09' }, 'fin')
    saisir(duree!, '7')
    expect(changer).toHaveBeenLastCalledWith({ debut: '2026-03-02', duree: 7 }, 'duree')
    saisir(debut!, '2026-04-01')
    expect(changer).toHaveBeenLastCalledWith({ debut: '2026-04-01', duree: 3 }, 'debut')
    saisir(h.querySelector('input[type=range]')!, '60')
    expect(changer).toHaveBeenLastCalledWith({ debut: '2026-03-02', duree: 3, progression: 60 })
    clic([...h.querySelectorAll('button')].find((b) => b.textContent === 'Supprimer la tâche')!)
    expect(changer).toHaveBeenLastCalledWith(undefined)
    expect(fermer).toHaveBeenCalled()
  })

  it('sans tâche, pas de bouton Supprimer', () => {
    const h = monter(<EditeurTache planning={undefined} changer={() => {}} fermer={() => {}} />)
    expect([...h.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['OK'])
  })
})

describe('l’éditeur de lien', () => {
  it('web : Entrée valide l’adresse ; Supprimer le lien la vide', () => {
    const valider = vi.fn()
    const h = monter(<EditeurLienWeb adresse="https://notak.app" valider={valider} />)
    saisir(h.querySelector('input')!, ' https://exemple.org ')
    touche(h.querySelector('input')!, 'Enter')
    expect(valider).toHaveBeenLastCalledWith('https://exemple.org')
    clic([...h.querySelectorAll('button')].find((b) => b.textContent === 'Supprimer le lien')!)
    expect(valider).toHaveBeenLastCalledWith('')
  })

  it('sujet : une liste filtrable des autres sujets de la carte', () => {
    let a = nouvelArbre('Central')
    const c = lire(a).central
    let x: string, y: string
    ;[a, x] = ajouterEnfant(a, c, 'Alpha')
    ;[a, y] = ajouterEnfant(a, c, 'Beta')
    const valider = vi.fn()
    const h = monter(<EditeurLienSujet lecture={lire(a)} depuis={x} choisi={null} valider={valider} />)
    expect([...h.querySelectorAll('[role=option]')].map((o) => o.textContent)).toEqual(['Central', 'Beta'])
    saisir(h.querySelector('input')!, 'bet')
    expect([...h.querySelectorAll('[role=option]')].map((o) => o.textContent)).toEqual(['Beta'])
    clic(h.querySelector('[role=option]')!)
    expect(valider).toHaveBeenCalledWith(y)
  })
})

describe('l’éditeur d’équation', () => {
  it('montre l’aperçu en MathML à mesure, refuse un LaTeX invalide, Cmd+Entrée valide', () => {
    const valider = vi.fn()
    const h = monter(<EditeurEquation latex="" valider={valider} />)
    const champ = h.querySelector('textarea')!
    const ok = [...h.querySelectorAll('button')].find((b) => b.textContent === 'OK')!
    expect(ok.disabled).toBe(true)
    saisir(champ, '\\frac{a}{')
    expect(h.querySelector('.notak-arbre-erreur')!.textContent).toBe('LaTeX invalide')
    expect(ok.disabled).toBe(true)
    touche(champ, 'Enter', { metaKey: true })
    expect(valider).not.toHaveBeenCalled()
    saisir(champ, '\\frac{a}{b}')
    expect(h.querySelector('.notak-arbre-apercu-equation math')).toBeTruthy()
    expect(ok.disabled).toBe(false)
    touche(champ, 'Enter', { metaKey: true })
    expect(valider).toHaveBeenCalledWith('\\frac{a}{b}')
  })
})

describe('le popover', () => {
  it('se pose près du sujet, garde le focus sur son champ, se ferme à Échap et au clic dehors ; ses touches ne vont pas à la carte', () => {
    const fermer = vi.fn()
    const surCarte = vi.fn()
    const h = monter(
      <div onKeyDown={surCarte}>
        <Popover ancre={{ x: 100, y: 100, l: 80, h: 30 }} titre="Étiquettes" fermer={fermer}>
          <div className="notak-arbre-popover-corps">
            <input type="text" />
          </div>
        </Popover>
      </div>,
    )
    expect(h.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('Étiquettes')
    expect(document.activeElement).toBe(h.querySelector('input'))
    touche(h.querySelector('input')!, 'a')
    expect(surCarte).not.toHaveBeenCalled()
    act(() => void document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(fermer).toHaveBeenCalledTimes(1)
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(fermer).toHaveBeenCalledTimes(2)
  })
})

describe('le menu contextuel', () => {
  const items: Item[] = [
    { id: 'copier', libelle: 'Copier', touche: '⌘C' },
    { id: 'coller', libelle: 'Coller', inactif: true },
    'sep',
    { id: 'inserer', libelle: 'Insérer', sous: [{ id: 'inserer.note', libelle: 'Note' }] },
  ]

  it('liste ses entrées, grise celles qui ne sont pas disponibles, ouvre un sous-menu, rend l’identifiant choisi', () => {
    const choisir = vi.fn()
    const fermer = vi.fn()
    const h = monter(<MenuContextuel x={20} y={30} items={items} choisir={choisir} fermer={fermer} />)
    const boutons = [...h.querySelectorAll('button')]
    expect(boutons.map((b) => b.querySelector('.notak-arbre-entree-libelle')!.textContent)).toEqual(['Copier', 'Coller', 'Insérer'])
    expect(boutons[1]!.disabled).toBe(true)
    expect(h.querySelectorAll('hr')).toHaveLength(1)
    clic(boutons[0]!)
    expect(choisir).toHaveBeenLastCalledWith('copier')
    clic(boutons[2]!)
    const note = [...h.querySelectorAll('.notak-arbre-sous-menu button')]
    expect(note).toHaveLength(1)
    clic(note[0]!)
    expect(choisir).toHaveBeenLastCalledWith('inserer.note')
  })

  it('Échap et un clic dehors le ferment ; les flèches passent d’une entrée active à l’autre', () => {
    const fermer = vi.fn()
    const h = monter(<MenuContextuel x={0} y={0} items={items} choisir={() => {}} fermer={fermer} />)
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement!.textContent).toContain('Copier')
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    // « Coller » est grisé : la flèche saute à « Insérer ».
    expect(document.activeElement!.textContent).toContain('Insérer')
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(fermer).toHaveBeenCalledTimes(1)
    act(() => void document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(fermer).toHaveBeenCalledTimes(2)
    expect(h.querySelector('[role=menu]')).toBeTruthy()
  })
})
