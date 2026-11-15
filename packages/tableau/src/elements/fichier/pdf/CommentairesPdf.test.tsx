// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Magasin, creerMagasin } from '../../../coeur/magasin'
import { type DroitsTableau, filtrerMagasin } from '../../../coeur/droitsElements'
import type { Commentaire, Element, Fichier } from '../../../coeur/tableau'
import type { ContexteToile } from '../../types'
import '../../note'
import '../../decor'
import { chargerEmojis } from '../../decor/emojis'
import { oublierLus } from '../../commentaire/suivi'
import { afficherResolus } from '../../commentaire/Resolu'
import { demanderLeFil, filDemande } from '../../tableau/montrer'
import { ModaleFichier } from '../ModaleFichier'
import { mesuresFausses } from './fauxPdf'

vi.mock('../apercuPdf', async () => (await import('./fauxPdf')).moduleFaux)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let rendre: () => void
beforeAll(async () => {
  rendre = mesuresFausses()
  await chargerEmojis()
})
afterAll(() => rendre())

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  oublierLus()
  // « Afficher les résolus » est un réglage retenu d'une fois à l'autre : chaque essai part replié.
  afficherResolus(false)
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([37, 80, 68, 70])))
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const ana = { id: 'ana', nom: 'Ana Dupont', couleur: '#e33' }
const bob = { id: 'bob', nom: 'Bob Martin', couleur: '#2a7' }
const presence = (moi = ana) => ({ moi: () => moi, autres: () => [], ecouter: () => () => {}, signaler() {} })
const filDe = (page: number, x: number, y: number, texte: string, auteur = bob): Commentaire => ({
  type: 'commentaire',
  messages: [{ id: 'm1', auteur, date: Date.now() - 3_600_000, texte }],
  surPage: { page, x, y },
})
const pdf = (plus: Partial<Fichier> = {}): Element<Fichier> => ({
  id: 'p1',
  x: 0,
  y: 0,
  largeur: 34,
  contenu: { type: 'fichier', fichier: 'f1', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 1000, ...plus },
})
const attendre = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

/** La visionneuse sur une toile dont le magasin porte ce PDF (filtré comme pour un commentateur si `droits`). */
async function ouvrir(element = pdf(), services: Record<string, unknown> = {}, droits?: DroitsTableau) {
  const brut: Magasin = creerMagasin({ titre: '', etiquettes: [], elements: [element] })
  const magasin = droits ? filtrerMagasin(brut, () => droits, () => ana.id) : brut
  const contexte = { magasin, services: { presence: presence(), ...services } } as unknown as ContexteToile
  const montrer = () => {
    const el = brut.lire().elements.find((e) => e.id === element.id) as Element<Fichier>
    racine.render(<ModaleFichier contenu={el.contenu} adresse="/api/fichiers/f1" element={el} contexte={contexte} fermer={() => {}} />)
  }
  brut.ecouter(() => act(montrer))
  await act(async () => montrer())
  await attendre()
  await attendre()
  return brut
}

type Champ = HTMLElement & { editor: { commands: { insertContent(t: string): boolean } } }
const bouton = (nom: string) => [...document.querySelectorAll<HTMLButtonElement>('.notak-pdf-barre button')].find((b) => b.getAttribute('aria-label') === nom)
const COMMENTER = 'Épingler un commentaire sur une page (⌥⌘M)'
const fils = (m: Magasin) => (m.lire().elements[0]!.contenu as Fichier).fils
const epingles = () => [...document.querySelectorAll<HTMLElement>('.notak-pdf-epingle')]
const ecrire = (texte: string) => {
  const champ = document.querySelector<Champ>('.notak-fil-attache .ProseMirror')!
  act(() => void champ.editor.commands.insertContent(texte))
  act(() => document.querySelector<HTMLButtonElement>('.notak-fil-attache .notak-commentaire-publier')!.click())
}

describe('commenter un PDF', () => {
  it('« Commenter », un clic sur la page : un fil s’y épingle, et son premier message l’écrit dans l’élément', async () => {
    const m = await ouvrir()
    act(() => bouton(COMMENTER)!.click())
    expect(document.querySelector('.notak-pdf-consigne')).not.toBeNull()
    const couche = document.querySelector<HTMLElement>('.notak-pdf-page[data-page="1"] .notak-pdf-saisie-fil')!
    // La page fait 400 × 566 px : on épingle au quart de sa largeur, à mi-hauteur.
    act(() => void couche.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 283 })))
    expect(document.querySelector('.notak-pdf-consigne')).toBeNull()
    expect(epingles()).toHaveLength(1)
    expect(document.querySelector('.notak-pdf-epingle .notak-fil-attache')).not.toBeNull()
    // Rien n'est écrit tant que le fil n'a pas de message.
    expect(fils(m)).toBeUndefined()
    ecrire('Ce chiffre est faux')
    const ecrits = Object.values(fils(m)!)
    expect(ecrits).toHaveLength(1)
    expect(ecrits[0]!.surPage).toEqual({ page: 1, x: 0.25, y: 0.5 })
    expect(ecrits[0]!.messages.map((x) => [x.texte, x.auteur.id])).toEqual([['Ce chiffre est faux', 'ana']])
    expect(epingles()[0]!.style.left).toBe('25%')
    expect(epingles()[0]!.querySelector('.notak-epingle-compte')?.textContent).toBe('1')
  })

  it('un fil refermé sans message ne laisse rien', async () => {
    const m = await ouvrir()
    act(() => bouton(COMMENTER)!.click())
    act(() => void document.querySelector('.notak-pdf-saisie-fil')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 })))
    expect(epingles()).toHaveLength(1)
    act(() => void document.querySelector('.notak-fil-attache')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(epingles()).toHaveLength(0)
    expect(fils(m)).toBeUndefined()
  })

  it('les fils posés ont leur épingle sur leur page ; un clic ouvre le fil, on y répond', async () => {
    const m = await ouvrir(pdf({ fils: { a: filDe(1, 0.8, 0.1, 'Pourquoi ce total ?') } }))
    expect(epingles()).toHaveLength(1)
    const e = epingles()[0]!
    // Près du bord droit, la bulle s'ouvre à gauche de l'épingle.
    expect(e.hasAttribute('data-gauche')).toBe(true)
    act(() => e.querySelector('button')!.click())
    expect(document.querySelector('.notak-fil-attache')?.textContent).toContain('Pourquoi ce total ?')
    ecrire('Une erreur de report')
    expect(fils(m)?.a?.messages.map((x) => x.texte)).toEqual(['Pourquoi ce total ?', 'Une erreur de report'])
    expect(fils(m)?.a?.surPage).toEqual({ page: 1, x: 0.8, y: 0.1 })
  })

  it('arrivé par une notification qui parle d’un fil du PDF, la visionneuse l’ouvre', async () => {
    demanderLeFil('p1', 'a')
    await ouvrir(pdf({ fils: { a: filDe(1, 0.3, 0.4, 'Regarde ici') } }))
    expect(document.querySelector('.notak-fil-attache')?.textContent).toContain('Regarde ici')
    expect(filDemande('p1')).toBeNull()
  })

  it('en lecture seule, les fils se lisent sans champ, et « Commenter » n’est pas proposé', async () => {
    await ouvrir(pdf({ fils: { a: filDe(1, 0.3, 0.4, 'À lire') } }), { lectureSeule: true })
    expect(bouton(COMMENTER)).toBeUndefined()
    act(() => epingles()[0]!.querySelector('button')!.click())
    expect(document.querySelector('.notak-fil-attache')?.textContent).toContain('À lire')
    expect(document.querySelector('.notak-fil-attache .ProseMirror')).toBeNull()
  })

  it('un commentateur épingle et écrit ses fils, sans pouvoir dessiner', async () => {
    const droits: DroitsTableau = { role: 'commentaire', elements: {} }
    const m = await ouvrir(pdf(), { lectureSeule: true, droits }, droits)
    expect(bouton('Dessiner sur les pages (⇧D)')).toBeUndefined()
    act(() => bouton(COMMENTER)!.click())
    act(() => void document.querySelector('.notak-pdf-saisie-fil')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 100 })))
    ecrire('Je relis')
    expect(Object.values(fils(m) ?? {}).map((f) => f.messages[0]!.texte)).toEqual(['Je relis'])
  })
})

describe('la liste des fils du PDF', () => {
  const LISTE = 'Liste des commentaires du PDF'
  const deux = () => pdf({ fils: { b: { ...filDe(2, 0.5, 0.5, 'Résolu depuis', ana), resolu: true }, a: filDe(1, 0.4, 0.3, 'Pourquoi ce total ?') } })
  const lignes = () => [...document.querySelectorAll<HTMLElement>('.notak-pdf-fils-liste > li')]
  const titreResolus = () => document.querySelector<HTMLButtonElement>('.notak-pdf-fils .notak-resolus-entete')!

  it('dit chaque fil ouvert dans l’ordre de lecture : page, auteur, début du texte ; les résolus à part, repliés', async () => {
    await ouvrir(deux())
    // La barre ne compte que les fils ouverts.
    expect(bouton(LISTE)?.textContent).toBe('Commentaires (1)')
    act(() => bouton(LISTE)!.click())
    expect(document.querySelector('.notak-pdf-fils-tete .notak-pdf-fils-compte')?.textContent).toBe('1')
    expect(lignes().map((l) => l.dataset.fil)).toEqual(['a'])
    const [a] = lignes()
    expect(a!.querySelector('.notak-pdf-fil-page')?.textContent).toBe('Page 1')
    expect(a!.querySelector('.notak-pdf-fil-auteur')?.textContent).toBe('Bob Martin')
    expect(a!.querySelector('.notak-pdf-fil-texte')?.textContent).toBe('Pourquoi ce total ?')
    expect(a!.querySelector('.notak-pdf-fil-etat')?.textContent).toBe('Ouvert')
    // Les résolus, sous leur titre : repliés, puis dépliés.
    expect(titreResolus().textContent).toBe('Résolus (1)')
    expect(titreResolus().getAttribute('aria-expanded')).toBe('false')
    act(() => titreResolus().click())
    expect(titreResolus().getAttribute('aria-expanded')).toBe('true')
    const b = document.querySelector<HTMLElement>('.notak-pdf-fils-liste-resolus > li[data-fil="b"]')!
    expect(b.querySelector('.notak-pdf-fil-etat')?.textContent).toBe('Résolu')
    expect(b.hasAttribute('data-resolu')).toBe(true)
    expect(b.querySelector('.notak-pdf-fil-rouvrir')?.textContent).toBe('Rouvrir')
    expect(b.querySelector('.notak-pdf-fil-resoudre')).toBeNull()
  })

  it('l’épingle d’un fil résolu s’efface ; déplier « Résolus » la montre, grise et cochée', async () => {
    await ouvrir(deux())
    expect(epingles().map((e) => e.dataset.filPdf)).toEqual(['a'])
    act(() => bouton(LISTE)!.click())
    act(() => titreResolus().click())
    expect(epingles().map((e) => e.dataset.filPdf).sort()).toEqual(['a', 'b'])
    const b = document.querySelector<HTMLElement>('.notak-pdf-epingle[data-fil-pdf="b"]')!
    expect(b.hasAttribute('data-resolu')).toBe(true)
    // L'épingle résolue de toute l'app (`GlypheEpingle`) : verte, une coche à la place du compte.
    expect(b.querySelector('.notak-epingle-compte[data-resolu] svg')).not.toBeNull()
    expect(b.querySelector('.notak-epingle-forme path')?.getAttribute('fill')).toBe('#2f9a5a')
    expect(b.querySelector('.notak-epingle-bouton')?.getAttribute('aria-label')).toContain('résolu')
    expect(document.querySelector('.notak-pdf-epingle[data-fil-pdf="a"] .notak-epingle-compte[data-resolu]')).toBeNull()
  })

  // Comme un vrai clic : l'appui sur la flèche referme d'abord la bulle ouverte (un appui hors d'elle), puis le clic.
  const fleche = (nom: string) => {
    const b = document.querySelector<HTMLButtonElement>(`.notak-pdf-fils [aria-label="${nom}"]`)!
    act(() => void b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })))
    act(() => b.click())
  }
  const ouvertSur = (id: string) => document.querySelector(`.notak-pdf-epingle[data-fil-pdf="${id}"] .notak-fil-attache`)

  it('« suivant » et « précédent » ne parcourent que les fils ouverts', async () => {
    const trois = pdf({ fils: { ...deux().contenu.fils, c: filDe(3, 0.5, 0.5, 'Et ici ?') } })
    await ouvrir(trois)
    act(() => bouton(LISTE)!.click())
    fleche('Commentaire suivant')
    await attendre()
    expect(ouvertSur('a')).not.toBeNull()
    fleche('Commentaire suivant')
    await attendre()
    // Le résolu de la page 2 est sauté.
    expect(ouvertSur('c')).not.toBeNull()
    fleche('Commentaire suivant')
    await attendre()
    expect(ouvertSur('a')).not.toBeNull()
  })

  it('les résolus affichés, un clic sur un fil amène son épingle et l’ouvre ; « suivant » et « précédent » passent par tous', async () => {
    await ouvrir(deux())
    act(() => bouton(LISTE)!.click())
    act(() => titreResolus().click())
    act(() => document.querySelector<HTMLButtonElement>('li[data-fil="b"] .notak-pdf-fil')!.click())
    await attendre()
    expect(ouvertSur('b')?.textContent).toContain('Résolu depuis')
    fleche('Commentaire suivant')
    await attendre()
    expect(ouvertSur('a')).not.toBeNull()
    expect(lignes()[0]!.hasAttribute('data-courant')).toBe(true)
    fleche('Commentaire suivant')
    await attendre()
    expect(ouvertSur('b')).not.toBeNull()
    fleche('Commentaire précédent')
    await attendre()
    expect(ouvertSur('a')).not.toBeNull()
  })

  it('« Résoudre » range un fil sans l’effacer, sous « Résolus » ; « Rouvrir » le rend', async () => {
    const m = await ouvrir(deux())
    act(() => bouton(LISTE)!.click())
    const resoudre = (id: string) => document.querySelector<HTMLButtonElement>(`li[data-fil="${id}"] .notak-pdf-fil-resoudre`)!
    const rouvrir = (id: string) => document.querySelector<HTMLButtonElement>(`li[data-fil="${id}"] .notak-pdf-fil-rouvrir`)!
    expect(resoudre('a').getAttribute('aria-label')).toBe('Résoudre le fil')
    act(() => resoudre('a').click())
    expect(fils(m)?.a?.resolu).toBe(true)
    expect(fils(m)?.a?.messages).toHaveLength(1)
    expect(bouton(LISTE)?.textContent).toBe('Commentaires')
    expect(document.querySelector('.notak-pdf-fils-vide')?.textContent).toBe('Aucun commentaire ouvert : tout est résolu.')
    act(() => titreResolus().click())
    expect(rouvrir('a').textContent).toBe('Rouvrir')
    act(() => rouvrir('a').click())
    expect(fils(m)?.a?.resolu).toBeUndefined()
    expect(document.querySelector('.notak-pdf-fils-liste:not(.notak-pdf-fils-liste-resolus) > li[data-fil="a"]')).not.toBeNull()
  })

  it('sans fil, la liste le dit, et propose d’en écrire un', async () => {
    await ouvrir()
    act(() => bouton(LISTE)!.click())
    expect(document.querySelector('.notak-pdf-fils-vide')?.textContent).toBe('Aucun commentaire sur ce PDF.')
    expect(document.querySelector('.notak-pdf-fils-ajouter')?.textContent).toBe('Nouveau commentaire')
  })

  it('« Nouveau commentaire » passe en mode Commenter : un clic sur la page y épingle le fil', async () => {
    const m = await ouvrir(deux())
    act(() => bouton(LISTE)!.click())
    const nouveau = document.querySelector<HTMLButtonElement>('.notak-pdf-fils-ajouter')!
    act(() => nouveau.click())
    expect(nouveau.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.notak-pdf-consigne')).not.toBeNull()
    act(() => void document.querySelector('.notak-pdf-page[data-page="1"] .notak-pdf-saisie-fil')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 400 })))
    ecrire('Une question')
    expect(Object.keys(fils(m)!)).toHaveLength(3)
    expect(bouton(LISTE)?.textContent).toBe('Commentaires (2)')
  })

  it('en lecture seule, pas de « Nouveau commentaire » ni de « Résoudre »', async () => {
    await ouvrir(deux(), { lectureSeule: true })
    act(() => bouton(LISTE)!.click())
    expect(document.querySelector('.notak-pdf-fils-ajouter')).toBeNull()
    expect(document.querySelector('.notak-pdf-fil-resoudre')).toBeNull()
  })
})

describe('un clic à côté des pages', () => {
  const fond = () => document.querySelector<HTMLElement>('.notak-pdf-defile')!
  const cliquerLeFond = () => {
    act(() => void fond().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })))
    act(() => void fond().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
  }

  it('ne ferme jamais la visionneuse ; il referme la bulle du fil, par sa fermeture à elle', async () => {
    await ouvrir(pdf({ fils: { a: filDe(1, 0.4, 0.3, 'Pourquoi ce total ?') } }))
    act(() => document.querySelector<HTMLButtonElement>('.notak-pdf-epingle[data-fil-pdf="a"] .notak-epingle-bouton')!.click())
    expect(document.querySelector('.notak-fil-attache')).not.toBeNull()
    cliquerLeFond()
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
    expect(document.querySelector('.notak-pdf')).not.toBeNull()
    // Rien d'ouvert : le clic ne fait rien.
    cliquerLeFond()
    expect(document.querySelector('.notak-pdf')).not.toBeNull()
  })

  it('sort du mode Commenter sans épingler, et range la recherche', async () => {
    await ouvrir()
    act(() => bouton(COMMENTER)!.click())
    expect(document.querySelector('.notak-pdf-consigne')).not.toBeNull()
    cliquerLeFond()
    expect(document.querySelector('.notak-pdf-consigne')).toBeNull()
    expect(epingles()).toHaveLength(0)
    act(() => bouton('Rechercher dans le PDF (⌘F)')!.click())
    expect(document.querySelector('.notak-pdf-recherche')).not.toBeNull()
    cliquerLeFond()
    expect(document.querySelector('.notak-pdf-recherche')).toBeNull()
    expect(document.querySelector('.notak-pdf')).not.toBeNull()
  })
})

describe('déplacer une épingle', () => {
  const avant = document.elementsFromPoint
  afterEach(() => {
    document.elementsFromPoint = avant
  })
  /** Glisse l'épingle de ce fil jusqu'au point (x, y) de la page 1, qui fait 400 × 566 px à l'écran. */
  const glisser = (id: string, x: number, y: number) => {
    const page = document.querySelector('.notak-pdf-page[data-page="1"]')!
    document.elementsFromPoint = () => [page]
    const bouton = document.querySelector<HTMLButtonElement>(`.notak-pdf-epingle[data-fil-pdf="${id}"] .notak-epingle-bouton`)!
    const pointeur = (type: string, cx: number, cy: number) =>
      act(() => void bouton.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: cx, clientY: cy, bubbles: true, cancelable: true })))
    pointeur('pointerdown', 10, 10)
    pointeur('pointermove', x, y)
    pointeur('pointerup', x, y)
    act(() => bouton.click())
  }
  const deux = () => pdf({ fils: { mien: filDe(1, 0.1, 0.1, 'Le mien', ana), sien: filDe(1, 0.6, 0.6, 'Le sien', bob) } })
  const commentateur: DroitsTableau = { role: 'commentaire', elements: {} }

  it('celui qui a ouvert le fil glisse son épingle ailleurs sur la page ; le clic qui finit le geste ne l’ouvre pas', async () => {
    const m = await ouvrir(deux(), { lectureSeule: true, droits: commentateur }, commentateur)
    expect(document.querySelector('[data-fil-pdf="mien"]')!.hasAttribute('data-deplacable')).toBe(true)
    glisser('mien', 100, 283)
    expect(fils(m)?.mien?.surPage).toEqual({ page: 1, x: 0.25, y: 0.5 })
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
  })

  it('un commentateur ne déplace pas l’épingle du fil d’un autre', async () => {
    const m = await ouvrir(deux(), { lectureSeule: true, droits: commentateur }, commentateur)
    expect(document.querySelector('[data-fil-pdf="sien"]')!.hasAttribute('data-deplacable')).toBe(false)
    glisser('sien', 100, 283)
    expect(fils(m)?.sien?.surPage).toEqual({ page: 1, x: 0.6, y: 0.6 })
  })

  it('qui peut modifier le PDF déplace toutes les épingles', async () => {
    const m = await ouvrir(deux())
    expect(document.querySelector('[data-fil-pdf="sien"]')!.hasAttribute('data-deplacable')).toBe(true)
    glisser('sien', 200, 100)
    expect(fils(m)?.sien?.surPage).toEqual({ page: 1, x: 0.5, y: 0.1767 })
  })

  it('lâchée hors des pages, elle revient où elle était', async () => {
    const m = await ouvrir(deux())
    const bouton = document.querySelector<HTMLButtonElement>('.notak-pdf-epingle[data-fil-pdf="mien"] .notak-epingle-bouton')!
    document.elementsFromPoint = () => []
    for (const [type, x] of [['pointerdown', 10], ['pointermove', 300], ['pointerup', 300]] as const)
      act(() => void bouton.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: 10, bubbles: true, cancelable: true })))
    expect(fils(m)?.mien?.surPage).toEqual({ page: 1, x: 0.1, y: 0.1 })
  })
})
