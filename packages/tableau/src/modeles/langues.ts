// Le catalogue dans la langue de l'interface. Réservé à la toile (bundler) : le serveur importe `accueil` et
// `accueil.en` à part, sans ce fichier.
import { ACCUEIL } from './accueil'
import { ACCUEIL_EN } from './accueil.en'
import { MODELES } from './catalogue'
import { MODELES_EN } from './catalogue.en'
import type { ModeleTableau } from './construire'

type Langue = 'fr' | 'en'

export const modelesDe = (l: Langue): readonly ModeleTableau[] => (l === 'en' ? MODELES_EN : MODELES)
export const accueilDe = (l: Langue): ModeleTableau => (l === 'en' ? ACCUEIL_EN : ACCUEIL)
