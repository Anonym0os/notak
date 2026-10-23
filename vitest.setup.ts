// Les tests parlent français sauf demande contraire : un navigateur de test déclare « fr-FR », comme celui de
// l'équipe, et l'anglais se choisit exprès (`definirLangue('en')`).
if (typeof navigator !== 'undefined') {
  for (const [cle, valeur] of [
    ['language', 'fr-FR'],
    ['languages', ['fr-FR', 'fr']],
  ] as const)
    Object.defineProperty(navigator, cle, { value: valeur, configurable: true })
}
