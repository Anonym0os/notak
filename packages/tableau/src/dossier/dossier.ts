/**
 * Le dossier Notak vu par le moteur : quelques opérations sur des fichiers, sans rien supposer de ce qui les porte
 * (le système de fichiers d'une application, l'API d'accès aux fichiers d'un navigateur, la mémoire pour les essais).
 * Les chemins sont relatifs au dossier, séparés par `/`.
 *
 * Ce qui porte le dossier ne garantit presque rien : un nuage livre en retard, dans le désordre, à moitié, en double
 * sous un autre nom, ou remplace un fichier par un fantôme à télécharger. Le moteur fait avec (voir STOCKAGE.md).
 */
export interface Dossier {
  /** Le contenu d'un sous-dossier, vide s'il n'existe pas. */
  lister(chemin: string): Promise<EntreeDossier[]>
  /** Le contenu d'un fichier, `'absent'` s'il n'existe pas, `'fantome'` s'il n'est pas encore descendu du nuage. */
  lire(chemin: string): Promise<Uint8Array | 'absent' | 'fantome'>
  /**
   * Écrit un fichier en entier, ou rien : par un fichier temporaire renommé ensuite. Crée les dossiers manquants.
   * Échoue d'une `ErreurDossier` de cause `'lecture-seule'` si le dossier refuse qu'on y écrive.
   */
  ecrireAtomique(chemin: string, octets: Uint8Array): Promise<void>
  /** Supprime un fichier ; ne fait rien s'il n'existe pas. */
  supprimer(chemin: string): Promise<void>
  /** Demande au nuage de faire descendre un fantôme. Sans effet là où il n'y a pas de fantômes. */
  telecharger?(chemin: string): Promise<void>
}

export interface EntreeDossier {
  nom: string
  genre: 'fichier' | 'dossier'
  /** En octets, pour un fichier. */
  taille?: number
  /** Un fichier que le nuage n'a pas encore fait descendre (iCloud « Optimiser le stockage », OneDrive « à la demande »). */
  fantome?: boolean
}

export class ErreurDossier extends Error {
  constructor(
    message: string,
    readonly cause: 'lecture-seule' | 'plein' | 'indisponible',
  ) {
    super(message)
  }
}

/**
 * Ce que l'appareil garde pour lui, hors du dossier, et qui survit à un redémarrage (IndexedDB dans un navigateur,
 * un fichier de l'application ailleurs). Perdu, il se reconstruit : l'appareil prend alors un nouvel identifiant.
 */
export interface DepotLocal {
  lire<T>(cle: string): Promise<T | undefined>
  ecrire(cle: string, valeur: unknown): Promise<void>
}

/** Un dépôt en mémoire, pour les essais. Il survit au « redémarrage » d'un appareil simulé si on le garde. */
export function depotMemoire(): DepotLocal & { donnees: Map<string, unknown> } {
  const donnees = new Map<string, unknown>()
  return {
    donnees,
    async lire<T>(cle: string) {
      return structuredClone(donnees.get(cle)) as T | undefined
    },
    async ecrire(cle, valeur) {
      donnees.set(cle, structuredClone(valeur))
    },
  }
}
