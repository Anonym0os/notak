/**
 * Ce que la page fait au lancement dans la coque mobile, et seulement là (`main.tsx`) :
 * - au tout premier lancement, le thème suit le système (iOS est sombre ou clair selon l'heure et la personne ; une
 *   app qui s'ouvre blanche la nuit détonne) ; ensuite, le réglage de la personne commande ;
 * - la vue native prend la couleur du fond de la page, et la barre d'état son style, à chaque changement de thème ;
 * - le clavier est suivi (`clavier.ts`), par la viewport et par l'événement de la coque.
 */
import { appliquerClavierDeLaCoque, type EvenementClavierCoque, suivreClavier } from './clavier'

const CLE_REGLAGES = 'notak:reglages'

interface Depot {
  getItem(cle: string): string | null
  setItem(cle: string, valeur: string): void
}

/** Au premier lancement seulement : le thème « système ». Rend `true` si c'est ce qui vient d'être fait. */
export function themeSystemeAuPremierLancement(depot: Depot): boolean {
  try {
    if (depot.getItem(CLE_REGLAGES) !== null) return false
    depot.setItem(CLE_REGLAGES, JSON.stringify({ theme: 'systeme' }))
    return true
  } catch {
    return false
  }
}

interface Coque {
  invoke(commande: string, arguments_?: unknown): Promise<unknown>
  transformCallback?(f: (r: unknown) => void): number
}

/** Le fond que la page affiche en ce moment (`--notak-fond`, posé par la toile selon le thème), en `#rrggbb`. */
export function fondCourant(document: Document, fenetre: Pick<Window, 'getComputedStyle'>): string | null {
  const v = fenetre.getComputedStyle(document.documentElement).getPropertyValue('--notak-fond').trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null
}

/**
 * Dit à la coque le thème affiché (`data-theme` sur la racine, posé par la toile) et le fond : elle peint la vue
 * native derrière la page et règle la barre d'état. Rejoué à chaque changement de `data-theme`.
 */
export function suivreTheme(document: Document, fenetre: Pick<Window, 'getComputedStyle'>, coque: Coque): () => void {
  let dernier = ''
  const envoyer = () => {
    const theme = document.documentElement.dataset.theme === 'sombre' ? 'sombre' : 'clair'
    const fond = fondCourant(document, fenetre) ?? (theme === 'sombre' ? '#1b1e23' : '#ebedee')
    const cle = `${theme} ${fond}`
    if (cle === dernier) return
    dernier = cle
    void coque.invoke('plugin:appareil|regler_theme', { theme, fond }).catch(() => {})
  }
  envoyer()
  const observateur = new MutationObserver(envoyer)
  observateur.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-habillage'] })
  return () => observateur.disconnect()
}

/**
 * Écoute un événement du plugin : la coque envoie sur un canal (`__CHANNEL__:<id>`) ce que Swift `trigger`. Le message
 * arrive nu, ou enveloppé (`{ message }`) selon la version de Tauri : on prend les deux.
 */
export function ecouterPlugin(coque: Coque, evenement: string, f: (donnees: unknown) => void): void {
  if (!coque.transformCallback) return
  const id = coque.transformCallback((brut) => {
    const message = brut && typeof brut === 'object' && 'message' in (brut as Record<string, unknown>) ? (brut as { message: unknown }).message : brut
    f(message)
  })
  void coque.invoke('plugin:appareil|register_listener', { event: evenement, handler: `__CHANNEL__:${id}` }).catch(() => {})
}

/** Tout ce qui précède, branché sur la vraie fenêtre. */
export function demarrerMobile(fenetre: Window, coque: Coque): void {
  themeSystemeAuPremierLancement(fenetre.localStorage)
  suivreClavier(fenetre)
  ecouterPlugin(coque, 'clavier', (d) => appliquerClavierDeLaCoque(fenetre.document, d as EvenementClavierCoque))
  // La toile pose `data-theme` à son premier rendu : on attend qu'elle soit là.
  fenetre.requestAnimationFrame(() => suivreTheme(fenetre.document, fenetre, coque))
}
