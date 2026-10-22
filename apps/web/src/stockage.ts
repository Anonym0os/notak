import { type Espace, type Tableau, espaceDepuis, nouvelId } from '@notak/tableau'

// L'espace vit dans le navigateur, en attendant la synchronisation.
const CLE = 'notak:espace'
// La version précédente n'enregistrait qu'un tableau seul.
const ANCIENNE_CLE = 'notak:tableau'

export function lire(): Espace {
  try {
    const json = localStorage.getItem(CLE) ?? localStorage.getItem(ANCIENNE_CLE)
    if (json) return espaceDepuis(JSON.parse(json) as Tableau | Espace)
  } catch {
    // Un stockage illisible ou interdit : on repart d'un espace vide.
  }
  const id = nouvelId()
  return { racine: id, tableaux: { [id]: { id, titre: 'Mon tableau', elements: [] } } }
}

export function ecrire(e: Espace) {
  try {
    localStorage.setItem(CLE, JSON.stringify(e))
  } catch {
    // Stockage plein ou interdit : l'espace reste en mémoire.
  }
}
