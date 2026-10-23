import type { CouleurNote } from '../../coeur/tableau'
import { ICONES_TABLEAU } from './icones'

/** Les mots d'un titre, sans accents ni majuscules. */
export const motsDe = (titre: string): string[] =>
  titre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    // Le pluriel ne change pas le mot : « bleus » vaut « bleu ».
    .flatMap((m) => (m.length > 3 && m.endsWith('s') ? [m, m.slice(0, -1)] : [m]))

/** Un nom de couleur dans le titre donne cette couleur. */
const NOMS_COULEUR: Readonly<Record<string, CouleurNote>> = {
  gris: 'gris', gray: 'gris', grey: 'gris',
  cyan: 'cyan', turquoise: 'cyan',
  vert: 'vert', verte: 'vert', green: 'vert',
  brun: 'brun', marron: 'brun', brown: 'brun',
  jaune: 'jaune', yellow: 'jaune',
  orange: 'orange',
  rouge: 'rouge', red: 'rouge',
  rose: 'rose', pink: 'rose',
  violet: 'violet', violette: 'violet', purple: 'violet',
  bleu: 'bleu', bleue: 'bleu', blue: 'bleu',
}

const POSITIFS = new Set(['bien', 'bon', 'bonne', 'super', 'genial', 'reussite', 'succes', 'joie', 'bonheur', 'heureux', 'merci', 'victoire', 'fete', 'love', 'good', 'great', 'happy', 'success', 'win', 'joy'])
const NEGATIFS = new Set(['mal', 'mauvais', 'mauvaise', 'probleme', 'bug', 'echec', 'urgent', 'danger', 'peur', 'triste', 'colere', 'erreur', 'bad', 'problem', 'fail', 'failure', 'error', 'sad', 'angry', 'fear'])

/**
 * La couleur que dit le titre : un nom de couleur d'abord, puis un mot positif (vert) ou négatif (rouge).
 * Sinon `undefined` : la carte garde la couleur qu'elle a.
 */
export function couleurDuTitre(titre: string): CouleurNote | undefined {
  const mots = motsDe(titre)
  for (const m of mots) if (NOMS_COULEUR[m]) return NOMS_COULEUR[m]
  if (mots.some((m) => POSITIFS.has(m))) return 'vert'
  if (mots.some((m) => NEGATIFS.has(m))) return 'rouge'
  return undefined
}

/** Les mots qui évoquent chaque icône de la bibliothèque (français et anglais, sans accents). */
export const MOTS_ICONE: Readonly<Record<string, readonly string[]>> = {
  maison: ['maison', 'home', 'house', 'appartement', 'logement', 'demenagement'],
  voyage: ['voyage', 'vacances', 'trip', 'travel', 'vol', 'avion', 'holiday'],
  idee: ['idee', 'idees', 'idea', 'ideas', 'brainstorm', 'inspiration'],
  livre: ['livre', 'livres', 'book', 'books', 'lecture', 'roman'],
  musique: ['musique', 'music', 'playlist', 'chanson', 'concert'],
  film: ['film', 'films', 'cinema', 'movie', 'video', 'serie'],
  photo: ['photo', 'photos', 'image', 'images', 'photographie'],
  carte: ['carte', 'plan', 'map', 'itineraire'],
  cible: ['objectif', 'objectifs', 'but', 'goal', 'goals', 'cible', 'target'],
  calendrier: ['calendrier', 'agenda', 'planning', 'calendar', 'schedule', 'rendezvous'],
  argent: ['argent', 'budget', 'finance', 'finances', 'money', 'compta', 'facture', 'factures'],
  coeur: ['coeur', 'amour', 'love', 'favoris', 'favoris'],
  etoile: ['etoile', 'star', 'important', 'favori'],
  drapeau: ['drapeau', 'flag', 'jalon', 'jalons', 'milestone'],
  fusee: ['lancement', 'launch', 'startup', 'projet', 'projets', 'rocket'],
  outil: ['outil', 'outils', 'tool', 'tools', 'bricolage', 'travaux'],
  palette: ['design', 'dessin', 'art', 'couleur', 'couleurs', 'creation', 'maquette'],
  repas: ['repas', 'recette', 'recettes', 'cuisine', 'recipe', 'food', 'diner', 'dejeuner', 'restaurant'],
  sport: ['sport', 'sports', 'fitness', 'running', 'gym', 'entrainement'],
  personne: ['personne', 'profil', 'moi', 'perso', 'personal', 'me', 'contact', 'contacts'],
  equipe: ['equipe', 'team', 'famille', 'amis', 'groupe', 'family', 'friends'],
  dossier: ['dossier', 'dossiers', 'archive', 'archives', 'folder'],
  note: ['note', 'notes', 'memo', 'journal'],
  arbre: ['arbre', 'nature', 'jardin', 'tree', 'garden', 'foret'],
  travail: ['travail', 'bureau', 'work', 'office', 'pro', 'job', 'emploi', 'carriere'],
  courses: ['courses', 'shopping', 'achats', 'liste', 'groceries'],
  cadeau: ['cadeau', 'cadeaux', 'gift', 'gifts', 'anniversaire', 'noel', 'birthday'],
  cafe: ['cafe', 'the', 'coffee', 'tea', 'pause'],
  voiture: ['voiture', 'auto', 'car', 'garage', 'route'],
  ecole: ['ecole', 'cours', 'etudes', 'school', 'study', 'universite', 'classe', 'formation'],
  sante: ['sante', 'health', 'medecin', 'medical', 'docteur', 'bienetre'],
  plante: ['plante', 'plantes', 'plant', 'plants', 'fleur', 'fleurs'],
  animal: ['animal', 'animaux', 'chat', 'chien', 'pet', 'pets', 'dog', 'cat'],
  monde: ['monde', 'world', 'international', 'planete', 'web', 'site'],
  horloge: ['horloge', 'temps', 'time', 'horaire', 'horaires', 'deadline'],
  cle: ['cle', 'cles', 'key', 'keys', 'acces', 'mots'],
  graphique: ['graphique', 'stats', 'statistiques', 'chart', 'analyse', 'analytics', 'rapport', 'rapports', 'resultats'],
  ordinateur: ['ordinateur', 'computer', 'code', 'dev', 'tech', 'informatique', 'logiciel', 'app'],
  micro: ['micro', 'podcast', 'interview', 'enregistrement', 'voix'],
  jeu: ['jeu', 'jeux', 'game', 'games', 'gaming', 'jouer'],
  science: ['science', 'sciences', 'labo', 'recherche', 'research', 'experience'],
  soleil: ['soleil', 'sun', 'ete', 'summer', 'plage', 'meteo'],
}

/**
 * L'icône qu'évoque le titre : la première de la bibliothèque dont un mot s'y trouve et que les tableaux voisins
 * (`utilisees`) n'ont pas déjà. `undefined` si rien ne vient, la carte garde alors son initiale.
 */
export function iconeDuTitre(titre: string, utilisees: ReadonlySet<string> = new Set()): string | undefined {
  const mots = new Set(motsDe(titre))
  for (const [nom, evocations] of Object.entries(MOTS_ICONE)) {
    if (!ICONES_TABLEAU[nom] || utilisees.has(nom)) continue
    if (evocations.some((m) => mots.has(m))) return nom
  }
  return undefined
}
