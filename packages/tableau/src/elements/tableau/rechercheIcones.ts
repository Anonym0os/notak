import { CATALOGUE, libelleCatalogue } from './catalogue'
import { ICONES_TABLEAU } from './icones'
import { MOTS_ICONE, motsDe } from './initialisation'

export interface IconeTrouvee {
  nom: string
  libelle: string
}

/** Tout ce qu'on peut chercher : la petite bibliothèque d'abord, puis le catalogue. Les mots sont ceux qui l'évoquent. */
function toutes(): { nom: string; libelle: string; titre: string[]; mots: string[] }[] {
  return [
    ...Object.entries(ICONES_TABLEAU).map(([nom, { libelle }]) => ({ nom, libelle, titre: motsDe(libelle), mots: [...motsDe(libelle), ...(MOTS_ICONE[nom] ?? [])] })),
    ...Object.entries(CATALOGUE).map(([nom, e]) => ({ nom, libelle: libelleCatalogue(nom), titre: motsDe(`${e.fr} ${e.en}`), mots: [...motsDe(`${e.fr} ${e.en} ${e.mots}`)] })),
  ]
}

/**
 * Les icônes que cherche cette requête : chaque mot tapé doit commencer un mot de l'icône (« vac » trouve « vacances »).
 * Le nom de l'icône passe devant ce qui l'évoque, un mot entier devant un début de mot. Requête vide : tout, dans l'ordre du catalogue.
 */
export function chercherIcones(requete: string): IconeTrouvee[] {
  const voulus = motsDe(requete).filter((m) => m.length > 0)
  const toutesLesIcones = toutes()
  if (voulus.length === 0) return toutesLesIcones.map(({ nom, libelle }) => ({ nom, libelle }))
  const notees: { nom: string; libelle: string; note: number; rang: number }[] = []
  toutesLesIcones.forEach(({ nom, libelle, titre, mots }, rang) => {
    let note = 0
    for (const v of voulus) {
      // Le mot du nom de l'icône passe devant celui qui l'évoque seulement.
      if (titre.includes(v)) note += 3
      else if (mots.includes(v)) note += 2
      else if (mots.some((m) => m.startsWith(v))) note += 1
      else return
    }
    notees.push({ nom, libelle, note, rang })
  })
  return notees.sort((a, b) => b.note - a.note || a.rang - b.rang).map(({ nom, libelle }) => ({ nom, libelle }))
}
