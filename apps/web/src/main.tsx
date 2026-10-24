import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@notak/tableau/toile.css'
import './app.css'

// Deux éditions, un seul code : `VITE_EDITION=locale` (tout dans le navigateur, sans compte, ce que sert notak.app)
// ou l'édition serveur (comptes, partage, temps réel). Le choix se fait à la construction : le paquet de l'une ne
// contient rien de l'autre.
if (import.meta.env.VITE_EDITION === 'locale') void import('./edition/locale')
else void import('./edition/serveur')
