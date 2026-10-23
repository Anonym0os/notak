import type { PassageCellule } from '../../coeur/tableau'
import { couleurSurlignage, couleurTexte } from './formats'
import { type Marque, enPassages, morceaux } from './riche'

/**
 * Le texte riche d'une cellule dans un élément éditable : on y écrit les passages (`rendre`), le navigateur gère la
 * frappe, et on relit texte et passages dans le DOM (`lire`). Les marques tiennent à des balises et des attributs
 * que nous seuls posons ; ce que le navigateur ajoute de lui-même (un `<b>` de plus) se lit pareil.
 */

/** Le style d'un passage coloré ou surligné, tel que la cellule le dessine hors édition. */
export function styleDePassage(m: Pick<Marque, 'couleur' | 'surligne'>): { color?: string; background?: string } {
  return {
    ...(m.couleur ? { color: couleurTexte(m.couleur) } : {}),
    ...(m.surligne ? { background: couleurSurlignage(m.surligne), color: m.surligne === 'grisFonce' ? '#fff' : 'var(--notak-surligne-texte)' } : {}),
  }
}

/** Le nœud d'un morceau : le texte, dans les balises de ses marques. */
function noeudDe(m: Marque & { texte: string }): Node {
  let noeud: Node = document.createTextNode(m.texte)
  const envelopper = (balise: string, regler?: (n: HTMLElement) => void) => {
    const e = document.createElement(balise)
    regler?.(e)
    e.append(noeud)
    noeud = e
  }
  if (m.couleur || m.surligne) {
    envelopper('span', (e) => {
      if (m.couleur) e.dataset.couleur = m.couleur
      if (m.surligne) e.dataset.surligne = m.surligne
      Object.assign(e.style, styleDePassage(m))
    })
  }
  if (m.barre) envelopper('s')
  if (m.italique) envelopper('i')
  if (m.gras) envelopper('b')
  if (m.lien) {
    envelopper('a', (e) => {
      e.dataset.lien = m.lien!
      e.setAttribute('href', m.lien!)
      e.setAttribute('target', '_blank')
      e.setAttribute('rel', 'noopener noreferrer')
    })
  }
  return noeud
}

/** Écrit le texte et ses passages dans l'élément. Un texte qui finit par un retour à la ligne reçoit un `<br>` de sentinelle, sans quoi la ligne n'existe pas. */
export function rendre(racine: HTMLElement, texte: string, passages: readonly PassageCellule[]): void {
  racine.replaceChildren(...morceaux(texte, passages).map(noeudDe))
  if (texte.endsWith('\n')) {
    const br = document.createElement('br')
    br.dataset.fin = ''
    racine.append(br)
  }
}

const marquesDeNoeud = (e: HTMLElement, h: Marque): Marque => {
  const m: Marque = { ...h }
  const balise = e.tagName
  if (balise === 'B' || balise === 'STRONG' || Number.parseInt(e.style.fontWeight, 10) >= 600 || e.style.fontWeight === 'bold') m.gras = true
  if (balise === 'I' || balise === 'EM' || e.style.fontStyle === 'italic') m.italique = true
  if (balise === 'S' || balise === 'STRIKE' || balise === 'DEL' || e.style.textDecoration.includes('line-through')) m.barre = true
  if (balise === 'A') {
    const adresse = e.dataset.lien ?? e.getAttribute('href')
    if (adresse) m.lien = adresse
  }
  if (e.dataset.couleur) m.couleur = e.dataset.couleur
  if (e.dataset.surligne) m.surligne = e.dataset.surligne
  return m
}

/** Le texte et les passages que l'élément montre à présent. */
export function lire(racine: HTMLElement): { texte: string; passages: PassageCellule[] } {
  let texte = ''
  const marques: Marque[] = []
  const parcourir = (n: Node, h: Marque) => {
    if (n.nodeType === 3) {
      const t = (n.textContent ?? '').replace(/ /g, ' ')
      for (let i = 0; i < t.length; i++) marques.push({ ...h })
      texte += t
    } else if (n instanceof HTMLElement) {
      if (n.tagName === 'BR') {
        // La sentinelle de fin ne compte pas ; un autre `<br>` (le navigateur en pose) est un retour à la ligne.
        if (n.dataset.fin === undefined && n !== racine.lastChild) {
          texte += '\n'
          marques.push({ ...h })
        }
        return
      }
      const suite = marquesDeNoeud(n, h)
      n.childNodes.forEach((c) => parcourir(c, suite))
    }
  }
  racine.childNodes.forEach((c) => parcourir(c, {}))
  return { texte, passages: enPassages(marques) }
}

/** Le décalage, dans le texte de l'élément, d'un point (nœud, position) du DOM. */
function decalage(racine: HTMLElement, noeud: Node, position: number): number {
  const r = document.createRange()
  r.selectNodeContents(racine)
  try {
    r.setEnd(noeud, position)
  } catch {
    return (racine.textContent ?? '').length
  }
  return r.toString().replace(/ /g, ' ').length
}

/** La sélection de l'élément, en décalages dans le texte ; `null` si elle est ailleurs. */
export function selectionDe(racine: HTMLElement): { de: number; a: number } | null {
  const s = document.getSelection()
  if (!s || s.rangeCount === 0 || !s.anchorNode || !s.focusNode) return null
  if (!racine.contains(s.anchorNode) || !racine.contains(s.focusNode)) return null
  const ancre = decalage(racine, s.anchorNode, s.anchorOffset)
  const tete = decalage(racine, s.focusNode, s.focusOffset)
  return { de: Math.min(ancre, tete), a: Math.max(ancre, tete) }
}

/** Le point du DOM qui est à ce décalage dans le texte. */
function pointA(racine: HTMLElement, cible: number): { noeud: Node; position: number } {
  let reste = cible
  const textes: Text[] = []
  const collecter = (n: Node) => {
    if (n.nodeType === 3) textes.push(n as Text)
    else n.childNodes.forEach(collecter)
  }
  collecter(racine)
  for (const t of textes) {
    const long = t.data.length
    if (reste <= long) return { noeud: t, position: reste }
    reste -= long
  }
  const dernier = textes.at(-1)
  return dernier ? { noeud: dernier, position: dernier.data.length } : { noeud: racine, position: 0 }
}

/** Pose la sélection de l'élément sur ces décalages. */
export function poserSelection(racine: HTMLElement, de: number, a: number): void {
  const s = document.getSelection()
  if (!s) return
  const debut = pointA(racine, de)
  const fin = pointA(racine, a)
  const r = document.createRange()
  r.setStart(debut.noeud, debut.position)
  r.setEnd(fin.noeud, fin.position)
  s.removeAllRanges()
  s.addRange(r)
}

/** Remplace la sélection de l'élément par ce texte (un collage, un retour à la ligne), curseur derrière. */
export function insererTexte(racine: HTMLElement, texte: string): void {
  const s = document.getSelection()
  if (!s || s.rangeCount === 0 || !racine.contains(s.anchorNode)) return
  const r = s.getRangeAt(0)
  r.deleteContents()
  const noeud = document.createTextNode(texte)
  r.insertNode(noeud)
  r.setStartAfter(noeud)
  r.collapse(true)
  s.removeAllRanges()
  s.addRange(r)
}
