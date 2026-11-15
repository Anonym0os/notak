// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../../coeur/magasin'
import type { Commentaire, Element, Fichier } from '../../../coeur/tableau'
import type { ContexteToile } from '../../types'
import '../../note'
import '../../decor'
import { chargerEmojis } from '../../decor/emojis'
import { oublierBrouillons } from '../../commentaire/brouillon'
import { oublierLus } from '../../commentaire/suivi'
import { ModaleFichier } from '../ModaleFichier'
import { mesuresFausses } from './fauxPdf'

vi.mock('../apercuPdf', async () => (await import('./fauxPdf')).moduleFaux)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// La bulle d'un fil épinglé sur une page de PDF est celle de toute épingle (`BulleFil`) : son brouillon est retenu de
// la même façon, sans rien de propre à la visionneuse. Ni le clic dehors, ni le clic à côté des pages ne le perdent du
// premier coup ; et le clic à côté des pages ne ferme jamais la visionneuse, brouillon ou non.

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
  oublierBrouillons()
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
const fil: Commentaire = { type: 'commentaire', messages: [{ id: 'm1', auteur: bob, date: Date.now(), texte: 'Ce total ?' }], surPage: { page: 1, x: 0.3, y: 0.4 } }
const element: Element<Fichier> = { id: 'p1', x: 0, y: 0, largeur: 34, contenu: { type: 'fichier', fichier: 'f1', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 1000, fils: { a: fil } } }
const attendre = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))
type Champ = HTMLElement & { editor: { commands: { insertContent(t: string): boolean } } }

/** La visionneuse ouverte sur le PDF au fil « a », et ce que sa fermeture a dit. */
async function ouvrir() {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [element] })
  const contexte = { magasin, services: { presence: { moi: () => ana, autres: () => [], ecouter: () => () => {}, signaler() {} } } } as unknown as ContexteToile
  const etat = { fermee: false, magasin }
  await act(async () => racine.render(<ModaleFichier contenu={element.contenu} adresse="/api/fichiers/f1" element={element} contexte={contexte} fermer={() => (etat.fermee = true)} />))
  await attendre()
  await attendre()
  act(() => document.querySelector<HTMLButtonElement>('.notak-pdf-epingle button')!.click())
  return etat
}
/** Un clic à côté des pages, comme la souris le fait : l'appui, puis le clic. */
const cliquerLeFond = () => {
  const fond = document.querySelector<HTMLElement>('.notak-pdf-defile')!
  act(() => void fond.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })))
  act(() => fond.click())
}

describe('un brouillon dans un fil de PDF', () => {
  it('le premier clic à côté des pages garde la bulle et dit le brouillon ; le second l’abandonne ; la visionneuse reste', async () => {
    const etat = await ouvrir()
    act(() => void document.querySelector<Champ>('.notak-fil-attache .ProseMirror')!.editor.commands.insertContent('Une erreur'))
    cliquerLeFond()
    expect(etat.fermee).toBe(false)
    expect(document.querySelector('.notak-fil-attache')).not.toBeNull()
    expect(document.querySelector('.notak-compositeur-alerte')?.textContent).toContain('Commentaire non publié')
    cliquerLeFond()
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
    expect(etat.fermee).toBe(false)
    expect(document.querySelector('.notak-pdf')).not.toBeNull()
    expect(((etat.magasin.lire().elements[0]!.contenu as Fichier).fils?.a?.messages ?? []).map((m) => m.texte)).toEqual(['Ce total ?'])
  })

  it('le clic dehors, ailleurs que sur le fond, fait de même', async () => {
    const etat = await ouvrir()
    act(() => void document.querySelector<Champ>('.notak-fil-attache .ProseMirror')!.editor.commands.insertContent('Une erreur'))
    act(() => void document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })))
    expect(document.querySelector('.notak-fil-attache')).not.toBeNull()
    act(() => void document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })))
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
    expect(etat.fermee).toBe(false)
  })

  it('sans brouillon, le premier clic à côté des pages ferme la bulle, et la visionneuse reste', async () => {
    const etat = await ouvrir()
    cliquerLeFond()
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
    expect(etat.fermee).toBe(false)
    expect(document.querySelector('.notak-pdf')).not.toBeNull()
  })
})
