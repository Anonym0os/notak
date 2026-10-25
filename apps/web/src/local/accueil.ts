import type { ModeleTableau } from '@notak/tableau/modeles/construire'
import { ACCUEIL } from '@notak/tableau/modeles/accueil'
import { ACCUEIL_EN } from '@notak/tableau/modeles/accueil.en'

/**
 * Le tableau d'accueil de l'édition locale : celui des comptes neufs, sans ce qui n'existe pas ici (le partage par
 * adresse, la photo, le menu du compte), avec ce qui compte ici (garder une copie, où sont les tableaux).
 */
const REMPLACEMENTS: Record<'fr' | 'en', [RegExp, string][]> = {
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

function adapter(m: ModeleTableau, langue: 'fr' | 'en'): ModeleTableau {
  const texte = (t: string) => REMPLACEMENTS[langue].reduce((x, [motif, par]) => (motif.test(x) ? par : x), t)
  const parcourir = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(parcourir)
    if (typeof v !== 'object' || v === null) return v
    const o = { ...(v as Record<string, unknown>) }
    if (typeof o.texte === 'string') o.texte = texte(o.texte)
    if (Array.isArray(o.contenu)) o.contenu = o.contenu.map(parcourir)
    return o
  }
  return { ...m, elements: parcourir(m.elements) as ModeleTableau['elements'] }
}

export const accueilLocal = (langue: string): ModeleTableau => (langue === 'en' ? adapter(ACCUEIL_EN, 'en') : adapter(ACCUEIL, 'fr'))
