import type { Point } from './coeur/geometrie'
import type { Element, Id, Operation } from './coeur/tableau'
import { suivreEnvois } from './elements/envois'
import type { ContexteToile, Services } from './elements/types'
import { placerALaSuite } from './EspaceNotak'
import { type EspaceRangement, quandPretes } from './rangement'
import { operationsDImport } from './recevoirImport'

/** Ce que les récepteurs lisent d'une toile, quand aucune n'est ouverte : la vue d'un écran ordinaire, rien de choisi. */
function contexteHorsToile(magasin: ContexteToile['magasin'], services: Services): ContexteToile {
  const rien = () => {}
  return {
    magasin,
    services,
    camera: { origine: { x: 0, y: 0 }, echelle: 1 },
    rect: () => null,
    versTableau: (p: Point) => p,
    largeurVue: () => 1280,
    recevoir: rien,
    centreVue: () => ({ x: 0, y: 0 }),
    selection: new Set(),
    choisir: rien,
    commencerEdition: rien,
    brouillonDe: rien,
    montrer: rien,
    jeter: rien,
    creerSuivant: rien,
    prendrePointEdition: () => null,
  } as unknown as ContexteToile
}

/**
 * Importe ces fichiers sur la toile `toile`, sans qu'elle soit ouverte : posés à la suite de ce qu'elle porte. Rend ce
 * qui y est né (vide si rien n'a pris).
 */
export async function importerSurLaToile(espace: EspaceRangement, toile: Id, fichiers: readonly File[], services: Services): Promise<Element[]> {
  await quandPretes(espace, [toile])
  const magasin = espace.magasin(toile)
  const ops = await operationsDImport(fichiers, { x: 0, y: 0 }, contexteHorsToile(magasin, services))
  const nes = ops.flatMap((op) => (op.type === 'creer' ? [op.element] : []))
  if (nes.length === 0) return []
  const poses = placerALaSuite(magasin.lire(), nes)
  magasin.faire(poses.map((element): Operation => ({ type: 'creer', element })))
  // Personne ne dessine ces éléments : c'est ici qu'ils prennent leur vrai fichier, la fin de l'envoi venue.
  suivreEnvois(magasin, poses)
  return poses
}
