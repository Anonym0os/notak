// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act, useEffect, useState } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ContexteOutils } from '../../BoutonOutil'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Image } from '../../coeur/tableau'
import { useMenu } from '../../menuUnique'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import './index'
import { OutilsImage, RenduImage } from './Image'
import { recadrer, useRecadrageOuvert } from './Recadreur'
import { detourerImage, useDetourageOuvert } from './Detoureur'

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

const contexte = (): ContexteToile =>
  ({
    magasin: creerMagasin({ titre: '', etiquettes: [], elements: [] }),
    camera: { x: 0, y: 0, echelle: 1 },
    services: { fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } },
    finirEdition: () => {},
    commencerEdition: () => {},
  }) as unknown as ContexteToile

async function rendre(contenu: Partial<Image>, plus: Partial<Element<Image>> = {}, choisie = false) {
  const element: Element<Image> = {
    id: 'i1',
    x: 0,
    y: 0,
    largeur: 20,
    contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 200, typeMime: 'image/jpeg', ...contenu },
    ...plus,
  }
  await act(async () => {
    racine.render(<RenduImage element={element} choisie={choisie} enEdition={false} contexte={contexte()} brouillon={() => {}} changer={() => {}} />)
  })
}

describe('la carte d’une image', () => {
  it('la hauteur tombe sur la grille, moins les 2 px de la bordure', async () => {
    await rendre({})
    // 20 UG de large à 3 : 2, soit 13,33 UG, arrondies à 13 : 130 − 2 px.
    expect((hote.querySelector('.notak-image-cadre') as HTMLElement).style.height).toBe('128px')
  })

  it('la légende se range dans la carte, et l’invite reste tant qu’elle est affichée', async () => {
    await rendre({ legende: 'Un port' })
    expect(hote.querySelector('.notak-legende')?.textContent).toBe('Un port')
    await rendre({ legendeAffichee: true })
    expect(hote.querySelector('.notak-legende[data-vide]')).not.toBeNull()
    await rendre({})
    expect(hote.querySelector('.notak-legende')).toBeNull()
  })

  it('sous 8 UG de large, la légende est masquée', async () => {
    await rendre({ legende: 'Un port' }, { largeur: 6 })
    expect(hote.querySelector('.notak-legende')).toBeNull()
  })

  it('la photo prend l’arrondi de sa carte, que suit le filet de sélection, et la légende le texte du thème', () => {
    // Le chemin passe par une variable : écrit en dur dans `new URL`, Vite le changerait en adresse d'asset.
    const fichier = './image.css'
    const css = readFileSync(new URL(fichier, import.meta.url), 'utf8')
    const regle = (selecteur: string) => {
      const debut = css.indexOf(`${selecteur} {`)
      expect(debut, selecteur).toBeGreaterThanOrEqual(0)
      return css.slice(debut, css.indexOf('}', debut))
    }
    // Le haut de la photo suit l'arrondi de la carte (un habillage en donne un) ; tout le tour quand rien ne la suit.
    expect(regle(".notak-carte[data-type='image'] > .notak-image-cadre")).toMatch(/border-top-left-radius: inherit;[\s\S]*border-top-right-radius: inherit;/)
    expect(regle(".notak-carte[data-type='image']:not(:has(> .notak-legende)) > .notak-image-cadre")).toMatch(/border-radius: inherit;/)
    // En édition, le filet passe dedans et son arrondi perd les 2 px dont il rentre : la règle de toutes les cartes
    // (toile.css), qu'aucune règle de l'image ne redit.
    expect(css).not.toContain("[data-edition]:not([data-sans-fond])::before")
    // Sans carte (une image transparente), ni arrondi ni rognure.
    expect(regle(".notak-carte[data-type='image'][data-sans-fond]")).toMatch(/border-radius: 0;/)
    // La barre de couleur vit dans le cadre, rognée avec lui, et laisse le `::after` de la carte à l'ombre du glisser.
    expect(regle(".notak-carte[data-type='image'][data-teinte] > .notak-image-cadre::after")).toMatch(/height: 5px;/)
    expect(css).not.toContain(".notak-carte[data-type='image'][data-teinte]::after")
    // La légende prend le texte des cartes : lisible sur la carte sombre du thème sombre.
    expect(regle(".notak-carte[data-type='image'] .notak-legende")).toMatch(/color: var\(--notak-texte\);/)
  })

  it('le type dit sa carte : blanche, sauf une image transparente qui n’a pas rendu son fond', () => {
    const def = definition('image')!
    const sansFond = def.sansFond as (c: Image) => boolean
    const base = { type: 'image', fichier: 'f', largeurOrigine: 1, hauteurOrigine: 1 } as const
    expect(sansFond({ ...base, typeMime: 'image/jpeg' })).toBe(false)
    expect(sansFond({ ...base, typeMime: 'image/png', transparente: true })).toBe(true)
    expect(sansFond({ ...base, typeMime: 'image/png', transparente: true, fondBlanc: true })).toBe(false)
    expect(def.retraitPx?.(base)).toBe(2)
  })
})

describe('les outils de l’image dans le « ••• »', () => {
  /** Le tiroir « ••• » de la barre de gauche, ouvert, où se rangent les outils secondaires de l'image. */
  function Tiroir({ element, etat }: { element: Element<Image>; etat: { ouvert?: boolean; recadrage?: string | null; detourage?: string | null } }) {
    const [ouvert, setOuvert, ancre] = useMenu()
    const [plus, setPlus] = useState<HTMLElement | null>(null)
    useEffect(() => setOuvert(true), []) // eslint-disable-line react-hooks/exhaustive-deps
    etat.ouvert = ouvert
    etat.recadrage = useRecadrageOuvert()
    etat.detourage = useDetourageOuvert()
    return (
      <div ref={ancre}>
        <div className="tiroir" ref={setPlus} />
        <ContexteOutils.Provider value={{ aGauche: true, plus }}>
          <OutilsImage elements={[element]} contexte={contexte()} />
        </ContexteOutils.Provider>
      </div>
    )
  }

  it.each([['Recadrer'], ['Détourer']])('« %s » ouvre son outil et referme le tiroir', async (libelle) => {
    const element: Element<Image> = { id: 'i1', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 200, typeMime: 'image/jpeg' } }
    const etat: { ouvert?: boolean; recadrage?: string | null; detourage?: string | null } = {}
    await act(async () => {
      racine.render(<Tiroir element={element} etat={etat} />)
    })
    expect(etat.ouvert).toBe(true)
    act(() => hote.querySelector<HTMLButtonElement>(`.tiroir button[aria-label="${libelle}"]`)!.click())
    expect(etat.ouvert).toBe(false)
    expect(libelle === 'Recadrer' ? etat.recadrage : etat.detourage).toBe('i1')
    act(() => {
      recadrer(null)
      detourerImage(null)
    })
  })
})
