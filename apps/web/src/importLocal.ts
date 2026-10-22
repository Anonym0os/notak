import { type Element, type EspaceNavigable, type Id, type Operation } from '@notak/tableau'
import { lireAncienEspace, lireAncienFichier } from './ancien'
import { envoyerFichier } from './fichiers'

/**
 * Recopie l'ancien espace local dans le compte : la racine dans la racine, chaque tableau imbriqué dans un
 * tableau neuf, les images renvoyées au serveur. Les ids de tableaux changent, les renvois suivent.
 * Rend le nombre d'images qu'on n'a pas retrouvées.
 */
export async function importerEspaceLocal(espace: EspaceNavigable): Promise<number> {
  const ancien = lireAncienEspace()
  if (!ancien) return 0
  const nouveaux = new Map<Id, Id>([[ancien.racine, espace.racine]])
  const images = new Map<Id, Id | null>()
  let perdues = 0
  const file: Id[] = [ancien.racine]

  const image = async (fichier: Id): Promise<Id | null> => {
    if (!images.has(fichier)) {
      const blob = await lireAncienFichier(fichier)
      images.set(fichier, blob ? await envoyerFichier(blob).catch(() => null) : null)
    }
    return images.get(fichier) ?? null
  }

  for (let i = 0; i < file.length; i++) {
    const vieux = file[i]!
    const t = ancien.tableaux[vieux]
    const cible = nouveaux.get(vieux)!
    if (!t) continue
    const ops: Operation[] = []
    for (const e of t.elements) {
      let element: Element = e
      const c = e.contenu
      if (c.type === 'tableau') {
        let n = nouveaux.get(c.cible)
        if (!n) {
          const enfant = ancien.tableaux[c.cible]
          n = espace.creerTableau(enfant?.titre ?? c.titre ?? 'Tableau', cible)
          nouveaux.set(c.cible, n)
          if (enfant?.couleur) {
            const m = espace.magasin(n)
            m.remplacer({ ...m.lire(), couleur: enfant.couleur })
          }
          file.push(c.cible)
        }
        element = { ...e, contenu: { ...c, cible: n } }
      } else if (c.type === 'image') {
        const neuf = await image(c.fichier)
        if (neuf) element = { ...e, contenu: { ...c, fichier: neuf } }
        else perdues++
      }
      ops.push({ type: 'creer', element })
    }
    if (ops.length > 0) espace.magasin(cible).faire(ops)
  }
  return perdues
}
