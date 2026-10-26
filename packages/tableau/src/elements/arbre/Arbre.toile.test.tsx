// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { Arbre, Element as ElementToile, Id } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { RenduArbre } from './Arbre'
import { ajouterEnfant, ajouterFlottant, enfantsDe, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.assign(HTMLElement.prototype, { setPointerCapture() {}, releasePointerCapture() {} })

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

/** La carte ouverte en grand, avec un faux magasin : la surface n'a pas de taille en jsdom, la carte y est à l'origine, au zoom 1. */
function ouvrir(contenu: Arbre) {
  let element: ElementToile<Arbre> = { id: 'k', x: 0, y: 0, largeur: 40, contenu }
  const ecouteurs = new Set<() => void>()
  const contexte = {
    magasin: { lire: () => ({ elements: [element] }), ecouter: (f: () => void) => (ecouteurs.add(f), () => ecouteurs.delete(f)), annuler() {}, retablir() {} },
    services: {},
    finirEdition() {},
  } as unknown as ContexteToile
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const racine = createRoot(hote)
  racines.push(racine)
  const changer = (a: Arbre) => {
    element = { ...element, contenu: a }
    ecouteurs.forEach((f) => f())
  }
  act(() => racine.render(<RenduArbre element={element} choisie brouillon={() => {}} enEdition contexte={contexte} changer={changer} />))
  return { courant: () => element.contenu }
}

const fond = () => document.querySelector('.notak-arbre-fond') as HTMLElement
const surface = () => document.querySelector('.notak-arbre-surface') as HTMLElement
const sujet = (titre: string) => [...document.querySelectorAll('.notak-arbre-surface [data-sujet]')].find((s) => s.textContent === titre) as SVGElement
const sujets = () => document.querySelectorAll('.notak-arbre-surface [data-sujet]').length
const champ = () => document.querySelector('textarea.notak-arbre-champ') as HTMLTextAreaElement | null
const choisi = (titre: string) => !!sujet(titre)?.querySelector('.notak-arbre-choix')
const camera = () => (document.querySelector('.notak-arbre-grand > g') as SVGElement).style.transform

/** La boîte d'un sujet à l'écran (px de carte = px de fenêtre : caméra à l'origine, zoom 1). */
function boite(titre: string) {
  const s = sujet(titre)
  const [, x, y] = s.getAttribute('transform')!.match(/translate\((-?[\d.]+) (-?[\d.]+)\)/)!
  const r = s.querySelector('rect')!
  return { x: Number(x), y: Number(y), l: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) }
}
const milieu = (titre: string) => {
  const b = boite(titre)
  return { x: b.x + b.l / 2, y: b.y + b.h / 2 }
}

const pointeur = (e: Element, type: string, x: number, y: number, init: PointerEventInit = {}) =>
  act(() => void e.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...init })))
const touche = (key: string, init: KeyboardEventInit = {}) => act(() => void fond().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })))
const ecrire = (c: HTMLTextAreaElement, valeur: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(c, valeur)
    c.dispatchEvent(new Event('input', { bubbles: true }))
  })
const toucheChamp = (key: string, init: KeyboardEventInit = {}) => act(() => void champ()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })))

/** Un appui puis un relâchement sur un sujet : il est choisi. */
const choisir = (titre: string) => {
  const m = milieu(titre)
  pointeur(sujet(titre), 'pointerdown', m.x, m.y)
  pointeur(surface(), 'pointerup', m.x, m.y)
}

/** Central ; Idées (Alpha, Beta) ; Autre ; un flottant, loin. */
function base() {
  let a: Arbre = nouvelArbre('Central')
  const c = lire(a).central
  let idees: Id, autre: Id
  ;[a, idees] = ajouterEnfant(a, c, 'Idées')
  ;[a, autre] = ajouterEnfant(a, c, 'Autre')
  ;[a] = ajouterEnfant(a, idees, 'Alpha')
  ;[a] = ajouterEnfant(a, idees, 'Beta')
  ;[a] = ajouterFlottant(a, { x: 400, y: 300 }, 'Libre')
  return { a, c, idees, autre }
}

describe('Entrée, Tab et la frappe', () => {
  it('Entrée crée un frère et le choisit, sans ouvrir le champ', () => {
    const { a } = base()
    const c = ouvrir(a)
    const avant = sujets()
    choisir('Idées')
    touche('Enter')
    expect(sujets()).toBe(avant + 1)
    expect(champ()).toBeNull()
    expect(choisi('Idées')).toBe(false)
    const l = lire(c.courant())
    expect([...l.sujets.values()].map((s) => s.titre)).toContain('Sujet principal 3')
  })

  it('Tab crée un sous-sujet choisi, sans ouvrir le champ ; Maj+Entrée un frère avant', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Idées')
    touche('Tab')
    expect(champ()).toBeNull()
    expect(sujets()).toBe(7)
    touche('Enter', { shiftKey: true })
    expect(champ()).toBeNull()
    expect(sujets()).toBe(8)
  })

  it('taper un caractère ouvre le champ et remplace le titre ; Entrée valide', () => {
    const { a, idees } = base()
    const c = ouvrir(a)
    choisir('Idées')
    touche('x')
    expect(champ()).not.toBeNull()
    expect(champ()!.value).toBe('x')
    ecrire(champ()!, 'xy')
    toucheChamp('Enter')
    expect(champ()).toBeNull()
    expect(c.courant().sujets[idees]!.titre).toBe('xy')
  })

  it('Espace ouvre le champ sur le titre, le curseur à la fin ; un sujet jamais titré s’ouvre tout sélectionné', () => {
    const { a } = base()
    const c = ouvrir(a)
    choisir('Idées')
    touche(' ')
    expect(champ()!.value).toBe('Idées')
    expect(champ()!.selectionStart).toBe(5)
    expect(champ()!.selectionEnd).toBe(5)
    toucheChamp('Escape')
    // Un sujet neuf porte son titre par défaut : Espace le sélectionne en entier.
    touche('Enter')
    touche(' ')
    const l = lire(c.courant())
    expect(champ()!.value).toBe([...l.sujets.values()].find((s) => s.titre.startsWith('Sujet principal'))!.titre)
    expect(champ()!.selectionStart).toBe(0)
    expect(champ()!.selectionEnd).toBe(champ()!.value.length)
  })

  it('Échap annule : le titre ne change pas ; Tab valide', () => {
    const { a, idees } = base()
    const c = ouvrir(a)
    choisir('Idées')
    touche('x')
    ecrire(champ()!, 'abandonné')
    toucheChamp('Escape')
    expect(champ()).toBeNull()
    expect(c.courant().sujets[idees]!.titre).toBe('Idées')
    touche(' ')
    ecrire(champ()!, 'validé par Tab')
    toucheChamp('Tab')
    expect(champ()).toBeNull()
    expect(c.courant().sujets[idees]!.titre).toBe('validé par Tab')
  })

  it('Maj+Entrée et Cmd+Entrée vont à la ligne sans valider', () => {
    const { a, idees } = base()
    const c = ouvrir(a)
    choisir('Idées')
    touche(' ')
    ecrire(champ()!, 'a')
    // Maj+Entrée : le champ laisse faire le navigateur (rien n'est annulé par lui).
    const maj = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
    act(() => void champ()!.dispatchEvent(maj))
    expect(maj.defaultPrevented).toBe(false)
    expect(champ()).not.toBeNull()
    champ()!.setSelectionRange(1, 1)
    toucheChamp('Enter', { metaKey: true })
    expect(champ()!.value).toBe('a\n')
    toucheChamp('Enter')
    expect(c.courant().sujets[idees]!.titre).toBe('a\n')
  })
})

describe('le champ d’un titre', () => {
  it('est transparent, sans bordure, posé dans le repère de la carte', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Idées')
    touche(' ')
    const c = champ()!
    expect(c.className).toBe('notak-arbre-champ')
    expect(c.closest('.notak-arbre-repere')).not.toBeNull()
    expect((c.closest('.notak-arbre-repere') as HTMLElement).style.transform).toContain('scale(1)')
    // À la police du sujet, en px de carte : le zoom est celui du repère.
    expect(c.style.font).toContain('Inter')
    expect(c.style.font).toMatch(/\d+px ?\/ ?[\d.]+px/)
  })

  it('suit le zoom : même taille de police en px de carte, la caméra fait le reste', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Idées')
    touche(' ')
    const avant = champ()!.style.font
    act(() => void surface().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -20, clientX: 0, clientY: 0 })))
    expect(champ()!.style.font).toBe(avant)
    expect((champ()!.closest('.notak-arbre-repere') as HTMLElement).style.transform).toContain('scale(1.2)')
  })

  it('est posé sur le texte : à la position du texte du sujet', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Idées')
    const b = boite('Idées')
    touche(' ')
    const [x, y] = [parseFloat(champ()!.style.left), parseFloat(champ()!.style.top)]
    expect(x).toBeGreaterThan(b.x)
    expect(x).toBeLessThan(b.x + b.l)
    expect(y).toBeGreaterThanOrEqual(b.y - 1)
    expect(y).toBeLessThan(b.y + b.h)
  })

  it('le sujet grandit pendant la frappe : sa boîte s’élargit, puis s’allonge quand le titre passe à la ligne', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Idées')
    const tailles = () => [...document.querySelectorAll('.notak-arbre-surface [data-sujet]')].map((s) => s.querySelector('rect')!).map((r) => [Number(r.getAttribute('width')), Number(r.getAttribute('height'))] as const)
    const avant = tailles()
    touche(' ')
    ecrire(champ()!, 'Un titre assez long pour être plus large que celui qu’il remplace')
    expect(Math.max(...tailles().map((t) => t[0]))).toBeGreaterThan(Math.max(...avant.map((t) => t[0])))
    const large = Math.max(...tailles().map((t) => t[1]))
    ecrire(champ()!, 'Un titre vraiment très long qui doit passer à la ligne automatiquement dans le sujet, à la largeur maximale du rang, et encore un peu plus loin')
    expect(Math.max(...tailles().map((t) => t[1]))).toBeGreaterThan(large)
    // Le texte n'est plus dessiné par le sujet : il est dans le champ.
    expect(champ()!.value).toContain('largeur maximale')
  })

  it('le contour de sélection reste visible autour du sujet pendant l’édition', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Idées')
    touche(' ')
    expect(document.querySelectorAll('.notak-arbre-surface .notak-arbre-choix').length).toBe(1)
  })
})

describe('le cadre de sélection', () => {
  it('un glisser sur le fond choisit les sujets qu’il touche, en direct, et disparaît au lâcher', () => {
    const { a } = base()
    ouvrir(a)
    const idees = boite('Idées')
    const autre = boite('Autre')
    // Un coin du fond, loin de tout.
    pointeur(surface(), 'pointerdown', 900, 900)
    expect(document.querySelector('.notak-arbre-cadre')).toBeNull()
    pointeur(surface(), 'pointermove', 901, 901)
    expect(document.querySelector('.notak-arbre-cadre')).toBeNull()
    pointeur(surface(), 'pointermove', idees.x + 5, idees.y + 5)
    const r = document.querySelector('.notak-arbre-cadre')!
    expect(r).not.toBeNull()
    expect(choisi('Idées')).toBe(true)
    // Plus loin, le cadre touche aussi l'autre sujet.
    pointeur(surface(), 'pointermove', autre.x + 5, autre.y + 5)
    expect(choisi('Autre')).toBe(true)
    // Le rétrécir lâche : le cadre remplace la sélection.
    pointeur(surface(), 'pointermove', idees.x + idees.l + 400, idees.y + idees.h + 40)
    pointeur(surface(), 'pointerup', idees.x + idees.l + 400, idees.y + idees.h + 40)
    expect(document.querySelector('.notak-arbre-cadre')).toBeNull()
  })

  it('un cadre qui ne touche rien vide la sélection ; un appui simple sur le fond la vide', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Idées')
    expect(choisi('Idées')).toBe(true)
    pointeur(surface(), 'pointerdown', 900, 900)
    pointeur(surface(), 'pointerup', 900, 900)
    expect(choisi('Idées')).toBe(false)
    expect(document.querySelectorAll('.notak-arbre-choix')).toHaveLength(0)
  })

  it('Maj garde la sélection d’avant et ajoute ce que le cadre touche, sans jamais rien retirer', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Autre')
    const idees = boite('Idées')
    pointeur(surface(), 'pointerdown', 900, 900, { shiftKey: true })
    pointeur(surface(), 'pointermove', idees.x + 5, idees.y + 5, { shiftKey: true })
    expect(choisi('Idées')).toBe(true)
    expect(choisi('Autre')).toBe(true)
    pointeur(surface(), 'pointermove', 900, 900, { shiftKey: true })
    expect(choisi('Idées')).toBe(true)
    expect(choisi('Autre')).toBe(true)
    pointeur(surface(), 'pointerup', 900, 900, { shiftKey: true })
  })

  it('Échap arrête le cadre : il disparaît, la sélection garde ce qu’il avait pris', () => {
    const { a } = base()
    ouvrir(a)
    const idees = boite('Idées')
    pointeur(surface(), 'pointerdown', 900, 900)
    pointeur(surface(), 'pointermove', idees.x + 5, idees.y + 5)
    expect(choisi('Idées')).toBe(true)
    touche('Escape')
    expect(document.querySelector('.notak-arbre-cadre')).toBeNull()
    expect(choisi('Idées')).toBe(true)
    pointeur(surface(), 'pointermove', 905, 905)
    pointeur(surface(), 'pointerup', 905, 905)
    expect(document.querySelector('.notak-arbre-cadre')).toBeNull()
  })
})

describe('le défilement', () => {
  it('le clic droit glissé défile la carte, sans menu ; sans glisser, il ouvre le menu au relâchement', async () => {
    const { a } = base()
    ouvrir(a)
    expect(camera()).toContain('translate(0px, 0px)')
    // macOS : le menu contextuel naît à l'appui, il attend.
    pointeur(surface(), 'pointerdown', 300, 300, { button: 2, buttons: 2 })
    act(() => void surface().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })))
    expect(document.querySelector('.notak-arbre-ctx')).toBeNull()
    pointeur(surface(), 'pointermove', 340, 310, { button: 2, buttons: 2 })
    expect(camera()).toContain('translate(40px, 10px)')
    pointeur(surface(), 'pointerup', 340, 310, { button: 2, buttons: 0 })
    expect(document.querySelector('.notak-arbre-ctx')).toBeNull()
    // Le menu ne se supprime que le temps de l'événement : le tour suivant, un clic droit sans glisser en ouvre un.
    await new Promise((r) => setTimeout(r, 5))
    // Sans glisser : un menu.
    pointeur(surface(), 'pointerdown', 300, 300, { button: 2, buttons: 2 })
    act(() => void surface().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })))
    pointeur(surface(), 'pointerup', 300, 300, { button: 2, buttons: 0 })
    expect(document.querySelector('.notak-arbre-ctx')).not.toBeNull()
  })

  it('Windows : le menu arrive après le relâchement ; un glisser le supprime', () => {
    const { a } = base()
    ouvrir(a)
    pointeur(surface(), 'pointerdown', 300, 300, { button: 2, buttons: 2 })
    pointeur(surface(), 'pointermove', 350, 300, { button: 2, buttons: 2 })
    pointeur(surface(), 'pointerup', 350, 300, { button: 2, buttons: 0 })
    act(() => void surface().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 350, clientY: 300 })))
    expect(document.querySelector('.notak-arbre-ctx')).toBeNull()
  })

  it('glisser le sujet central fait défiler la carte, sans déplacer le sujet', () => {
    const { a } = base()
    const c = ouvrir(a)
    const m = milieu('Central')
    pointeur(sujet('Central'), 'pointerdown', m.x, m.y)
    pointeur(surface(), 'pointermove', m.x + 60, m.y + 20)
    expect(camera()).toContain('translate(60px, 20px)')
    pointeur(surface(), 'pointerup', m.x + 60, m.y + 20)
    expect(c.courant()).toBe(a)
    expect(document.querySelector('.notak-arbre-depot')).toBeNull()
  })

  it('la molette défile 1 pour 1 ; Cmd+molette zoome autour du pointeur, entre 0,02 et 8', () => {
    const { a } = base()
    ouvrir(a)
    const roue = (init: WheelEventInit) => act(() => void surface().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 0, clientY: 0, ...init })))
    roue({ deltaX: 12, deltaY: 30 })
    expect(camera()).toContain('translate(-12px, -30px)')
    for (let i = 0; i < 60; i++) roue({ metaKey: true, deltaY: -50 })
    expect(camera()).toContain('scale(8)')
    for (let i = 0; i < 60; i++) roue({ metaKey: true, deltaY: 50 })
    expect(camera()).toContain('scale(0.02)')
  })
})

describe('glisser un sujet', () => {
  it('au-delà de 2 px : le fantôme suit, l’original s’estompe, le repère montre où il ira', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Autre')
    const [de, vers] = [milieu('Autre'), milieu('Idées')]
    pointeur(sujet('Autre'), 'pointerdown', de.x, de.y)
    pointeur(surface(), 'pointermove', de.x + 2, de.y)
    expect(document.querySelector('[opacity="0.7"]')).toBeNull()
    pointeur(surface(), 'pointermove', vers.x, vers.y)
    expect(document.querySelector('g[opacity="0.7"]')).not.toBeNull()
    expect(document.querySelector('g[opacity="0.3"]')).not.toBeNull()
    const repere = document.querySelector('.notak-arbre-depot')!
    expect(repere.getAttribute('width')).toBe('50')
    expect(repere.getAttribute('height')).toBe('18')
    expect(repere.getAttribute('rx')).toBe('4')
    expect(document.querySelector('.notak-arbre-depot-trait')).not.toBeNull()
    expect(surface().getAttribute('data-curseur')).toBe('sujet')
    pointeur(surface(), 'pointerup', vers.x, vers.y)
    expect(document.querySelector('.notak-arbre-depot')).toBeNull()
    expect(document.querySelector('g[opacity="0.7"]')).toBeNull()
  })

  it('lâché sur un sujet, il en devient l’enfant', () => {
    const { a, idees, autre } = base()
    const c = ouvrir(a)
    const [de, vers] = [milieu('Autre'), milieu('Idées')]
    pointeur(sujet('Autre'), 'pointerdown', de.x, de.y)
    pointeur(surface(), 'pointermove', vers.x, vers.y)
    pointeur(surface(), 'pointerup', vers.x, vers.y)
    const l = lire(c.courant())
    expect(l.sujets.get(autre)!.parent).toBe(idees)
    expect(enfantsDe(l, idees)).toContain(autre)
  })

  it('lâché hors de toute cible, il devient flottant', () => {
    const { a, autre } = base()
    const c = ouvrir(a)
    const de = milieu('Autre')
    pointeur(sujet('Autre'), 'pointerdown', de.x, de.y)
    pointeur(surface(), 'pointermove', 700, 600)
    expect(document.querySelector('.notak-arbre-depot')).toBeNull()
    pointeur(surface(), 'pointerup', 700, 600)
    expect(lire(c.courant()).sujets.get(autre)!.genre).toBe('detache')
  })

  it('Maj détache : il flotte, même lâché sur un sujet', () => {
    const { a, autre } = base()
    const c = ouvrir(a)
    const [de, vers] = [milieu('Autre'), milieu('Idées')]
    pointeur(sujet('Autre'), 'pointerdown', de.x, de.y)
    pointeur(surface(), 'pointermove', vers.x, vers.y, { shiftKey: true })
    expect(document.querySelector('.notak-arbre-depot')).toBeNull()
    pointeur(surface(), 'pointerup', vers.x, vers.y, { shiftKey: true })
    expect(lire(c.courant()).sujets.get(autre)!.genre).toBe('detache')
  })

  it('Alt copie : l’original reste, la copie se pose sur la cible', () => {
    const { a, idees, autre } = base()
    const c = ouvrir(a)
    const [de, vers] = [milieu('Autre'), milieu('Idées')]
    pointeur(sujet('Autre'), 'pointerdown', de.x, de.y)
    pointeur(surface(), 'pointermove', vers.x, vers.y, { altKey: true })
    expect(surface().getAttribute('data-curseur')).toBe('copie')
    pointeur(surface(), 'pointerup', vers.x, vers.y, { altKey: true })
    const l = lire(c.courant())
    expect(l.sujets.get(autre)!.parent).toBe(lire(a).central)
    const copies = enfantsDe(l, idees).filter((x) => l.sujets.get(x)!.titre === 'Autre')
    expect(copies).toHaveLength(1)
  })

  it('Échap annule : rien ne bouge, le repère et le fantôme disparaissent', () => {
    const { a } = base()
    const c = ouvrir(a)
    const [de, vers] = [milieu('Autre'), milieu('Idées')]
    pointeur(sujet('Autre'), 'pointerdown', de.x, de.y)
    pointeur(surface(), 'pointermove', vers.x, vers.y)
    expect(document.querySelector('.notak-arbre-depot')).not.toBeNull()
    touche('Escape')
    expect(document.querySelector('.notak-arbre-depot')).toBeNull()
    expect(document.querySelector('g[opacity="0.7"]')).toBeNull()
    pointeur(surface(), 'pointerup', vers.x, vers.y)
    expect(c.courant()).toBe(a)
  })

  it('plusieurs sujets choisis se déplacent ensemble', () => {
    const { a, idees, autre } = base()
    const c = ouvrir(a)
    // Alpha et Beta, choisis avec Cmd, glissés sur « Autre ».
    const [alpha, beta] = [milieu('Alpha'), milieu('Beta')]
    pointeur(sujet('Alpha'), 'pointerdown', alpha.x, alpha.y)
    pointeur(surface(), 'pointerup', alpha.x, alpha.y)
    pointeur(sujet('Beta'), 'pointerdown', beta.x, beta.y, { metaKey: true })
    pointeur(surface(), 'pointerup', beta.x, beta.y, { metaKey: true })
    expect(choisi('Alpha') && choisi('Beta')).toBe(true)
    const vers = milieu('Autre')
    pointeur(sujet('Alpha'), 'pointerdown', alpha.x, alpha.y)
    pointeur(surface(), 'pointermove', vers.x, vers.y)
    expect(document.querySelectorAll('g[opacity="0.7"]').length).toBe(2)
    pointeur(surface(), 'pointerup', vers.x, vers.y)
    const l = lire(c.courant())
    expect(enfantsDe(l, autre).map((x) => l.sujets.get(x)!.titre)).toEqual(['Alpha', 'Beta'])
    expect(enfantsDe(l, idees)).toHaveLength(0)
  })

  it('un appui sur un sujet d’une sélection multiple la garde ; relâché sans glisser, elle se réduit à lui', () => {
    const { a } = base()
    ouvrir(a)
    const [alpha, beta] = [milieu('Alpha'), milieu('Beta')]
    pointeur(sujet('Alpha'), 'pointerdown', alpha.x, alpha.y)
    pointeur(surface(), 'pointerup', alpha.x, alpha.y)
    pointeur(sujet('Beta'), 'pointerdown', beta.x, beta.y, { metaKey: true })
    pointeur(surface(), 'pointerup', beta.x, beta.y, { metaKey: true })
    pointeur(sujet('Alpha'), 'pointerdown', alpha.x, alpha.y)
    expect(choisi('Beta')).toBe(true)
    pointeur(surface(), 'pointerup', alpha.x, alpha.y)
    expect(choisi('Alpha')).toBe(true)
    expect(choisi('Beta')).toBe(false)
  })

  it('Cmd bascule un sujet dans la sélection', () => {
    const { a } = base()
    ouvrir(a)
    choisir('Alpha')
    const beta = milieu('Beta')
    pointeur(sujet('Beta'), 'pointerdown', beta.x, beta.y, { metaKey: true })
    pointeur(surface(), 'pointerup', beta.x, beta.y, { metaKey: true })
    expect(choisi('Beta')).toBe(true)
    pointeur(sujet('Beta'), 'pointerdown', beta.x, beta.y, { metaKey: true })
    pointeur(surface(), 'pointerup', beta.x, beta.y, { metaKey: true })
    expect(choisi('Beta')).toBe(false)
    expect(choisi('Alpha')).toBe(true)
  })
})

describe('le contour et les pastilles', () => {
  it('le survol dessine le contour à demi ; la sélection le dessine plein', () => {
    const { a } = base()
    ouvrir(a)
    const m = milieu('Autre')
    pointeur(sujet('Autre'), 'pointermove', m.x, m.y, { buttons: 0 })
    expect(sujet('Autre').querySelector('.notak-arbre-survol')).not.toBeNull()
    choisir('Autre')
    expect(sujet('Autre').querySelector('.notak-arbre-survol')).toBeNull()
    const contour = sujet('Autre').querySelector('.notak-arbre-choix')!
    expect(contour.getAttribute('stroke-width')).toBe('2')
    expect(contour.getAttribute('rx')).toBe('4')
    pointeur(surface(), 'pointerleave', 0, 0)
  })

  it('un sujet choisi seul porte deux pastilles « + » : un enfant, un frère', () => {
    const { a } = base()
    const c = ouvrir(a)
    act(() => void window.dispatchEvent(new Event('focus')))
    choisir('Autre')
    expect(document.querySelectorAll('.notak-arbre-ajout')).toHaveLength(2)
    const enfant = document.querySelector('[data-ajout^="enfant:"]')!
    pointeur(enfant, 'pointerdown', 0, 0)
    pointeur(surface(), 'pointerup', 0, 0)
    expect(sujets()).toBe(7)
    expect(lire(c.courant()).sujets.size).toBe(7)
    const frere = document.querySelector('[data-ajout^="frere:"]')!
    pointeur(frere, 'pointerdown', 0, 0)
    expect(sujets()).toBe(8)
  })

  it('pas de pastilles pour le central (un seul), sans focus de fenêtre, ni pour plusieurs sujets', () => {
    const { a } = base()
    ouvrir(a)
    act(() => void window.dispatchEvent(new Event('focus')))
    choisir('Central')
    expect(document.querySelectorAll('.notak-arbre-ajout')).toHaveLength(1)
    choisir('Autre')
    act(() => void window.dispatchEvent(new Event('blur')))
    expect(document.querySelectorAll('.notak-arbre-ajout')).toHaveLength(0)
    expect(document.querySelector('.notak-arbre-fenetre')!.hasAttribute('data-inactif')).toBe(true)
    act(() => void window.dispatchEvent(new Event('focus')))
    const beta = milieu('Beta')
    pointeur(sujet('Beta'), 'pointerdown', beta.x, beta.y, { metaKey: true })
    pointeur(surface(), 'pointerup', beta.x, beta.y, { metaKey: true })
    expect(document.querySelectorAll('.notak-arbre-ajout')).toHaveLength(0)
  })
})

describe('la barre du sujet choisi', () => {
  const barre = () => document.querySelector('.notak-arbre-sujet-barre')
  const clic = (e: Element) => act(() => void e.dispatchEvent(new MouseEvent('click', { bubbles: true })))

  it('flotte au-dessus d’un sujet choisi seul ; pas pendant l’édition ni pour plusieurs sujets', () => {
    const { a } = base()
    ouvrir(a)
    expect(barre()).not.toBeNull()
    choisir('Autre')
    expect(barre()).not.toBeNull()
    touche(' ')
    expect(barre()).toBeNull()
    toucheChamp('Escape')
    expect(barre()).not.toBeNull()
    const beta = milieu('Beta')
    pointeur(sujet('Beta'), 'pointerdown', beta.x, beta.y, { metaKey: true })
    pointeur(surface(), 'pointerup', beta.x, beta.y, { metaKey: true })
    expect(barre()).toBeNull()
  })

  it('ses boutons parlent aux éditeurs : la relation arme le tracé, la tâche coche le sujet', () => {
    const { a, autre } = base()
    const c = ouvrir(a)
    choisir('Autre')
    const boutons = [...barre()!.querySelectorAll('button')]
    clic(boutons[0]!)
    expect(surface().hasAttribute('data-relier')).toBe(true)
    touche('Escape')
    clic(barre()!.querySelectorAll('button')[4]!)
    expect(c.courant().sujets[autre]!.tache).toBe('a-faire')
  })

  it('la case d’une tâche se coche au clic, avec l’animation de la case commune, et se décoche de même', () => {
    const { a, autre } = base()
    const c = ouvrir(a)
    choisir('Autre')
    clic(barre()!.querySelectorAll('button')[4]!)
    const dessin = () => document.querySelector('[data-tache] .notak-case-svg') as SVGElement
    expect(dessin().dataset.etat).toBe('a-faire')
    expect(dessin().dataset.anime).toBeUndefined()
    const m = dessin().getBoundingClientRect()
    pointeur(document.querySelector('[data-tache]')!, 'pointerdown', m.x, m.y)
    expect(c.courant().sujets[autre]!.tache).toBe('faite')
    expect(dessin().dataset.etat).toBe('faite')
    expect(dessin().dataset.anime).toBe('coche')
    pointeur(document.querySelector('[data-tache]')!, 'pointerdown', m.x, m.y)
    expect(c.courant().sujets[autre]!.tache).toBe('a-faire')
    expect(dessin().dataset.anime).toBe('decoche')
  })

  it('le pinceau ouvre la fenêtre « Style » : un choix s’applique au sujet et la ferme ; Échap la ferme sans fermer la carte', () => {
    const { a, autre } = base()
    const c = ouvrir(a)
    choisir('Autre')
    clic(barre()!.querySelectorAll('button')[5]!)
    const fenetre = () => document.querySelector('.notak-arbre-choix-style')
    expect(fenetre()).toBeTruthy()
    const remplissage = fenetre()!.querySelectorAll('.notak-arbre-choix-style-couleurs')[0]!.querySelector('button')!
    clic(remplissage)
    expect(c.courant().sujets[autre]!.style?.remplissage?.toLowerCase()).toBe(remplissage.getAttribute('aria-label')!.toLowerCase())
    expect(fenetre()).toBeNull()
    clic(barre()!.querySelectorAll('button')[5]!)
    clic(fenetre()!.querySelector('.notak-arbre-style-rapide-ligne')!)
    expect(c.courant().sujets[autre]!.classe).toBe('important')
    clic(barre()!.querySelectorAll('button')[5]!)
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(fenetre()).toBeNull()
    expect(fond()).toBeTruthy()
  })
})
