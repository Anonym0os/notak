// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Table } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import type { ContexteToile } from '../types'
import { OutilsTable } from './Outils'
import { RenduTable } from './Table'
import { lireEtat, oublierEtat } from './etat'
import { formatsDe, nouvelleTable } from './grille'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  oublierEtat('T')
})

const ID = 'T'

function monde(plus: Partial<Table> = {}, options: { lectureSeule?: boolean; parent?: boolean } = {}) {
  const depart = nouvelleTable(0, 0)
  const element: Element<Table> = {
    ...depart,
    id: ID,
    ...(options.parent ? { parent: 'C' } : {}),
    contenu: {
      ...depart.contenu,
      cellules: [
        ['Nom', 'Prix', 'Qté'],
        ['a', '10', '2'],
        ['b', '20', '3'],
        ['', '', ''],
      ],
      ...plus,
    },
  }
  const magasin = creerMagasin({ titre: '', elements: [element] })
  const contexte = {
    magasin,
    services: { lectureSeule: !!options.lectureSeule },
    camera: { echelle: 1, origine: { x: 0, y: 0 } },
    selection: new Set([ID]),
  } as unknown as ContexteToile
  const lire = () => magasin.lire().elements[0] as Element<Table>
  return { magasin, contexte, lire }
}

function Monde({ magasin, contexte, choisie = true, seule = true }: { magasin: ReturnType<typeof creerMagasin>; contexte: ContexteToile; choisie?: boolean; seule?: boolean }) {
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const element = tableau.elements[0] as Element<Table>
  return (
    <>
      <RenduTable
        element={element}
        choisie={choisie}
        seule={seule}
        enEdition={false}
        contexte={contexte}
        brouillon={() => {}}
        changer={(c) => magasin.faire([{ type: 'contenu', id: ID, avant: element.contenu, apres: c }])}
      />
      <OutilsTable elements={[element]} contexte={contexte} />
    </>
  )
}

function monter(m: ReturnType<typeof monde>, props: { choisie?: boolean; seule?: boolean } = {}) {
  act(() => racine.render(<Monde magasin={m.magasin} contexte={m.contexte} {...props} />))
}

const cellule = (l: number, c: number) => hote.querySelector<HTMLElement>(`td[data-cellule="${l},${c}"]`)!
const clavier = () => hote.querySelector<HTMLElement>('[data-table-clavier]')
const appuyer = (cible: EventTarget, init: KeyboardEventInit) =>
  act(() => void cible.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })))
const cliquer = (l: number, c: number, init: MouseEventInit = {}) =>
  act(() => void cellule(l, c).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ...init })))
const relacher = () => act(() => void hote.querySelector('.notak-tableur')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })))
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.includes(texte) || b.title.includes(texte))!

function taper(champ: HTMLTextAreaElement, texte: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(champ, texte)
    champ.setSelectionRange(texte.length, texte.length)
    champ.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const champ = () => hote.querySelector<HTMLTextAreaElement>('.notak-table-champ')!

describe('le rendu', () => {
  it('une grille aux largeurs des colonnes, le texte formaté selon le type', () => {
    const m = monde({
      formats: [[null, null, null], [null, { type: 'monnaie' }, null], [null, null, null], [null, null, null]],
    })
    monter(m, { choisie: false, seule: false })
    expect(hote.querySelectorAll('col')).toHaveLength(3)
    expect(hote.querySelectorAll('td')).toHaveLength(12)
    expect(cellule(1, 1).textContent?.replace(/[  ]/g, ' ')).toBe('10,00 €')
  })

  it('une formule montre son résultat ; une erreur, une pastille', () => {
    const m = monde({ cellules: [['=A2*B2', '=1/0'], ['10', '2'], ['', ''], ['', '']] })
    monter(m, { choisie: false, seule: false })
    expect(cellule(0, 0).textContent).toBe('20')
    expect(cellule(0, 1).querySelector('.notak-table-erreur')).not.toBeNull()
    expect(cellule(0, 1).textContent).toBe('')
  })

  it('une case à cocher se coche d’un clic, d’un seul pas, sans choisir la cellule', () => {
    const m = monde({ cellules: [['true', 'x'], ['', ''], ['', ''], ['', '']], formats: [[{ type: 'case' }, null], [null, null], [null, null], [null, null]] })
    monter(m)
    const case_ = cellule(0, 0).querySelector<HTMLInputElement>('input[type=checkbox]')!
    expect(case_.checked).toBe(true)
    act(() => case_.click())
    expect(m.lire().contenu.cellules[0]![0]).toBe('false')
    expect(lireEtat(ID).plages).toEqual([])
    m.magasin.annuler()
    expect(m.lire().contenu.cellules[0]![0]).toBe('true')
  })

  it('le titre paraît au-dessus quand avecTitre est posé', () => {
    const m = monde({ avecTitre: true, titre: 'Devis' })
    monter(m, { choisie: false, seule: false })
    expect(hote.querySelector('.notak-table-titre')?.textContent).toBe('Devis')
  })

  it('les repères paraissent seulement quand la table est seule choisie, hors colonne', () => {
    const m = monde()
    monter(m, { choisie: false, seule: false })
    expect(hote.querySelectorAll('.notak-table-repere')).toHaveLength(0)
    monter(m)
    expect([...hote.querySelectorAll('.notak-table-repere-colonne')].map((n) => n.textContent)).toEqual(['A', 'B', 'C'])
    expect([...hote.querySelectorAll('.notak-table-repere-ligne')].map((n) => n.textContent)).toEqual(['1', '2', '3', '4'])
    const dansColonne = monde({}, { parent: true })
    monter(dansColonne)
    expect(hote.querySelectorAll('.notak-table-repere')).toHaveLength(0)
  })

  it('en lecture seule, ni cellule choisie ni repères', () => {
    const m = monde({}, { lectureSeule: true })
    monter(m)
    expect(hote.querySelectorAll('.notak-table-repere')).toHaveLength(0)
    cliquer(1, 1)
    expect(lireEtat(ID).plages).toEqual([])
  })
})

describe('la sélection de cellules', () => {
  it('une table qui n’est pas choisie laisse passer le clic', () => {
    const m = monde()
    monter(m, { choisie: false, seule: false })
    let remonte = false
    document.body.addEventListener('pointerdown', () => (remonte = true), { once: true })
    cliquer(1, 1)
    expect(remonte).toBe(true)
    expect(lireEtat(ID).plages).toEqual([])
  })

  it('choisie, un clic choisit la cellule sans rien laisser remonter, et le clavier est à la table', () => {
    const m = monde()
    monter(m)
    let remonte = false
    document.body.addEventListener('pointerdown', () => (remonte = true), { once: true })
    cliquer(1, 1)
    expect(remonte).toBe(false)
    expect(lireEtat(ID).plages).toEqual([{ l1: 1, c1: 1, l2: 1, c2: 1 }])
    expect(document.activeElement).toBe(clavier())
    expect(cellule(1, 1).querySelector('.notak-table-sel')).not.toBeNull()
    expect(hote.querySelector('.notak-table-recopie')).not.toBeNull()
  })

  it('Maj étend, Cmd ajoute une plage', () => {
    const m = monde()
    monter(m)
    cliquer(0, 0)
    cliquer(1, 1, { shiftKey: true })
    expect(lireEtat(ID).plages).toEqual([{ l1: 0, c1: 0, l2: 1, c2: 1 }])
    cliquer(3, 2, { metaKey: true })
    expect(lireEtat(ID).plages).toHaveLength(2)
  })

  it('un clic sur la cellule déjà seule choisie ouvre l’éditeur', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    relacher()
    expect(hote.querySelector('.notak-table-editeur')).toBeNull()
    cliquer(1, 0)
    relacher()
    expect(champ().value).toBe('a')
  })

  it('un clic sur une lettre choisit la colonne entière, sur un numéro la ligne', () => {
    const m = monde()
    monter(m)
    act(() => void hote.querySelectorAll('.notak-table-repere-colonne')[1]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })))
    expect(lireEtat(ID).plages).toEqual([{ l1: 0, c1: 1, l2: 3, c2: 1 }])
    act(() => void hote.querySelectorAll('.notak-table-repere-ligne')[2]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })))
    expect(lireEtat(ID).plages).toEqual([{ l1: 2, c1: 0, l2: 2, c2: 2 }])
  })

  it('la table qui cesse d’être seule choisie oublie ses cellules', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    monter(m, { choisie: true, seule: false })
    expect(lireEtat(ID).plages).toEqual([])
  })
})

describe('le clavier de la grille', () => {
  it('les flèches déplacent, Maj étend, aux bords on reste', () => {
    const m = monde()
    monter(m)
    cliquer(0, 0)
    appuyer(clavier()!, { key: 'ArrowDown' })
    appuyer(clavier()!, { key: 'ArrowRight' })
    expect(lireEtat(ID).plages).toEqual([{ l1: 1, c1: 1, l2: 1, c2: 1 }])
    appuyer(clavier()!, { key: 'ArrowDown', shiftKey: true })
    appuyer(clavier()!, { key: 'ArrowRight', shiftKey: true })
    expect(lireEtat(ID).plages).toEqual([{ l1: 1, c1: 1, l2: 2, c2: 2 }])
    appuyer(clavier()!, { key: 'ArrowRight' })
    appuyer(clavier()!, { key: 'ArrowRight' })
    expect(lireEtat(ID).tete).toEqual({ l: 2, c: 2 })
  })

  it('une touche prise par la table ne remonte pas à la toile', () => {
    const m = monde()
    monter(m)
    cliquer(0, 0)
    let remonte = false
    document.body.addEventListener('keydown', () => (remonte = true), { once: true })
    appuyer(clavier()!, { key: 'ArrowDown' })
    expect(remonte).toBe(false)
  })

  it('Tab passe à la cellule suivante et à la ligne', () => {
    const m = monde()
    monter(m)
    cliquer(0, 2)
    appuyer(clavier()!, { key: 'Tab' })
    expect(lireEtat(ID).tete).toEqual({ l: 1, c: 0 })
    appuyer(clavier()!, { key: 'Tab', shiftKey: true })
    expect(lireEtat(ID).tete).toEqual({ l: 0, c: 2 })
  })

  it('Retour arrière vide les cellules choisies, d’un pas', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    cliquer(2, 1, { shiftKey: true })
    appuyer(clavier()!, { key: 'Backspace' })
    expect(m.lire().contenu.cellules.slice(1, 3).map((l) => l.slice(0, 2))).toEqual([['', ''], ['', '']])
    m.magasin.annuler()
    expect(m.lire().contenu.cellules[1]![0]).toBe('a')
  })

  it('Cmd+B met en gras toute la cellule, et l’ôte si la première l’a', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    appuyer(clavier()!, { key: 'b', metaKey: true })
    expect(formatsDe(m.lire().contenu)[1]![0]?.gras).toBe(true)
    appuyer(clavier()!, { key: 'b', metaKey: true })
    expect(formatsDe(m.lire().contenu)[1]![0]?.gras).toBeUndefined()
    appuyer(clavier()!, { key: 'i', metaKey: true })
    appuyer(clavier()!, { key: 'x', metaKey: true, shiftKey: true })
    expect(formatsDe(m.lire().contenu)[1]![0]).toMatchObject({ italique: true, barre: true })
  })

  it('Alt+flèche insère une ligne ou une colonne, la table et l’élément grandissent ensemble', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    const largeur = m.lire().largeur
    appuyer(clavier()!, { key: 'ArrowDown', altKey: true })
    expect(m.lire().contenu.cellules).toHaveLength(5)
    expect(m.lire().contenu.cellules[2]).toEqual(['', '', ''])
    appuyer(clavier()!, { key: 'ArrowRight', altKey: true })
    expect(m.lire().contenu.cellules[0]).toHaveLength(4)
    expect(m.lire().largeur).toBe(largeur + 12)
    // Un pas par geste : annuler la colonne rend la largeur d'avant.
    m.magasin.annuler()
    expect(m.lire().largeur).toBe(largeur)
    expect(m.lire().contenu.cellules[0]).toHaveLength(3)
  })

  it('Cmd+Retour arrière retire la ligne choisie, les références se réécrivent', () => {
    const m = monde({ cellules: [['1', ''], ['2', ''], ['=A1+A2', ''], ['', '']] })
    monter(m)
    cliquer(0, 0)
    appuyer(clavier()!, { key: 'Backspace', metaKey: true })
    expect(m.lire().contenu.cellules).toHaveLength(3)
    expect(m.lire().contenu.cellules[1]![0]).toBe('=#REF!+A1')
  })

  it('Cmd+Entrée ajoute une ligne dessous', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    appuyer(clavier()!, { key: 'Enter', metaKey: true })
    expect(m.lire().contenu.cellules).toHaveLength(5)
    expect(lireEtat(ID).tete).toEqual({ l: 2, c: 0 })
  })

  it('Échap déchoisit les cellules et rend le focus à la toile', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    appuyer(clavier()!, { key: 'Escape' })
    expect(lireEtat(ID).plages).toEqual([])
    expect(clavier()).toBeNull()
  })
})

describe('l’édition d’une cellule', () => {
  it('un caractère remplace le contenu, Entrée valide et descend, un seul pas d’historique', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    appuyer(clavier()!, { key: 'z' })
    expect(champ().value).toBe('z')
    taper(champ(), 'zèbre')
    appuyer(champ(), { key: 'Enter' })
    expect(m.lire().contenu.cellules[1]![0]).toBe('zèbre')
    expect(hote.querySelector('.notak-table-editeur')).toBeNull()
    expect(lireEtat(ID).tete).toEqual({ l: 2, c: 0 })
    expect(document.activeElement).toBe(clavier())
    m.magasin.annuler()
    expect(m.lire().contenu.cellules[1]![0]).toBe('a')
  })

  it('Entrée sur la cellule l’édite, Échap abandonne', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    appuyer(clavier()!, { key: 'Enter' })
    expect(champ().value).toBe('a')
    taper(champ(), 'autre')
    appuyer(champ(), { key: 'Escape' })
    expect(m.lire().contenu.cellules[1]![0]).toBe('a')
    expect(lireEtat(ID).edition).toBeNull()
  })

  it('Tab valide et passe à droite ; Maj+Entrée va à la ligne dans la cellule', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    appuyer(clavier()!, { key: 'F2' })
    taper(champ(), 'xy')
    appuyer(champ(), { key: 'Enter', shiftKey: true })
    expect(champ().value).toBe('xy\n')
    appuyer(champ(), { key: 'Tab' })
    expect(m.lire().contenu.cellules[1]![0]).toBe('xy\n')
    expect(lireEtat(ID).tete).toEqual({ l: 1, c: 1 })
  })

  it('le type se déduit de ce qu’on tape', () => {
    const m = monde()
    monter(m)
    cliquer(3, 0)
    appuyer(clavier()!, { key: 'Enter' })
    taper(champ(), '12,5 %')
    appuyer(champ(), { key: 'Enter' })
    expect(m.lire().contenu.cellules[3]![0]).toBe('0.125')
    expect(formatsDe(m.lire().contenu)[3]![0]?.type).toBe('pourcent')
  })

  it('une formule aux parenthèses ouvertes se ferme, et sa cellule montre le résultat', () => {
    const m = monde()
    monter(m)
    cliquer(3, 1)
    appuyer(clavier()!, { key: 'Enter' })
    taper(champ(), '=SUM(B2:B3')
    appuyer(champ(), { key: 'Enter' })
    expect(m.lire().contenu.cellules[3]![1]).toBe('=SUM(B2:B3)')
    expect(cellule(3, 1).textContent).toBe('30')
  })

  it('l’autocomplétion propose les fonctions, ↑↓ en boucle, Entrée insère le nom et la parenthèse', () => {
    const m = monde()
    monter(m)
    cliquer(3, 1)
    appuyer(clavier()!, { key: 'Enter' })
    taper(champ(), '=')
    expect([...hote.querySelectorAll('.notak-table-fonctions li')].map((li) => li.textContent)).toEqual(['SUM', 'IF', 'MIN', 'MAX', 'COUNT', 'AVERAGE'])
    appuyer(champ(), { key: 'ArrowUp' })
    expect(hote.querySelector('.notak-table-fonctions li[data-choisie]')?.textContent).toBe('AVERAGE')
    taper(champ(), '=ave')
    expect(hote.querySelector('.notak-table-fonctions li b')?.textContent).toBe('AVE')
    appuyer(champ(), { key: 'Enter' })
    expect(champ().value).toBe('=AVERAGE(')
    expect(m.lire().contenu.cellules[3]![1]).toBe('')
  })

  it('un clic sur une cellule, après un opérateur, la cite dans la formule', () => {
    const m = monde()
    monter(m)
    cliquer(3, 1)
    appuyer(clavier()!, { key: 'Enter' })
    taper(champ(), '=B2+')
    cliquer(2, 1)
    expect(champ().value).toBe('=B2+B3')
    // Un autre clic remplace la référence qu'on vient de citer.
    cliquer(1, 2)
    expect(champ().value).toBe('=B2+C2')
    // Les références sont colorées sur la grille.
    expect(hote.querySelectorAll('.notak-table-ref')).toHaveLength(2)
  })

  it('une cellule date ouvre un calendrier ; le jour choisi garde le format de la cellule', () => {
    const m = monde({ cellules: [['46054', ''], ['', ''], ['', ''], ['', '']], formats: [[{ type: 'date', date: 'long' }, null], [null, null], [null, null], [null, null]] })
    monter(m)
    cliquer(0, 0)
    appuyer(clavier()!, { key: 'Enter' })
    expect(champ().value).toBe('2026-02-01')
    const jour = hote.querySelector<HTMLInputElement>('.notak-table-calendrier input[type=date]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(jour, '2026-03-15')
      jour.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(champ().value).toBe('2026-03-15')
    appuyer(champ(), { key: 'Enter' })
    expect(formatsDe(m.lire().contenu)[0]![0]).toEqual({ type: 'date', date: 'long' })
    expect(m.lire().contenu.cellules[0]![0]).toBe('46096')
  })
})

describe('les colonnes', () => {
  const poignee = (j: number) => hote.querySelectorAll<HTMLElement>('.notak-table-largeur')[j]!
  const souris = (cible: HTMLElement, type: string, clientX: number) =>
    act(() => void cible.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX })))

  it('tirer la poignée élargit la colonne et l’élément ensemble, d’un seul pas', () => {
    const m = monde()
    monter(m)
    souris(poignee(0), 'pointerdown', 100)
    souris(poignee(0), 'pointermove', 130)
    // En direct, avant le lâcher.
    expect(m.lire().contenu.largeurs![0]).toBeCloseTo(14.3, 5)
    expect(m.lire().largeur).toBeCloseTo(37, 5)
    souris(poignee(0), 'pointerup', 130)
    expect(m.lire().contenu.largeurs!.reduce((a, b) => a + b, 0)).toBeCloseTo(m.lire().largeur, 5)
    expect(Number.isInteger(m.lire().largeur)).toBe(true)
    m.magasin.annuler()
    expect(m.lire().largeur).toBe(34)
    expect(m.lire().contenu.largeurs).toEqual([11.3, 11.3, 11.4])
  })

  it('une colonne ne descend pas sous 4 UG', () => {
    const m = monde()
    monter(m)
    souris(poignee(1), 'pointerdown', 300)
    souris(poignee(1), 'pointermove', 0)
    souris(poignee(1), 'pointerup', 0)
    expect(m.lire().contenu.largeurs![1]).toBeGreaterThanOrEqual(4)
  })

  it('une poignée lâchée sans bouger ne laisse rien dans l’historique', () => {
    const m = monde()
    monter(m)
    souris(poignee(2), 'pointerdown', 100)
    souris(poignee(2), 'pointerup', 100)
    expect(m.magasin.annuler()).toBe(false)
  })

  it('un double-clic ajuste la colonne à son contenu', () => {
    const m = monde()
    monter(m)
    act(() => void poignee(0).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })))
    const ls = m.lire().contenu.largeurs!
    expect(ls[0]).toBeLessThan(11.3)
    expect(Number.isInteger(m.lire().largeur)).toBe(true)
    expect(m.magasin.annuler()).toBe(true)
    expect(m.magasin.annuler()).toBe(false)
  })

  it('une colonne entière choisie : sa poignée les tire toutes', () => {
    const m = monde()
    monter(m)
    act(() => void hote.querySelectorAll('.notak-table-repere-colonne')[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })))
    act(() => void hote.querySelectorAll('.notak-table-repere-colonne')[1]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, shiftKey: true })))
    souris(poignee(0), 'pointerdown', 100)
    souris(poignee(0), 'pointermove', 120)
    const ls = m.lire().contenu.largeurs!
    expect(ls[0]).toBeCloseTo(12.3, 5)
    expect(ls[1]).toBeCloseTo(12.3, 5)
    expect(ls[2]).toBeCloseTo(11.4, 5)
  })
})

describe('le titre', () => {
  it('Tab quitte le titre pour A1 ; Maj+Tab depuis A1 y revient', () => {
    const m = monde({ avecTitre: true, titre: 'Devis' })
    monter(m)
    const titre = hote.querySelector<HTMLInputElement>('input.notak-table-titre')!
    act(() => titre.focus())
    appuyer(titre, { key: 'Tab' })
    expect(lireEtat(ID).tete).toEqual({ l: 0, c: 0 })
    expect(document.activeElement).toBe(clavier())
    appuyer(clavier()!, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(titre)
  })

  it('le titre s’écrit d’un pas, à la validation', () => {
    const m = monde({ avecTitre: true, titre: '' })
    monter(m)
    const titre = hote.querySelector<HTMLInputElement>('input.notak-table-titre')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(titre, 'Budget')
      titre.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(m.lire().contenu.titre).toBe('')
    appuyer(titre, { key: 'Enter' })
    expect(m.lire().contenu.titre).toBe('Budget')
    m.magasin.annuler()
    expect(m.lire().contenu.titre).toBe('')
  })
})

describe('le presse-papiers', () => {
  const presse = (type: 'copy' | 'cut' | 'paste', donnees: Record<string, string> = {}) => {
    const evt = new Event(type, { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
    const stock = { ...donnees }
    evt.clipboardData = { setData: (t: string, v: string) => void (stock[t] = v), getData: (t: string) => stock[t] ?? '' }
    act(() => void clavier()!.dispatchEvent(evt))
    return { stock, evt }
  }

  it('copier met du texte à tabulations et un HTML dans le presse-papiers', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    cliquer(2, 1, { shiftKey: true })
    const { stock, evt } = presse('copy')
    expect(evt.defaultPrevented).toBe(true)
    expect(stock['text/plain']).toBe('a\t10\nb\t20')
    expect(stock['text/html']).toContain('<table')
  })

  it('couper puis coller déplace : la source se vide au collage, tout d’un pas', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    cliquer(1, 1, { shiftKey: true })
    const { stock } = presse('cut')
    expect(m.lire().contenu.cellules[1]![0]).toBe('a')
    cliquer(3, 0)
    presse('paste', stock)
    expect(m.lire().contenu.cellules[3]!.slice(0, 2)).toEqual(['a', '10'])
    expect(m.lire().contenu.cellules[1]!.slice(0, 2)).toEqual(['', ''])
    m.magasin.annuler()
    expect(m.lire().contenu.cellules[1]!.slice(0, 2)).toEqual(['a', '10'])
    expect(m.lire().contenu.cellules[3]!.slice(0, 2)).toEqual(['', ''])
  })

  it('coller du texte de tableur agrandit la grille et déduit les types', () => {
    const m = monde()
    monter(m)
    cliquer(3, 2)
    presse('paste', { 'text/plain': '5 %\t2026-01-01\n7\t8' })
    expect(m.lire().contenu.cellules).toHaveLength(5)
    expect(m.lire().contenu.cellules[0]).toHaveLength(4)
    expect(formatsDe(m.lire().contenu)[3]![2]?.type).toBe('pourcent')
    expect(formatsDe(m.lire().contenu)[3]![3]?.type).toBe('date')
  })

  it('une formule copiée puis collée plus bas voit ses références se décaler', () => {
    const m = monde({ cellules: [['1', '=A1*2'], ['2', ''], ['', ''], ['', '']] })
    monter(m)
    cliquer(0, 1)
    const { stock } = presse('copy')
    cliquer(1, 1)
    presse('paste', stock)
    expect(m.lire().contenu.cellules[1]![1]).toBe('=A2*2')
  })
})

describe('les outils de la barre', () => {
  it('sans cellule : Titre, + Ligne, + Colonne', () => {
    const m = monde()
    monter(m)
    expect([...hote.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Titre', 'Ligne', 'Colonne'])
    act(() => bouton('Titre').click())
    expect(m.lire().contenu.avecTitre).toBe(true)
    act(() => bouton('Ligne').click())
    expect(m.lire().contenu.cellules).toHaveLength(5)
    act(() => bouton('Colonne').click())
    expect(m.lire().contenu.cellules[0]).toHaveLength(4)
    expect(m.lire().largeur).toBe(34 + 12)
  })

  it('des cellules choisies : les outils de cellule remplacent ceux de l’élément', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    const noms = [...hote.querySelectorAll('button')].filter((b) => b.closest('.notak-note-menu-ancre') || b.title).map((b) => b.title)
    expect(noms).toEqual(
      expect.arrayContaining(['Couleur du texte et surlignage', 'Type de cellule', 'Couleur de la cellule', 'Écrire une formule dans la cellule', 'Alignement dans la cellule', 'Autres gestes sur les cellules']),
    )
    expect(hote.textContent).not.toContain('Titre')
  })

  it('l’outil Type : le type se donne à la cellule et ses options se règlent', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    act(() => bouton('Type de cellule').click())
    const types = [...hote.querySelectorAll('[role=menuitemradio]')]
    expect(types.map((b) => b.textContent)).toEqual(['Automatique', 'Nombre', 'Monnaie', 'Pourcentage', 'Texte', 'Date et heure', 'Case à cocher'])
    // « Nom » est du texte : la cellule du dessus ne peut pas être un nombre ; ici B2 vaut 10, tout va.
    act(() => (types[2] as HTMLElement).click())
    expect(formatsDe(m.lire().contenu)[1]![1]?.type).toBe('monnaie')
    const decimales = hote.querySelector<HTMLSelectElement>('.notak-table-options select')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(decimales, '0')
      decimales.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(formatsDe(m.lire().contenu)[1]![1]).toEqual({ type: 'monnaie', decimales: 0 })
  })

  it('l’outil Type se grise pour un type qu’aucune cellule choisie ne peut prendre', () => {
    const m = monde()
    monter(m)
    cliquer(1, 0)
    act(() => bouton('Type de cellule').click())
    const types = [...hote.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')]
    expect(types.find((b) => b.textContent === 'Nombre')!.disabled).toBe(true)
    expect(types.find((b) => b.textContent === 'Texte')!.disabled).toBe(false)
  })

  it('la couleur de la cellule : un aperçu au survol, le choix d’un seul pas', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    act(() => bouton('Couleur de la cellule').click())
    const jaune = hote.querySelector<HTMLElement>('[aria-label="Jaune"]')!
    act(() => void jaune.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    act(() => void jaune.dispatchEvent(new MouseEvent('pointerenter')))
    expect(lireEtat(ID).apercuFond).toBe('#ffd14d')
    expect(formatsDe(m.lire().contenu)[1]![1]).toBeNull()
    act(() => jaune.click())
    expect(formatsDe(m.lire().contenu)[1]![1]).toEqual({ fond: '#ffd14d' })
    expect(lireEtat(ID).apercuFond).toBeUndefined()
  })

  it('la couleur du texte et le surlignage s’excluent', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    act(() => bouton('Couleur du texte et surlignage').click())
    act(() => hote.querySelector<HTMLElement>('[aria-label="Rouge"]')!.click())
    expect(formatsDe(m.lire().contenu)[1]![1]).toEqual({ couleur: '#d93a3a' })
    act(() => bouton('Couleur du texte et surlignage').click())
    act(() => hote.querySelector<HTMLElement>('[aria-label="Rose"]')!.click())
    expect(formatsDe(m.lire().contenu)[1]![1]).toEqual({ surligne: '#ffb8e8' })
  })

  it('l’alignement : horizontal et vertical', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    act(() => bouton('Alignement dans la cellule').click())
    act(() => hote.querySelector<HTMLElement>('[aria-label="Au centre"]')!.click())
    act(() => bouton('Alignement dans la cellule').click())
    act(() => hote.querySelector<HTMLElement>('[aria-label="En bas"]')!.click())
    expect(formatsDe(m.lire().contenu)[1]![1]).toEqual({ alignement: 'centre', vertical: 'bas' })
  })

  it('fx ouvre l’édition avec = ; il se grise sur plusieurs cellules', () => {
    const m = monde()
    monter(m)
    cliquer(3, 0)
    act(() => bouton('Écrire une formule').click())
    expect(champ().value).toBe('=')
    appuyer(champ(), { key: 'Escape' })
    cliquer(3, 0)
    cliquer(3, 1, { shiftKey: true })
    expect(bouton('Écrire une formule').disabled).toBe(true)
  })

  it('+ Colonne ajoute autant de colonnes que la sélection en couvre, à droite', () => {
    const m = monde()
    monter(m)
    cliquer(0, 0)
    cliquer(0, 1, { shiftKey: true })
    act(() => bouton('Ajouter une colonne à droite').click())
    expect(m.lire().contenu.cellules[0]).toHaveLength(5)
    expect(lireEtat(ID).plages).toEqual([{ l1: 0, c1: 2, l2: 0, c2: 3 }])
  })

  it('« ••• » reprend le menu du clic droit sans le presse-papiers', () => {
    const m = monde()
    monter(m)
    cliquer(1, 1)
    act(() => bouton('Autres gestes').click())
    const noms = [...hote.querySelectorAll('.notak-table-menu-plus button')].map((b) => b.textContent?.replace('⌥↑', '').replace('⌥↓', '').replace('⌥←', '').replace('⌥→', '').replace('⌫', '').replace('⌘', ''))
    expect(noms).toContain('Ajouter une ligne au-dessus')
    expect(noms).toContain('Vider la cellule')
    expect(noms).not.toContain('Copier')
  })
})

describe('le clic droit', () => {
  it('sur une cellule d’une table seule choisie : le menu de la table, pas celui de la toile', () => {
    const m = monde()
    const toile = document.createElement('div')
    toile.className = 'notak-toile'
    document.body.append(toile)
    const r = createRoot(toile)
    act(() => r.render(<Monde magasin={m.magasin} contexte={m.contexte} />))
    const td = toile.querySelector<HTMLElement>('td[data-cellule="1,1"]')!
    let remonte = false
    document.body.addEventListener('contextmenu', () => (remonte = true), { once: true })
    act(() => void td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 60 })))
    expect(remonte).toBe(false)
    const libelles = [...toile.querySelectorAll('.notak-menu button')].map((b) => b.querySelector('.notak-menu-libelle')?.textContent)
    expect(libelles).toEqual(
      expect.arrayContaining(['Couper', 'Copier', 'Coller', 'Coller les valeurs', 'Ajouter une ligne au-dessus', 'Ajouter une ligne en dessous', 'Ajouter une colonne à gauche', 'Ajouter une colonne à droite', 'Vider la cellule', 'Retirer la ligne', 'Retirer la colonne']),
    )
    expect(lireEtat(ID).plages).toEqual([{ l1: 1, c1: 1, l2: 1, c2: 1 }])
    act(() => r.unmount())
    toile.remove()
  })
})
