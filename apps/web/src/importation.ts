import { type DepotFichiers, type Element, type EspaceNavigable, type Id, type Services, decoderNotak, importerSurLaToile, nouvelId, quandPretes } from '@notak/tableau'
import { ErreurImport, lireExportMilanote } from './milanote'
import { poserLePlan } from './Importer'
import { poserNotak } from './notak'

/**
 * Des fichiers de la machine importés sur une toile, sans l'ouvrir : lâchés sur la bibliothèque, ou choisis par
 * Fichier › Importer… dans Notak de bureau. Un `.notak` et un export Milanote (zip) deviennent des toiles, comme par
 * le bouton « Importer » ; le reste se pose sur la toile (`importerSurLaToile` : une carte mentale pour un `.xmind`, un
 * document pour un texte, un fichier joint sinon).
 */

export interface BilanImport {
  /** Ce qui est né sur la toile. */
  elements: Element[]
  /** Les toiles nées d'un `.notak` ou d'un export Milanote, avec leur titre. */
  toiles: { id: Id; titre: string }[]
  /** Les fichiers qui n'ont pas pu être lus. */
  refuses: string[]
}

/** Ce qui devient une toile, et non un élément : le format de Notak, et un zip qui est peut-être un export Milanote. */
export const devientUneToile = (f: File) => /\.(notak|zip)$/i.test(f.name)

export async function importerFichiers(fichiers: readonly File[], dans: Id, espace: EspaceNavigable, services: Services & { fichiers: DepotFichiers }): Promise<BilanImport> {
  await quandPretes(espace, [dans])
  const bilan: BilanImport = { elements: [], toiles: [], refuses: [] }
  const reste: File[] = []
  for (const f of fichiers) {
    if (/\.notak$/i.test(f.name)) {
      try {
        const { tete } = await poserNotak(decoderNotak(new Uint8Array(await f.arrayBuffer())), espace, dans, services.fichiers)
        bilan.toiles.push({ id: tete, titre: espace.tableau(tete)?.titre ?? '' })
      } catch {
        bilan.refuses.push(f.name)
      }
    } else if (/\.zip$/i.test(f.name)) {
      // Un zip qui n'est pas un export Milanote reste un fichier joint.
      try {
        const { tete } = await poserLePlan(lireExportMilanote(new Uint8Array(await f.arrayBuffer()), nouvelId), espace, dans, services.fichiers)
        bilan.toiles.push({ id: tete, titre: espace.tableau(tete)?.titre ?? '' })
      } catch (x) {
        if (x instanceof ErreurImport) reste.push(f)
        else bilan.refuses.push(f.name)
      }
    } else reste.push(f)
  }
  if (reste.length > 0) bilan.elements = await importerSurLaToile(espace, dans, reste, services)
  return bilan
}
