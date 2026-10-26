// @vitest-environment jsdom
import { ErreurNotak, definirLangue } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FichierOuvert } from '../bureau'
import { FichiersOuverts } from './FichiersOuverts'

const m = vi.hoisted(() => ({
  fichiersOuverts: vi.fn(),
  lireFichierOuvert: vi.fn(),
  ecouter: vi.fn(),
  revenirIci: vi.fn(),
  estPageServeur: vi.fn(),
  poserNotak: vi.fn(),
  attendreEnvoi: vi.fn(),
  decoderNotak: vi.fn(),
}))
vi.mock('../bureau', async (origine) => ({
  ...(await origine<typeof import('../bureau')>()),
  fichiersOuverts: m.fichiersOuverts,
  lireFichierOuvert: m.lireFichierOuvert,
  ecouter: m.ecouter,
  revenirIci: m.revenirIci,
  estPageServeur: m.estPageServeur,
}))
vi.mock('../notak', () => ({ poserNotak: m.poserNotak, attendreEnvoi: m.attendreEnvoi }))
vi.mock('@notak/tableau', async (origine) => ({ ...(await origine<typeof import('@notak/tableau')>()), decoderNotak: m.decoderNotak }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ne fait pas de dialogue modal : `open` suffit pour ce qu'on vérifie.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
}

let racine: Root
let hote: HTMLElement
/** Ce que la coque tient en file ; `ouvertDepuisLeSysteme()` dit à la page qu'il y en a un de plus. */
let file: FichierOuvert[]
let surOuverture: () => void
const arreter = vi.fn()
const ouvrir = vi.fn()
const espace = { racine: 'accueil' } as never
const fichiers = {} as never

const copie = (id: string, extra: Partial<FichierOuvert> = {}): FichierOuvert => ({ id, nom: `${id}.notak`, taille: 2048, confiee: false, ...extra })

beforeEach(() => {
  definirLangue('fr')
  file = []
  surOuverture = () => {}
  arreter.mockReset()
  ouvrir.mockReset()
  m.estPageServeur.mockReset().mockReturnValue(true)
  m.fichiersOuverts.mockReset().mockImplementation(async () => [...file])
  m.lireFichierOuvert.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]))
  m.decoderNotak.mockReset().mockReturnValue({ racine: 'x' })
  m.poserNotak.mockReset().mockResolvedValue({ tete: 'neuf', tableaux: 2, perdus: 0, poses: ['accueil', 'neuf'] })
  m.attendreEnvoi.mockReset().mockResolvedValue(true)
  m.revenirIci.mockReset().mockResolvedValue(undefined)
  m.ecouter.mockReset().mockImplementation(async (_evenement: string, rappel: () => void) => {
    surOuverture = rappel
    return arreter
  })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  document.querySelectorAll('dialog').forEach((d) => d.remove())
})

const monter = async () => {
  await act(async () => racine.render(<FichiersOuverts espace={espace} racine="accueil" fichiers={fichiers} ouvrir={ouvrir} />))
}
const dialogue = () => document.querySelector<HTMLDialogElement>('dialog.ouverts-dialogue')
const bouton = (texte: RegExp) => [...(dialogue()?.querySelectorAll('button') ?? [])].find((b) => texte.test(b.textContent ?? ''))
const clic = (texte: RegExp) => act(async () => bouton(texte)!.click())
/** Le système remet une copie de plus à l'app : la coque le dit, la page relit la file. */
const ouvertDepuisLeSysteme = (...nouvelles: FichierOuvert[]) =>
  act(async () => {
    file.push(...nouvelles)
    surOuverture()
  })

describe('les copies remises à l’app depuis le système', () => {
  it('rien en file, rien à montrer ; hors de l’app de bureau, on n’écoute même pas la coque', async () => {
    await monter()
    expect(dialogue()).toBeNull()
    expect(m.ecouter).toHaveBeenCalledWith('notak://fichier-ouvert', expect.any(Function))

    m.estPageServeur.mockReturnValue(false)
    m.fichiersOuverts.mockClear()
    m.ecouter.mockClear()
    await act(async () => racine.render(null))
    await monter()
    expect(m.fichiersOuverts).not.toHaveBeenCalled()
    expect(m.ecouter).not.toHaveBeenCalled()
  })

  it('une copie en attente à l’arrivée : le dialogue propose de l’importer ici, de l’ouvrir sur cet ordinateur, ou plus tard', async () => {
    file = [copie('Plan')]
    await monter()
    const d = dialogue()!
    expect(d.open).toBe(true)
    expect(d.getAttribute('aria-labelledby')).toBe('ouverts-titre')
    expect(d.querySelector('h2')?.textContent).toBe('« Plan.notak »')
    expect(d.textContent).toContain('Copie Notak de 2 ko')
    expect(d.textContent).toContain('localhost:3000')
    expect([...d.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Importer sur localhost:3000', 'Ouvrir sur cet ordinateur', 'Plus tard'])
    expect(d.textContent).toContain('Notak s’y ouvrira désormais')
    // Rien n'a encore été lu : la copie reste en file tant qu'on n'a pas choisi.
    expect(m.lireFichierOuvert).not.toHaveBeenCalled()
  })

  it('le nom du fichier est du texte : jamais du HTML', async () => {
    file = [copie('x', { nom: '<img src=x onerror="alert(1)">.notak' })]
    await monter()
    expect(dialogue()!.querySelector('h2')?.textContent).toBe('« <img src=x onerror="alert(1)">.notak »')
    expect(dialogue()!.querySelector('img')).toBeNull()
  })

  it('« Importer » lit la copie, la pose sous l’accueil, dit ce qui est arrivé, et « Ouvrir » y mène', async () => {
    file = [copie('Plan')]
    await monter()
    await clic(/^Importer sur/)
    expect(m.lireFichierOuvert).toHaveBeenCalledExactlyOnceWith('Plan')
    expect(m.decoderNotak).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
    expect(m.poserNotak).toHaveBeenCalledExactlyOnceWith({ racine: 'x' }, espace, 'accueil', fichiers)
    expect(dialogue()!.textContent).toContain('2 toiles importées.')
    expect(dialogue()!.querySelector('[role=status]')).not.toBeNull()
    await clic(/^Ouvrir$/)
    expect(ouvrir).toHaveBeenCalledExactlyOnceWith('neuf')
    expect(dialogue()).toBeNull()
  })

  it('les fichiers qu’on n’a pas pu reprendre se disent aussi', async () => {
    m.poserNotak.mockResolvedValue({ tete: 'neuf', tableaux: 1, perdus: 2 })
    file = [copie('Plan')]
    await monter()
    await clic(/^Importer sur/)
    expect(dialogue()!.textContent).toContain('1 toile importée, 2 fichiers non repris.')
    await clic(/^Fermer$/)
    expect(ouvrir).not.toHaveBeenCalled()
    expect(dialogue()).toBeNull()
  })

  it('pendant l’import, rien ne se clique, et Échap n’interrompt rien', async () => {
    let finir: () => void = () => {}
    m.poserNotak.mockReturnValue(new Promise((r) => (finir = () => r({ tete: 'neuf', tableaux: 1, perdus: 0 }))))
    file = [copie('Plan')]
    await monter()
    await clic(/^Importer sur/)
    expect(dialogue()!.getAttribute('aria-busy') ?? dialogue()!.querySelector('.ouverts-carte')?.getAttribute('aria-busy')).toBe('true')
    expect(dialogue()!.querySelectorAll('button')).toHaveLength(0)
    expect(dialogue()!.textContent).toContain('Import en cours…')
    const echap = new Event('cancel', { cancelable: true })
    await act(async () => void dialogue()!.dispatchEvent(echap))
    expect(echap.defaultPrevented).toBe(true)
    expect(dialogue()).not.toBeNull()
    await act(async () => finir())
    expect(dialogue()!.textContent).toContain('1 toile importée.')
  })

  it('un fichier qui n’en est pas un, ou venu d’une version plus récente, ou illisible : chacun ses mots', async () => {
    const cas: [unknown, string][] = [
      [new ErreurNotak('pas un fichier Notak'), 'Ce fichier n’est pas un fichier Notak.'],
      [new ErreurNotak('version plus récente'), 'Ce fichier vient d’une version plus récente de Notak'],
      [{ code: 'illisible' }, 'Cette copie n’a pas pu être lue.'],
      [{ code: 'introuvable' }, 'Cette copie n’a pas pu être lue.'],
      [new Error('disque plein'), 'Import impossible'],
    ]
    for (const [erreur, mots] of cas) {
      file = [copie(`f${mots.length}`)]
      m.poserNotak.mockRejectedValue(erreur)
      await act(async () => racine.render(null))
      await monter()
      await clic(/^Importer sur/)
      expect(dialogue()!.querySelector('[role=alert]')?.textContent, mots).toContain(mots)
      await clic(/^Fermer$/)
      expect(dialogue()).toBeNull()
    }
  })

  it('« Ouvrir sur cet ordinateur » emmène la fenêtre aux toiles de cet ordinateur, où la page locale lira la copie', async () => {
    file = [copie('Plan')]
    await monter()
    await clic(/Ouvrir sur cet ordinateur/)
    expect(m.revenirIci).toHaveBeenCalledExactlyOnceWith('local')
    // Elle n'est pas lue d'ici : c'est la page locale qui la prendra.
    expect(m.lireFichierOuvert).not.toHaveBeenCalled()
  })

  it('si la coque n’emmène pas la fenêtre, les choix reviennent au bout de trois secondes', async () => {
    vi.useFakeTimers()
    file = [copie('Plan')]
    await monter()
    await clic(/Ouvrir sur cet ordinateur/)
    expect(dialogue()!.querySelectorAll('button')).toHaveLength(0)
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)))
    expect([...dialogue()!.querySelectorAll('button')].map((b) => b.textContent)).toContain('Plus tard')
    vi.useRealTimers()
  })

  it('et si la coque refuse, on le dit', async () => {
    m.revenirIci.mockRejectedValue({ code: 'interdit' })
    file = [copie('Plan')]
    await monter()
    await clic(/Ouvrir sur cet ordinateur/)
    expect(dialogue()!.querySelector('[role=alert]')?.textContent).toContain('Impossible de passer aux toiles de cet ordinateur')
    await clic(/^Fermer$/)
    expect(dialogue()).toBeNull()
  })

  it('« Plus tard » laisse la copie en file : on ne la repropose plus à cette page, mais une autre arrive', async () => {
    file = [copie('Plan')]
    await monter()
    await clic(/Plus tard/)
    expect(dialogue()).toBeNull()
    expect(m.lireFichierOuvert).not.toHaveBeenCalled()

    // La coque redit la même file (la copie y est toujours) : rien ne se rouvre.
    await ouvertDepuisLeSysteme()
    expect(dialogue()).toBeNull()

    await ouvertDepuisLeSysteme(copie('Autre'))
    expect(dialogue()!.querySelector('h2')?.textContent).toBe('« Autre.notak »')
  })

  it('Échap vaut « plus tard »', async () => {
    file = [copie('Plan')]
    await monter()
    await act(async () => void dialogue()!.dispatchEvent(new Event('cancel', { cancelable: true })))
    expect(dialogue()).toBeNull()
    expect(m.lireFichierOuvert).not.toHaveBeenCalled()
  })

  it('plusieurs copies : une à la fois, la suivante quand la première est réglée', async () => {
    file = [copie('Une'), copie('Deux')]
    await monter()
    expect(dialogue()!.querySelector('h2')?.textContent).toBe('« Une.notak »')
    await clic(/Plus tard/)
    expect(dialogue()!.querySelector('h2')?.textContent).toBe('« Deux.notak »')
    await clic(/^Importer sur/)
    await clic(/^Fermer$/)
    expect(dialogue()).toBeNull()
    expect(m.lireFichierOuvert).toHaveBeenCalledExactlyOnceWith('Deux')
  })

  it('une copie qui arrive pendant un dialogue attend son tour, sans le remplacer', async () => {
    file = [copie('Une')]
    await monter()
    await ouvertDepuisLeSysteme(copie('Deux'))
    expect(dialogue()!.querySelector('h2')?.textContent).toBe('« Une.notak »')
    expect(document.querySelectorAll('dialog')).toHaveLength(1)
  })

  it('une coque qui ne répond pas à la lecture de la file ne montre rien', async () => {
    m.fichiersOuverts.mockRejectedValue({ code: 'interdit' })
    await monter()
    expect(dialogue()).toBeNull()
  })

  it('une réponse de la coque à demi lisible n’ouvre aucun dialogue', async () => {
    for (const reponse of [undefined, null, 'texte', {}, [{ id: 'sans-nom' }], [null, 3], [{ id: 'a', nom: 'a.notak', taille: '12', confiee: false }]]) {
      m.fichiersOuverts.mockResolvedValue(reponse)
      await act(async () => racine.render(null))
      await monter()
      expect(dialogue(), String(JSON.stringify(reponse))).toBeNull()
    }
    // Les entrées bonnes restent, les autres s'écartent.
    m.fichiersOuverts.mockResolvedValue([{ id: 'x' }, copie('Bonne')])
    await act(async () => racine.render(null))
    await monter()
    expect(dialogue()!.querySelector('h2')?.textContent).toBe('« Bonne.notak »')
  })

  it('on cesse d’écouter la coque en quittant la page', async () => {
    await monter()
    await act(async () => racine.render(null))
    expect(arreter).toHaveBeenCalledTimes(1)
  })
})

describe('les toiles de cet ordinateur confiées à ce serveur', () => {
  it('le dialogue demande d’importer, dit que rien ne se supprime ici, et ne propose pas d’ouvrir un fichier ailleurs', async () => {
    file = [copie('toiles', { nom: 'Notak.notak', confiee: true })]
    await monter()
    const d = dialogue()!
    expect(d.querySelector('h2')?.textContent).toBe('Importer les toiles de cet ordinateur sur localhost:3000 ?')
    expect(d.textContent).toContain('Rien n’est supprimé sur cet ordinateur : vos toiles y restent.')
    expect([...d.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Importer', 'Pas maintenant'])
  })

  it('« Importer » les pose comme n’importe quelle copie', async () => {
    file = [copie('toiles', { confiee: true })]
    await monter()
    await clic(/^Importer$/)
    expect(m.lireFichierOuvert).toHaveBeenCalledExactlyOnceWith('toiles')
    expect(m.poserNotak).toHaveBeenCalledTimes(1)
    expect(dialogue()!.textContent).toContain('2 toiles importées.')
  })

  it('« Pas maintenant » ne lit rien et ne supprime rien : la copie reste en file', async () => {
    file = [copie('toiles', { confiee: true })]
    await monter()
    await clic(/Pas maintenant/)
    expect(dialogue()).toBeNull()
    expect(m.lireFichierOuvert).not.toHaveBeenCalled()
    expect(m.revenirIci).not.toHaveBeenCalled()
    expect(file).toHaveLength(1)
  })
})
