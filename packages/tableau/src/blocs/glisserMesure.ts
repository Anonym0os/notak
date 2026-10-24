import type { Editor } from '@tiptap/react'
import type { ColonneMesuree } from './depot'
import { PAS_RETRAIT, type Ligne } from './glisser'
import { type Bloc, blocsDe } from './modele'

/**
 * Le DOM de la poignée et du glisser : les lignes du texte mesurées dans le repère de la zone qui défile, le retrait
 * d'un niveau lu sur la page, le centre de la première ligne d'un bloc, et le fantôme qu'on tire. Les décisions sont
 * dans `glisser.ts`, `depot.ts` et `rectangle.ts` ; ici, tout ce qui a besoin d'un navigateur.
 */

export interface Mesure {
  lignes: Ligne[]
  colonnes: ColonneMesuree[]
  fins: Map<string | null, number>
}

/** L'origine de la zone dans l'écran : retirer cela d'un point de l'écran donne un point du contenu qui défile. */
export function origine(zone: HTMLElement): { x: number; y: number } {
  const r = zone.getBoundingClientRect()
  return { x: r.left - zone.scrollLeft + zone.clientLeft, y: r.top - zone.scrollTop + zone.clientTop }
}

/** Le retrait d'un niveau : la variable `--notak-pas-retrait` que pose la page, 32 px à défaut. */
export function pasRetrait(el: HTMLElement): number {
  const v = Number.parseFloat(getComputedStyle(el).getPropertyValue('--notak-pas-retrait'))
  return Number.isFinite(v) && v > 0 ? v : PAS_RETRAIT
}

/** Les lignes visibles du texte (un bloc caché par un dépliant fermé n'en a pas), les colonnes, et la fin de chaque conteneur. */
export function mesurer(editeur: Editor, zone: HTMLElement): Mesure {
  const vue = editeur.view
  const { x: ox, y: oy } = origine(zone)
  const blocs = blocsDe(vue.state.doc)
  const parId = new Map(blocs.map((b) => [b.id, b]))
  const lignes: Ligne[] = []
  const colonnes: ColonneMesuree[] = []
  const cadres = new Map<string | null, { gauche: number; droite: number }>()
  const fins = new Map<string | null, number>([[null, vue.state.doc.content.size]])
  const indices = new Map<string, number>()
  for (const b of blocs) {
    const dom = vue.nodeDOM(b.pos)
    if (!(dom instanceof HTMLElement) || !b.id) continue
    const r = dom.getBoundingClientRect()
    const rect = { gauche: r.left - ox, haut: r.top - oy, droite: r.right - ox, bas: r.bottom - oy }
    if (b.type === 'colonne') {
      fins.set(b.id, b.fin - 1)
      const frere = blocs.find((x) => x.id === b.parent)
      const indice = indices.get(b.parent ?? '') ?? 0
      indices.set(b.parent ?? '', indice + 1)
      colonnes.push({ id: b.id, rangee: b.parent ?? '', indice, total: frere?.enfants.length ?? indice + 1, blocs: [], ...rect })
      continue
    }
    if (r.height === 0 && r.width === 0) continue
    // La colonne qui le contient, et son rang dans son conteneur.
    let colonne = b.parent ? parId.get(b.parent) : undefined
    while (colonne && colonne.type !== 'colonne') colonne = colonne.parent ? parId.get(colonne.parent) : undefined
    const niveau = b.profondeur - (colonne ? colonne.profondeur + 1 : 0)
    const conteneur = colonne?.id ?? null
    if (niveau <= 0 || !cadres.has(conteneur)) cadres.set(conteneur, { gauche: rect.gauche, droite: rect.droite })
    lignes.push({
      id: b.id,
      type: b.type,
      pos: b.pos,
      fin: b.fin,
      niveau: Math.max(0, niveau),
      parent: b.parent,
      conteneur,
      cadre: cadres.get(conteneur)!,
      ferme: (b.type === 'deroulant' || b.type.startsWith('titreDeroulant')) && b.format.ouvert === false,
      aEnfants: b.enfants.length > 0,
      ...rect,
    })
    if (conteneur) colonnes.find((c) => c.id === conteneur)?.blocs.push(b.id)
  }
  return { lignes, colonnes, fins }
}

/**
 * Le milieu de la première ligne d'un bloc, dans l'écran : celui du premier caractère, ou, sans texte, le milieu d'une
 * ligne sous le haut du bloc (son remplissage compris). La poignée de 24 px s'y centre.
 */
export function centrePremiereLigne(dom: HTMLElement): number {
  const r = dom.getBoundingClientRect()
  const style = getComputedStyle(dom)
  const ligne = Number.parseFloat(style.lineHeight)
  const hauteurLigne = Number.isFinite(ligne) ? ligne : 24
  const marqueur = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) })
  const texte = marqueur.nextNode()
  if (texte) {
    const plage = document.createRange()
    plage.setStart(texte, 0)
    plage.setEnd(texte, 1)
    const rect = plage.getClientRects()[0]
    if (rect && rect.height > 0) return rect.top + rect.height / 2
  }
  const haut = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.borderTopWidth) || 0
  // Un bloc court (un séparateur) se centre sur lui-même.
  return r.top + Math.min(r.height / 2, haut + hauteurLigne / 2)
}

/** Le niveau d'un bloc dans son conteneur, la page ou sa colonne (0 au premier niveau). */
export function niveauRelatif(blocs: readonly Bloc[], b: Bloc): number {
  let colonne = b.parent ? blocs.find((x) => x.id === b.parent) : undefined
  while (colonne && colonne.type !== 'colonne') colonne = colonne.parent ? blocs.find((x) => x.id === colonne!.parent) : undefined
  return Math.max(0, b.profondeur - (colonne ? colonne.profondeur + 1 : 0))
}

/** Les ids des blocs d'un sous-arbre, de ses lignes visibles. */
export const lignesDe = (lignes: readonly Ligne[], pos: number, fin: number) => lignes.filter((l) => l.pos >= pos && l.pos < fin)

/**
 * Le fantôme d'un glisser : un clone des lignes tirées, à leur place, à 40 % d'opacité, sans événements, qu'une
 * translation fait suivre le pointeur. Les blocs d'origine restent où ils sont.
 */
export function creerFantome(editeur: Editor, zone: HTMLElement, lignes: readonly Ligne[]): { deplacer(dx: number, dy: number): void; retirer(): void } {
  const vue = editeur.view
  const { x: ox, y: oy } = origine(zone)
  const fantome = document.createElement('div')
  fantome.className = 'notak-blocs notak-texte notak-blocs-fantome'
  fantome.setAttribute('aria-hidden', 'true')
  for (const l of lignes) {
    const dom = vue.nodeDOM(l.pos)
    if (!(dom instanceof HTMLElement)) continue
    const copie = dom.cloneNode(true) as HTMLElement
    for (const el of [copie, ...copie.querySelectorAll<HTMLElement>('[data-bloc], [id], [contenteditable]')]) {
      el.removeAttribute('data-bloc')
      el.removeAttribute('id')
      el.removeAttribute('contenteditable')
    }
    copie.classList.remove('notak-bloc-choisi')
    const r = dom.getBoundingClientRect()
    Object.assign(copie.style, { position: 'absolute', left: `${r.left - ox}px`, top: `${r.top - oy}px`, width: `${r.width}px`, margin: '0', boxSizing: 'border-box' })
    fantome.append(copie)
  }
  zone.append(fantome)
  return {
    deplacer: (dx, dy) => {
      fantome.style.transform = `translate(${dx}px, ${dy}px)`
    },
    retirer: () => fantome.remove(),
  }
}
