import { type EntreeIndex, type Id, type ResumeContenu, rangerLesToiles } from '@notak/tableau'
import type { BilanRangement, EntreeBibliotheque } from '../api'
import type { BilanImport } from '../importation'
import { t } from '../langue'
import { avecApercus } from '../bibliotheque/modele'
import type { SourceVignettes } from '../bibliotheque/Vignettes'
import type { FicheToile } from './catalogue'
import type { EspaceLocal } from './espace'
import { fichiersLocaux } from './fichiers'
import { cleVu, lireVus, noterVu } from './vus'

/**
 * La bibliothèque de l'app, celle du bureau (`PageBibliotheque`), sur les toiles de l'appareil : l'index dit quelles
 * toiles existent, le catalogue ce qu'elles contiennent, la règle commune (`rangerLesToiles`) où chacune est rangée et
 * lesquelles sont à la corbeille ; les favoris voyagent avec l'index. Les récents sont ce qu'on a ouvert sur l'appareil,
 * et ce qu'on a ajouté, changé ou déplacé, que les toiles retiennent (le catalogue le lit). Ranger, c'est changer les
 * toiles elles-mêmes (comme sur le serveur) : personne d'autre ne les voit, il n'y a pas d'accès à peser.
 */

/** Rien ne change pour personne : l'app n'a pas d'autres comptes. */
const BILAN_VIDE: BilanRangement = { nouveaux: 0, perdus: 0, permanents: 0, liensOuverts: 0, liensEteints: 0 }
/** Tant de toiles inconnues du catalogue se lisent avant de montrer la page ; les autres, ensuite, en tâche de fond. */
const LUES_D_ABORD = 24
/** Les fiches qui arrivent en rafale (une première lecture, une synchro) redessinent la page une fois. */
const REGROUPER = 250

type ResumeToile = Extract<ResumeContenu, { genre: 'toile' }>

/**
 * Les entrées de l'appareil, comme celles qu'un serveur rend (`GET /api/bibliotheque`) : chaque toile hors l'accueil
 * et la corbeille, avec la toile qui la range ; chaque page, carte mentale, photo, lien et fichier qu'elles portent,
 * l'accueil compris. `vu` : la dernière fois qu'on l'a ouverte ici (`vus`), ajoutée, changée ou déplacée (les gestes
 * des fiches), ce qui range les récents.
 */
export function entreesDeLAppareil(
  toiles: readonly EntreeIndex[],
  racine: Id,
  fiches: ReadonlyMap<Id, Pick<FicheToile, 'resumes' | 'gestes'>>,
  favoris: ReadonlyMap<string, number>,
  vus: Readonly<Record<string, number>>,
): EntreeBibliotheque[] {
  const titres = new Map(toiles.map((e) => [e.id, e.titre || (e.id === racine ? t('biblio.accueil') : '')]))
  // Ce qu'on a ajouté, changé ou déplacé compte comme ce qu'on a ouvert, comme sur un serveur. Un geste d'avant
  // l'arrivée de la toile dans l'espace n'est pas le sien : une copie reçue porte les traces de qui l'a faite, et
  // l'édition locale y signe, chez chacun, du même nom.
  const recent = (toile: EntreeIndex, element: Id | null): number | null => {
    const geste = fiches.get(toile.id)?.gestes?.[element ?? '']
    const quand = [vus[cleVu(toile.id, element)], geste !== undefined && geste >= toile.cree ? geste : undefined].filter((v): v is number => typeof v === 'number')
    return quand.length ? Math.max(...quand) : null
  }
  const resumeDe = (id: Id) => fiches.get(id)?.resumes.find((r): r is ResumeToile => r.genre === 'toile')
  const { dossierDe, cachees } = rangerLesToiles(
    toiles.map((e) => {
      const r = resumeDe(e.id)
      return { id: e.id, parent: e.parent ?? null, ...(r?.cartes ? { cartes: r.cartes } : {}), ...(r?.jetees ? { jetees: r.jetees } : {}) }
    }),
  )
  const entrees: EntreeBibliotheque[] = []
  for (const e of toiles) {
    if (cachees.has(e.id)) continue
    if (e.id !== racine) {
      const dans = dossierDe(e.id)
      const { cartes: _c, jetees: _j, ...resume } = resumeDe(e.id) ?? { genre: 'toile' as const, element: '' as const, titre: e.titre, boites: [] }
      entrees.push({
        tableau: e.id,
        element: null,
        genre: 'toile',
        titre: e.titre,
        resume: { ...resume, titre: e.titre },
        ou: dans ? (titres.get(dans) ?? null) : null,
        dans,
        vu: recent(e, null),
        favori: favoris.has(`${e.id}/`),
        partage: false,
      })
    }
    for (const r of fiches.get(e.id)?.resumes ?? []) {
      if (r.genre === 'toile') continue
      entrees.push({
        tableau: e.id,
        element: r.element,
        genre: r.genre,
        titre: r.titre,
        resume: r,
        ou: titres.get(e.id) ?? null,
        dans: e.id,
        vu: recent(e, r.element),
        favori: favoris.has(`${e.id}/${r.element}`),
        partage: false,
      })
    }
  }
  return entrees
}

/** Ce que la page de la bibliothèque demande, pour les toiles de cet appareil. */
export function sourceLocale(
  el: EspaceLocal,
  {
    importer,
  }: {
    /** Importe des fichiers de la machine sur une toile ; une copie .notak passe par sa réouverture (et ses marques). */
    importer?: (fichiers: File[], dans: Id) => Promise<BilanImport>
  } = {},
) {
  const { index, reseau, catalogue } = el
  const enLecture = new Set<Id>()
  const lire = async (ids: readonly Id[]) => {
    const a = ids.filter((id) => !enLecture.has(id))
    a.forEach((id) => enLecture.add(id))
    try {
      await catalogue.completer(a, reseau.avec)
    } finally {
      a.forEach((id) => enLecture.delete(id))
    }
  }
  const charger = async (): Promise<EntreeBibliotheque[]> => {
    const toiles = index.lister()
    const manquantes = await catalogue.manquantes(toiles.map((e) => e.id))
    await lire(manquantes.slice(0, LUES_D_ABORD))
    // Le reste se lit derrière : chaque fiche qui arrive redessine la page (`ecouter`).
    if (manquantes.length > LUES_D_ABORD) void lire(manquantes.slice(LUES_D_ABORD))
    return avecApercus(entreesDeLAppareil(toiles, index.racine(), await catalogue.fiches(), index.favoris(), lireVus()))
  }
  return {
    charger,
    ecouter(f: () => void) {
      let minuteur: ReturnType<typeof setTimeout> | undefined
      const plusTard = () => {
        clearTimeout(minuteur)
        minuteur = setTimeout(f, REGROUPER)
      }
      const a = catalogue.ecouter(plusTard)
      const b = index.ecouter(plusTard)
      return () => {
        clearTimeout(minuteur)
        a()
        b()
      }
    },
    async rangerToile(toile: Id, parent: Id, options: { essai?: boolean } = {}) {
      if (!options.essai) index.declarer(toile, '', parent)
      return { ...BILAN_VIDE, fait: !options.essai }
    },
    async definirFavori(toile: Id, favori: boolean, element: Id | null = null) {
      index.definirFavori(`${toile}/${element ?? ''}`, favori)
    },
    /** Les photos de l'appareil ; l'image d'un lien venue d'un autre site attend l'accord d'une toile reçue. */
    vignettes: { adresse: fichiersLocaux.adresse, distant: (toile: Id) => !index.recu(toile) } satisfies SourceVignettes,
    async noterVu(e: Pick<EntreeBibliotheque, 'tableau' | 'element'>) {
      noterVu(cleVu(e.tableau, e.element))
    },
    ...(importer ? { importer } : {}),
  }
}
