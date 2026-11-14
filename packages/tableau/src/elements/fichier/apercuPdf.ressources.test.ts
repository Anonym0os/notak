// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

// pdf.js ne tourne pas sous jsdom : un faux moteur retient ce qu'on lui demande d'ouvrir.
const ouvert = vi.hoisted(() => ({ options: null as Record<string, unknown> | null }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: ({ data: _, ...options }: Record<string, unknown>) => {
    ouvert.options = options
    return { promise: Promise.reject(new Error('pas de PDF ici')) }
  },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/travailleur.js' }))

afterEach(() => vi.unstubAllGlobals())

describe('l’aperçu d’un PDF sur sa carte', () => {
  it('ouvre le document avec les CMaps et les polices standard de l’application', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([37, 80, 68, 70])))
    const { premierePage } = await import('./apercuPdf')
    expect(await premierePage('/api/fichiers/japonais')).toBeNull()
    expect(ouvert.options).toEqual({
      cMapUrl: new URL('/pdfjs/cmaps/', document.baseURI).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('/pdfjs/standard_fonts/', document.baseURI).href,
      isEvalSupported: false,
    })
  })
})
