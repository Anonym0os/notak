/**
 * Pour les essais : pdf.js ne tourne pas sous jsdom. Ce faux moteur ouvre un document de `etatFaux.pages` pages A4,
 * chacune avec une ligne de texte (« Page n hippopotame »), et compte les documents relâchés. À brancher par
 * `vi.mock('../apercuPdf', async () => (await import('./fauxPdf')).moduleFaux)`.
 */
export const etatFaux = { pages: 3, detruits: 0, options: null as Record<string, unknown> | null }

class TextLayer {
  textDivs: HTMLElement[] = []
  textContentItemsStr: string[] = []
  constructor(private o: { container: HTMLElement; textContentSource: { page: number } }) {}
  render() {
    const s = document.createElement('span')
    s.textContent = `Page ${this.o.textContentSource.page} hippopotame`
    this.o.container.append(s)
    this.textDivs = [s]
    this.textContentItemsStr = [s.textContent]
    return Promise.resolve()
  }
  cancel() {}
}

const page = (n: number) => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale, scale }),
  render: () => ({ promise: Promise.resolve(), cancel() {} }),
  streamTextContent: () => ({ page: n }),
  getTextContent: async () => ({ items: [{ str: `Page ${n} hippopotame`, hasEOL: false }] }),
})

const pdfjs = {
  TextLayer,
  getDocument: ({ data: _, ...options }: Record<string, unknown>) => ((etatFaux.options = options), {
    promise: Promise.resolve({
      numPages: etatFaux.pages,
      getPage: async (n: number) => page(n),
      destroy: async () => void etatFaux.detruits++,
    }),
    destroy: async () => {},
  }),
}

/** Le module `apercuPdf` tel que les essais le voient : le faux moteur, et une carte sans aperçu de première page. */
export const moduleFaux = { moteurPdf: async () => pdfjs, useApercuPdf: () => ({ etat: 'manque' as const }), DELAI_APERCU_MS: 60_000 }

/** jsdom ne mesure rien : la vue fait 1000 × 800 px, une page 400 × 566 px, et une toile ne se dessine pas. */
export function mesuresFausses(): () => void {
  const proto = HTMLElement.prototype
  const avant = {
    largeur: Object.getOwnPropertyDescriptor(proto, 'clientWidth'),
    hauteur: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
    boite: proto.getBoundingClientRect,
    contexte: HTMLCanvasElement.prototype.getContext,
    capture: proto.setPointerCapture,
  }
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 1000 })
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 800 })
  proto.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 566, width: 400, height: 566, x: 0, y: 0, toJSON: () => ({}) })
  proto.setPointerCapture = () => {}
  HTMLCanvasElement.prototype.getContext = (() => null) as never
  const observateur = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as never
  return () => {
    if (avant.largeur) Object.defineProperty(proto, 'clientWidth', avant.largeur)
    if (avant.hauteur) Object.defineProperty(proto, 'clientHeight', avant.hauteur)
    proto.getBoundingClientRect = avant.boite
    proto.setPointerCapture = avant.capture
    HTMLCanvasElement.prototype.getContext = avant.contexte
    globalThis.ResizeObserver = observateur
  }
}
