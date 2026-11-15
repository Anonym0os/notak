// Les tests parlent français sauf demande contraire : un navigateur de test déclare « fr-FR », comme celui de
// l'équipe, et l'anglais se choisit exprès (`definirLangue('en')`).
if (typeof navigator !== 'undefined') {
  for (const [cle, valeur] of [
    ['language', 'fr-FR'],
    ['languages', ['fr-FR', 'fr']],
  ] as const)
    Object.defineProperty(navigator, cle, { value: valeur, configurable: true })
}

// Un éditeur ProseMirror détruit (`EditorView.destroy`) remet à 20 ms la lecture des dernières mutations du DOM
// (`DOMObserver.stop`) : si le fichier d'essais finit avant, le minuteur part après la fin de l'environnement jsdom et
// lit `document`, d'où une « Unhandled Error » qui fait échouer la suite sans un essai rouge, selon la charge de la
// machine. Chaque fichier d'un environnement de navigateur laisse donc passer ces minuteurs avant de rendre la main.
if (typeof window !== 'undefined') {
  const { afterAll, vi } = await import('vitest')
  afterAll(async () => {
    vi.useRealTimers()
    await new Promise((fin) => setTimeout(fin, 40))
  })
}
