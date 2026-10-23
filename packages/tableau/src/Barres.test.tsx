// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BarreSelection } from './Barres'
import { creerMagasin } from './coeur/magasin'
import { type Element, nouvelleNote } from './coeur/tableau'
import './elements'
import { tousLesOutilsCommuns, toutesLesEntreesMenu } from './elements/registre'
import type { ContexteToile } from './elements/types'
import { fermerMenus } from './menuUnique'
import { useReglages } from './reglages'

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
  fermerMenus()
})

function monde() {
  const note: Element = nouvelleNote(0, 0, 'Une idée')
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [note] })
  const choisis: string[][] = []
  const contexte = {
    magasin,
    choisir: (ids: string[]) => void choisis.push(ids),
    rect: () => null,
    commencerEdition: () => {},
    services: { presence: { moi: () => ({ id: 'ana', nom: 'Ana', couleur: '#e33' }), autres: () => [], ecouter: () => () => {}, signaler() {} } },
  } as unknown as ContexteToile
  return { note, contexte, choisis }
}

const monter = (aGauche: boolean) => {
  const { note, contexte, choisis } = monde()
  act(() => racine.render(<BarreSelection elements={[note]} contexte={contexte} position={{ x: 300, y: 40 }} aGauche={aGauche} />))
  return { choisis }
}
const tuile = (libelle: string) =>
  [...hote.querySelectorAll<HTMLButtonElement>('button.notak-outil')].find((b) => b.querySelector('.notak-outil-libelle')?.textContent === libelle)!

describe('la barre de sélection à gauche', () => {
  it('prend la place de la barre de création : un panneau, une flèche de retour, des tuiles icône + libellé', () => {
    const { choisis } = monter(true)
    expect(hote.querySelector('nav.notak-barre-outils[data-selection]')).not.toBeNull()
    const couleur = tuile('Couleur')
    expect(couleur.querySelector('.notak-outil-icone svg, .notak-outil-icone .notak-outil-pastille')).not.toBeNull()
    expect(tuile('Étiquettes')).toBeDefined()
    expect(tuile('Réagir')).toBeDefined()
    expect(tuile('Commenter')).toBeDefined()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-barre-retour')!.click())
    expect(choisis).toEqual([[]])
  })

  it('range les outils secondaires derrière « ••• »', () => {
    monter(true)
    const plus = hote.querySelector<HTMLElement>('.notak-selection-plus')!
    expect(plus.querySelector('.notak-tiroir')?.hasAttribute('hidden')).toBe(true)
    // La légende, la barre et le texte d'une note sont secondaires : dans le tiroir, pas dans la colonne.
    expect(plus.querySelector('.notak-tiroir-grille')!.textContent).toContain('Légende')
    expect(hote.querySelector('.notak-barre-selection > .notak-outil-place')).not.toBeNull()
    expect([...hote.querySelectorAll('.notak-barre-selection > button.notak-outil')].map((b) => b.textContent)).not.toContain('Légende')
    act(() => plus.querySelector<HTMLButtonElement>('.notak-outil-plus')!.click())
    expect(plus.querySelector('.notak-tiroir')?.hasAttribute('hidden')).toBe(false)
  })

  it('un seul menu à la fois : en ouvrir un referme l’autre, y compris le panneau des commentaires', () => {
    monter(true)
    act(() => tuile('Couleur').click())
    expect(tuile('Couleur').getAttribute('aria-expanded')).toBe('true')
    act(() => tuile('Réagir').click())
    expect(tuile('Couleur').getAttribute('aria-expanded')).toBe('false')
    expect(tuile('Réagir').getAttribute('aria-expanded')).toBe('true')
    act(() => tuile('Commenter').click())
    expect(tuile('Commenter').getAttribute('aria-pressed')).toBe('true')
    act(() => tuile('Couleur').click())
    expect(tuile('Commenter').getAttribute('aria-pressed')).toBe('false')
  })

  it('un menu du tiroir s’ouvre sans refermer le tiroir', () => {
    monter(true)
    const plus = hote.querySelector<HTMLElement>('.notak-selection-plus')!
    act(() => plus.querySelector<HTMLButtonElement>('.notak-outil-plus')!.click())
    const legende = [...plus.querySelectorAll<HTMLButtonElement>('button.notak-outil')].find((b) => b.textContent === 'Légende')!
    act(() => legende.click())
    expect(plus.querySelector('.notak-tiroir')?.hasAttribute('hidden')).toBe(false)
    expect(plus.querySelector('[role="menu"]')).not.toBeNull()
  })
})

describe('la couleur de la note', () => {
  const ouvrir = () => {
    const m = monde()
    act(() => racine.render(<BarreSelection elements={[m.note]} contexte={m.contexte} position={{ x: 0, y: 0 }} aGauche />))
    act(() => tuile('Couleur').click())
    return m
  }
  const pastilles = () => [...hote.querySelectorAll<HTMLButtonElement>('.notak-pastilles-grille')[0]!.querySelectorAll('button')]

  it('un seul outil, deux onglets : le fond d’abord, puis la bande du haut', () => {
    ouvrir()
    expect([...hote.querySelectorAll('.notak-barre-selection > .notak-outil-place [role="tab"], .notak-barre-selection > div [role="tab"]')].map((b) => b.textContent)).toEqual(['Fond', 'Bande du haut'])
    expect([...hote.querySelectorAll<HTMLButtonElement>('button.notak-outil')].filter((b) => b.textContent === 'Barre')).toHaveLength(0)
  })

  it('le fond : Aucune, onze teintes dans l’ordre, Transparent en dernier', () => {
    ouvrir()
    expect(pastilles().map((b) => b.getAttribute('data-pastille'))).toEqual([
      'aucune', 'gris', 'cyan', 'vert', 'brun', 'jaune', 'orange', 'rouge', 'rose', 'violet', 'bleu', 'bleu_nuit', 'transparent',
    ])
  })

  it('une teinte se pose sur le fond, le panneau reste ouvert, la bande a son onglet', () => {
    const { note, contexte } = ouvrir()
    act(() => pastilles().find((b) => b.getAttribute('data-pastille') === 'rouge')!.click())
    expect(contexte.magasin.lire().elements.find((e) => e.id === note.id)!.contenu).toMatchObject({ couleur: 'rouge' })
    expect(hote.querySelector('.notak-panneau-couleur')).not.toBeNull()
    // La toile rend la barre avec les éléments à jour.
    act(() => racine.render(<BarreSelection elements={contexte.magasin.lire().elements} contexte={contexte} position={{ x: 0, y: 0 }} aGauche />))
    act(() => hote.querySelector<HTMLButtonElement>('[data-onglet="bande"]')!.click())
    expect(pastilles()).toHaveLength(12)
    act(() => pastilles().find((b) => b.getAttribute('data-pastille') === 'vert')!.click())
    expect(contexte.magasin.lire().elements.find((e) => e.id === note.id)!.contenu).toMatchObject({ couleur: 'rouge', barre: '#7cd651' })
  })

  it('« Couleur personnalisée » ouvre le sélecteur natif et pose la teinte choisie', () => {
    const { note, contexte } = ouvrir()
    const champ = hote.querySelector<HTMLInputElement>('.notak-couleur-libre input[type="color"]')!
    expect(champ).not.toBeNull()
    act(() => {
      champ.value = '#123456'
      champ.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(contexte.magasin.lire().elements.find((e) => e.id === note.id)!.contenu).toMatchObject({ fond: '#123456' })
  })
})

describe('la barre de sélection flottante', () => {
  it('garde ses boutons de texte, au-dessus de la sélection', () => {
    monter(false)
    expect(hote.querySelector('nav')).toBeNull()
    const bar = hote.querySelector<HTMLElement>('.notak-barre-selection')!
    expect(bar.hasAttribute('data-a-gauche')).toBe(false)
    expect(bar.style.left).toBe('300px')
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toContain('Légende')
    expect(bar.querySelector('.notak-outil')).toBeNull()
  })
})

describe('le registre', () => {
  it('« Grouper en colonne » n’est qu’une entrée du menu du clic droit, même déclarée deux fois', async () => {
    const { entreeGrouper } = await import('./elements/colonne/OutilGrouper')
    const { registre } = await import('./elements/registre')
    registre.entreeMenu({ ...entreeGrouper })
    expect(toutesLesEntreesMenu().filter((e) => e.libelle === entreeGrouper.libelle)).toHaveLength(1)
    const noms = tousLesOutilsCommuns().map((o) => o.name)
    expect(new Set(noms).size).toBe(noms.length)
  })
})

describe('les réglages', () => {
  it('rangent les outils de la sélection à gauche par défaut', () => {
    localStorage.clear()
    let barre = ''
    function Sonde() {
      barre = useReglages()[0].barre
      return null
    }
    act(() => racine.render(<Sonde />))
    expect(barre).toBe('gauche')
  })
})
