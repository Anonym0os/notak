/**
 * Dans l'application de bureau (la coque Tauri, `apps/bureau`), la fenêtre n'a pas de barre de titre : ses trois
 * boutons se posent dans la première rangée de l'en-tête, comme chez Milanote. La racine du document le dit
 * (`data-bureau`), et dit aussi le plein écran (`data-plein-ecran`), où ces boutons disparaissent et rendent leur place.
 */

interface Tauri {
  invoke<T>(commande: string, arguments_?: unknown, options?: { headers?: Record<string, string> }): Promise<T>
}

/** La coque, si l'on tourne dedans. */
export const coque = (fenetre: Window = window): Tauri | null => (fenetre as unknown as { __TAURI_INTERNALS__?: Tauri }).__TAURI_INTERNALS__ ?? null

export const estBureau = (fenetre: Window = window): boolean => coque(fenetre) !== null

/** Une commande de la coque (`apps/bureau/src-tauri/src/lib.rs`) ; hors de l'app de bureau, une erreur. */
export function invoquer<T>(commande: string, arguments_?: unknown, options?: { headers?: Record<string, string> }): Promise<T> {
  const c = coque()
  return c ? c.invoke<T>(commande, arguments_, options) : Promise.reject(new Error('hors de l’application de bureau'))
}

export function marquerBureau(fenetre: Window = window): void {
  if (!estBureau(fenetre)) return
  const racine = fenetre.document.documentElement
  racine.dataset.bureau = ''
  const pleinEcran = () =>
    racine.toggleAttribute('data-plein-ecran', fenetre.innerWidth >= fenetre.screen.width && fenetre.innerHeight >= fenetre.screen.height)
  pleinEcran()
  fenetre.addEventListener('resize', pleinEcran)
  garderLesLiens(fenetre)
}

/** Les adresses qu'un lien peut ouvrir hors de Notak : le web, un courriel, un numéro. */
const VERS_DEHORS = new Set(['https:', 'http:', 'mailto:', 'tel:'])

/**
 * Un lien vers un autre site, cliqué dans la page, s'ouvre dans le navigateur de la personne. Sans cela, la fenêtre de
 * Notak partirait sur ce site, sans bouton pour revenir. La coque le fait pour toute nouvelle fenêtre (`target="_blank"`,
 * `window.open`) et refuse toute autre navigation (`navigation.rs`) : on fait donc passer chaque lien par là.
 * Un lien dans un texte en cours d'écriture ne s'ouvre pas au clic, comme dans un navigateur ; un lien d'une autre
 * sorte (`javascript:`, `file:`…) ne s'ouvre pas du tout.
 */
export function garderLesLiens(fenetre: Window = window): void {
  fenetre.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return
    const lien = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!lien || lien.closest('[contenteditable=""], [contenteditable="true"]') || lien.hasAttribute('download')) return
    let adresse: URL
    try {
      adresse = new URL(lien.href, fenetre.location.href)
    } catch {
      return e.preventDefault()
    }
    if (adresse.origin === fenetre.location.origin && VERS_DEHORS.has(adresse.protocol)) return
    e.preventDefault()
    if (VERS_DEHORS.has(adresse.protocol)) fenetre.open(adresse.href, '_blank', 'noopener')
  })
}
