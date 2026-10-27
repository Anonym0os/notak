import { dansCoque } from './bureau'

/**
 * Le service worker de la version web : l'application s'ouvre sans réseau, et se met à jour d'elle-même.
 *
 * Une nouvelle version s'installe dès qu'elle est publiée, et prend la main tout de suite (`service-worker.js`) : la
 * prochaine page ouverte est la nouvelle. Une page déjà ouverte, elle, tourne encore sur l'ancienne, dont les
 * fichiers viennent d'être effacés : un morceau qu'elle n'a pas encore chargé (l'export PDF, une carte mentale) ne se
 * trouverait plus. Elle le sait (`controllerchange`, ou un morceau introuvable) et propose de recharger.
 *
 * Une page qui reste ouverte des jours (l'application installée) redemande la version toutes les heures, et quand on
 * y revient : la mise à jour n'attend pas qu'on la ferme.
 */

/** Une nouvelle version a pris la main sous cette page : il faut la recharger pour en profiter. */
let nouvelle = false
const ecouteurs = new Set<() => void>()
const signaler = () => {
  if (nouvelle) return
  nouvelle = true
  for (const f of ecouteurs) f()
}
export const nouvelleVersion = () => nouvelle
/**
 * Dit à la page qu'une nouvelle version est arrivée, quand ce n'est pas le service worker qui l'apprend : dans l'app de
 * bureau il est désactivé, et c'est la page du serveur qui voit que celui-ci a changé de version (`serveur/versionServeur.ts`).
 */
export const signalerNouvelleVersion = signaler
export const ecouterNouvelleVersion = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}

const HEURE = 3600_000
/** Revenir sur l'onglet redemande la version, au plus une fois par dix minutes. */
const ENTRE_DEUX_RETOURS = 10 * 60_000

/** Suit les versions : celle qui prend la main sous la page, et la recherche régulière des suivantes. */
export function suivreLesVersions(enregistrement: Pick<ServiceWorkerRegistration, 'update'>, conteneur: ServiceWorkerContainer, fenetre: Window = window): void {
  // Une page ouverte avant tout service worker (la toute première visite) n'a rien de vieux : sa prise en main n'est pas une mise à jour.
  let tenue = conteneur.controller !== null
  conteneur.addEventListener('controllerchange', () => {
    if (tenue) signaler()
    tenue = true
  })
  // Vite le dit quand un morceau ne se charge plus : celui d'une version déjà remplacée.
  fenetre.addEventListener('vite:preloadError', signaler)
  const demander = () => void enregistrement.update().catch(() => {})
  fenetre.setInterval(demander, HEURE)
  let dernier = Date.now()
  fenetre.document.addEventListener('visibilitychange', () => {
    if (fenetre.document.visibilityState !== 'visible' || Date.now() - dernier < ENTRE_DEUX_RETOURS) return
    dernier = Date.now()
    demander()
  })
}

/** Installe le service worker : seulement dans l'application construite, où `sw.js` existe (Vite ne le sert pas en développement). */
export function enregistrerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  // L'app de bureau embarque ses fichiers et se met à jour par sa coque, de versions signées : un service worker y
  // garderait une vieille version par-dessus la nouvelle. S'il en reste un d'avant, il s'en va.
  if (dansCoque()) {
    void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()), () => {})
    return
  }
  if (!import.meta.env.PROD) return
  window.addEventListener('load', () => {
    // `updateViaCache: 'none'` : la recherche d'une nouvelle version ne se contente jamais d'une copie gardée de `sw.js`.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(
      (enregistrement) => suivreLesVersions(enregistrement, navigator.serviceWorker),
      () => {
        // Sans service worker, l'application marche toujours : elle ne s'ouvre simplement pas hors ligne.
      },
    )
  })
}
