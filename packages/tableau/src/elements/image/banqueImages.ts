import { useSyncExternalStore } from 'react'
import type { Point } from '../../coeur/geometrie'
import { type Image as ContenuImage, nouvelId } from '../../coeur/tableau'
import { t } from '../../langue'
import type { ContexteToile, ImageDeBanque } from '../types'
import { hauteurPour, largeurInitiale } from './geometrie'

/** La largeur de la copie que le serveur rapatrie (`large2x` de la banque), au plus celle de l'original. */
export const LARGEUR_COPIE = 1880

const CLE_HISTORIQUE = 'notak:banque:recherches'
/** Combien de mots (ceux du titre, puis les recherches) le menu garde au plus. */
export const MOTS_MAX = 10

// — Ouvert ou fermé : l'outil de la barre et le panneau ne se connaissent pas, ils se parlent ici. —
let ouverte = false
const abonnes = new Set<() => void>()
const changer = (v: boolean) => {
  if (ouverte === v) return
  ouverte = v
  abonnes.forEach((f) => f())
}
export const basculerBanque = () => changer(!ouverte)
export const fermerBanque = () => changer(false)
export const banqueOuverte = () => ouverte
export const useBanqueOuverte = () =>
  useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    () => ouverte,
    () => false,
  )

const MOTS_VIDES = new Set(
  'le la les un une des du de d l et ou à au aux en sur sous dans par pour avec sans mon ma mes ton ta tes son sa ses ce cet cette ces the a an of and or to in on for with my your our his her its this that'.split(' '),
)

/** Les mots d'un titre qui valent une recherche : sans signes ni mots vides, et seulement s'il y en a plusieurs. */
export function motsDuTitre(titre: string): string[] {
  const mots = titre
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m))
  const uniques = [...new Set(mots)]
  return uniques.length > 1 ? uniques : []
}

/** Les dernières recherches tapées, la plus récente en tête ; vide si le navigateur refuse le stockage. */
export function lireHistorique(): string[] {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE_HISTORIQUE) ?? '[]')
    return Array.isArray(brut) ? brut.filter((x): x is string => typeof x === 'string').slice(0, MOTS_MAX) : []
  } catch {
    return []
  }
}

/** Ajoute une recherche en tête (en minuscules, sans doublon) et rend l'historique à jour. */
export function noterRecherche(terme: string): string[] {
  const mot = terme.trim().toLowerCase()
  const actuel = lireHistorique()
  if (!mot) return actuel
  const suite = [mot, ...actuel.filter((x) => x !== mot)].slice(0, MOTS_MAX)
  try {
    localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(suite))
  } catch {
    // stockage refusé : la recherche vaut pour la session seulement
  }
  return suite
}

/** Les entrées du menu après « Recommandées » : les mots du titre, puis les recherches, dix au plus. */
export const motsDuMenu = (titre: string, historique: string[]): string[] => [...new Set([...motsDuTitre(titre), ...historique])].slice(0, MOTS_MAX)

/**
 * Pose une image de la banque sur la toile, centrée sur `ou` (en UG) : le serveur la rapatrie dans les fichiers
 * du tableau, puis elle naît avec son crédit en légende. Rend vrai si elle a été posée.
 */
export async function poserImageDeBanque(image: ImageDeBanque, ou: Point, contexte: ContexteToile): Promise<boolean> {
  const { rapatrier } = contexte.services
  if (!rapatrier || contexte.services.lectureSeule) return false
  const { id, type } = await rapatrier(image.grande)
  const largeurOrigine = Math.max(1, Math.min(image.largeur || LARGEUR_COPIE, LARGEUR_COPIE))
  const hauteurOrigine = Math.max(1, Math.round((largeurOrigine * (image.hauteur || 1)) / (image.largeur || 1)))
  const contenu: ContenuImage = { type: 'image', fichier: id, largeurOrigine, hauteurOrigine, typeMime: type, legende: t('image.banque.credit', { nom: image.auteur }) }
  const largeur = largeurInitiale(largeurOrigine)
  const hauteur = hauteurPour(largeur, contenu)
  contexte.magasin.faire([{ type: 'creer', element: { id: nouvelId(), x: Math.round(ou.x - largeur / 2), y: Math.round(ou.y - hauteur / 2), largeur, contenu } }])
  return true
}

/** Des fichiers pris au sélecteur ou déposés : ils passent aux récepteurs de la toile, au milieu de la vue. */
export function envoyerFichiers(fichiers: Iterable<File>, contexte: ContexteToile) {
  const d = new DataTransfer()
  for (const f of fichiers) d.items.add(f)
  if (d.files.length === 0) return false
  contexte.recevoir(d, contexte.centreVue())
  return true
}
