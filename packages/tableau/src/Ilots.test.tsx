// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentTexte, Element } from './coeur/tableau'
import { RenduDocument } from './elements/document/Document'
import type { ContexteToile } from './elements/types'
import { BoutonIlot, ContexteEntete, type EnteteEspace, FilEcran, IlotCompte, IlotPartage } from './Ilots'
import { definirLangue } from './langue'

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
})

const entete = (plus: Partial<EnteteEspace> = {}): EnteteEspace => ({
  fil: [
    { id: 'R', titre: 'Accueil' },
    { id: 'P', titre: 'Projets' },
    { id: 'T', titre: 'Un steak vivant ?!' },
  ],
  ouvrir: vi.fn(),
  ...plus,
})

const rendre = (valeur: EnteteEspace | null, enfant: React.ReactNode) =>
  act(() => racine.render(<ContexteEntete.Provider value={valeur}>{enfant}</ContexteEntete.Provider>))

const textes = (selecteur: string) => [...document.querySelectorAll(selecteur)].map((n) => n.textContent)

describe('la barre d’îlots, commune au tableau, à la carte et au document', () => {
  it('le fil d’un écran ouvert en grand : le tableau qui le porte et celui d’au-dessus, puis son titre en gras', () => {
    rendre(entete(), <FilEcran titre={<span>Carte des idées</span>} fermer={() => {}} />)
    expect(textes('.notak-fil-segment')).toEqual(['Projets', 'Un steak vivant ?!'])
    expect(document.querySelector('.notak-fil-titre')!.textContent).toBe('Carte des idées')
    expect(document.querySelector('.notak-fil-titre')!.getAttribute('aria-current')).toBe('page')
  })

  it('un maillon du fil ferme l’écran d’abord (ce qu’il tient s’enregistre), puis ouvre le tableau voulu ; celui qui le porte ne fait que fermer', () => {
    const e = entete()
    const appels: string[] = []
    e.ouvrir = (id) => void appels.push(`ouvrir ${id}`)
    rendre(e, <FilEcran titre="Carte" fermer={() => appels.push('fermer')} />)
    const [projets, tableau] = document.querySelectorAll<HTMLButtonElement>('.notak-fil-segment')
    act(() => projets!.click())
    expect(appels).toEqual(['fermer', 'ouvrir P'])
    appels.length = 0
    act(() => tableau!.click())
    expect(appels).toEqual(['fermer'])
  })

  it('sans espace autour (un test, une page publique), le fil n’a que le titre et les îlots de l’application ne paraissent pas', () => {
    rendre(
      null,
      <>
        <FilEcran titre="Seul" fermer={() => {}} />
        <IlotPartage />
        <IlotCompte />
      </>,
    )
    expect(document.querySelectorAll('.notak-fil-segment')).toHaveLength(0)
    expect(document.querySelector('.notak-ilot-partage, .notak-ilot-compte')).toBeNull()
  })

  it('le fil est un îlot, comme les autres : la toile passe dessous sans le brouiller ; l’état de l’écran y suit le titre', () => {
    rendre(entete(), <FilEcran titre="Carte" fermer={() => {}} apres={<span className="etat">Lecture seule</span>} />)
    const fil = document.querySelector('.notak-fil-ecran')!
    expect(fil.classList.contains('notak-ilot')).toBe(true)
    expect([...fil.children].map((n) => n.textContent)).toEqual(['Projets', 'Un steak vivant ?!', 'Carte', 'Lecture seule'])
  })

  it('le dernier îlot : les boutons de l’écran, un filet, puis le compte prêté par l’application', () => {
    rendre(
      entete({ compte: <button type="button" className="compte-nom">S</button> }),
      <IlotCompte>
        <BoutonIlot icone="exporter" libelle="Exporter" onClick={() => {}} />
      </IlotCompte>,
    )
    const ilot = document.querySelector('.notak-ilot-compte')!
    expect([...ilot.querySelectorAll('.notak-ilot-bouton, .notak-ilot-filet, .compte-nom')].map((n) => n.className)).toEqual(['notak-ilot-bouton', 'notak-ilot-filet', 'compte-nom'])
  })

  it('un bouton à bascule se dit enfoncé', () => {
    rendre(null, <BoutonIlot icone="panneauGauche" libelle="Panneau" actif onClick={() => {}} />)
    expect(document.querySelector('.notak-ilot-bouton')!.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('le document ouvert en grand porte la même barre', () => {
  const doc: Element<DocumentTexte> = {
    id: 'D',
    x: 0,
    y: 0,
    largeur: 10,
    contenu: { type: 'document', titre: 'Notes', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bonjour' }] }] } },
  }
  let basculer = vi.fn()
  beforeEach(() => {
    basculer = vi.fn()
  })
  const monter = (finirEdition: () => void) => {
    const contexte = { services: {}, magasin: {}, finirEdition, choisir: () => {}, selection: new Set(['D']) } as unknown as ContexteToile
    rendre(
      entete({
        partage: (
          <div className="partage">
            <button type="button" className="bouton" aria-expanded="true" onClick={basculer}>
              Partager
            </button>
          </div>
        ),
      }),
      <RenduDocument element={doc} choisie enEdition contexte={contexte} brouillon={() => {}} changer={() => {}} />,
    )
  }

  it('le retour, le fil jusqu’au document, l’historique, puis le partage de l’application', () => {
    monter(() => {})
    const barre = document.querySelector('.notak-document-entete')!
    expect(barre.querySelector('.notak-document-fermer')!.getAttribute('aria-label')).toBe('Revenir au tableau')
    expect([...barre.querySelectorAll('.notak-fil-segment')].map((n) => n.textContent)).toEqual(['Projets', 'Un steak vivant ?!'])
    expect(barre.querySelector('.notak-historique')).not.toBeNull()
    expect(barre.querySelector('.notak-ilot-partage .partage')).not.toBeNull()
  })

  it('Échap, le menu du partage ouvert, le referme par son bouton (la surcouche arrête la touche avant l’application) : le document reste ouvert', () => {
    const finir = vi.fn()
    monter(finir)
    const bouton = document.querySelector<HTMLElement>('.notak-ilot-partage button')!
    act(() => void bouton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(basculer).toHaveBeenCalledTimes(1)
    expect(finir).not.toHaveBeenCalled()
  })

  it('Échap, aucun menu ouvert et le focus sur « Partager », ferme le document comme ailleurs', () => {
    const finir = vi.fn()
    monter(finir)
    const bouton = document.querySelector<HTMLElement>('.notak-ilot-partage button')!
    bouton.setAttribute('aria-expanded', 'false')
    act(() => void bouton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(basculer).not.toHaveBeenCalled()
    expect(finir).toHaveBeenCalled()
  })
})
