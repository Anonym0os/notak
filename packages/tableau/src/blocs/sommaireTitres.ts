import type { Node as NoeudPM } from '@tiptap/pm/model'

/**
 * Le sommaire latéral de la page (docs/NOTION.md § 9) : les décisions du composant `Sommaire.tsx`, sans DOM. Quels
 * sont les titres de la page, quel titre est le courant à un défilement donné, de quelle longueur est le trait d'un
 * niveau, où défiler au clic, et si la fenêtre laisse la place à la colonne. Les valeurs sont celles mesurées dans Notion.
 */

/** Un titre de la page : son niveau (1 à 3), son texte, et son id de bloc (`null` dans une page figée, sans ids). */
export interface Titre {
  id: string | null
  niveau: 1 | 2 | 3
  texte: string
}

/** Le bord droit des traits, à partir du bord droit de la fenêtre. */
export const DROITE = 35
/** Le premier trait, sous le haut de la zone qui défile (la barre du haut fait 44 px, le trait est à 174 de la fenêtre). */
export const HAUT = 130
/** Le remplissage de la colonne : la zone de survol déborde des traits. */
export const REMPLISSAGE = { haut: 12, droite: 12, bas: 12, gauche: 20 }
/** Le pas des traits, de haut en haut : 2 px de trait, 12 px d'air. */
export const PAS = 14
/** Un titre est « passé » quand son haut a atteint cette distance du haut de la zone. */
export const SEUIL = 72
/** Au clic, le titre s'arrête à cette distance du haut de la zone. */
export const DECALAGE = 56
/** L'air exigé entre le texte de la page et la colonne. */
export const AIR = 12
/** Le panneau se referme ce temps après que la souris a quitté la colonne et lui. */
export const GRACE = 150

/** Le trait d'un niveau : 16 px pour un titre 1, 12 pour un titre 2, 8 pour un titre 3. */
export const longueurTrait = (niveau: 1 | 2 | 3): number => (niveau === 1 ? 16 : niveau === 2 ? 12 : 8)

/** Le retrait de la ligne d'un titre dans le panneau : 6 px du bord, puis 12 px par niveau. */
export const retraitLigne = (niveau: 1 | 2 | 3): number => 6 + 12 * (niveau - 1)

const niveauDe = (n: unknown): 1 | 2 | 3 => Math.min(3, Math.max(1, Number(n) || 1)) as 1 | 2 | 3

/** Les titres du texte dans l'ordre de lecture : ceux de la page et ceux des colonnes. Les dépliants comptent, ouverts ou non. */
export function titresDe(doc: NoeudPM): Titre[] {
  const sortie: Titre[] = []
  const parcourir = (conteneur: NoeudPM) =>
    conteneur.forEach((n) => {
      if (n.type.name === 'heading') sortie.push({ id: (n.attrs.id as string | null) ?? null, niveau: niveauDe(n.attrs.level), texte: n.textContent })
      else if (n.type.name === 'colonnes') n.forEach((colonne) => parcourir(colonne))
    })
  parcourir(doc)
  return sortie
}

/** Les titres d'un rendu figé (la page en lecture) : ses `h1`, `h2`, `h3`, dans l'ordre. */
export function titresDuRendu(racine: ParentNode | null): Titre[] {
  if (!racine) return []
  return [...racine.querySelectorAll<HTMLElement>('h1, h2, h3')].map((el) => ({
    id: el.getAttribute('data-bloc'),
    niveau: niveauDe(el.tagName.slice(1)),
    texte: el.textContent ?? '',
  }))
}

/** Deux listes de titres disent la même chose : le composant ne se redessine pas pour rien. */
export const memesTitres = (a: readonly Titre[], b: readonly Titre[]): boolean =>
  a.length === b.length && a.every((t, i) => t.id === b[i]!.id && t.niveau === b[i]!.niveau && t.texte === b[i]!.texte)

/**
 * Le titre courant : le dernier dont le haut est passé sous le seuil (en haut de la zone visible), sinon le premier.
 * `hauts[i]` est le haut du titre `i` dans le repère de la zone, `null` pour un titre qu'on ne voit pas (caché par un
 * dépliant fermé) : il ne peut pas être le courant.
 */
export function titreCourant(hauts: readonly (number | null)[], seuil: number = SEUIL): number {
  let courant = 0
  hauts.forEach((h, i) => {
    if (h !== null && h <= seuil) courant = i
  })
  return courant
}

/** Le défilement qui amène un titre à `decalage` px sous le haut de la zone (jamais au-dessus de zéro). */
export const cibleDefilement = (hautTitre: number, hautZone: number, defilement: number, decalage: number = DECALAGE): number =>
  Math.max(0, Math.round(defilement + hautTitre - hautZone - decalage))

/** La fenêtre laisse-t-elle la place à la colonne, à droite du texte de la page ? Sinon elle ne se montre pas. */
export function placeSuffisante(largeurFenetre: number, droiteTexte: number): boolean {
  const gauche = largeurFenetre - DROITE - longueurTrait(1) - REMPLISSAGE.gauche
  return gauche >= droiteTexte + AIR
}

/**
 * L'élément à atteindre pour un titre : lui-même s'il se voit, sinon le dernier bloc visible qui le précède, qui est
 * le dépliant fermé qui le cache (les blocs cachés suivent tous leur dépliant).
 */
export function elementVisible(el: HTMLElement): HTMLElement {
  let cible: HTMLElement = el
  while (cible.classList.contains('notak-cache')) {
    const avant = cible.previousElementSibling
    if (!(avant instanceof HTMLElement)) break
    cible = avant
  }
  return cible
}

/** Un titre caché ne se mesure pas. */
export const estCache = (el: HTMLElement): boolean => !!el.closest('.notak-cache')
