import type { GenreLien, Lien } from '../../coeur/tableau'
import type { Point } from '../../coeur/geometrie'
import { type Element, nouvelId } from '../../coeur/tableau'
import { registre } from '../registre'
import { lireAdresse } from './adresse'
import { largeurMinLien, proportionLien } from './affichage'
import { RenduLien, titreDuLien } from './Lien'
import './lien.css'
import { OutilsLien } from './Outils'
import { t } from '../../langue'
import { type NomIcone, ico } from '../../icones'
import { couleurDuContenu } from '../couleur'
import { OutilCouleurCarte } from '../couleur/OutilCouleurCarte'

const LARGEUR_LIEN = 34

const GENRES: { genre: GenreLien; libelle: string; icone: NomIcone; rang: number }[] = [
  // Dans « ••• » de la barre de création, l'ordre de Milanote : Audio, Carte, Vidéo.
  { genre: 'audio', get libelle() { return t('lien.audio') }, icone: 'audio', rang: 230 },
  { genre: 'carte', get libelle() { return t('lien.carte') }, icone: 'carte', rang: 240 },
  { genre: 'video', get libelle() { return t('lien.video') }, icone: 'lecture', rang: 250 },
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
  get nom() {
    return t('type.lien')
  },
  resume: (c) => titreDuLien(c) || c.url,
  Rendu: RenduLien,
  editable: true,
  hauteurParDefaut: 7,
  sansFond: true,
  hauteurBornable: true,
  // 4 UG avec un média (comme une image), 17 sans ; une vidéo seule garde ses proportions.
  largeurMin: largeurMinLien,
  proportion: proportionLien,
  Outils: OutilCouleurCarte,
  // La couleur est une barre de 5 px en haut de la carte (le fond reste blanc), pas une teinte.
  couleur: couleurDuContenu<Lien>(),
  OutilsApres: OutilsLien,
  outils: [
    {
      get libelle() {
        return t('type.lien')
      },
      icone: ico('lien'),
      rang: 20,
      vignette: 'lien',
      fantome: () => nouveauLien({ x: 0, y: 0 }, ''),
      creer: (ou) => [{ type: 'creer', element: nouveauLien(ou, '') }],
    },
    ...GENRES.map(({ genre, libelle, icone, rang }) => ({
      libelle,
      icone: ico(icone),
      rang,
      vignette: genre,
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

// Copier l'adresse n'a pas de tuile : il est au menu « ••• » de la barre, comme chez Milanote (on ouvre en cliquant l'en-tête).
const liensAvecAdresse = (els: Element[]) => els.length > 0 && els.every((e) => e.contenu.type === 'lien' && !!e.contenu.url)
const adressesDe = (els: Element[]) => els.flatMap((e) => (e.contenu.type === 'lien' ? [e.contenu.url] : []))

registre.entreeMenu({
  get libelle() {
    return t('lien.copierAdresse')
  },
  visible: (els) => liensAvecAdresse(els),
  faire: (els) => void navigator.clipboard.writeText(adressesDe(els).join('\n')),
})
