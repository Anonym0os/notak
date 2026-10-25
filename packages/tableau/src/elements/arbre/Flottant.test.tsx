// @vitest-environment jsdom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarreBas, type PropsBarreBas } from './BarreBas'
import { ChoixTheme, PopoverFixe } from './ChoixTheme'
import { Flottant, MesureFlottant } from './Flottant'
import { Deroulant, Entree } from './Fenetre'
import { Popover as PopoverInsertions } from './Insertions'
import { MenuContextuel } from './MenuContextuel'
import { PopoverNote } from './PopoverNote'
import { MARGE_FENETRE } from './geometrieMenus'
import { MenuContextuel as MenuReglages, Popover as PopoverReglages } from './controles'
import { Popover as PopoverStyle } from './controles-style'
import type { Item } from './menus'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Les fenêtres flottantes ne sortent jamais de la fenêtre. jsdom n'a pas de mise en page : l'ancre est un faux élément
 * qui donne son rectangle, et la taille de la fenêtre flottante vient de `MesureFlottant` (la fenêtre de jsdom fait
 * 1024 × 768). Chaque composant est monté avec son ancre contre le bord droit et le bord bas ; le rectangle qu'il
 * s'est donné doit tenir dans la fenêtre, avec 8 px de marge.
 */

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

function monter(noeud: ReactNode, mesure?: { l: number; h: number }) {
  const hote = document.createElement('div')
  document.body.append(hote)
  const racine = createRoot(hote)
  racines.push(racine)
  const rendre = (n: ReactNode) => act(() => racine.render(mesure ? <MesureFlottant value={() => mesure}>{n}</MesureFlottant> : n))
  rendre(noeud)
  return { hote, rendre }
}

const FENETRE = { l: window.innerWidth, h: window.innerHeight }

interface Rect {
  left: number
  top: number
  width: number
  height: number
}
const rectDe = ({ left, top, width, height }: Rect) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })

/** Un faux élément qui dit où il est : tout ce que les fenêtres flottantes lui demandent. */
function faux(r: Rect) {
  let courant = r
  const el = { getBoundingClientRect: () => rectDe(courant), closest: () => null, contains: () => false, offsetWidth: r.width }
  return { el: el as unknown as HTMLElement, deplacer: (n: Rect) => (courant = n) }
}

/** Le rectangle que la fenêtre flottante s'est donné : sa position, et sa taille bornée si elle l'a été. */
function posee(noeud: Element | null, taille: { l: number; h: number }) {
  const s = (noeud as HTMLElement).style
  const l = Math.min(taille.l, s.maxWidth ? Number.parseFloat(s.maxWidth) : Number.POSITIVE_INFINITY)
  const h = Math.min(taille.h, s.maxHeight ? Number.parseFloat(s.maxHeight) : Number.POSITIVE_INFINITY)
  return { x: Number.parseFloat(s.left), y: Number.parseFloat(s.top), l, h }
}
const tient = (p: { x: number; y: number; l: number; h: number }) => {
  expect(p.x).toBeGreaterThanOrEqual(MARGE_FENETRE)
  expect(p.y).toBeGreaterThanOrEqual(MARGE_FENETRE)
  expect(p.x + p.l).toBeLessThanOrEqual(FENETRE.l - MARGE_FENETRE)
  expect(p.y + p.h).toBeLessThanOrEqual(FENETRE.h - MARGE_FENETRE)
}

/** Le coin bas droit de la fenêtre, et son bord droit : les deux endroits où tout débordait. */
const COIN = { left: FENETRE.l - 40, top: FENETRE.h - 36, width: 36, height: 28 }
const BORD_DROIT = { left: FENETRE.l - 130, top: 200, width: 120, height: 28 }
const BORD_BAS = { left: 400, top: FENETRE.h - 36, width: 80, height: 28 }

describe('Flottant', () => {
  it('sous son ancre quand la place existe, avec la taille mesurée', () => {
    const a = faux({ left: 100, top: 100, width: 80, height: 28 })
    const { hote } = monter(<Flottant ancre={a.el} role="dialog">x</Flottant>, { l: 200, h: 100 })
    const p = posee(hote.querySelector('[role=dialog]'), { l: 200, h: 100 })
    expect(p).toMatchObject({ x: 100, y: 134 })
  })

  it('contre le bord droit : ramenée dans la fenêtre, jamais coupée', () => {
    const a = faux(BORD_DROIT)
    for (const alignement of ['debut', 'centre', 'fin'] as const) {
      const { hote } = monter(<Flottant ancre={a.el} alignement={alignement} role="dialog">x</Flottant>, { l: 308, h: 200 })
      tient(posee(hote.querySelector('[role=dialog]'), { l: 308, h: 200 }))
    }
  })

  it('contre le bord bas : retournée au-dessus de l’ancre', () => {
    const a = faux(BORD_BAS)
    const { hote } = monter(<Flottant ancre={a.el} role="dialog">x</Flottant>, { l: 200, h: 150 })
    const noeud = hote.querySelector('[role=dialog]') as HTMLElement
    expect(noeud.dataset.cote).toBe('haut')
    const p = posee(noeud, { l: 200, h: 150 })
    tient(p)
    expect(p.y + p.h).toBeLessThanOrEqual(BORD_BAS.top)
  })

  it('dans le coin bas droit, à gauche comme à droite et dessus comme dessous', () => {
    const a = faux(COIN)
    for (const cote of ['bas', 'haut', 'gauche', 'droite', 'libre'] as const) {
      const { hote } = monter(<Flottant ancre={a.el} cote={cote} role="dialog">x</Flottant>, { l: 308, h: 300 })
      tient(posee(hote.querySelector('[role=dialog]'), { l: 308, h: 300 }))
    }
  })

  it('plus haute que la fenêtre : sa hauteur est bornée et son contenu défile', () => {
    const a = faux(BORD_DROIT)
    const { hote } = monter(<Flottant ancre={a.el} role="dialog">x</Flottant>, { l: 200, h: 2000 })
    const noeud = hote.querySelector('[role=dialog]') as HTMLElement
    expect(noeud.hasAttribute('data-borne')).toBe(true)
    expect(noeud.style.maxHeight).toBe(`${FENETRE.h - 2 * MARGE_FENETRE}px`)
    tient(posee(noeud, { l: 200, h: 2000 }))
  })

  it('plus large que la fenêtre : sa largeur est bornée', () => {
    const a = faux(BORD_DROIT)
    const { hote } = monter(<Flottant ancre={a.el} role="dialog">x</Flottant>, { l: 3000, h: 100 })
    tient(posee(hote.querySelector('[role=dialog]'), { l: 3000, h: 100 }))
  })

  it('un point (clic droit) dans le coin : glisse dans la fenêtre', () => {
    const { hote } = monter(<Flottant ancre={{ x: FENETRE.l - 2, y: FENETRE.h - 2, l: 0, h: 0 }} cote="libre" role="menu">x</Flottant>, { l: 230, h: 300 })
    tient(posee(hote.querySelector('[role=menu]'), { l: 230, h: 300 }))
  })

  it('se replace quand la fenêtre est redimensionnée et que l’ancre a bougé', () => {
    const a = faux({ left: 100, top: 100, width: 80, height: 28 })
    const { hote } = monter(<Flottant ancre={a.el} role="dialog">x</Flottant>, { l: 200, h: 100 })
    const noeud = hote.querySelector('[role=dialog]') as HTMLElement
    expect(noeud.style.left).toBe('100px')
    a.deplacer(BORD_DROIT)
    act(() => void window.dispatchEvent(new Event('resize')))
    tient(posee(noeud, { l: 200, h: 100 }))
    expect(noeud.style.left).toBe(`${FENETRE.l - 200 - MARGE_FENETRE}px`)
  })

  it('sans ancre, rien ne s’affiche', () => {
    const { hote } = monter(<Flottant ancre={null} role="dialog">x</Flottant>, { l: 200, h: 100 })
    expect(hote.querySelector('[role=dialog]')).toBeNull()
  })

  it('se pose dans le fond de la carte, hors du parent qui rogne', () => {
    const fond = document.createElement('div')
    fond.className = 'notak-arbre-fond'
    document.body.append(fond)
    const racine = createRoot(fond)
    racines.push(racine)
    const a = faux(BORD_DROIT)
    // Le parent rogne (overflow: hidden) : la fenêtre n’y est pas, elle est un enfant direct du fond.
    act(() =>
      racine.render(
        <MesureFlottant value={() => ({ l: 200, h: 100 })}>
          <div style={{ overflow: 'hidden' }}>
            <Flottant ancre={{ ...a.el, closest: () => fond } as unknown as HTMLElement} role="dialog">
              x
            </Flottant>
          </div>
        </MesureFlottant>,
      ),
    )
    const noeud = fond.querySelector('[role=dialog]') as HTMLElement
    expect(noeud.parentElement).toBe(fond)
    expect(noeud.style.position).toBe('fixed')
  })
})

describe('les popovers du panneau de droite (controles)', () => {
  it('la liste sous un bouton contre le bord droit', () => {
    const a = faux(BORD_DROIT)
    const { hote } = monter(
      <PopoverReglages ancre={a.el} ouvert fermer={() => {}} largeur={268}>
        x
      </PopoverReglages>,
      { l: 268, h: 400 },
    )
    tient(posee(hote.querySelector('[role=dialog]'), { l: 268, h: 400 }))
  })

  it('la liste large comme son bouton, dans le coin bas droit', () => {
    const a = faux(COIN)
    const { hote } = monter(
      <PopoverReglages ancre={a.el} ouvert fermer={() => {}}>
        x
      </PopoverReglages>,
      { l: 36, h: 320 },
    )
    const p = posee(hote.querySelector('[role=dialog]'), { l: 36, h: 320 })
    tient(p)
    expect(p.y + p.h).toBeLessThanOrEqual(COIN.top)
  })

  it('le grand choix s’ouvre à gauche du panneau, en haut de son bouton, sans sortir par le bas', () => {
    const panneau = document.createElement('div')
    panneau.className = 'notak-arbre-cote'
    panneau.getBoundingClientRect = () => rectDe({ left: FENETRE.l - 268, top: 0, width: 268, height: FENETRE.h }) as DOMRect
    const a = faux({ left: FENETRE.l - 200, top: FENETRE.h - 60, width: 150, height: 28 })
    ;(a.el as unknown as { closest: (s: string) => Element | null }).closest = (s: string) => (s === '.notak-arbre-cote' ? panneau : null)
    const { hote } = monter(
      <PopoverReglages ancre={a.el} ouvert fermer={() => {}} cote="gauche" largeur={388} hauteur={450}>
        x
      </PopoverReglages>,
      { l: 388, h: 450 },
    )
    const noeud = hote.querySelector('[role=dialog]') as HTMLElement
    const p = posee(noeud, { l: 388, h: 450 })
    tient(p)
    expect(noeud.dataset.cote).toBe('gauche')
    expect(p.x + p.l).toBeLessThanOrEqual(FENETRE.l - 268)
  })

  it('le menu d’un clic droit dans le coin', () => {
    const a = faux(COIN)
    const { hote } = monter(<MenuReglages ancre={a.el} point={{ x: FENETRE.l - 3, y: FENETRE.h - 3 }} entrees={[{ libelle: 'Modifier', onClick: () => {} }]} fermer={() => {}} />, { l: 180, h: 120 })
    tient(posee(hote.querySelector('[role=menu]'), { l: 180, h: 120 }))
  })
})

describe('les popovers de l’onglet Style (controles-style)', () => {
  it('une carte sous un bouton contre le bord droit, dans le coin bas', () => {
    for (const r of [BORD_DROIT, COIN, BORD_BAS]) {
      const a = faux(r)
      const { hote } = monter(
        <PopoverStyle ancre={{ current: a.el }} fermer={() => {}} largeur={264}>
          x
        </PopoverStyle>,
        { l: 264, h: 420 },
      )
      tient(posee(hote.querySelector('[role=dialog]'), { l: 264, h: 420 }))
    }
  })
})

describe('le popover d’insertion', () => {
  it('près d’un sujet au bord droit et au bord bas', () => {
    for (const r of [BORD_DROIT, COIN, BORD_BAS]) {
      const { hote } = monter(
        <PopoverInsertions ancre={{ x: r.left, y: r.top, l: r.width, h: r.height }} titre="Étiquettes" fermer={() => {}} largeur={340}>
          <p>corps</p>
        </PopoverInsertions>,
        { l: 340, h: 260 },
      )
      tient(posee(hote.querySelector('[role=dialog]'), { l: 340, h: 260 }))
    }
  })
})

describe('les popovers du mode Pitch (ChoixTheme)', () => {
  it('« Changer de thème » dans le panneau de droite : la grille des thèmes tient dans l’écran', () => {
    // Le bouton est dans le panneau de 268 px contre le bord droit ; la grille, content-box, fait 276 + 32 de rembourrage.
    const bouton = faux({ left: FENETRE.l - 250, top: 330, width: 232, height: 28 })
    const { hote } = monter(<ChoixTheme ancre={bouton.el} pitch={{ theme: 'light' }} ratio="16:9" choisir={() => {}} fermer={() => {}} />, { l: 308, h: 420 })
    const p = posee(hote.querySelector('[role=dialog]'), { l: 308, h: 420 })
    tient(p)
    expect(p.x + p.l).toBeLessThanOrEqual(FENETRE.l - MARGE_FENETRE)
  })

  it('vers le haut, ancré tout en haut : passe dessous', () => {
    const a = faux({ left: 500, top: 4, width: 40, height: 28 })
    const { hote } = monter(
      <PopoverFixe ancre={a.el} fermer={() => {}} largeur={290} vers="haut">
        x
      </PopoverFixe>,
      { l: 322, h: 300 },
    )
    const p = posee(hote.querySelector('[role=dialog]'), { l: 322, h: 300 })
    tient(p)
    expect(p.y).toBeGreaterThan(4 + 28)
  })

  it('les réglages dans le coin bas droit', () => {
    const a = faux(COIN)
    const { hote } = monter(
      <PopoverFixe ancre={a.el} fermer={() => {}} largeur={290}>
        x
      </PopoverFixe>,
      { l: 322, h: 700 },
    )
    tient(posee(hote.querySelector('[role=dialog]'), { l: 322, h: 700 }))
  })
})

describe('les menus déroulants (Deroulant)', () => {
  /** Un porteur dont on fixe le rectangle avant que le menu ne le lise. */
  function monterDeroulant(r: Rect, vers: 'bas' | 'haut', alignement: 'debut' | 'centre' | 'fin', mesure: { l: number; h: number }) {
    return monter(
      <div
        ref={(n) => {
          if (n) n.getBoundingClientRect = () => rectDe(r) as DOMRect
        }}
      >
        <button type="button">ouvrir</button>
        <Deroulant ouvert fermer={() => {}} vers={vers} alignement={alignement}>
          <Entree libelle="Un" />
        </Deroulant>
      </div>,
      mesure,
    )
  }

  it('au-dessus d’un porteur du bord bas droit, centré : reste dans l’écran', () => {
    const { hote } = monterDeroulant(COIN, 'haut', 'centre', { l: 120, h: 200 })
    const p = posee(hote.querySelector('[role=menu]'), { l: 120, h: 200 })
    tient(p)
    expect(p.y + p.h).toBeLessThanOrEqual(COIN.top)
  })

  it('sous un porteur du bord droit, aligné à droite', () => {
    const { hote } = monterDeroulant(BORD_DROIT, 'bas', 'fin', { l: 180, h: 80 })
    tient(posee(hote.querySelector('[role=menu]'), { l: 180, h: 80 }))
  })

  it('sous un porteur du bord bas : se retourne au-dessus', () => {
    const { hote } = monterDeroulant(BORD_BAS, 'bas', 'debut', { l: 220, h: 200 })
    const p = posee(hote.querySelector('[role=menu]'), { l: 220, h: 200 })
    tient(p)
    expect(p.y + p.h).toBeLessThanOrEqual(BORD_BAS.top)
  })

  it('un menu plus haut que la fenêtre défile', () => {
    const { hote } = monterDeroulant(BORD_DROIT, 'bas', 'fin', { l: 180, h: 1500 })
    const noeud = hote.querySelector('[role=menu]') as HTMLElement
    expect(noeud.hasAttribute('data-borne')).toBe(true)
    tient(posee(noeud, { l: 180, h: 1500 }))
  })
})

describe('le menu contextuel de la carte', () => {
  const items: Item[] = [
    { id: 'copier', libelle: 'Copier', icone: 'menuCopier' },
    { id: 'inserer', libelle: 'Insérer', icone: 'ajouter', sous: [{ id: 'inserer.note', libelle: 'Note', icone: 'note' }] },
  ]

  it('cliqué dans le coin bas droit : glisse dans la fenêtre', () => {
    const { hote } = monter(<MenuContextuel x={FENETRE.l - 1} y={FENETRE.h - 1} items={items} choisir={() => {}} fermer={() => {}} />, { l: 230, h: 400 })
    tient(posee(hote.querySelector('[role=menu]'), { l: 230, h: 400 }))
  })

  it('sous un « + » du bord droit, ou du bord bas', () => {
    for (const r of [BORD_DROIT, COIN, BORD_BAS]) {
      const a = faux(r)
      const { hote } = monter(<MenuContextuel ancre={a.el} items={items} choisir={() => {}} fermer={() => {}} />, { l: 230, h: 400 })
      tient(posee(hote.querySelector('[role=menu]'), { l: 230, h: 400 }))
    }
  })

  it('plus haut que la fenêtre : il défile', () => {
    const { hote } = monter(<MenuContextuel x={10} y={10} items={items} choisir={() => {}} fermer={() => {}} />, { l: 230, h: 2000 })
    const noeud = hote.querySelector('[role=menu]') as HTMLElement
    expect(noeud.hasAttribute('data-borne')).toBe(true)
    tient(posee(noeud, { l: 230, h: 2000 }))
  })
})

describe('la bulle des comptes et le menu du zoom (BarreBas)', () => {
  const props: PropsBarreBas = {
    titre: 'Projet',
    lectureSeule: false,
    sujets: 12,
    choisis: 0,
    mots: 30,
    caracteres: 150,
    zoom: 1,
    enPlan: false,
    zenActif: false,
    pitchActif: false,
    zoomer: vi.fn(),
    ajuster: vi.fn(),
    basculerPlan: vi.fn(),
    zen: vi.fn(),
    presenter: vi.fn(),
    renommer: vi.fn(),
    dupliquer: vi.fn(),
    nouvelle: vi.fn(),
    enregistrer: vi.fn(),
  }
  const clic = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

  it('les comptes, au-dessus du compteur posé dans le coin bas droit', () => {
    const { hote } = monter(<BarreBas {...props} />, { l: 160, h: 90 })
    const compteur = hote.querySelector('.notak-arbre-bas-compteur') as HTMLElement
    compteur.getBoundingClientRect = () => rectDe(COIN) as DOMRect
    clic(compteur.querySelector('button')!)
    const p = posee(hote.querySelector('.notak-arbre-bas-popover'), { l: 160, h: 90 })
    tient(p)
    expect(p.y + p.h).toBeLessThanOrEqual(COIN.top)
  })

  it('les paliers du zoom, au-dessus du pourcentage posé dans le coin bas droit', () => {
    const { hote } = monter(<BarreBas {...props} />, { l: 160, h: 300 })
    const zoom = hote.querySelector('.notak-arbre-bas-zoom') as HTMLElement
    zoom.getBoundingClientRect = () => rectDe(COIN) as DOMRect
    clic(zoom.querySelector('button')!)
    const p = posee(hote.querySelector('.notak-arbre-bas-menu'), { l: 160, h: 300 })
    tient(p)
    expect(p.y + p.h).toBeLessThanOrEqual(COIN.top)
  })
})

describe('la note d’un sujet (PopoverNote)', () => {
  it('demandée hors de l’écran, elle se pose dedans', () => {
    const { hote } = monter(<PopoverNote titre="Sujet" note={undefined} x={FENETRE.l + 300} y={FENETRE.h + 300} lectureSeule={false} valider={() => {}} fermer={() => {}} />, { l: 400, h: 280 })
    tient(posee(hote.querySelector('[role=dialog]'), { l: 400, h: 280 }))
  })

  it('près du bord droit : à gauche de ce que la carte demandait', () => {
    const { hote } = monter(<PopoverNote titre="Sujet" note={undefined} x={FENETRE.l - 100} y={300} lectureSeule={false} valider={() => {}} fermer={() => {}} />, { l: 400, h: 280 })
    tient(posee(hote.querySelector('[role=dialog]'), { l: 400, h: 280 }))
  })
})
