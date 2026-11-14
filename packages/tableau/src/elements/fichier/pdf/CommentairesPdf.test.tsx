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
