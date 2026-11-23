import { textesEn, textesFr } from '@notak/tableau'
import type { EntreeBibliotheque } from '../api'
import { en as enWeb, fr as frWeb } from '../langue'
import { genere, neLe } from './modele'

/**
 * Ce qui reste vide, sous le nom qu'il a reçu en naissant, et n'a jamais rien porté part de lui-même à la corbeille :
 * une « Nouvelle toile » qu'on a ouverte puis quittée sans rien y poser, un « Nouveau dossier » jamais rempli, une page
 * sans titre ni texte, une carte mentale réduite à son « Sujet central ». Comme une note vide des Notes d'iOS, qui
 * disparaît quand on la quitte ; mais à la corbeille, d'où l'on peut la reprendre, et avec un avis qui le dit.
 *
 * Ce qui a une histoire reste : une toile vidée après avoir porté quelque chose, une page dont on a effacé le texte.
 * Le serveur le lit dans l'activité (`EntreeBibliotheque.vierge`) ; sans lui (l'app sur l'appareil), rien ne part.
 */

/**
 * Ce qui vient d'être créé, ou touché, n'est pas encore jugé : une création peut être en cours (l'agent pose une toile,
 * puis ce qu'elle porte ; quelqu'un l'a ouverte il y a un instant).
 */
export const DELAI_VIDES = 10 * 60_000

/** Un nom d'origine, en français comme en anglais : une chose garde celui qu'elle a reçu dans la langue de qui l'a créée. */
const deuxLangues = (cle: string) => [textesFr[cle], textesEn[cle], frWeb[cle], enWeb[cle]].filter((x): x is string => typeof x === 'string')
const NOMS_DE_TOILE = new Set(['', ...deuxLangues('tableau.nouveau'), ...deuxLangues('biblio.dossier.nouveau')])
const NOMS_DE_CARTE = new Set(['', ...deuxLangues('arbre.central')])

/** Ces entrées-ci partent : à soi (ni partagées, ni générées par un outil, ni en favori), vides, sans nom, sans histoire. */
export function videsAJeter(toutes: readonly EntreeBibliotheque[], maintenant = Date.now()): EntreeBibliotheque[] {
  // Les toiles qui portent quelque chose qui a sa tuile (une page, une photo, une toile) : elles ne sont pas vides.
  const portent = new Set(toutes.flatMap((e) => (e.dans && !(e.element === null && e.tableau === e.dans) ? [e.dans] : [])))
  return toutes.filter((e) => {
    if (e.vierge !== true || e.partage || e.favori || genere(e) || e.fiche) return false
    // Née il y a moins de dix minutes, ou touchée depuis : on attend.
    const nee = neLe(e, maintenant)
    if (nee === null || maintenant - nee < DELAI_VIDES) return false
    if (e.vu !== null && maintenant - e.vu < DELAI_VIDES) return false
    const r = e.resume
    const titre = e.titre.trim()
    switch (r.genre) {
      case 'toile':
        return e.element === null && NOMS_DE_TOILE.has(titre) && r.boites.length === 0 && !r.nonTries && !portent.has(e.tableau)
      case 'document':
        return titre === '' && r.lignes.every((l) => l.trim() === '')
      case 'arbre':
        return NOMS_DE_CARTE.has(titre) && r.branches.length === 0
      default:
        return false
    }
  })
}
