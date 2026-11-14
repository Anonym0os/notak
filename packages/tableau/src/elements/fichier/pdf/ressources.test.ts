import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('les ressources de pdf.js', () => {
  it('se prennent à la racine du site, quelle que soit la page d’où l’on ouvre le PDF', async () => {
    const { optionsDocument } = await import('./ressources')
    expect(optionsDocument('https://notak.exemple.fr/t/abc/e/def', false)).toEqual({
      cMapUrl: 'https://notak.exemple.fr/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://notak.exemple.fr/pdfjs/standard_fonts/',
      wasmUrl: 'https://notak.exemple.fr/pdfjs/wasm/',
      useWasm: false,
      isEvalSupported: false,
    })
  })

  it('dans l’app de bureau, sur place, par le protocole de la coque', async () => {
    const { optionsDocument } = await import('./ressources')
    expect(optionsDocument('tauri://localhost/t/abc').cMapUrl).toBe('tauri://localhost/pdfjs/cmaps/')
    expect(optionsDocument('tauri://localhost/t/abc').wasmUrl).toBe('tauri://localhost/pdfjs/wasm/')
    expect(optionsDocument('http://localhost:3010/').standardFontDataUrl).toBe('http://localhost:3010/pdfjs/standard_fonts/')
  })
})

describe('le WebAssembly, permis ou non', () => {
  it('là où rien ne l’interdit, pdf.js prend le wasm du décodeur JPEG 2000', async () => {
    const { peutCompilerWasm, optionsDocument } = await import('./ressources')
    expect(peutCompilerWasm()).toBe(true)
    expect(optionsDocument('https://notak.test/').useWasm).toBe(true)
  })

  it('sous la CSP de Notak, qui refuse de compiler le wasm, il prend d’emblée le repli en JavaScript ; testé une fois', async () => {
    // Ce que fait un navigateur sous `script-src 'self'` sans `'wasm-unsafe-eval'` : la compilation lève une erreur.
    const compiler = vi.fn(function () {
      throw new WebAssembly.CompileError('Refused to compile or instantiate WebAssembly module')
    })
    vi.stubGlobal('WebAssembly', { ...WebAssembly, Module: compiler, CompileError: WebAssembly.CompileError })
    const { peutCompilerWasm, optionsDocument } = await import('./ressources')
    expect(optionsDocument('https://notak.test/').useWasm).toBe(false)
    expect(peutCompilerWasm()).toBe(false)
    expect(compiler).toHaveBeenCalledTimes(1)
  })
})
