// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { type Commentaire, type Element, type NoeudTexte, nouvelId } from './coeur/tableau'
import './elements'
import { chargerEmojis } from './elements/decor/emojis'
import { ouvrirFil } from './elements/decor/etat'
import { demanderAMontrer, demanderLeFil, filDemande } from './elements/tableau/montrer'
import { fermerMenus } from './menuUnique'
import { Toile } from './Toile'

// Une notification de commentaire mène à son fil (`demanderLeFil`) : la toile se pose sur l'élément qui le porte, et le
// fil s'ouvre, que ce soit une épingle, le fil accroché à une carte, ou celui d'un passage de la marge d'une note.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeAll(async () => {
  await chargerEmojis()
})
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  // Une vue mesurée : la toile ne prend une demande d'arrivée qu'une fois sa taille connue.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800)
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  ouvrirFil(null)
  demanderAMontrer(null)
  vi.restoreAllMocks()
})

const fil = (texte: string): Commentaire => ({ type: 'commentaire', messages: [{ id: nouvelId(), auteur: { id: 'bob', nom: 'Bob' }, date: 1, texte }] })
const paragraphe = (texte: string, fil?: string): NoeudTexte => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: texte, ...(fil ? { marks: [{ type: 'commentaireTexte', attrs: { fil } }] } : {}) }] }],
})

/** La toile, puis la notification suivie, le temps que le fil s'ouvre. */
async function arriver(elements: Element[], element: string, cle: string) {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements })
  act(() => racine.render(<Toile magasin={magasin} services={{}} />))
  await act(async () => demanderLeFil(element, cle))
  await act(async () => void (await new Promise((r) => setTimeout(r, 120))))
}

describe('une notification de commentaire ouvre son fil', () => {
  it('le fil accroché à une carte s’ouvre sur elle', async () => {
    const note: Element = { id: nouvelId(), x: 2, y: 2, largeur: 17, contenu: { type: 'note', texte: paragraphe('Budget') }, commentaire: fil('Trop juste') }
    await arriver([note], note.id, '')
    expect(document.querySelector('.notak-fil-attache')?.textContent).toContain('Trop juste')
    expect(filDemande(note.id)).toBeNull()
  })

  it('une épingle réduite s’ouvre en bulle', async () => {
    const epingle: Element = { id: nouvelId(), x: 40, y: 2, largeur: 3, contenu: { ...fil('À vérifier'), replie: true } }
    await arriver([epingle], epingle.id, '')
    expect(document.querySelector('.notak-epingle-bulle')?.textContent).toContain('À vérifier')
  })

  it('le fil d’un passage s’ouvre à côté de la note, sans ouvrir celui qu’elle porte', async () => {
    const note: Element = {
      id: nouvelId(),
      x: 2,
      y: 2,
      largeur: 17,
      contenu: { type: 'note', texte: paragraphe('Budget serré', 'f1'), fils: { f1: fil('Pourquoi ?') } },
      commentaire: fil('Autre chose'),
    }
    await arriver([note], note.id, 'f1')
    expect(document.querySelector('.notak-note-marge')?.textContent).toContain('Pourquoi ?')
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
    expect(filDemande(note.id)).toBeNull()
  })

  it('un élément qui n’est plus là laisse la toile telle quelle', async () => {
    const note: Element = { id: nouvelId(), x: 2, y: 2, largeur: 17, contenu: { type: 'note', texte: paragraphe('Budget') }, commentaire: fil('Trop juste') }
    await arriver([note], 'parti', '')
    expect(document.querySelector('.notak-fil-attache')).toBeNull()
  })
})
