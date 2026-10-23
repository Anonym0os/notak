import { regional } from './formats'
import type { Id } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { collerA, copiable } from './actions'
import { derniereCopie, lireEtat, retenirCopie } from './etat'
import { evaluerTable } from './formules'
import { normaliserPlage, viderPlage } from './grille'
import { modifierTable } from './modifier'
import { lireCollage } from './pressePapiers'

/** Les valeurs calculées d'une plage : une formule donne son résultat, le reste son texte. */
function valeursDe(cellules: readonly (readonly string[])[], l1: number, c1: number, l2: number, c2: number): string[][] {
  const calculs = evaluerTable(cellules)
  const sortie: string[][] = []
  for (let l = l1; l <= l2; l++) {
    const ligne: string[] = []
    for (let c = c1; c <= c2; c++) {
      const brut = cellules[l]?.[c] ?? ''
      const r = calculs[l]?.[c]
      if (!brut.startsWith('=')) ligne.push(brut)
      else if (!r || r.erreur || r.valeur === null) ligne.push('')
      else ligne.push(typeof r.valeur === 'number' ? String(Number(r.valeur.toPrecision(15))) : String(r.valeur))
    }
    sortie.push(ligne)
  }
  return sortie
}

/**
 * Ce qu'une copie ou une coupe de cette table met dans le presse-papiers (texte et HTML), et ce qu'on retient pour
 * le collage : d'où ça vient, et la source à vider si c'était une coupe.
 */
export function preparerCopie(contexte: ContexteToile, id: Id, couper: boolean): { texte: string; html: string } | null {
  const el = contexte.magasin.lire().elements.find((x) => x.id === id)
  const plages = lireEtat(id).plages
  if (!el || el.contenu.type !== 'table') return null
  const copie = copiable(el.contenu, plages)
  if (!copie) return null
  const p = copie.plage
  retenirCopie({
    id,
    texte: copie.texte,
    origine: { l: p.l1, c: p.c1 },
    valeurs: valeursDe(el.contenu.cellules, p.l1, p.c1, p.l2, p.c2),
    coupe: couper ? p : null,
  })
  return { texte: copie.texte, html: copie.html }
}

/**
 * Colle ce qu'il y a dans le presse-papiers à partir de la première cellule choisie. Notre propre copie garde ses
 * formats et décale ses formules ; une coupe vide sa source. `valeursSeules` : le texte seul, sans mise en forme.
 */
export function collerDansTable(contexte: ContexteToile, id: Id, html: string | null, texte: string, valeursSeules = false): boolean {
  const plages = lireEtat(id).plages
  const premiere = plages[0]
  if (!premiere) return false
  const derniere = derniereCopie()
  const memo = derniere && derniere.texte === texte ? derniere : null
  const donnees = valeursSeules ? lireCollage(null, memo ? memo.valeurs.map((l) => l.join('\t')).join('\n') : texte) : lireCollage(html, texte)
  const ancre = normaliserPlage(premiere)
  const decalage = memo && !valeursSeules ? { dl: ancre.l1 - memo.origine.l, dc: ancre.c1 - memo.origine.c } : null
  const coupe = memo?.coupe ?? null
  const viderIci = !!coupe && memo?.id === id
  const fait = modifierTable(contexte, id, (table) => collerA(viderIci ? viderPlage(table, coupe) : table, plages, donnees, decalage, regional()))
  if (fait && memo && coupe) {
    if (memo.id !== id) modifierTable(contexte, memo.id, (table) => ({ table: viderPlage(table, coupe) }))
    retenirCopie({ ...memo, coupe: null })
  }
  return fait
}

/** Le presse-papiers du système, lu à la demande d'un menu (le collage au clavier passe par l'événement `paste`). */
export async function collerDepuisLeSysteme(contexte: ContexteToile, id: Id, valeursSeules: boolean): Promise<void> {
  let html: string | null = null
  let texte = ''
  try {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text()
      if (item.types.includes('text/plain')) texte = await (await item.getType('text/plain')).text()
    }
  } catch {
    try {
      texte = await navigator.clipboard.readText()
    } catch {
      return
    }
  }
  collerDansTable(contexte, id, html, texte, valeursSeules)
}
