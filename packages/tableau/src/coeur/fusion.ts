/**
 * Un geste calculé sur un état un peu ancien (un pas d'annulation, le geste d'un autre arrivé entre-temps) effacerait
 * ce qui a changé depuis. On n'applique donc au contenu stocké que ce que le geste a changé : champ par champ, et
 * entrée par entrée pour les dictionnaires nommés.
 *
 * Les sujets d'une carte mentale ne passent plus par ici : ils ont chacun leur clé dans `arbres` (`arbresYjs.ts`),
 * ce qui tient aussi les écritures vraiment simultanées. Restent les autres champs de la carte (options, thème).
 */

type Dico = Record<string, unknown>

const estDico = (v: unknown): v is Dico => typeof v === 'object' && v !== null && !Array.isArray(v)
const pareil = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * Le contenu `actuel`, auquel on applique la différence entre `avant` et `apres`. Pour chaque champ nommé dans
 * `cles` (des dictionnaires), seules les entrées ajoutées, changées ou retirées par le geste bougent ; les autres
 * champs prennent la valeur d'`apres` s'ils ont changé, sinon gardent celle d'`actuel`.
 */
export function fusionnerParCles<C extends object>(actuelC: C, avantC: C, apresC: C, cles: readonly string[]): C {
  const [actuel, avant, apres] = [actuelC, avantC, apresC] as unknown as Dico[] as [Dico, Dico, Dico]
  const sortie: Dico = { ...actuel }
  for (const champ of new Set([...Object.keys(avant), ...Object.keys(apres)])) {
    if (cles.includes(champ)) continue
    if (pareil(avant[champ], apres[champ])) continue
    if (apres[champ] === undefined) delete sortie[champ]
    else sortie[champ] = apres[champ]
  }
  for (const champ of cles) {
    const de = estDico(avant[champ]) ? avant[champ] : {}
    const vers = estDico(apres[champ]) ? apres[champ] : {}
    const ici: Dico = { ...(estDico(actuel[champ]) ? actuel[champ] : {}) }
    let touche = false
    for (const cle of new Set([...Object.keys(de), ...Object.keys(vers)])) {
      if (pareil(de[cle], vers[cle])) continue
      touche = true
      if (vers[cle] === undefined) delete ici[cle]
      else ici[cle] = vers[cle]
    }
    if (!touche) continue
    if (Object.keys(ici).length === 0 && apres[champ] === undefined) delete sortie[champ]
    else sortie[champ] = ici
  }
  return sortie as C
}
