import type { GenreLien, Lien } from '../../coeur/tableau'
import type { Point } from '../../coeur/geometrie'
import { type Element, nouvelId } from '../../coeur/tableau'
import { registre } from '../registre'
import { lireAdresse } from './adresse'
import { RenduLien, titreDuLien } from './Lien'
import './lien.css'
import { OutilsLien } from './Outils'

const LARGEUR_LIEN = 34

const GENRES: { genre: GenreLien; libelle: string; icone: string; rang: number }[] = [
  { genre: 'video', libelle: 'Vidéo', icone: '▶', rang: 21 },
  { genre: 'audio', libelle: 'Audio', icone: '♪', rang: 22 },
  { genre: 'carte', libelle: 'Carte', icone: '⌖', rang: 23 },
]

const nouveauLien = (ou: Point, url: string, genre?: GenreLien): Element<Lien> => ({
  id: nouvelId(),
  x: Math.round(ou.x),
  y: Math.round(ou.y),
  largeur: LARGEUR_LIEN,
  contenu: { type: 'lien', url, statut: 'attente', ...(genre ? { genre } : {}) },
})

registre.type<Lien>({
  type: 'lien',
  nom: 'Lien',
  resume: (c) => titreDuLien(c) || c.url,
  Rendu: RenduLien,
  editable: true,
  hauteurParDefaut: 20,
  sansFond: true,
  hauteurBornable: true,
  Outils: OutilsLien,
  outils: [
    {
      libelle: 'Lien',
      icone: '↗',
      rang: 20,
      fantome: () => nouveauLien({ x: 0, y: 0 }, ''),
      creer: (ou) => [{ type: 'creer', element: nouveauLien(ou, '') }],
    },
    ...GENRES.map(({ genre, libelle, icone, rang }) => ({
      libelle,
      icone,
      rang,
      tiroir: true,
      fantome: () => nouveauLien({ x: 0, y: 0 }, '', genre),
      // Un lien vide, en édition : on y colle l'adresse de la vidéo, du morceau ou de la carte.
      creer: (ou: Point) => [{ type: 'creer' as const, element: nouveauLien(ou, '', genre) }],
    })),
  ],
})

/** Plusieurs adresses collées ou déposées se posent l'une sous l'autre, à ce pas (UG). */
const PAS_ADRESSES = 12

registre.recepteur({
  priorite: 30,
  recevoir(donnees, ou) {
    // Une liste d'adresses (glissées d'un navigateur, ou une par ligne) : un lien chacune, tant qu'aucune ligne
    // n'est autre chose qu'une adresse.
    const brut = donnees.getData('text/uri-list') || donnees.getData('text/plain')
    const lignes = brut.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    const urls = lignes.map(lireAdresse)
    if (urls.length === 0 || urls.some((u) => !u)) return null
    return [...new Set(urls as string[])].map((url, i) => ({ type: 'creer' as const, element: nouveauLien({ x: ou.x, y: ou.y + i * PAS_ADRESSES }, url) }))
  },
})
