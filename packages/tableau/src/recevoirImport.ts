import { blocsDepuisMarkdown } from './blocs/collageMarkdown'
import type { Point } from './coeur/geometrie'
import { type Element, type Operation, texteBrut } from './coeur/tableau'
import { nouveauDocument } from './elements/document/texte'
import { marquerDepot, tousLesRecepteurs } from './elements/registre'
import type { ContexteToile } from './elements/types'

/**
 * Des fichiers qu'on importe : lâchés sur la bibliothèque, ou choisis par Fichier › Importer… dans Notak de bureau.
 * Chacun devient ce qu'il deviendrait lâché sur la toile (une carte mentale pour un `.xmind`, une image, une table
 * pour un `.csv`, un fichier joint pour le reste), sauf un texte : un `.md` ou un `.txt` devient un document, comme
 * un import dans Notion. Lâché sur la toile, un texte reste un fichier joint, comme chez Milanote.
 */

/** Ce qui s'importe en document. */
export const EST_UN_TEXTE = /\.(md|markdown|txt|text)$/i

/** L'événement que la page lance pour Fichier › Importer… : la toile ouverte le prend (`preventDefault`), sinon l'hôte. */
export const EVENEMENT_IMPORT = 'notak:importer'
export type DetailImport = { fichiers: File[] }

/**
 * Un texte en document, son Markdown en blocs. Comme dans Notion, un titre de premier niveau en tête devient le titre
 * du document ; sinon, c'est le nom du fichier sans son extension.
 */
export async function documentDuTexte(f: File, ou: Point): Promise<Element> {
  const blocs = blocsDepuisMarkdown(await f.text())
  const tete = blocs[0]?.type === 'heading' && blocs[0].attrs?.level === 1 ? texteBrut(blocs[0]).trim() : ''
  const corps = tete ? blocs.slice(1) : blocs
  const e = nouveauDocument(Math.round(ou.x), Math.round(ou.y))
  return {
    ...e,
    contenu: { ...e.contenu, titre: tete || f.name.replace(/\.[^.]+$/, ''), texte: { type: 'doc', content: corps.length ? corps : [{ type: 'paragraph' }] } },
  }
}

/**
 * Les opérations qui posent ces fichiers sur la toile de `contexte`, de gauche à droite à partir de `ou`. Chacun passe
 * seul devant les récepteurs : un `.xmind` ne fait pas oublier le PDF lâché avec lui.
 */
export async function operationsDImport(fichiers: readonly File[], ou: Point, contexte: ContexteToile): Promise<Operation[]> {
  const ops: Operation[] = []
  let x = ou.x
  for (const f of fichiers) {
    const pas: Operation[] = []
    if (EST_UN_TEXTE.test(f.name)) pas.push({ type: 'creer', element: await documentDuTexte(f, { x, y: ou.y }) })
    else {
      const donnees = new DataTransfer()
      donnees.items.add(f)
      marquerDepot(donnees)
      for (const r of tousLesRecepteurs()) {
        const venus = await r.recevoir(donnees, { x, y: ou.y }, contexte)
        if (!venus || venus.length === 0) continue
        pas.push(...venus)
        if (!r.cumulable) break
      }
    }
    const poses = pas.flatMap((op) => (op.type === 'creer' && !op.element.parent ? [op.element] : []))
    if (poses.length > 0) x = Math.max(...poses.map((e) => e.x + e.largeur)) + 2
    ops.push(...pas)
  }
  return ops
}
