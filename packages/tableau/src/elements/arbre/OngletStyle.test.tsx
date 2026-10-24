// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Arbre, Id } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import type { ContexteToile } from '../types'
import { OngletStyle } from './OngletStyle'
import { ajouterLimite, ajouterRelation, ajouterResume } from './modele/elements'
import { type Geste, appliquerGeste } from './modele/gestes'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Le panneau « contenu du sujet » (éditeur de note, image) n'est pas l'objet de ces essais.
vi.mock('./Panneau', () => ({ Panneau: () => <div data-testid="contenu" /> }))

let racine: Root
let hote: HTMLElement
const faire = vi.fn<(g: Geste) => void>()

beforeEach(() => {
  faire.mockClear()
  hote = document.createElement('div')
  hote.className = 'notak-arbre-fond'
  document.body.append(hote)
  racine = createRoot(hote)
  localStorage.clear()
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  document.body.querySelectorAll('.notak-arbre-style-pop').forEach((x) => x.remove())
})

function carte() {
  let a: Arbre = nouvelArbre('Centre')
  const c = lire(a).central
  let p: Id, q: Id, s: Id
  ;[a, p] = ajouterEnfant(a, c, 'Alpha')
  ;[a, q] = ajouterEnfant(a, c, 'Beta')
  ;[a, s] = ajouterEnfant(a, p, 'Sous')
  return { a, c, p, q, s }
}

const monter = (a: Arbre, choisis: Id[]) =>
  act(() => racine.render(<OngletStyle arbre={a} lecture={lire(a)} choisis={choisis} courant={choisis[0] ?? lire(a).central} faire={faire} contexte={{ services: {} } as unknown as ContexteToile} />))

const texte = () => hote.textContent ?? ''
/** Un bouton par son libellé exact (aria-label, titre ou texte), ou par une expression. */
const bouton = (libelle: string | RegExp, hoteDe: ParentNode = document.body) => {
  const tous = [...hoteDe.querySelectorAll<HTMLElement>('button, [role=option], [role=menuitem], [role=menuitemradio]')]
  const noms = (x: HTMLElement) => [x.getAttribute('aria-label'), x.getAttribute('title'), x.textContent].filter((n): n is string => !!n)
  const b = tous.find((x) => noms(x).some((n) => (typeof libelle === 'string' ? n === libelle : libelle.test(n))))
  if (!b) throw new Error(`Pas de bouton « ${libelle} » parmi ${tous.map((x) => noms(x)[0]).join(' | ')}`)
  return b
}
/** Une ligne d'un menu ouvert, par son texte. */
const option = (libelle: string) => {
  const o = [...document.body.querySelectorAll<HTMLElement>('.notak-arbre-style-pop [role=option], .notak-arbre-style-pop [role=menuitem], .notak-arbre-style-pop [role=menuitemradio]')].find((x) => x.textContent === libelle)
  if (!o) throw new Error(`Pas de ligne « ${libelle} »`)
  return o
}
/** Une case à cocher par son libellé. */
const caseA = (libelle: string) => [...hote.querySelectorAll<HTMLInputElement>('label.notak-arbre-style-case')].find((x) => x.textContent === libelle)!.querySelector('input')!
const cliquer = (el: HTMLElement) => act(() => void el.click())
const saisir = (champ: HTMLInputElement, valeur: string, touche = 'Enter') =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, valeur)
    champ.dispatchEvent(new Event('input', { bubbles: true }))
    if (touche) champ.dispatchEvent(new KeyboardEvent('keydown', { key: touche, bubbles: true }))
  })
const champ = (titre: string) => document.body.querySelector<HTMLInputElement>(`input[aria-label="${titre}"]`)!

describe('l’onglet Style : ce que la sélection montre', () => {
  it('rien de choisi : l’état vide', () => {
    const { a } = carte()
    monter(a, [])
    expect(texte()).toContain('Sélectionner un objet à formater.')
    expect(hote.querySelectorAll('.notak-arbre-style-section')).toHaveLength(0)
  })

  it('un mélange (un sujet et une relation) : l’état vide aussi', () => {
    const { a, p, q } = carte()
    const [b, r] = ajouterRelation(a, p, q)
    monter(b, [p, r!])
    expect(texte()).toContain('Sélectionner un objet à formater.')
  })

  it('le sujet central : forme, texte, structure, branche (branche colorée), ni style rapide ni numérotation', () => {
    const { a, c } = carte()
    monter(a, [c])
    const titres = [...hote.querySelectorAll('.notak-arbre-style-titre')].map((x) => x.textContent)
    expect(titres).toEqual(['Forme', 'Texte', 'Structure', 'Branche', 'Contenu du sujet'])
    expect(hote.querySelector('.notak-arbre-style-rapide')).toBeNull()
    expect(texte()).toContain('Branche colorée')
    expect(texte()).not.toContain('Numérotation')
  })

  it('un sujet principal : style rapide en tête, numérotation en bas', () => {
    const { a, p } = carte()
    monter(a, [p])
    expect(hote.querySelector('.notak-arbre-style-rapide')).not.toBeNull()
    expect([...hote.querySelectorAll('.notak-arbre-style-titre')].map((x) => x.textContent)).toContain('Numérotation')
    expect(texte()).not.toContain('Branche colorée')
  })

  it('un sujet flottant n’a pas de numérotation', () => {
    const { a } = carte()
    const [b, fl] = [appliquerGeste(a, { type: 'flottant', position: { x: 10, y: 10 } }, () => 'Libre')!.arbre, null]
    void fl
    const flottant = Object.entries(b.sujets).find(([, s]) => s.genre === 'detache')![0]
    monter(b, [flottant])
    expect(hote.querySelector('.notak-arbre-style-rapide')).not.toBeNull()
    expect([...hote.querySelectorAll('.notak-arbre-style-titre')].map((x) => x.textContent)).not.toContain('Numérotation')
  })

  it('plusieurs sujets de types différents : pas de style rapide', () => {
    const { a, p, s } = carte()
    monter(a, [p, s])
    expect(hote.querySelector('.notak-arbre-style-rapide')).toBeNull()
  })

  it('deux sujets aux valeurs différentes : « Multiple »', () => {
    const { a, p, q } = carte()
    const b = appliquerGeste(a, { type: 'style', ids: [q], style: { taille: 30, graisse: 800 } }, () => 'x')!.arbre
    monter(b, [p, q])
    expect(document.body.querySelector<HTMLInputElement>('input[aria-label="Définir la taille de police."]')!.placeholder).toBe('Multiple')
    expect(texte()).toContain('Multiple')
  })

  it('« Réinitialiser le style » n’est là que s’il y a un style à retirer', () => {
    const { a, p } = carte()
    monter(a, [p])
    expect(texte()).not.toContain('Réinitialiser le style')
    const b = appliquerGeste(a, { type: 'style', ids: [p], style: { taille: 22 } }, () => 'x')!.arbre
    monter(b, [p])
    expect(texte()).toContain('Réinitialiser le style')
    cliquer(bouton('Réinitialiser le style'))
    expect(faire).toHaveBeenCalledWith({ type: 'style', ids: [p], style: null })
    expect(faire).toHaveBeenCalledWith({ type: 'largeur', ids: [p], largeur: undefined })
  })

  it('une section se replie, et se déplie', () => {
    const { a, p } = carte()
    monter(a, [p])
    const titre = [...hote.querySelectorAll<HTMLElement>('.notak-arbre-style-titre')].find((x) => x.textContent === 'Texte')!
    const corps = titre.closest('.notak-arbre-style-section')!.querySelector<HTMLElement>('.notak-arbre-style-corps')!
    expect(corps.hidden).toBe(false)
    cliquer(titre)
    expect(corps.hidden).toBe(true)
    cliquer(titre)
    expect(corps.hidden).toBe(false)
  })
})

describe('l’onglet Style : chaque contrôle passe par un geste', () => {
  it('le gras, l’italique, le barré, le souligné', () => {
    const { a, s: p } = carte()
    monter(a, [p])
    cliquer(bouton('Mettre le texte en gras.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { graisse: 700, gras: undefined } })
    // Un sujet déjà gras (le central, 700) repasse à 400.
    const c = lire(a).central
    monter(a, [c])
    cliquer(bouton('Mettre le texte en gras.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [c], style: { graisse: 400, gras: undefined } })
    monter(a, [p])
    cliquer(bouton('Mettre le texte en italique.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { italique: true } })
    cliquer(bouton('Barrer le texte.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { barre: true } })
    cliquer(bouton('Souligner le texte.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { souligne: true } })
  })

  it('l’alignement et la casse', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Aligner le texte à droite.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { alignement: 'droite' } })
    cliquer(bouton('Définir l’utilisation des majuscules du texte.'))
    cliquer(bouton('MAJUSCULES'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { casse: 'majuscules' } })
  })

  it('la taille de police : saisie libre bornée à 1–200', () => {
    const { a, p } = carte()
    monter(a, [p])
    saisir(champ('Définir la taille de police.'), '22')
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { taille: 22 } })
    saisir(champ('Définir la taille de police.'), '900')
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { taille: 200 } })
  })

  it('la police, avec les récentes retenues', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir la famille de polices.'))
    cliquer(bouton('Georgia'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { police: 'Georgia, serif' } })
    expect(JSON.parse(localStorage.getItem('notak.arbre.polices')!)).toEqual(['Georgia, serif'])
    cliquer(bouton('Choisir la famille de polices.'))
    cliquer(bouton('Par défaut'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { police: undefined } })
  })

  it('le style de police : graisse et italique ensemble', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir le style de police.'))
    cliquer(bouton('Light Italic'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { graisse: 300, gras: undefined, italique: true } })
  })

  it('« aucun remplissage » ; le bouton de couleur se grise', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir le style de remplissage.'))
    cliquer(bouton('Aucun remplissage'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { motifRemplissage: 'aucun' } })
    const b = appliquerGeste(a, { type: 'style', ids: [p], style: { motifRemplissage: 'aucun' } }, () => 'x')!.arbre
    monter(b, [p])
    expect(bouton('Choisir la couleur de remplissage.', hote).hasAttribute('disabled')).toBe(true)
    expect(hote.textContent).toContain('Aucun')
  })

  it('un motif de remplissage hachuré', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir le style de remplissage.'))
    cliquer(bouton('Diagonales fines (main levée)'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { motifRemplissage: 'diagonales-fines' } })
  })

  it('« aucune bordure » met l’épaisseur à 0 ; un motif choisi à 0 la remet à 2', () => {
    const { a, p } = carte()
    const b = appliquerGeste(a, { type: 'style', ids: [p], style: { bordure: '#112233', epaisseurBordure: 3 } }, () => 'x')!.arbre
    monter(b, [p])
    cliquer(bouton('Choisir le style de bordure.'))
    cliquer(bouton('Aucune bordure'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { motifBordure: 'aucun', epaisseurBordure: 0 } })
    const c = appliquerGeste(b, { type: 'style', ids: [p], style: { motifBordure: 'aucun', epaisseurBordure: 0 } }, () => 'x')!.arbre
    monter(c, [p])
    cliquer(bouton('Choisir le style de bordure.'))
    cliquer(bouton('Tiret'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { motifBordure: 'tirets', epaisseurBordure: 2 } })
  })

  it('l’épaisseur de la bordure : cinq valeurs', () => {
    const { a, p } = carte()
    const b = appliquerGeste(a, { type: 'style', ids: [p], style: { bordure: '#112233', epaisseurBordure: 2 } }, () => 'x')!.arbre
    monter(b, [p])
    cliquer(bouton('Définir la largeur de bordure.'))
    expect([...document.body.querySelectorAll('[role=option]')].map((x) => x.textContent)).toEqual(['Très fin', 'Mince', 'Moyen', 'Gras', 'Très gras'])
    cliquer(bouton('Très gras'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { epaisseurBordure: 8 } })
  })

  it('la forme du sujet : quatre groupes, « Plus de formes » les montre tous', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir la forme du sujet.'))
    const popover = document.body.querySelector('.notak-arbre-style-pop')!
    expect(popover.textContent).toContain('Basique')
    expect(popover.textContent).not.toContain('Avancé')
    expect(popover.querySelectorAll('.notak-arbre-style-tuile').length).toBe(13)
    cliquer(bouton('Plus de formes'))
    expect(document.body.querySelector('.notak-arbre-style-pop')!.textContent).toContain('Organigramme')
    expect(document.body.querySelectorAll('.notak-arbre-style-pop .notak-arbre-style-tuile').length).toBe(12 + 13 + 7 + 15 + 1)
    cliquer(bouton('Étoile'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { forme: 'etoile' } })
    expect(document.body.querySelector('.notak-arbre-style-pop')).toBeNull()
  })

  it('la longueur : saisie d’une largeur, « Adapter » la retire', () => {
    const { a, p } = carte()
    monter(a, [p])
    expect(bouton('Adapter automatiquement la longueur du sujet à son texte.', hote).hasAttribute('disabled')).toBe(true)
    saisir(champ('Largeur du sujet, en px.'), '240')
    expect(faire).toHaveBeenLastCalledWith({ type: 'largeur', ids: [p], largeur: 240 })
    const b = appliquerGeste(a, { type: 'largeur', ids: [p], largeur: 240 }, () => 'x')!.arbre
    monter(b, [p])
    expect(champ('Largeur du sujet, en px.').value).toBe('240')
    cliquer(bouton('Adapter automatiquement la longueur du sujet à son texte.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'largeur', ids: [p], largeur: undefined })
  })

  it('le style rapide : très important, barré, par défaut', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir un style à ajouter au sujet sélectionné.'))
    cliquer(bouton('Très important'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'porter', ids: [p], champ: 'classe', valeur: 'important' })
    cliquer(bouton('Choisir un style à ajouter au sujet sélectionné.'))
    cliquer(bouton('Par défaut'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'porter', ids: [p], champ: 'classe', valeur: undefined })
  })

  it('la structure : une famille, puis sa variante ; suivre le parent', () => {
    const { a, p } = carte()
    monter(a, [p])
    // Sans structure à lui, un sujet suit son parent : la variante est grisée.
    expect(bouton('Choisir la disposition de la structure.', hote).hasAttribute('disabled')).toBe(true)
    cliquer(bouton('Choisir la structure du sujet.'))
    expect(document.body.querySelector('.notak-arbre-style-pop')!.textContent).not.toContain('Carte mentale')
    cliquer(bouton(/Organigramme/))
    expect(faire).toHaveBeenLastCalledWith({ type: 'structure', ids: [p], structure: 'organigramme-bas' })
    const b = appliquerGeste(a, { type: 'structure', ids: [p], structure: 'organigramme-bas' }, () => 'x')!.arbre
    monter(b, [p])
    expect(bouton('Choisir la disposition de la structure.', hote).hasAttribute('disabled')).toBe(false)
    cliquer(bouton('Choisir la disposition de la structure.'))
    cliquer(bouton('Du bas vers le haut'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'structure', ids: [p], structure: 'organigramme-haut' })
    cliquer(bouton('Choisir la structure du sujet.'))
    cliquer(bouton('Suivre la structure du sujet parent'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'structure', ids: [p], structure: null })
  })

  it('le central a la carte mentale parmi ses structures, et pas de « suivre le parent »', () => {
    const { a, c } = carte()
    monter(a, [c])
    cliquer(bouton('Choisir la structure du sujet.'))
    const texteCarte = document.body.querySelector('.notak-arbre-style-pop')!.textContent!
    expect(texteCarte).toContain('Carte mentale')
    expect(texteCarte).not.toContain('Suivre la structure')
  })
})

describe('l’onglet Style : la branche', () => {
  it('la forme de la ligne, huit choix', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir la forme de la ligne de branche.'))
    expect(document.body.querySelectorAll('.notak-arbre-style-pop .notak-arbre-style-tuile')).toHaveLength(8)
    cliquer(bouton('Anse'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { branche: 'anse' } })
  })

  it('« aucun » met l’épaisseur à 0 ; la largeur et la couleur se grisent', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir le style de la ligne.'))
    cliquer(option('Aucun'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { motif: 'aucun', epaisseurBranche: 0 } })
    const b = appliquerGeste(a, { type: 'style', ids: [p], style: { motif: 'aucun', epaisseurBranche: 0 } }, () => 'x')!.arbre
    monter(b, [p])
    expect(bouton('Définir la largeur de ligne.', hote).hasAttribute('disabled')).toBe(true)
    expect(bouton('Choisir la couleur de la ligne.', hote).hasAttribute('disabled')).toBe(true)
  })

  it('les largeurs effilées sont offertes à toutes les formes de ligne, comme chez Xmind', () => {
    const { a: avant, p } = carte()
    // Une branche en coude s'effile aussi : seule « aucune » n'a pas de trait.
    const a = appliquerGeste(avant, { type: 'style', ids: [p], style: { branche: 'coudee' } }, () => 'x')!.arbre
    monter(a, [p])
    cliquer(bouton('Définir la largeur de ligne.'))
    expect(document.body.querySelectorAll('[role=option]')).toHaveLength(10)
    cliquer(bouton('Moyen'))
    const b = appliquerGeste(a, { type: 'style', ids: [p], style: { branche: 'courbe' } }, () => 'x')!.arbre
    monter(b, [p])
    cliquer(bouton('Définir la largeur de ligne.'))
    const options = [...document.body.querySelectorAll('[role=option]')].map((x) => x.textContent)
    expect(options).toHaveLength(10)
    expect(options).toContain('Mince – Effilé')
    cliquer(bouton('Mince – Effilé'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { epaisseurBranche: 2, effilee: true } })
  })

  it('les onze pointes', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir le style d’extrémité.'))
    expect(document.body.querySelectorAll('.notak-arbre-style-pop .notak-arbre-style-tuile')).toHaveLength(11)
    cliquer(bouton('Fer de lance'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [p], style: { pointeBranche: 'fer-de-lance' } })
  })

  it('le central : la bascule « Branche colorée », et la série de couleurs', () => {
    const { a, c } = carte()
    monter(a, [c])
    cliquer(bouton('Définir une couleur différente pour chaque branche.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'options', options: { uneCouleur: true } })
    cliquer(bouton('Choisir la série de couleurs des branches.'))
    const series = document.body.querySelectorAll('.notak-arbre-style-serie')
    expect(series.length).toBeGreaterThan(6)
    cliquer(series[1] as HTMLElement)
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [c], style: { serieCouleurs: expect.any(Array) } })
  })

  it('une seule couleur : un bouton de couleur à la place de la série', () => {
    const { a, c } = carte()
    const b = appliquerGeste(a, { type: 'options', options: { uneCouleur: true } }, () => 'x')!.arbre
    monter(b, [c])
    expect(hote.querySelector('.notak-arbre-style-serie-bouton')).toBeNull()
    cliquer(bouton('Choisir la couleur de la ligne.'))
    cliquer(bouton('#D33017'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [c], style: { couleurBranche: '#d33017' } })
  })
})

describe('l’onglet Style : la numérotation et « Mettre à jour »', () => {
  it('un style de numérotation, ses deux cases et l’application aux frères', () => {
    const { a, p } = carte()
    monter(a, [p])
    cliquer(bouton('Choisir le style de numérotation.'))
    cliquer(bouton('I.II.III.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'lot', gestes: [{ type: 'porter', ids: [p], champ: 'numerotation', valeur: { motif: 'romain' } }] })
    const b = appliquerGeste(a, { type: 'porter', ids: [p], champ: 'numerotation', valeur: { motif: 'romain' } }, () => 'x')!.arbre
    monter(b, [p])
    cliquer(caseA('Numéros échelonnés'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'lot', gestes: [{ type: 'porter', ids: [p], champ: 'numerotation', valeur: { motif: 'romain', paliers: true } }] })
    cliquer(caseA('Commencer depuis le début'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'lot', gestes: [{ type: 'porter', ids: [p], champ: 'numerotation', valeur: { motif: 'romain', debut: true } }] })
    cliquer(bouton('Appliquer aux sujets frères'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'numeroterFreres', id: p })
  })

  it('« Aucun » retire la numérotation', () => {
    const { a, p } = carte()
    const b = appliquerGeste(a, { type: 'porter', ids: [p], champ: 'numerotation', valeur: { motif: 'arabe' } }, () => 'x')!.arbre
    monter(b, [p])
    cliquer(bouton('Choisir le style de numérotation.'))
    cliquer(option('Aucun'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'porter', ids: [p], champ: 'numerotation', valeur: undefined })
  })

  it('« Mettre à jour » : un menu à deux entrées quand les deux se peuvent', () => {
    const { a, p, q, s } = carte()
    const b = appliquerGeste(a, { type: 'style', ids: [p], style: { taille: 22 } }, () => 'x')!.arbre
    monter(b, [p])
    cliquer(bouton('Mettre à jour'))
    cliquer(bouton('Appliquer pour tous les sujets de niveau 1'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'mettreAJourStyle', id: p, portee: 'niveau' })
    cliquer(bouton('Mettre à jour'))
    cliquer(bouton('Appliquer pour tous les sous-sujets'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'mettreAJourStyle', id: p, portee: 'sous-sujets' })
    void q
    void s
  })

  it('caché sans style, ou pour le central', () => {
    const { a, p, c } = carte()
    monter(a, [p])
    expect(texte()).not.toContain('Mettre à jour')
    const b = appliquerGeste(a, { type: 'style', ids: [c], style: { taille: 30 } }, () => 'x')!.arbre
    monter(b, [c])
    expect(texte()).not.toContain('Mettre à jour')
  })
})

describe('l’onglet Style : relation, limite, résumé', () => {
  it('une relation : forme, pointes, motif, épaisseur, texte', () => {
    const { a, p, q } = carte()
    const [b, r] = ajouterRelation(a, p, q)
    monter(b, [r!])
    expect([...hote.querySelectorAll('.notak-arbre-style-titre')].map((x) => x.textContent)).toEqual(['Forme', 'Texte'])
    cliquer(bouton('Choisir la forme de la relation.'))
    expect(document.body.querySelectorAll('.notak-arbre-style-pop .notak-arbre-style-tuile')).toHaveLength(7)
    cliquer(bouton('Zigzag'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'styleObjet', ids: [r!], style: { forme: 'zigzag' } })
    const pointes = [...hote.querySelectorAll<HTMLElement>('[aria-label="Choisir le style d’extrémité."]')]
    expect(pointes).toHaveLength(2)
    cliquer(pointes[0]!)
    cliquer(bouton('Point'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'styleObjet', ids: [r!], style: { pointeDepart: 'point' } })
    cliquer(bouton('Choisir le style de la ligne.'))
    expect([...document.body.querySelectorAll('[role=option]')]).toHaveLength(7)
    cliquer(bouton('Définir la largeur de ligne.'))
    cliquer(bouton('Gras'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'styleObjet', ids: [r!], style: { epaisseur: 5 } })
    cliquer(bouton('Souligner le texte.'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'styleObjet', ids: [r!], style: { souligne: true } })
  })

  it('une limite : neuf formes, un remplissage plafonné à 20 % d’opacité, une bordure', () => {
    const { a, p } = carte()
    const [b, x] = ajouterLimite(a, [p])
    monter(b, [x!])
    cliquer(bouton('Choisir la forme de la limite.'))
    expect(document.body.querySelectorAll('.notak-arbre-style-pop .notak-arbre-style-tuile')).toHaveLength(9)
    cliquer(bouton('Vagues'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'styleObjet', ids: [x!], style: { forme: 'vagues' } })
    cliquer(bouton('Choisir la couleur de remplissage.'))
    cliquer(bouton('#D33017'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'styleObjet', ids: [x!], style: { remplissage: '#d3301733' } })
    cliquer(bouton('Choisir le style de bordure.'))
    expect(document.body.querySelectorAll('.notak-arbre-style-pop .notak-arbre-style-tuile')).toHaveLength(7)
    cliquer(bouton('Aucune bordure'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'styleObjet', ids: [x!], style: { motif: 'aucun', epaisseur: 0 } })
  })

  it('un résumé : sa ligne, son sujet, son texte, sa branche', () => {
    const { a, p, q } = carte()
    const [b, sujet] = ajouterResume(a, [p, q], 'En bref')
    const rid = Object.keys(b.resumes!)[0]!
    monter(b, [sujet!])
    expect([...hote.querySelectorAll('.notak-arbre-style-titre')].map((x) => x.textContent)).toEqual(['Ligne de résumé', 'Sujet du résumé', 'Texte', 'Branche'])
    cliquer(bouton('Choisir la forme du résumé.'))
    expect(document.body.querySelectorAll('.notak-arbre-style-pop .notak-arbre-style-tuile')).toHaveLength(5)
    cliquer(bouton('Ronde'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'styleObjet', ids: [rid], style: { forme: 'ronde' } })
    cliquer(bouton('Choisir la forme du sujet.'))
    cliquer(bouton('Cercle'))
    expect(faire).toHaveBeenLastCalledWith({ type: 'style', ids: [sujet!], style: { forme: 'cercle' } })
  })
})

describe('l’onglet Style en anglais', () => {
  it('parle anglais', () => {
    definirLangue('en')
    try {
      const { a, p } = carte()
      monter(a, [p])
      expect([...hote.querySelectorAll('.notak-arbre-style-titre')].map((x) => x.textContent).slice(0, 2)).toEqual(['Shape', 'Text'])
      expect(texte()).toContain('Numbering')
      monter(a, [])
      expect(texte()).toContain('Select an object to format.')
    } finally {
      definirLangue('fr')
    }
  })
})
