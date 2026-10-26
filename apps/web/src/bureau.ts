/** Vrai dans l'application de bureau, la coque Tauri. */
export const dansBureau = (fenetre: Window = window): boolean => '__TAURI_INTERNALS__' in fenetre

/**
 * Dans l'application de bureau (la coque Tauri, `apps/bureau`), la fenêtre n'a pas de barre de titre : ses trois
 * boutons se posent dans la première rangée de l'en-tête, comme chez Milanote. La racine du document le dit
 * (`data-bureau`), et dit aussi le plein écran (`data-plein-ecran`), où ces boutons disparaissent et rendent leur place.
 */
export function marquerBureau(fenetre: Window = window): void {
  if (!dansBureau(fenetre)) return
  const racine = fenetre.document.documentElement
  racine.dataset.bureau = ''
  const pleinEcran = () =>
    racine.toggleAttribute('data-plein-ecran', fenetre.innerWidth >= fenetre.screen.width && fenetre.innerHeight >= fenetre.screen.height)
  pleinEcran()
  fenetre.addEventListener('resize', pleinEcran)
}
