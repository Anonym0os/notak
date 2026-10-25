// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageReglages } from './PageReglages'
import { PHOTO_MAX, type Reglages, type ServiceCompte, refusDePhoto } from './reglages'
import { RUBRIQUES, morceaux, rubriquesVisibles } from './rubriquesReglages'
import { VERSION_NOTAK } from './version'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  localStorage.clear()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const reglages: Reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true, grille: 10, barre: 'flottante' }
type Proprietes = Partial<Parameters<typeof PageReglages>[0]>
const monter = (p: Proprietes = {}) => act(() => racine.render(<PageReglages reglages={reglages} changer={() => {}} fermer={() => {}} {...p} />))

const bouton = (texte: string) => [...hote.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === texte)
const lien = (texte: string) => [...hote.querySelectorAll<HTMLButtonElement>('.notak-rg-lien')].find((b) => b.querySelector('span')?.textContent === texte)
const titre = () => hote.querySelector('h2')?.textContent
const ouvrir = (rubrique: string) => act(() => lien(rubrique)!.click())
const touche = (key: string, extra: KeyboardEventInit = {}) => act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })))

/** Écrit dans le champ de recherche comme au clavier (React écoute `input`). */
function chercher(texte: string) {
  const champ = hote.querySelector<HTMLInputElement>('input[type="search"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, texte)
    champ.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function service(extra: Partial<ServiceCompte> = {}) {
  const appels: string[] = []
  const s: ServiceCompte = {
    nom: 'Ana',
    email: 'ana@exemple.fr',
    couleur: '#2f9e44',
    photo: null,
    changerCouleur: async (c) => void appels.push(`couleur:${c}`),
    changerPhoto: async (f) => void appels.push(`photo:${f ? f.name : 'aucune'}`),
    ...extra,
  }
  return { s, appels }
}

describe('refus d’une photo', () => {
  it('accepte une image raisonnable, refuse un autre type ou un poids excessif', () => {
    expect(refusDePhoto({ type: 'image/png', size: 1000 })).toBeNull()
    expect(refusDePhoto({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPEG/)
    expect(refusDePhoto({ type: 'application/pdf', size: 1000 })).not.toBeNull()
    expect(refusDePhoto({ type: 'image/jpeg', size: PHOTO_MAX + 1 })).toMatch(/5 Mo/)
  })
})

describe('les rubriques', () => {
  it('s’ouvrent sur Apparence, et seules celles qui ont un réglage paraissent', () => {
    monter()
    expect(titre()).toBe('Apparence')
    expect(lien('Apparence')?.getAttribute('aria-current')).toBe('page')
    const rubriques = [...hote.querySelectorAll('.notak-rg-lien > span:first-of-type')].map((s) => s.textContent)
    expect(rubriques).toEqual(['Général', 'Apparence', 'Toile', 'Raccourcis clavier'])
    expect([...hote.querySelectorAll('.notak-rg-groupe')].map((g) => g.textContent)).toEqual(['Notak'])
    expect(hote.textContent).toContain(`Notak ${VERSION_NOTAK}`)
  })

  it('une rubrique sans ligne n’existe pas ; lui donner une ligne suffit à la montrer', () => {
    const c = { reglages, changer: () => {} }
    expect(rubriquesVisibles(c).map((r) => r.id)).not.toContain('corbeille')
    const corbeille = RUBRIQUES.find((r) => r.id === 'corbeille')!
    const avecLigne = RUBRIQUES.map((r) =>
      r === corbeille ? { ...r, sections: [{ titre: () => 'Vider', lignes: [{ id: 'essai', libelle: () => 'Vider seule', controle: { type: 'touches' as const, combinaison: '⌘K' } }] }] } : r,
    )
    expect(rubriquesVisibles(c, avecLigne).map((r) => r.id)).toContain('corbeille')
  })

  it('passent de l’une à l’autre, et la dernière ouverte revient à l’ouverture suivante', () => {
    monter()
    ouvrir('Toile')
    expect(titre()).toBe('Toile')
    expect(lien('Toile')?.getAttribute('aria-current')).toBe('page')
    expect(lien('Apparence')?.getAttribute('aria-current')).toBeNull()
    expect(hote.textContent).toContain('Double-clic sur le vide')
    act(() => racine.unmount())
    racine = createRoot(hote)
    monter()
    expect(titre()).toBe('Toile')
  })

  it('une rubrique retenue qui n’existe plus ici retombe sur Apparence', () => {
    localStorage.setItem('notak:reglages-rubrique', 'profil')
    monter()
    expect(titre()).toBe('Apparence')
  })

  it('le mode propose clair, sombre et système', () => {
    const choisis: Partial<Reglages>[] = []
    monter({ changer: (r) => choisis.push(r) })
    const modes = [...hote.querySelectorAll<HTMLButtonElement>('[aria-label="Mode"] [role="radio"]')]
    expect(modes.map((b) => b.textContent)).toEqual(['Clair', 'Sombre', 'Système'])
    expect(modes[0]!.getAttribute('aria-checked')).toBe('true')
    act(() => modes[2]!.click())
    expect(choisis).toEqual([{ theme: 'systeme' }])
  })

  it('une pilule transmet le choix, et montre celui en cours', () => {
    const choisis: Partial<Reglages>[] = []
    monter({ changer: (r) => choisis.push(r) })
    ouvrir('Toile')
    const grille = hote.querySelector('[role="radiogroup"][aria-label="Grille"]')!
    expect([...grille.querySelectorAll('[aria-checked="true"]')].map((b) => b.textContent)).toEqual(['Large10 px'])
    act(() => (grille.querySelector('[role="radio"]') as HTMLElement).click())
    expect(choisis).toEqual([{ grille: 8 }])
  })

  it('la barre des outils de gauche suit le bouton du premier îlot', () => {
    const basculer = vi.fn()
    monter({ outils: { caches: false, basculer } })
    ouvrir('Toile')
    const groupe = hote.querySelector('[role="radiogroup"][aria-label="Barre des outils de gauche"]')!
    expect(groupe.querySelector('[aria-checked="true"]')?.textContent).toBe('Affichée')
    act(() => bouton('Affichée')!.click())
    expect(basculer).not.toHaveBeenCalled()
    act(() => bouton('Masquée')!.click())
    expect(basculer).toHaveBeenCalledOnce()
  })

  it('sans état des outils, la ligne n’est pas là', () => {
    monter()
    ouvrir('Toile')
    expect(hote.textContent).not.toContain('Barre des outils de gauche')
  })

  it('les raccourcis reprennent la fenêtre des raccourcis, une pastille par touche', () => {
    monter()
    ouvrir('Raccourcis clavier')
    const ligne = [...hote.querySelectorAll('.notak-rg-ligne')].find((l) => l.textContent?.startsWith('Thème sombre'))!
    // Sur Mac ⇧, ⌘ et D, une pastille chacune ; ailleurs « Maj+Ctrl+D » d'un bloc.
    const pastilles = [...ligne.querySelectorAll('kbd')].map((k) => k.textContent)
    expect(pastilles.length === 3 ? pastilles : pastilles[0]).toEqual(pastilles.length === 3 ? ['⇧', '⌘', 'D'] : 'Maj+Ctrl+D')
  })
})

describe('le profil', () => {
  it('n’existe que si l’application prête le service', () => {
    monter()
    expect(lien('Profil')).toBeUndefined()
    monter({ compte: service().s })
    expect(lien('Profil')).toBeDefined()
    expect(hote.querySelector('.notak-rg-moi')?.textContent).toContain('ana@exemple.fr')
  })

  it('le compte en haut de la colonne mène au profil', () => {
    monter({ compte: service().s })
    act(() => hote.querySelector<HTMLButtonElement>('.notak-rg-moi')!.click())
    expect(titre()).toBe('Profil')
  })

  it('montre l’initiale sans photo, la photo avec, et propose de la retirer', () => {
    monter({ compte: service().s })
    ouvrir('Profil')
    expect(hote.querySelector('.notak-reglages-avatar img')).toBeNull()
    expect(hote.querySelector('.notak-reglages-avatar')?.textContent).toBe('A')
    expect(hote.textContent).toContain('Choisir une photo')
    monter({ compte: service({ photo: '/api/fichiers/x?l=400' }).s })
    expect(hote.querySelector('.notak-reglages-avatar img')?.getAttribute('src')).toBe('/api/fichiers/x?l=400')
    expect(hote.textContent).toContain('Retirer la photo')
  })

  it('une couleur choisie est transmise, la couleur actuelle est cochée', async () => {
    const { s, appels } = service()
    monter({ compte: s })
    ouvrir('Profil')
    const radios = [...hote.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="Couleur du compte"] [role="radio"]')]
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.getAttribute('aria-label'))).toEqual(['#2f9e44'])
    await act(async () => radios[4]!.click())
    expect(appels).toEqual(['couleur:#1971c2'])
  })

  it('retirer la photo la transmet comme « aucune »', async () => {
    const { s, appels } = service({ photo: '/p' })
    monter({ compte: s })
    ouvrir('Profil')
    await act(async () => bouton('Retirer la photo')!.click())
    expect(appels).toEqual(['photo:aucune'])
  })

  it('dit pourquoi un changement a échoué', async () => {
    const echec = vi.fn().mockRejectedValue(new Error('Serveur injoignable'))
    monter({ compte: service({ changerCouleur: echec }).s })
    ouvrir('Profil')
    const premiere = hote.querySelector<HTMLButtonElement>('[aria-label="Couleur du compte"] [role="radio"]')!
    await act(async () => premiere.click())
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe('Serveur injoignable')
  })

  it('une photo refusée n’est pas envoyée', async () => {
    const { s, appels } = service()
    monter({ compte: s })
    ouvrir('Profil')
    const champ = hote.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(champ, 'files', { value: [new File(['x'], 'cv.pdf', { type: 'application/pdf' })], configurable: true })
    await act(async () => champ.dispatchEvent(new Event('change', { bubbles: true })))
    expect(appels).toEqual([])
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/PNG/)
  })

  it('une bonne photo est transmise', async () => {
    const { s, appels } = service()
    monter({ compte: s })
    ouvrir('Profil')
    const champ = hote.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(champ, 'files', { value: [new File(['x'], 'moi.png', { type: 'image/png' })], configurable: true })
    await act(async () => champ.dispatchEvent(new Event('change', { bubbles: true })))
    expect(appels).toEqual(['photo:moi.png'])
  })
})

describe('la recherche', () => {
  it('trouve dans les libellés et les aides de toutes les rubriques, sans tenir aux accents', () => {
    monter()
    chercher('theme')
    expect(titre()).toBe('1 réglage pour « theme »')
    expect([...hote.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Thème'])
    chercher('grille')
    expect(titre()).toBe('2 réglages pour « grille »')
    // Les rubriques avec résultat disent combien, les autres pâlissent.
    expect(lien('Toile')?.querySelector('.notak-rg-nombre')?.textContent).toBe('1')
    expect(lien('Raccourcis clavier')?.querySelector('.notak-rg-nombre')?.textContent).toBe('1')
    expect(lien('Apparence')?.hasAttribute('data-hors')).toBe(true)
    expect(lien('Toile')?.hasAttribute('data-hors')).toBe(false)
    // L'aide aussi : « s'alignent » n'est que dans l'aide de la grille.
    chercher('alignent')
    expect(titre()).toBe('1 réglage pour « alignent »')
  })

  it('un résultat se règle sur place, et le nom de sa rubrique y mène', () => {
    const choisis: Partial<Reglages>[] = []
    monter({ changer: (r) => choisis.push(r) })
    chercher('double')
    act(() => bouton('Ne fait rien')!.click())
    expect(choisis).toEqual([{ doubleClic: false }])
    act(() => hote.querySelector<HTMLButtonElement>('.notak-rg-section-titre button')!.click())
    expect(titre()).toBe('Toile')
    expect(hote.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('')
  })

  it('rien trouvé : le dit', () => {
    monter()
    chercher('xyzzy')
    expect(titre()).toBe('Aucun réglage pour « xyzzy »')
    expect(hote.querySelectorAll('.notak-rg-lien[data-hors]').length).toBe(4)
  })

  it('surligne sans tenir aux accents ni aux capitales', () => {
    expect(morceaux('Le thème sombre', 'THEME')).toEqual([
      { texte: 'Le ', trouve: false },
      { texte: 'thème', trouve: true },
      { texte: ' sombre', trouve: false },
    ])
    expect(morceaux('abc', '')).toEqual([{ texte: 'abc', trouve: false }])
  })
})

describe('le clavier', () => {
  it('Échap vide d’abord la recherche, puis ferme', () => {
    const fermer = vi.fn()
    monter({ fermer })
    chercher('grille')
    touche('Escape')
    expect(fermer).not.toHaveBeenCalled()
    expect(hote.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('')
    expect(titre()).toBe('Apparence')
    touche('Escape')
    expect(fermer).toHaveBeenCalledOnce()
  })

  it('un clic sur le fond ferme, un clic dans la fenêtre non', () => {
    const fermer = vi.fn()
    monter({ fermer })
    act(() => void hote.querySelector('.notak-rg')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(fermer).not.toHaveBeenCalled()
    act(() => void hote.querySelector('.notak-rg-fond')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(fermer).toHaveBeenCalledOnce()
  })

  it('le champ de recherche a le focus à l’ouverture, Cmd+F l’y ramène ; à la fermeture, le focus revient', () => {
    const avant = document.createElement('button')
    document.body.append(avant)
    avant.focus()
    monter()
    const champ = hote.querySelector<HTMLInputElement>('input[type="search"]')!
    expect(document.activeElement).toBe(champ)
    lien('Toile')!.focus()
    touche('f', { metaKey: true })
    expect(document.activeElement).toBe(champ)
    act(() => racine.render(<></>))
    expect(document.activeElement).toBe(avant)
    avant.remove()
  })

  it('Tab tourne dans la fenêtre', () => {
    monter()
    const fermer = hote.querySelector<HTMLButtonElement>('.notak-rg-fermer')!
    // jsdom ne met pas en page : rien n'a d'`offsetParent`, sauf l'élément qui a le focus.
    fermer.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => void document.dispatchEvent(tab))
    expect(tab.defaultPrevented).toBe(true)
  })
})

describe('langue des réglages', () => {
  it('propose automatique, français et anglais, et passe l’interface en anglais', async () => {
    const { definirLangue } = await import('./langue')
    const choisis: unknown[] = []
    monter({ changer: (r) => choisis.push(r) })
    ouvrir('Général')
    const boutons = [...hote.querySelectorAll<HTMLElement>('[aria-label="Langue de l’interface"] [role="radio"]')].map((b) => b.textContent)
    expect(boutons).toEqual(['AutomatiqueFrançais', 'Français', 'English'])
    act(() => bouton('English')!.click())
    expect(choisis).toEqual([{ langue: 'en' }])
    try {
      definirLangue('en')
      monter({ reglages: { ...reglages, langue: 'en' } })
      expect(hote.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Settings')
      expect(hote.textContent).toContain('Interface language')
    } finally {
      definirLangue('fr')
    }
  })
})

describe('version', () => {
  it('est celle du paquet', () => {
    // `glob` est celui de Vite, comme dans langue.test.ts.
    const brut = (import.meta as unknown as { glob(m: string, o: object): Record<string, string> }).glob('../package.json', { query: '?raw', import: 'default', eager: true })
    const paquet = JSON.parse(Object.values(brut)[0]!) as { version: string }
    expect(VERSION_NOTAK).toBe(paquet.version)
  })
})
