/**
 * Ce que pdf.js va chercher à côté d'un document : ses CMaps (le texte chinois, japonais ou coréen d'une police non
 * embarquée) et ses polices standard (Helvetica, Times, Courier, Symbol, ZapfDingbats quand le PDF ne les porte pas).
 * L'application les sert elle-même, à la racine de son site (`apps/web/pdfjs/plugin.ts`) : ni CDN ni réseau tiers,
 * l'app de bureau et ses pages hors ligne les ont sur place. Sans elles, le texte japonais d'un PDF disparaît, et une
 * police standard est remplacée par celle du système, aux largeurs fausses.
 */

/** Où l'application sert les ressources de pdf.js, depuis la racine du site. */
export const CHEMIN_RESSOURCES_PDF = '/pdfjs/'

/** Les options de chaque document que pdf.js ouvre (l'aperçu d'une carte, la visionneuse). `base` : l'adresse de la page. */
export function optionsDocument(base: string = document.baseURI) {
  const ici = (dossier: string) => new URL(`${CHEMIN_RESSOURCES_PDF}${dossier}/`, base).href
  return {
    cMapUrl: ici('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: ici('standard_fonts'),
    // Un PDF n'exécute rien : pdf.js n'a pas à compiler de fonction à partir de ce qu'il contient.
    isEvalSupported: false,
  }
}
