// L'écran d'attente de index.html prend le thème choisi dans les réglages (lireReglages, @notak/tableau), avant que l'app
// n'ait chargé. Un fichier et non un script dans la page : la politique de sécurité de l'app de bureau les refuse.
try {
  const reglages = JSON.parse(localStorage.getItem('notak:reglages') || '{}')
  const choix = reglages.theme || (localStorage.getItem('notak:theme') === 'sombre' ? 'sombre' : 'clair')
  const sombre = choix === 'sombre' || (choix === 'systeme' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (sombre) document.querySelector('.ecran-attente')?.setAttribute('data-theme', 'sombre')
} catch {}
