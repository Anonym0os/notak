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
  'commun.sansTitre': 'Sans titre',

  'espace.accueil': 'Accueil',
  'espace.accesRetire': 'Accès retiré',
  'espace.horsLigneGarde': 'Hors ligne : gardé sur cet appareil, envoyé au retour du réseau',
  'espace.toutSEnregistre': 'Tout s’enregistre tout seul',
  'espace.titreTableau': 'Titre du tableau',
  'espace.chargement': 'Chargement…',
  'espace.fil': 'Fil d’Ariane',
  'espace.niveauxCaches': 'Niveaux cachés',
  'espace.annuler': 'Annuler',
  'espace.retablir': 'Rétablir',
  'espace.horsLigne': 'Hors ligne',
  'espace.horsLigneInfo': 'Vos modifications sont gardées sur cet appareil ; elles partiront au retour du réseau.',
  'espace.envoiFichiers.one': 'Envoi de {n} fichier…',
  'espace.envoiFichiers.other': 'Envoi de {n} fichiers…',
  'espace.enregistrement': 'Enregistrement…',
  'espace.enregistre': 'Enregistré',
  'commun.annuler': 'Annuler',

  'barre.glisser': 'Glissez l’outil sur le tableau',
  'barre.plusOutils': 'Plus d’outils',
  'barre.plus': 'Plus',
  'barre.outilsParType': 'Outils de chaque type',

  'menu.element': 'Élément',

  'corbeille.titre': 'Corbeille',
  'corbeille.vide': 'Rien à la corbeille.',
  'corbeille.remettre': 'Remettre',
  'corbeille.confirmer': 'Effacer pour de bon ?',
  'corbeille.effacer': 'Effacer',
  'corbeille.vider': 'Vider la corbeille',

  'nonTries.titre': 'Non triés',
  'nonTries.vide': 'Rien en attente. Alt+` y met la sélection.',
  'nonTries.glisser': 'Glisser sur la toile',
  'nonTries.poser': 'Poser',

  'recherche.aucun': 'Aucun résultat',
  'recherche.resultats.one': '{n} résultat',
  'recherche.resultats.other': '{n} résultats',
  'recherche.rang': '{rang} sur {n}',
  'recherche.partout': 'Chercher dans les tableaux',
  'recherche.ici': 'Chercher dans ce tableau',
  'recherche.precedent': 'Résultat précédent (Maj+Entrée)',
  'recherche.suivant': 'Résultat suivant (Entrée)',
  'recherche.fermer': 'Fermer (Échap)',
  'recherche.ailleurs': 'Dans les autres tableaux',

  'raccourcis.titre': 'Raccourcis clavier',
  'raccourcis.elements': 'Éléments',
  'raccourcis.modifier': 'Modifier l’élément choisi',
  'raccourcis.finirModif': 'Finir la modification',
  'raccourcis.nouveauDessous': 'Nouvel élément dessous',
  'raccourcis.dupliquer': 'Dupliquer',
  'raccourcis.presspapiers': 'Couper, copier, coller',
  'raccourcis.corbeille': 'Mettre à la corbeille',
  'raccourcis.deplacer': 'Déplacer (de 5 avec Maj)',
  'raccourcis.plans': 'Premier plan, arrière-plan',
  'raccourcis.relier': 'Relier par une ligne',
  'raccourcis.toutSelectionner': 'Tout sélectionner',
  'raccourcis.annulerRetablir': 'Annuler, rétablir',
  'raccourcis.arranger': 'Arranger',
  'raccourcis.alignerHorizontal': 'Aligner à gauche, à droite',
  'raccourcis.alignerVertical': 'Aligner en haut, en bas',
  'raccourcis.centrer': 'Centrer en largeur, en hauteur',
  'raccourcis.repartir': 'Répartir en largeur, en hauteur',
  'raccourcis.vue': 'Vue et navigation',
  'raccourcis.zoom': 'Zoomer, dézoomer, 100 %',
  'raccourcis.toutVoir': 'Tout voir',
  'raccourcis.attraper': 'Attraper la toile',
  'raccourcis.chercher': 'Chercher dans le tableau',
  'raccourcis.ouvrirTableau': 'Ouvrir le tableau choisi',
  'raccourcis.parent': 'Tableau parent, redescendre',
  'raccourcis.reculer': 'Reculer, avancer',
  'raccourcis.themeSombre': 'Thème sombre',
  'raccourcis.presentation': 'Présentation',
  'raccourcis.reglages': 'Réglages',
  'raccourcis.aide': 'Ces raccourcis',
  'raccourcis.texte': 'Texte',
  'raccourcis.gras': 'Gras, italique, barré',
  'raccourcis.titres': 'Titre, sous-titre',
  'raccourcis.paragraphe': 'Texte normal, petit texte',
  'raccourcis.listes': 'Liste à puces, numérotée',
  'raccourcis.citation': 'Citation, bloc de code',
  'raccourcis.codeLigne': 'Code dans la ligne',
  'raccourcis.centrerTexte': 'Centrer',
  'raccourcis.surligner': 'Surligner',
  'raccourcis.lien': 'Lien',
  'raccourcis.touche.echap': 'Échap',
  'raccourcis.touche.espace': 'Espace',
  'raccourcis.touche.espaceGlisser': 'Espace + glisser',
  'raccourcis.touche.maj': 'Maj+',
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
  'commun.sansTitre': 'Untitled',

  'espace.accueil': 'Home',
  'espace.accesRetire': 'Access removed',
  'espace.horsLigneGarde': 'Offline: kept on this device, sent when the network returns',
  'espace.toutSEnregistre': 'Everything saves itself',
  'espace.titreTableau': 'Board title',
  'espace.chargement': 'Loading…',
  'espace.fil': 'Breadcrumb',
  'espace.niveauxCaches': 'Hidden levels',
  'espace.annuler': 'Undo',
  'espace.retablir': 'Redo',
  'espace.horsLigne': 'Offline',
  'espace.horsLigneInfo': 'Your changes are kept on this device; they will be sent when the network returns.',
  'espace.envoiFichiers.one': 'Uploading {n} file…',
  'espace.envoiFichiers.other': 'Uploading {n} files…',
  'espace.enregistrement': 'Saving…',
  'espace.enregistre': 'Saved',
  'commun.annuler': 'Cancel',

  'barre.glisser': 'Drag the tool onto the board',
  'barre.plusOutils': 'More tools',
  'barre.plus': 'More',
  'barre.outilsParType': 'Tools for each type',

  'menu.element': 'Item',

  'corbeille.titre': 'Trash',
  'corbeille.vide': 'The trash is empty.',
  'corbeille.remettre': 'Put back',
  'corbeille.confirmer': 'Delete for good?',
  'corbeille.effacer': 'Delete',
  'corbeille.vider': 'Empty the trash',

  'nonTries.titre': 'Unsorted',
  'nonTries.vide': 'Nothing waiting. Alt+` puts the selection here.',
  'nonTries.glisser': 'Drag onto the board',
  'nonTries.poser': 'Place',

  'recherche.aucun': 'No results',
  'recherche.resultats.one': '{n} result',
  'recherche.resultats.other': '{n} results',
  'recherche.rang': '{rang} of {n}',
  'recherche.partout': 'Search all boards',
  'recherche.ici': 'Search this board',
  'recherche.precedent': 'Previous result (Shift+Enter)',
  'recherche.suivant': 'Next result (Enter)',
  'recherche.fermer': 'Close (Esc)',
  'recherche.ailleurs': 'In other boards',

  'raccourcis.titre': 'Keyboard shortcuts',
  'raccourcis.elements': 'Items',
  'raccourcis.modifier': 'Edit the selected item',
  'raccourcis.finirModif': 'Finish editing',
  'raccourcis.nouveauDessous': 'New item below',
  'raccourcis.dupliquer': 'Duplicate',
  'raccourcis.presspapiers': 'Cut, copy, paste',
  'raccourcis.corbeille': 'Move to the trash',
  'raccourcis.deplacer': 'Move (by 5 with Shift)',
  'raccourcis.plans': 'Bring to front, send to back',
  'raccourcis.relier': 'Connect with a line',
  'raccourcis.toutSelectionner': 'Select all',
  'raccourcis.annulerRetablir': 'Undo, redo',
  'raccourcis.arranger': 'Arrange',
  'raccourcis.alignerHorizontal': 'Align left, right',
  'raccourcis.alignerVertical': 'Align top, bottom',
  'raccourcis.centrer': 'Center horizontally, vertically',
  'raccourcis.repartir': 'Distribute horizontally, vertically',
  'raccourcis.vue': 'View and navigation',
  'raccourcis.zoom': 'Zoom in, zoom out, 100%',
  'raccourcis.toutVoir': 'Fit everything',
  'raccourcis.attraper': 'Pan the board',
  'raccourcis.chercher': 'Search the board',
  'raccourcis.ouvrirTableau': 'Open the selected board',
  'raccourcis.parent': 'Parent board, go back down',
  'raccourcis.reculer': 'Back, forward',
  'raccourcis.themeSombre': 'Dark theme',
  'raccourcis.presentation': 'Presentation',
  'raccourcis.reglages': 'Settings',
  'raccourcis.aide': 'These shortcuts',
  'raccourcis.texte': 'Text',
  'raccourcis.gras': 'Bold, italic, strikethrough',
  'raccourcis.titres': 'Heading, subheading',
  'raccourcis.paragraphe': 'Normal text, small text',
  'raccourcis.listes': 'Bulleted, numbered list',
  'raccourcis.citation': 'Quote, code block',
  'raccourcis.codeLigne': 'Inline code',
  'raccourcis.centrerTexte': 'Center',
  'raccourcis.surligner': 'Highlight',
  'raccourcis.lien': 'Link',
  'raccourcis.touche.echap': 'Esc',
  'raccourcis.touche.espace': 'Space',
  'raccourcis.touche.espaceGlisser': 'Space + drag',
  'raccourcis.touche.maj': 'Shift+',
  // FIN en
}
