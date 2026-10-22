import type { Apercu } from '../../coeur/tableau';
/**
 * Lit l'aperçu d'une page dans son HTML : `og:*`, puis `twitter:*`, `<title>` et `<link rel="icon">`.
 * `base` est l'adresse de la page : les adresses relatives en deviennent absolues.
 */
export declare function lireApercu(html: string, base: string): Apercu;
