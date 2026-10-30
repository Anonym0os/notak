import { auDoigt } from '@notak/tableau'
import type { ModeleTableau } from '@notak/tableau/modeles/construire'
import { ACCUEIL } from '@notak/tableau/modeles/accueil'
import { ACCUEIL_EN } from '@notak/tableau/modeles/accueil.en'
import { AU_DOIGT, type Reecritures, reecrire } from '@notak/tableau/modeles/accueilDoigt'

/**
 * Le tableau d'accueil de l'édition locale : celui des comptes neufs, sans ce qui n'existe pas ici (le partage par
 * adresse, la photo, le menu du compte), avec ce qui compte ici (garder une copie, où sont les tableaux).
 */
const REMPLACEMENTS: Record<'fr' | 'en', Reecritures> = {
  fr: [
    [/^# Les raccourcis\n.*/s, '# Les raccourcis\nTapez / pour les voir tous.'],
    [/^# Partager\n.*/s, '# Garder une copie\nCmd+S enregistre une copie .notak, à ranger où vous voulez. La pastille en haut à droite dit où sont vos toiles.'],
    [/^# Réglages\n.*/s, '# Réglages\nCmd+, règle le thème et la taille.'],
  ],
  en: [
    [/^# Shortcuts\n.*/s, '# Shortcuts\nType / to see them all.'],
    [/^# Share\n.*/s, '# Keep a copy\nCmd+S saves a .notak copy, to keep wherever you like. The pill at the top right tells where your boards are.'],
    [/^# Settings\n.*/s, '# Settings\nCmd+, sets the theme and the size.'],
  ],
}

/**
 * Au doigt (`auDoigt`), par-dessus : les gestes d'un écran qu'on touche (`AU_DOIGT`, les mêmes que sur un serveur), et
 * la copie, qui n'existe qu'ici.
 */
const COPIE_AU_DOIGT: Record<'fr' | 'en', Reecritures> = {
  fr: [[/^# Garder une copie\n.*/s, '# Garder une copie\nLe dossier, en haut à droite, enregistre une copie .notak à ranger où vous voulez, et dit où sont vos toiles.']],
  en: [[/^# Keep a copy\n.*/s, '# Keep a copy\nThe folder, at the top right, saves a .notak copy to keep wherever you like, and tells where your boards are.']],
}

const adapter = (m: ModeleTableau, langue: 'fr' | 'en', doigt: boolean): ModeleTableau =>
  reecrire(m, doigt ? [...REMPLACEMENTS[langue], ...AU_DOIGT[langue], ...COPIE_AU_DOIGT[langue]] : REMPLACEMENTS[langue])

export const accueilLocal = (langue: string, doigt = auDoigt()): ModeleTableau =>
  langue === 'en' ? adapter(ACCUEIL_EN, 'en', doigt) : adapter(ACCUEIL, 'fr', doigt)
