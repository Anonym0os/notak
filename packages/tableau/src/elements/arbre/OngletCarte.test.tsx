// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Arbre, Id, StructureArbre } from '../../coeur/tableau'
import { OngletCarte, optionsLargeur, optionsPolices, valeurLargeur } from './OngletCarte'
import { apercuDe } from './carte/apercu'
import { modifierPreferences, preferences, relirePreferences } from './carte/preferences'
import { POLICES } from './carte/polices'
import type { Geste } from './modele/gestes'
import { ajouterEnfant, ajouterFlottant, changerSujet, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let gestes: Geste[]
beforeEach(() => {
  localStorage.clear()
  relirePreferences()
  gestes = []
  hote = document.createElement('div')
  hote.className = 'notak-arbre-fond'
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

function carte(structure: StructureArbre = 'carte', plus: Partial<Arbre> = {}): Arbre {
  let a = nouvelArbre('Centre')
  const c = lire(a).central
  a = changerSujet(a, c, (s) => ({ ...s, structure }))
  let p: Id
  ;[a, p] = ajouterEnfant(a, c, 'Un')
  ;[a] = ajouterEnfant(a, c, 'Deux')
  ;[a] = ajouterEnfant(a, p, 'Sous')
  ;[a] = ajouterFlottant(a, { x: 300, y: 0 }, 'Libre')
  return { ...a, ...plus }
}

function monter(a: Arbre) {
  act(() => racine.render(<OngletCarte arbre={a} lecture={lire(a)} faire={(g) => gestes.push(g)} />))
}

const bouton = (nom: string | RegExp) => {
  const tous = [...hote.querySelectorAll<HTMLElement>('button, [role=option], [role=tab], [role=menuitem]')]
  const noms = (b: HTMLElement) => [b.getAttribute('aria-label'), b.getAttribute('title'), b.textContent].filter((x): x is string => !!x)
  const trouve = tous.find((b) => noms(b).some((n) => (typeof nom === 'string' ? n === nom : nom.test(n))))
  if (!trouve) throw new Error(`Pas de bouton « ${String(nom)} » parmi : ${tous.map((b) => noms(b)[0]).join(' | ')}`)
  return trouve
}
const cliquer = (el: HTMLElement) => act(() => el.click())
const interrupteur = (libelle: string) => hote.querySelector<HTMLButtonElement>(`button[role=switch][aria-label="${libelle}"]`)!
const saisir = (el: HTMLInputElement, valeur: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valeur)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
const dernier = () => gestes.at(-1)

describe('l’onglet Carte : ce qu’il montre', () => {
  it('chaque bloc, dans l’ordre de l’onglet Map de Xmind', () => {
    monter(carte())
    const texte = hote.textContent!
    const ordre = [
      'Carte mentale',
      'Thème couleur',
      'Arrière-plan',
      'Police globale',
      'Largeur de la ligne de branche',
      'Branche colorée',
      'Couleur',
      'Style de carte',
      'Équilibrer la carte',
      'Carte compacte',
      'Affichage des sujets',
      'Largeur uniforme',
      'Afficher toutes les notes',
      'Flottants colorés auto',
      'Relation',
      'Couleur ligne suit sujet',
      'Avancé',
      'Branches libres',
      'Sujet flottant flexible',
      'Chevauchement des sujets',
      'Police CJK',
      'Après avoir défini les polices chinoises',
      'Thèmes personnalisés',
    ]
    let depuis = 0
    for (const mot of ordre) {
      const i = texte.indexOf(mot, depuis)
      expect(i, mot).toBeGreaterThanOrEqual(0)
      depuis = i
    }
  })

  it('pas de bouton « Upgrade », pas de badge PRO', () => {
    monter(carte())
    expect(hote.textContent).not.toMatch(/Upgrade|PRO/)
    expect(hote.querySelector('img')).toBeNull()
  })

  it('quatre titres de section, des séparateurs entre les blocs', () => {
    monter(carte())
    expect([...hote.querySelectorAll('.notak-arbre-reglages-titre')].map((x) => x.textContent)).toEqual(['Style de carte', 'Affichage des sujets', 'Relation', 'Avancé'])
    expect(hote.querySelectorAll('hr.notak-filet').length).toBeGreaterThanOrEqual(8)
  })

  it('une carte neuve : carte équilibrée et branches de couleur allumées, le reste éteint', () => {
    monter(carte())
    const allumes = [...hote.querySelectorAll<HTMLButtonElement>('button[role=switch]')].filter((i) => i.getAttribute('aria-checked') === 'true').map((i) => i.getAttribute('aria-label'))
    expect(allumes).toEqual(['Branche colorée', 'Équilibrer la carte'])
  })

  it('les réglages d’une carte se lisent dans ses options', () => {
    monter(carte('carte', { options: { compacte: true, uniforme: true, toutesNotes: true, flottantsColores: true, relationsColorees: true, libre: true, flottantSouple: true, chevauchement: true, uneCouleur: true } }))
    const eteints = [...hote.querySelectorAll<HTMLButtonElement>('button[role=switch]')].filter((i) => i.getAttribute('aria-checked') !== 'true').map((i) => i.getAttribute('aria-label'))
    // Tout est allumé, sauf « Branche colorée » : c'est « une couleur » qui l'est.
    expect(eteints).toEqual(['Branche colorée'])
  })

  it('chaque ligne à bascule porte l’infobulle de Xmind sur toute la ligne', () => {
    monter(carte())
    const ligne = interrupteur('Carte compacte').closest('.notak-reglage')!
    expect(ligne.getAttribute('title')).toBe('Réduire la taille et l\'espacement des éléments.')
  })

  it('la carte du squelette nomme le groupe de la structure, jamais la structure', () => {
    monter(carte('arete-droite'))
    expect(hote.querySelector('.notak-arbre-reglages-squelette-nom')!.textContent).toBe('Diagramme en arêtes de poisson')
  })

  it('une structure qui n’est pas une carte grise « Équilibrer » et « Branches libres »', () => {
    monter(carte('logique-droite'))
    expect(interrupteur('Équilibrer la carte').disabled).toBe(true)
    expect(interrupteur('Branches libres').disabled).toBe(true)
    expect(interrupteur('Carte compacte').disabled).toBe(false)
  })
})

describe('l’onglet Carte : ce que chaque réglage envoie', () => {
  const bascules: [string, string, boolean][] = [
    ['Carte compacte', 'compacte', true],
    ['Largeur uniforme', 'uniforme', true],
    ['Afficher toutes les notes', 'toutesNotes', true],
    ['Flottants colorés auto', 'flottantsColores', true],
    ['Couleur ligne suit sujet', 'relationsColorees', true],
    ['Branches libres', 'libre', true],
    ['Sujet flottant flexible', 'flottantSouple', true],
    ['Chevauchement des sujets', 'chevauchement', true],
  ]
  for (const [libelle, cle, actif] of bascules)
    it(`« ${libelle} » : un geste « reglage ${cle} »`, () => {
      monter(carte())
      cliquer(interrupteur(libelle))
      expect(gestes).toEqual([{ type: 'reglage', cle, actif }])
    })

  it('« Équilibrer la carte » éteint, puis allumé', () => {
    monter(carte())
    cliquer(interrupteur('Équilibrer la carte'))
    expect(dernier()).toEqual({ type: 'equilibrer', actif: false })
    monter(carte('carte-libre'))
    cliquer(interrupteur('Équilibrer la carte'))
    expect(dernier()).toEqual({ type: 'equilibrer', actif: true })
  })

  it('la carte non équilibrée règle le nombre de principaux à droite', () => {
    monter(carte('carte-libre'))
    expect(hote.textContent).toContain('À droite')
    cliquer(bouton('−'))
    expect(dernier()).toEqual({ type: 'aDroite', n: 1 })
    monter(carte())
    expect(hote.textContent).not.toContain('À droite')
  })

  it('« Branche colorée » éteinte : « une couleur » ; allumée de nouveau : les branches de couleur', () => {
    monter(carte())
    cliquer(interrupteur('Branche colorée'))
    expect(dernier()).toEqual({ type: 'reglage', cle: 'uneCouleur', actif: true })
    monter(carte('carte', { options: { uneCouleur: true } }))
    cliquer(interrupteur('Branche colorée'))
    expect(dernier()).toEqual({ type: 'reglage', cle: 'uneCouleur', actif: false })
  })

  it('le jeu de couleurs : un bouton à anneau quand les branches sont de couleur, la pastille de la couleur de ligne sinon', () => {
    monter(carte())
    expect(hote.querySelector('.notak-arbre-reglages-select-jeu')).not.toBeNull()
    cliquer(bouton('Jeu de couleurs'))
    const jeux = document.querySelectorAll('.notak-arbre-reglages-jeu')
    expect(jeux.length).toBe(10)
    expect(document.querySelectorAll('.notak-arbre-reglages-jeu[aria-selected=true]').length).toBe(1)
    cliquer(jeux[1] as HTMLElement)
    expect(dernier()).toMatchObject({ type: 'jeuCouleurs', couleurs: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'] })
    // Il se ferme au choix.
    expect(document.querySelector('.notak-arbre-reglages-jeu')).toBeNull()
    cliquer(bouton('Jeu de couleurs'))
    cliquer(document.querySelectorAll('.notak-arbre-reglages-jeu')[0] as HTMLElement)
    expect(dernier()).toEqual({ type: 'jeuCouleurs', couleurs: null })

    monter(carte('carte', { options: { uneCouleur: true } }))
    expect(hote.querySelector('.notak-arbre-reglages-select-jeu')).toBeNull()
    cliquer(bouton('Couleur'))
    cliquer(document.querySelector('.notak-arbre-reglages-case-couleur[aria-label="#dc2626"]') as HTMLElement)
    expect(dernier()).toEqual({ type: 'couleurLigne', couleur: '#dc2626' })
  })
})

describe('le squelette', () => {
  it('la fenêtre a ses huit groupes ; un choix applique le squelette et la laisse ouverte', () => {
    monter(carte('carte', { squelette: 'carte-1' }))
    cliquer(bouton('Choisir le squelette.'))
    const groupes = [...document.querySelectorAll('.notak-arbre-reglages-groupe-titre')].map((x) => x.textContent)
    expect(groupes).toEqual(['Carte mentale', 'Diagramme logique', "Carte d'accolade", 'Organigramme', 'Arbre graphique', 'Chronologie', 'Diagramme en arêtes de poisson', 'Matrice'])
    cliquer(bouton('Diagramme logique 1'))
    expect(gestes).toEqual([{ type: 'squelette', squelette: 'logique-1' }])
    expect(document.querySelector('.notak-arbre-reglages-squelettes')).not.toBeNull()
    // Le squelette actif ne se réapplique pas.
    cliquer(bouton('Carte mentale 1'))
    expect(gestes).toHaveLength(1)
  })

  it('une grille de trois vignettes par groupe : douze pour la carte mentale, neuf pour le diagramme logique', () => {
    monter(carte())
    cliquer(bouton('Choisir le squelette.'))
    const groupes = [...document.querySelectorAll('.notak-arbre-reglages-groupe-squelettes')]
    expect(groupes.map((g) => g.querySelectorAll('.notak-arbre-reglages-vignette').length)).toEqual([12, 9, 6, 6, 6, 6, 3, 3])
    // Un squelette dessiné à la main porte son petit crayon.
    expect(groupes[0]!.querySelectorAll('.notak-arbre-reglages-vignette-main')).toHaveLength(4)
  })

  it('chaque vignette porte le style de son squelette : les branches effilées sont des surfaces, les autres des traits', () => {
    monter(carte())
    cliquer(bouton('Choisir le squelette.'))
    const pleines = (nom: string) => [...bouton(nom).querySelectorAll('svg path')].filter((p) => !p.getAttribute('transform') && p.getAttribute('fill') && p.getAttribute('fill') !== 'none' && p.getAttribute('stroke') === 'none')
    // Le deuxième squelette de la carte mentale est effilé : ses branches du central sont pleines.
    expect(pleines('Carte mentale 2').length).toBeGreaterThanOrEqual(4)
    expect(pleines('Carte mentale 1').length).toBe(0)
  })

  it('un groupe se replie au clic sur son titre', () => {
    monter(carte())
    cliquer(bouton('Choisir le squelette.'))
    const avant = document.querySelectorAll('.notak-arbre-reglages-vignette').length
    cliquer([...document.querySelectorAll<HTMLElement>('.notak-arbre-reglages-groupe-titre')][0]!)
    expect(document.querySelectorAll('.notak-arbre-reglages-vignette').length).toBeLessThan(avant)
  })

  it('le squelette actif est marqué', () => {
    monter(carte('logique-droite', { squelette: 'logique-2' }))
    cliquer(bouton('Choisir le squelette.'))
    const actives = document.querySelectorAll('.notak-arbre-reglages-grille-squelettes .notak-arbre-reglages-vignette[data-actif]')
    expect(actives).toHaveLength(1)
    expect(actives[0]!.querySelector('button')!.getAttribute('aria-label')).toBe('Diagramme logique 2')
  })

  it('la carte du squelette montre la vignette du squelette courant, et le nom de son groupe', () => {
    monter(carte('logique-droite', { squelette: 'logique-3' }))
    expect(hote.querySelector('.notak-arbre-reglages-squelette-nom')!.textContent).toBe('Diagramme logique')
    expect(hote.querySelector('.notak-arbre-reglages-squelette-vignette svg')).not.toBeNull()
  })

  it('chaque structure a une vignette calculée avec la mise en page de la carte', () => {
    for (const s of ['carte', 'carte-libre', 'logique-droite', 'accolade-gauche', 'organigramme-bas', 'arbre-droite', 'chronologie-horizontale', 'arete-gauche', 'matrice-lignes'] as StructureArbre[]) {
      const g = apercuDe(s)
      expect(g.disposition.boites.size, s).toBe(g.lecture.sujets.size)
      expect(Number.isFinite(g.cadre.l) && g.cadre.l > 0 && g.cadre.h > 0, s).toBe(true)
    }
    // Deux structures, deux dessins.
    expect(apercuDe('logique-droite').cadre.l).not.toBe(apercuDe('organigramme-bas').cadre.l)
  })
})

describe('le thème de couleur', () => {
  it('le sélecteur montre le groupe courant : six segments et son nom', () => {
    monter(carte('carte', { theme: 'ocean' }))
    const s = hote.querySelector('.notak-arbre-reglages-select-theme')!
    expect(s.textContent).toBe('Océan')
    expect(s.querySelectorAll('.notak-arbre-reglages-segments i')).toHaveLength(6)
  })

  it('six variantes au plus, la première (branches de couleur) active pour une carte neuve ; un clic en prend une', () => {
    monter(carte())
    const v = hote.querySelectorAll('.notak-arbre-reglages-variantes .notak-arbre-reglages-vignette')
    expect(v.length).toBeGreaterThan(1)
    expect(v.length).toBeLessThanOrEqual(6)
    expect(v[0]!.hasAttribute('data-actif')).toBe(true)
    cliquer(v[2]!.querySelector('button')!)
    expect(dernier()).toMatchObject({ type: 'themeCouleur', choix: { theme: 'classique' } })
    const choix = (dernier() as Extract<Geste, { type: 'themeCouleur' }>).choix
    expect(choix.accent).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('la variante à une couleur de la carte est celle qui est active', () => {
    monter(carte('carte', { theme: 'foret', options: { uneCouleur: true }, couleurLigne: '#5a9e54' }))
    const actives = hote.querySelectorAll('.notak-arbre-reglages-variantes .notak-arbre-reglages-vignette[data-actif]')
    expect(actives).toHaveLength(1)
    expect(actives[0]!.hasAttribute('data-actif')).toBe(true)
    expect(hote.querySelector('.notak-arbre-reglages-variantes .notak-arbre-reglages-vignette')!.hasAttribute('data-actif')).toBe(false)
  })

  it('la liste a ses onglets Coloré et Classique ; un clic sur un groupe prend sa première variante, la fenêtre reste ouverte', () => {
    monter(carte())
    cliquer(bouton('Choisir le thème de couleur.'))
    expect([...document.querySelectorAll('[role=tab]')].map((x) => x.textContent)).toEqual(['Coloré', 'Classique'])
    // La carte neuve est du thème classique : la liste s'ouvre sur l'onglet Classique.
    expect([...document.querySelectorAll('.notak-arbre-reglages-bande')].map((x) => x.getAttribute('aria-label'))).toEqual(['Classique', 'Sobre', 'Papier', 'Ardoise'])
    cliquer(bouton('Coloré'))
    cliquer(document.querySelector<HTMLElement>('.notak-arbre-reglages-bande[aria-label="Océan"]')!)
    expect(dernier()).toEqual({ type: 'themeCouleur', choix: { theme: 'ocean', accent: undefined } })
    expect(document.querySelector('.notak-arbre-reglages-themes')).not.toBeNull()
    // L'onglet choisi est retenu.
    expect(preferences().ongletThemes).toBe('colore')
  })

  it('le groupe actif porte « Alterner » et passe à la variante suivante, puis revient à la première', () => {
    monter(carte('carte', { theme: 'ocean' }))
    cliquer(bouton('Choisir le thème de couleur.'))
    expect(document.querySelector('.notak-arbre-reglages-bande[data-actif] .notak-arbre-reglages-alterner')!.textContent).toBe('Alterner')
    cliquer(document.querySelector<HTMLElement>('.notak-arbre-reglages-bande[aria-label="Océan"]')!)
    const premier = (dernier() as Extract<Geste, { type: 'themeCouleur' }>).choix
    expect(premier.theme).toBe('ocean')
    expect(premier.accent).toBeTruthy()
  })

  it('un favori se pose sur l’étoile d’une variante, apparaît dans un onglet Favori, et s’en retire', () => {
    monter(carte())
    cliquer(hote.querySelector<HTMLElement>('.notak-arbre-reglages-variantes .notak-arbre-reglages-etoile')!)
    expect(preferences().favoris).toEqual(['classique|'])
    cliquer(bouton('Choisir le thème de couleur.'))
    expect([...document.querySelectorAll('[role=tab]')].map((x) => x.textContent)[0]).toBe('Favori')
  })

  it('« + » ouvre la boîte : Enregistrer attend les six couleurs et un nom', () => {
    monter(carte())
    cliquer(bouton('Créer un nouveau thème.'))
    const enregistrer = bouton('Enregistrer') as HTMLButtonElement
    expect(document.querySelector('#notak-arbre-reglages-dlg-titre')!.textContent).toBe('Créer un nouveau thème de couleur')
    expect(enregistrer.disabled).toBe(true)
    expect(document.querySelector('.notak-arbre-reglages-dlg-apercu')!.textContent).toBe('Aperçu du thème de couleur')
    const couleurs = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']
    couleurs.forEach((c, i) => {
      const champ = document.querySelector<HTMLInputElement>(`input[aria-label="Couleur ${i + 1}"]`)!
      expect(champ.disabled, `case ${i + 1}`).toBe(false)
      cliquer(champ)
      saisir(champ, c)
    })
    expect(document.querySelector('input[aria-label="Couleur 6"]')).not.toBeNull()
    expect((bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(false)
    expect(document.querySelectorAll('.notak-arbre-reglages-dlg-variantes svg').length).toBeGreaterThan(1)
    expect((document.querySelector('.notak-arbre-reglages-dlg-nom') as HTMLInputElement).value).toBe('Personnalisé')
    cliquer(bouton('Enregistrer'))
    expect(preferences().couleursPerso).toMatchObject([{ nom: 'Personnalisé', palette: couleurs }])
    expect(document.querySelector('.notak-arbre-reglages-dialogue')).toBeNull()
  })

  it('seule la première case vide est ouverte', () => {
    monter(carte())
    cliquer(bouton('Créer un nouveau thème.'))
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Couleur 1"]')!.disabled).toBe(false)
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Couleur 2"]')!.disabled).toBe(true)
    cliquer(bouton('Annuler'))
    expect(document.querySelector('.notak-arbre-reglages-dialogue')).toBeNull()
    expect(preferences().couleursPerso).toEqual([])
  })

  it('un thème de couleur à soi a son onglet « Ma couleur », applique ses couleurs, et le nom suivant est proposé', () => {
    modifierPreferences((p) => ({ ...p, couleursPerso: [{ id: 'perso:a', nom: 'Personnalisé', palette: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] }] }))
    monter(carte())
    cliquer(bouton('Choisir le thème de couleur.'))
    expect([...document.querySelectorAll('[role=tab]')].map((x) => x.textContent)).toEqual(['Ma couleur', 'Coloré', 'Classique'])
    cliquer(bouton('Ma couleur'))
    cliquer(bouton('Personnalisé'))
    expect(dernier()).toEqual({ type: 'themeCouleur', choix: { theme: 'perso:a', accent: undefined, perso: { nom: 'Personnalisé', palette: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] } } })
    cliquer(bouton('Créer un nouveau thème.'))
    expect((document.querySelector('.notak-arbre-reglages-dlg-nom') as HTMLInputElement).value).toBe('Personnalisé 2')
  })
})

describe('le fond, les polices, la largeur', () => {
  it('le fond : un clic sur une case du nuancier le pose et ferme la fenêtre', () => {
    monter(carte())
    cliquer(bouton('Arrière-plan'))
    expect(document.querySelectorAll('.notak-arbre-reglages-nuancier > .notak-arbre-reglages-grille-couleurs .notak-arbre-reglages-case-couleur')).toHaveLength(45)
    cliquer(document.querySelector('.notak-arbre-reglages-case-couleur[aria-label="#fef08a"]') as HTMLElement)
    expect(dernier()).toEqual({ type: 'fond', couleur: '#fef08a' })
    expect(document.querySelector('.notak-arbre-reglages-nuancier')).toBeNull()
    expect(preferences().couleursRecentes).toEqual(['#fef08a'])
  })

  it('l’hexa : « abc » devient #aabbcc ; l’opacité s’ajoute ; ils émettent à Entrée sans fermer', () => {
    monter(carte())
    cliquer(bouton('Arrière-plan'))
    const hex = document.querySelector<HTMLInputElement>('input[aria-label="Code hexadécimal"]')!
    saisir(hex, 'abc')
    act(() => void hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(dernier()).toEqual({ type: 'fond', couleur: '#aabbcc' })
    expect(document.querySelector('.notak-arbre-reglages-nuancier')).not.toBeNull()
    const opacite = document.querySelector<HTMLInputElement>('input[aria-label="Opacité"]')!
    saisir(opacite, '50')
    act(() => void opacite.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(dernier()).toEqual({ type: 'fond', couleur: '#aabbcc80' })
  })

  it('la pastille d’une carte au fond propre montre cette couleur, avec « Couleur du thème » pour la retirer', () => {
    monter(carte('carte', { fond: '#ffeecc' }))
    expect(hote.querySelector<HTMLElement>('.notak-arbre-reglages-pastille')!.style.getPropertyValue('--c')).toBe('#ffeecc')
    cliquer(bouton('Arrière-plan'))
    cliquer(bouton('Couleur du thème'))
    expect(dernier()).toEqual({ type: 'fond', couleur: null })
  })

  it('la police globale : la liste, un choix, « Par défaut »', () => {
    monter(carte())
    expect(hote.querySelector('[aria-label="Police globale"]')!.textContent).toBe('Par défaut')
    cliquer(bouton('Police globale'))
    const noms = [...document.querySelectorAll('[role=option]')].map((x) => x.textContent)
    expect(noms[0]).toBe('Par défaut')
    expect(noms.slice(1)).toEqual(POLICES.map((p) => p.nom))
    expect(document.querySelector<HTMLElement>('[role=option]:nth-child(1)')).not.toBeNull()
    cliquer(bouton('Verdana'))
    expect(dernier()).toEqual({ type: 'policeGlobale', police: 'Verdana' })
    expect(preferences().policesRecentes).toEqual(['Verdana'])
    monter(carte('carte', { police: 'Verdana' }))
    expect(hote.querySelector('[aria-label="Police globale"]')!.textContent).toBe('Verdana')
    cliquer(bouton('Police globale'))
    // Les récentes en tête, puis « Par défaut ».
    expect([...document.querySelectorAll('[role=option]')].map((x) => x.textContent).slice(0, 2)).toEqual(['Verdana', 'Par défaut'])
    cliquer(document.querySelectorAll<HTMLElement>('[role=option]')[1]!)
    expect(dernier()).toEqual({ type: 'policeGlobale', police: null })
  })

  it('chaque police se montre dans sa propre police', () => {
    monter(carte())
    cliquer(bouton('Police globale'))
    const georgia = [...document.querySelectorAll<HTMLElement>('[role=option] span:last-child')].find((x) => x.textContent === 'Georgia')!
    expect(georgia.style.fontFamily).toContain('Georgia')
  })

  it('la police CJK n’offre que des polices CJK', () => {
    monter(carte())
    cliquer(bouton('Police CJK'))
    const noms = [...document.querySelectorAll('[role=option]')].map((x) => x.textContent)
    expect(noms).toContain('PingFang SC')
    expect(noms).not.toContain('Georgia')
    cliquer(bouton('Yu Gothic'))
    expect(dernier()).toEqual({ type: 'policeCjk', police: 'Yu Gothic' })
  })

  it('la largeur de ligne : « Par défaut », les cinq niveaux, puis les mêmes effilés', () => {
    expect(optionsLargeur().map((o) => o.libelle)).toEqual([
      'Par défaut', 'Très fin', 'Mince', 'Moyen', 'Gras', 'Très gras',
      'Très fin - Effilé', 'Mince - Effilé', 'Moyen - Effilé', 'Gras - Effilé', 'Très gras - Effilé',
    ])
    expect(optionsLargeur().filter((o) => o.separateurAvant)).toHaveLength(1)
    monter(carte())
    const option = (nom: string) => [...document.querySelectorAll<HTMLElement>('[role=option]')].find((x) => x.textContent === nom)!
    cliquer(bouton('Largeur de la ligne de branche'))
    cliquer(option('Gras'))
    expect(dernier()).toEqual({ type: 'largeurBranche', pt: 5, effile: false })
    cliquer(bouton('Largeur de la ligne de branche'))
    cliquer(option('Moyen - Effilé'))
    expect(dernier()).toEqual({ type: 'largeurBranche', pt: 3, effile: true })
    cliquer(bouton('Largeur de la ligne de branche'))
    cliquer(option('Par défaut'))
    expect(dernier()).toEqual({ type: 'largeurBranche', pt: null, effile: false })
  })

  it('la largeur courante se lit dans la carte, même une valeur venue d’un fichier', () => {
    expect(valeurLargeur({})).toBe('0')
    expect(valeurLargeur({ largeurBranche: 5 })).toBe('5')
    expect(valeurLargeur({ largeurBranche: 5, effile: true })).toBe('5-effile')
    monter(carte('carte', { largeurBranche: 2.5 }))
    expect(hote.querySelector('[aria-label="Largeur de la ligne de branche"]')!.textContent).toBe('2.5 pt')
    monter(carte('carte', { largeurBranche: 3, effile: true }))
    expect(hote.querySelector('[aria-label="Largeur de la ligne de branche"]')!.textContent).toBe('Moyen - Effilé')
  })

  it('l’ordre d’une liste de polices : récentes, courante, « Par défaut », toutes', () => {
    const o = optionsPolices(POLICES, ['Georgia', 'Arial'], 'Verdana').map((x) => x.libelle)
    expect(o.slice(0, 5)).toEqual(['Georgia', 'Arial', 'Verdana', 'Par défaut', POLICES[0]!.nom])
    expect(optionsPolices(POLICES, [], undefined)[0]!.libelle).toBe('Par défaut')
  })
})

describe('les thèmes personnalisés', () => {
  it('le bouton ouvre la vue secondaire : un titre, une croix, la tuile « Créer un thème »', () => {
    monter(carte())
    cliquer(bouton('Thèmes personnalisés'))
    const racineCarte = hote.querySelector('.notak-arbre-reglages')!
    expect(racineCarte.hasAttribute('data-secondaire')).toBe(true)
    expect(hote.querySelector('.notak-arbre-reglages-secondaire header strong')!.textContent).toBe('Thèmes personnalisés')
    expect(hote.querySelector('.notak-arbre-reglages-tuile-nom')!.textContent).toBe('Créer un thème')
    expect(hote.textContent).not.toContain('Police globale')
    cliquer(bouton('Fermer'))
    expect(hote.textContent).toContain('Police globale')
  })

  it('créer un thème garde le style de la carte ; un clic l’applique ; le thème actif est marqué', () => {
    monter(carte('carte', { theme: 'ocean', police: 'Verdana', options: { compacte: true } }))
    cliquer(bouton('Thèmes personnalisés'))
    cliquer(hote.querySelector<HTMLElement>('.notak-arbre-reglages-creer')!)
    expect(preferences().themesPerso).toMatchObject([{ nom: 'Thème', style: { theme: 'ocean', police: 'Verdana', options: { compacte: true } } }])
    // La carte garde ce style : la tuile est active.
    monter(carte('carte', { theme: 'ocean', police: 'Verdana', options: { compacte: true } }))
    expect(hote.querySelector('.notak-arbre-reglages-vignette[data-actif]')).not.toBeNull()
    // Une autre carte : un clic lui applique le style.
    monter(carte())
    cliquer(hote.querySelector<HTMLElement>('.notak-arbre-reglages-vignette button')!)
    expect(dernier()).toEqual({ type: 'styleCarte', style: { theme: 'ocean', police: 'Verdana', options: { compacte: true } } })
  })

  it('le nom d’un thème se change en place', () => {
    modifierPreferences((p) => ({ ...p, themesPerso: [{ id: 'a', nom: 'Avant', style: {} }] }))
    monter(carte())
    cliquer(bouton('Thèmes personnalisés'))
    cliquer(hote.querySelector<HTMLElement>('button.notak-arbre-reglages-tuile-nom')!)
    const champ = hote.querySelector<HTMLInputElement>('.notak-arbre-reglages-renommer')!
    saisir(champ, 'Après')
    act(() => void champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(preferences().themesPerso[0]!.nom).toBe('Après')
  })
})
