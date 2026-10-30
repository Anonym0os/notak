import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@notak/tableau/toile.css'
import './app.css'
import './styles/ios.css'
import { estMobile } from './appareil'
import { coque, estBureau, marquerBureau, peutJoindreUnServeur } from './bureau'
import { simulerCoqueSiDemandee } from './ios/coqueSimulee'

// En développement, `?coque=ios` fait croire à la page qu'elle est dans l'app d'un iPhone : de quoi essayer dans le
// navigateur ce qui passe par la coque (se connecter à un serveur). Rien de cela n'est construit pour la production.
if (import.meta.env.DEV) simulerCoqueSiDemandee()

marquerBureau()
// Sur un iPhone ou un iPad : le thème du système au premier lancement, la vue native au fond du thème, le clavier suivi.
if (estMobile()) void import('./ios/demarrage').then((m) => m.demarrerMobile(window, coque()!))

// Dans l'app de bureau, les réglages (⌘,) gagnent leur rubrique « App de bureau », quelle que soit l'édition.
if (estBureau()) void import('./bureau/ReglagesBureau').then((m) => m.brancherReglagesBureau())
// Au téléphone, les réglages ouvrent sur le compte et son serveur : dans l'édition serveur, et dans l'app qui peut en joindre un.
if (import.meta.env.VITE_EDITION !== 'locale' || peutJoindreUnServeur()) void import('./bureau/CompteEtServeur').then((m) => m.brancherReglagesCompte())

// Deux éditions, un seul code : `VITE_EDITION=locale` (tout dans le navigateur, sans compte, ce que sert notak.app)
// ou l'édition serveur (comptes, partage, temps réel). Le choix se fait à la construction : le paquet de l'une ne
// contient rien de l'autre.
if (import.meta.env.VITE_EDITION === 'locale') {
  const monterLocal = () => void import('./edition/locale')
  // Sur sa page embarquée, l'app (ordinateur, iPhone, iPad) regarde d'abord où Notak doit s'ouvrir : les toiles d'ici,
  // ou le serveur retenu.
  if (peutJoindreUnServeur()) void import('./bureau/Porte').then((m) => m.passerLaPorte(monterLocal)).catch(monterLocal)
  else monterLocal()
} else void import('./edition/serveur')
