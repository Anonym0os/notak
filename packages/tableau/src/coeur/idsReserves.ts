// Ce fichier est lu sans la toile (le format .notak, le moteur de dossier) : il ne tire rien.

/**
 * Les noms que l'édition locale donne à ses propres bases IndexedDB et canaux (`notak:local:<nom>`), à côté de ceux
 * des tableaux (`notak:local:<id du tableau>`). Un tableau qui porterait l'un d'eux ouvrirait la base de l'index, des
 * fichiers ou des réglages comme si c'était la sienne : un lien `/t/fichiers`, une copie .notak ou un dossier
 * partagé pourraient ainsi abîmer l'espace. Un identifiant de tableau tiré par Notak (`nouvelId`) n'en est jamais un.
 */
export const IDS_RESERVES: ReadonlySet<string> = new Set(['espace', 'fichiers', 'reglages', 'coffre', 'synchro', 'changements', 'accueilli'])

export const idReserve = (id: string): boolean => IDS_RESERVES.has(id.toLowerCase())
