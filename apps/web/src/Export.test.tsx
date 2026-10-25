// @vitest-environment jsdom
import { type ContenuNotak, type SujetExport, creerZip, ouvrirExport } from '@notak/tableau'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogueExport, poids } from './DialogueExport'
import { Export, ErreurExport, type ExportLocal } from './Export'
import { choisirEmplacement } from './enregistrer'

/** Un `.notak` de trois tableaux et un fichier. Son décodage a ses tests (fichierEspace.test.ts) ; fflate, dans jsdom, ne relit pas ses propres archives. */
const CONTENU: ContenuNotak = {
  racine: 'T1',
  tableaux: [
    { id: 'T1', titre: 'Voyage', etat: new Uint8Array() },
    { id: 'T2', titre: 'Étapes', parent: 'T1', etat: new Uint8Array() },
    { id: 'T3', titre: 'Budget', parent: 'T1', etat: new Uint8Array() },
  ],
  fichiers: [{ id: 'F1', type: 'image/png', octets: new Uint8Array([1, 2, 3]) }],
}
vi.mock('@notak/tableau', async (origine) => ({ ...(await origine<typeof import('@notak/tableau')>()), decoderNotak: () => CONTENU }))
vi.mock('./enregistrer', async (origine) => ({ ...(await origine<typeof import('./enregistrer')>()), choisirEmplacement: vi.fn() }))
const choisir = vi.mocked(choisirEmplacement)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ne fait pas de dialogue modal : `open` suffit pour ce qu'on vérifie.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
// Ni `arrayBuffer` sur les Blob de jsdom, ni adresses d'objet.
if (!Blob.prototype.arrayBuffer)
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((ok) => {
      const l = new FileReader()
      l.onload = () => ok(l.result as ArrayBuffer)
      l.readAsArrayBuffer(this)
    })
  }
URL.createObjectURL ??= () => 'blob:essai'
URL.revokeObjectURL ??= () => {}

let racine: Root
let hote: HTMLElement
const ecrits: Blob[] = []
const local: ExportLocal = {
  texte: vi.fn(async (_, f) => new Blob([f === 'md' ? '# Voyage\n\nUne note' : 'Voyage\n\nUne note'])),
  medias: vi.fn(async () => {
    throw new ErreurExport('aucun_media')
  }),
  notak: vi.fn(async () => new Blob([new Uint8Array([80, 75, 3, 4])])),
}

/** Le texte d'un Blob : celui de jsdom n'a pas `text()`. */
const texte = (b: Blob) =>
  new Promise<string>((ok) => {
    const l = new FileReader()
    l.onload = () => ok(l.result as string)
    l.readAsText(b)
  })

/** Laisse les promesses de l'aperçu se résoudre (FileReader compris). */
const patienter = () => act(async () => new Promise((fin) => setTimeout(fin, 20)))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  ecrits.length = 0
  choisir.mockReset()
  choisir.mockImplementation(async (f) => ({ nom: f.nom, ecrire: async (b) => void ecrits.push(b) }))
  hote = document.createElement('div')
  hote.className = 'notak-espace'
  document.body.append(hote)
  racine = createRoot(hote)
  act(() =>
    racine.render(
      <>
        <Export tableau="T1" titre={() => 'Voyage'} local={local} />
        <DialogueExport />
      </>,
    ),
  )
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const dialogue = () => document.querySelector<HTMLDialogElement>('.export-dialogue')
const apercu = () => document.querySelector<HTMLElement>('.export-apercu')!
const ouvrir = async () => {
  act(() => document.querySelector<HTMLButtonElement>('.export > button')!.click())
  await patienter()
}
const choisirFormat = async (f: string) => {
  act(() => document.querySelector<HTMLInputElement>(`input[name=format][value=${f}]`)!.click())
  await patienter()
}
const exporter = async () => {
  await act(async () => {
    document.querySelector<HTMLButtonElement>('.export-actions .bouton-plein')!.click()
  })
  await patienter()
}

describe('le dialogue d’export du tableau', () => {
  it('s’ouvre sur Notak, recommandé, avec ses options cochées, et montre ce que le fichier emporte', async () => {
    await ouvrir()
    expect(dialogue()!.open).toBe(true)
    expect(document.querySelector<HTMLInputElement>('input[name=format]:checked')!.value).toBe('notak')
    expect([...document.querySelectorAll<HTMLInputElement>('.export-options input[type=checkbox]')].map((c) => c.checked)).toEqual([true, true])
    expect(apercu().textContent).toContain('3 tableaux · 1 image ou fichier')
    expect([...apercu().querySelectorAll('li')].map((l) => l.textContent)).toEqual(['Voyage', 'ÉtapesSous-tableau', 'BudgetSous-tableau'])
    expect(document.querySelector('.export-poids')!.textContent).toMatch(/^\.notak · \d+ o$/)
  })

  it('l’aperçu se refait quand une option change, et le fichier écrit est celui de l’aperçu', async () => {
    await ouvrir()
    act(() => document.querySelectorAll<HTMLInputElement>('.export-options input[type=checkbox]')[0]!.click())
    await patienter()
    expect(local.notak).toHaveBeenLastCalledWith('T1', { sousTableaux: false, fichiers: true })
    const appels = vi.mocked(local.notak).mock.calls.length
    await exporter()
    expect(choisir).toHaveBeenCalledWith({ nom: 'Voyage.notak', extension: 'notak', type: 'application/x-notak', description: 'Notak' })
    // Rien n'est refait à l'export : on écrit ce qu'on a vu.
    expect(local.notak).toHaveBeenCalledTimes(appels)
    expect(ecrits).toHaveLength(1)
    expect(dialogue()).toBeNull()
    expect(document.querySelector('.bandeau')!.textContent).toContain('Voyage.notak')
  })

  it('n’écrit rien et reste ouvert si l’on renonce à choisir l’emplacement', async () => {
    choisir.mockResolvedValue(null)
    await ouvrir()
    await exporter()
    expect(ecrits).toHaveLength(0)
    expect(dialogue()!.open).toBe(true)
    expect(document.querySelector('.export-erreur')).toBeNull()
  })

  it('Markdown et texte brut : l’aperçu montre le texte, et le fichier a la bonne extension', async () => {
    await ouvrir()
    await choisirFormat('md')
    expect(apercu().querySelector('pre')!.textContent).toBe('# Voyage\n\nUne note')
    await exporter()
    expect(choisir.mock.calls.at(-1)![0]).toMatchObject({ nom: 'Voyage.md', type: 'text/markdown' })
    expect(await texte(ecrits.at(-1)!)).toBe('# Voyage\n\nUne note')
    await ouvrir()
    await choisirFormat('txt')
    await exporter()
    expect(choisir.mock.calls.at(-1)![0]).toMatchObject({ nom: 'Voyage.txt', type: 'text/plain' })
    expect(await texte(ecrits.at(-1)!)).toBe('Voyage\n\nUne note')
  })

  it('un tableau sans média : l’aperçu le dit, et l’export est désactivé', async () => {
    await ouvrir()
    await choisirFormat('medias')
    expect(apercu().textContent).toContain('ni image ni fichier')
    expect(document.querySelector<HTMLButtonElement>('.export-actions .bouton-plein')!.disabled).toBe(true)
  })

  it('les médias : l’aperçu liste les fichiers de l’archive, avec leur poids', async () => {
    vi.mocked(local.medias).mockResolvedValueOnce(
      new Blob([
        creerZip([
          { nom: 'photo.jpg', octets: new Uint8Array(2048) },
          { nom: 'devis.pdf', octets: new Uint8Array(10) },
        ]) as Uint8Array<ArrayBuffer>,
      ]),
    )
    await ouvrir()
    await choisirFormat('medias')
    expect(apercu().textContent).toContain('2 images et fichiers')
    expect([...apercu().querySelectorAll('li')].map((l) => l.textContent)).toEqual(['photo.jpg2 ko', 'devis.pdf10 o'])
  })

  it('montre les options des captures, et la résolution seulement pour l’image de l’écran', async () => {
    await ouvrir()
    await choisirFormat('png')
    expect(document.querySelector('input[name=resolution]')).toBeNull()
    act(() => document.querySelectorAll<HTMLInputElement>('input[name=portee]')[1]!.click())
    expect(document.querySelectorAll('input[name=resolution]')).toHaveLength(3)
    await choisirFormat('pdf')
    expect(document.querySelector('input[name=resolution]')).toBeNull()
    expect(document.querySelector('.export-options input[type=checkbox]')).toBeNull()
  })

  it('retient le dernier format choisi sur l’appareil', async () => {
    await ouvrir()
    await choisirFormat('txt')
    act(() => dialogue()!.close())
    await ouvrir()
    expect(document.querySelector<HTMLInputElement>('input[name=format]:checked')!.value).toBe('txt')
  })
})

describe('le même dialogue, pour une carte ou un document', () => {
  const sujet = (format?: string): SujetExport => ({
    genre: 'carte',
    titre: 'Ma carte',
    note: 'Une note sous les formats',
    ...(format ? { format } : {}),
    formats: [
      {
        id: 'png',
        icone: 'fichierImage',
        libelle: 'Image',
        aide: 'Toute la carte',
        extension: 'png',
        type: 'image/png',
        recommande: true,
        options: ['fond'],
        preparer: vi.fn(async (r) => ({ apercu: { type: 'images' as const, images: [new Blob([r.fond ? 'fond' : 'sans'])] }, fichier: new Blob(['png']) })),
      },
      {
        id: 'docx',
        icone: 'fichier',
        libelle: 'Word',
        aide: 'Le document',
        extension: 'docx',
        type: 'application/x-docx',
        preparer: vi.fn(async () => ({
          apercu: { type: 'images' as const, images: [new Blob(['1']), new Blob(['2']), new Blob(['3'])], legende: 'Mise en page indicative' },
        })),
        fabriquer: vi.fn(async () => new Blob(['docx'])),
      },
    ],
  })

  it('s’ouvre sur le format recommandé, avec ses options, sa note, et le genre retient ses propres réglages', async () => {
    localStorage.setItem('notak.export', JSON.stringify({ format: 'txt' }))
    const s = sujet()
    act(() => void ouvrirExport(s))
    await patienter()
    expect(document.querySelector('#export-titre')!.textContent).toContain('Ma carte')
    expect(document.querySelector<HTMLInputElement>('input[name=format]:checked')!.value).toBe('png')
    expect(document.querySelector('.export-xmind')!.textContent).toBe('Une note sous les formats')
    expect(s.formats[0]!.preparer).toHaveBeenCalledWith(expect.objectContaining({ fond: true }))
    act(() => document.querySelector<HTMLInputElement>('.export-options input[type=checkbox]')!.click())
    await patienter()
    expect(s.formats[0]!.preparer).toHaveBeenLastCalledWith(expect.objectContaining({ fond: false }))
    expect(JSON.parse(localStorage.getItem('notak.export.carte')!)).toMatchObject({ fond: false })
    expect(JSON.parse(localStorage.getItem('notak.export')!)).toEqual({ format: 'txt' })
  })

  it('feuillette les pages de l’aperçu, et fabrique le fichier à l’export quand l’aperçu ne le porte pas', async () => {
    const s = sujet('docx')
    act(() => void ouvrirExport(s))
    await patienter()
    expect(document.querySelector('.export-pages')!.textContent).toBe('Page 1 sur 3')
    expect(document.querySelector('.export-apercu-legende')!.textContent).toBe('Mise en page indicative')
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Page suivante"]')!.click())
    expect(document.querySelector('.export-pages')!.textContent).toBe('Page 2 sur 3')
    // Pas de poids tant que le fichier n'est pas fait.
    expect(document.querySelector('.export-poids')!.textContent).toBe('')
    await exporter()
    expect(s.formats[1]!.fabriquer).toHaveBeenCalledTimes(1)
    expect(await texte(ecrits[0]!)).toBe('docx')
    expect(choisir.mock.calls[0]![0]).toMatchObject({ nom: 'Ma carte.docx', extension: 'docx' })
  })

  it('un aperçu qui échoue le dit, et l’export reste impossible', async () => {
    const s = sujet()
    vi.mocked(s.formats[0]!.preparer).mockRejectedValue(new Error('panne'))
    act(() => void ouvrirExport(s))
    await patienter()
    expect(apercu().textContent).toContain('L’aperçu n’a pas pu se faire.')
    expect(document.querySelector<HTMLButtonElement>('.export-actions .bouton-plein')!.disabled).toBe(true)
  })
})

describe('poids', () => {
  it('se dit en octets, kilo-octets ou mégaoctets', () => {
    expect(poids(512)).toBe('512 o')
    expect(poids(2048)).toBe('2 ko')
    expect(poids(1.5 * 1024 * 1024)).toBe('1,5 Mo')
  })
})
