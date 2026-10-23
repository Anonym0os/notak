/** Installe le service worker : seulement dans l'application construite, où `sw.js` existe (Vite ne le sert pas en développement). */
export function enregistrerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Sans service worker, l'application marche toujours : elle ne s'ouvre simplement pas hors ligne.
    })
  })
}
