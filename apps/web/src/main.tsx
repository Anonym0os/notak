import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@notak/tableau/toile.css'
import './app.css'
import { estBureau, estPageServeur, marquerBureau } from './bureau'

marquerBureau()

// Dans l'app de bureau, les réglages (⌘,) gagnent leur rubrique « App de bureau », quelle que soit l'édition.
if (estBureau()) void import('./bureau/ReglagesBureau').then((m) => m.brancherReglagesBureau())

// Deux éditions, un seul code : `VITE_EDITION=locale` (tout dans le navigateur, sans compte, ce que sert notak.app)
// ou l'édition serveur (comptes, partage, temps réel). Le choix se fait à la construction : le paquet de l'une ne
// contient rien de l'autre.
if (import.meta.env.VITE_EDITION === 'locale') {
  const monterLocal = () => void import('./edition/locale')
  // Sur sa page embarquée, l'app de bureau regarde d'abord où Notak doit s'ouvrir : les toiles d'ici, ou le serveur retenu.
  if (estBureau() && !estPageServeur()) void import('./bureau/Porte').then((m) => m.passerLaPorte(monterLocal)).catch(monterLocal)
  else monterLocal()
} else void import('./edition/serveur')
