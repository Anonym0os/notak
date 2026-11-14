/**
 * Ce que pdf.js va chercher à côté d'un document : ses CMaps (le texte chinois, japonais ou coréen d'une police non
 * embarquée), ses polices standard (Helvetica, Times, Courier, Symbol, ZapfDingbats quand le PDF ne les porte pas) et
 * son décodeur JPEG 2000 (les images JPX, fréquentes dans les PDF numérisés). L'application les sert elle-même, à la
 * racine de son site (`apps/web/pdfjs/plugin.ts`) : ni CDN ni réseau tiers, l'app de bureau et ses pages hors ligne les
 * ont sur place. Sans elles, le texte japonais d'un PDF disparaît, une police standard est remplacée par celle du
 * système, aux largeurs fausses, et une image JPEG 2000 reste blanche.
 */

/** Où l'application sert les ressources de pdf.js, depuis la racine du site. */
export const CHEMIN_RESSOURCES_PDF = '/pdfjs/'

/** Le plus petit module WebAssembly qui soit : son en-tête, sans rien dedans. */
const MODULE_VIDE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
let wasmPermis: boolean | undefined

/**
 * La page peut-elle compiler du WebAssembly ? La CSP de Notak (`script-src 'self'`, sans `'wasm-unsafe-eval'`, sur le
 * serveur comme dans l'app de bureau) le refuse. pdf.js prend alors d'emblée le repli en JavaScript de son décodeur
 * JPEG 2000 (`openjpeg_nowasm_fallback.js`, chargé seulement quand un PDF porte une telle image) au lieu de télécharger
 * pour rien les 250 Ko du wasm, et laisse les profils de couleur ICC aux couleurs de remplacement, sans aller chercher
 * le module qui les lirait. Là où rien ne l'interdit (le développement), le wasm sert. Testé une fois.
 */
export function peutCompilerWasm(): boolean {
  if (wasmPermis === undefined) {
    try {
      new WebAssembly.Module(MODULE_VIDE)
      wasmPermis = true
    } catch {
      wasmPermis = false
    }
  }
  return wasmPermis
}

/** Les options de chaque document que pdf.js ouvre (l'aperçu d'une carte, la visionneuse). `base` : l'adresse de la page. */
export function optionsDocument(base: string = document.baseURI, wasm: boolean = peutCompilerWasm()) {
  const ici = (dossier: string) => new URL(`${CHEMIN_RESSOURCES_PDF}${dossier}/`, base).href
  return {
    cMapUrl: ici('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: ici('standard_fonts'),
    wasmUrl: ici('wasm'),
    useWasm: wasm,
    // Un PDF n'exécute rien : pdf.js n'a pas à compiler de fonction à partir de ce qu'il contient.
    isEvalSupported: false,
  }
}
