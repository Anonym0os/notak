import { useSyncExternalStore } from 'react'

/**
 * Les langues de l'interface. Le français est la source : tout texte vu à l'écran a une clé dans `fr`, et `en`
 * la traduit (un test vérifie que les deux ont les mêmes clés). Une clé absente de la langue choisie retombe sur
 * le français, puis sur la clé elle-même : un oubli se voit, il ne casse rien.
 *
 * Le choix vit dans les réglages (`notak:reglages`) : `auto` suit la langue du navigateur.
 */
export type Langue = 'fr' | 'en'
export type ChoixLangue = 'auto' | Langue
export type Textes = Record<string, string>

export const LANGUES: readonly Langue[] = ['fr', 'en']

const CLE_REGLAGES = 'notak:reglages'

/** Le français pour un navigateur français (ou sans langue connue), l'anglais pour tout autre. */
export function langueDuNavigateur(): Langue {
  const l = typeof navigator === 'undefined' ? '' : (navigator.languages?.[0] ?? navigator.language ?? '')
  return !l || /^fr/i.test(l) ? 'fr' : 'en'
}

export const resoudreLangue = (choix: ChoixLangue | undefined): Langue => (choix === 'fr' || choix === 'en' ? choix : langueDuNavigateur())

/** Le choix gardé par les réglages de ce navigateur. */
export function choixEnregistre(): ChoixLangue {
  try {
    const brut = (JSON.parse(localStorage.getItem(CLE_REGLAGES) ?? '{}') as { langue?: unknown }).langue
    return brut === 'fr' || brut === 'en' ? brut : 'auto'
  } catch {
    return 'auto'
  }
}

let courante: Langue | null = null
const abonnes = new Set<() => void>()
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

/** La langue en cours, lue dans les réglages la première fois. */
export function langue(): Langue {
  courante ??= resoudreLangue(choixEnregistre())
  return courante
}

/** Change la langue de l'interface et prévient ceux qui la suivent (`useLangue`). */
export function definirLangue(choix: ChoixLangue | undefined) {
  const suivante = resoudreLangue(choix)
  if (suivante === courante) return
  courante = suivante
  if (typeof document !== 'undefined') document.documentElement.lang = suivante
  abonnes.forEach((f) => f())
}

/** La langue en cours, et un nouveau rendu quand elle change. */
export const useLangue = (): Langue => useSyncExternalStore(ecouter, langue, () => 'fr')

/** Les textes qu'une application ajoute aux siens (`apps/web`), à l'import de son module de textes. */
export function ajouterTextes(source: Textes, traduction: Textes) {
  Object.assign(fr, source)
  Object.assign(en, traduction)
}

/**
 * Le texte d'une clé dans la langue en cours ; `{nom}` dans le texte prend `valeurs.nom`.
 * Un oubli de traduction retombe sur le français.
 */
export function t(cle: string, valeurs?: Record<string, string | number>): string {
  const texte = (langue() === 'en' ? en[cle] : undefined) ?? fr[cle] ?? cle
  return valeurs ? texte.replace(/\{(\w+)\}/g, (m, k: string) => (k in valeurs ? String(valeurs[k]) : m)) : texte
}

/**
 * Un texte qui s'accorde en nombre : la clé porte deux formes, `cle.one` et `cle.other` (le pluriel de la
 * langue, `Intl.PluralRules`). `{n}` vaut le nombre.
 */
export function tn(cle: string, n: number, valeurs?: Record<string, string | number>): string {
  const forme = new Intl.PluralRules(langue()).select(n) === 'one' ? 'one' : 'other'
  return t(`${cle}.${forme}`, { n, ...valeurs })
}

export const fr: Textes = {
  'commun.fermer': 'Fermer',

  'reglages.titre': 'Réglages',
  'reglages.theme': 'Thème',
  'reglages.theme.clair': 'Clair',
  'reglages.theme.sombre': 'Sombre',
  'reglages.taille': 'Taille de l’interface',
  'reglages.taille.petite': 'Petite',
  'reglages.taille.moyenne': 'Moyenne',
  'reglages.taille.grande': 'Grande',
  'reglages.doubleClic': 'Double-clic sur le vide',
  'reglages.doubleClic.note': 'Crée une note',
  'reglages.doubleClic.rien': 'Ne fait rien',
  'reglages.langue': 'Langue',
  'reglages.langue.auto': 'Automatique (navigateur)',
  'reglages.langue.fr': 'Français',
  'reglages.langue.en': 'English',
  'reglages.compte': 'Compte',
  'reglages.compte.photoChanger': 'Changer la photo',
  'reglages.compte.photoChoisir': 'Choisir une photo',
  'reglages.compte.photoRetirer': 'Retirer la photo',
  'reglages.compte.photoChamp': 'Photo du compte',
  'reglages.compte.couleur': 'Couleur du compte',
  'reglages.compte.echec': 'Le changement a échoué.',
  'reglages.photo.type': 'Choisissez une image PNG, JPEG, WebP ou GIF.',
  'reglages.photo.poids': 'Cette image dépasse 5 Mo.',
  // FIN fr
}

export const en: Textes = {
  'commun.fermer': 'Close',

  'reglages.titre': 'Settings',
  'reglages.theme': 'Theme',
  'reglages.theme.clair': 'Light',
  'reglages.theme.sombre': 'Dark',
  'reglages.taille': 'Interface size',
  'reglages.taille.petite': 'Small',
  'reglages.taille.moyenne': 'Medium',
  'reglages.taille.grande': 'Large',
  'reglages.doubleClic': 'Double-click on empty space',
  'reglages.doubleClic.note': 'Creates a note',
  'reglages.doubleClic.rien': 'Does nothing',
  'reglages.langue': 'Language',
  'reglages.langue.auto': 'Automatic (browser)',
  'reglages.langue.fr': 'Français',
  'reglages.langue.en': 'English',
  'reglages.compte': 'Account',
  'reglages.compte.photoChanger': 'Change photo',
  'reglages.compte.photoChoisir': 'Choose a photo',
  'reglages.compte.photoRetirer': 'Remove photo',
  'reglages.compte.photoChamp': 'Account photo',
  'reglages.compte.couleur': 'Account color',
  'reglages.compte.echec': 'The change failed.',
  'reglages.photo.type': 'Choose a PNG, JPEG, WebP or GIF image.',
  'reglages.photo.poids': 'This image is larger than 5 MB.',
  // FIN en
}
