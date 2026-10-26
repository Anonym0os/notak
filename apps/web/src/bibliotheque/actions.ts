import {
  type EspaceNavigable,
  type Place,
  carteDeLaToile,
  creerDans,
  deplacer,
  dupliquer,
  jeter,
  quandPretes,
  rangerDansNeuve,
  renommerChose,
  resumesDuTableau,
} from '@notak/tableau'
import type { BilanRangement, EntreeBibliotheque } from '../api'
import type { BilanImport } from '../importation'
import { t, tn } from '../langue'
import type { Correctif } from './correctifs'
import { cleDe, porteuseDe } from './selection'

/**
 * Ce que font les gestes de la bibliothèque : chaque tuile est un élément d'une toile (sa carte, pour une toile), et
 * chaque geste passe par les toiles de l'espace comme s'il était fait sur elles. Le serveur range les toiles (leurs
 * accès suivent le dossier). Chaque geste rend ce qu'il dit, les correctifs à montrer d'ici que le serveur suive, et de
 * quoi le défaire.
 */

/** Ce que la bibliothèque demande à l'espace pour ranger. */
export type EspaceRangement = Pick<EspaceNavigable, 'racine' | 'magasin' | 'tableau' | 'ecouter' | 'creerTableau' | 'renommer' | 'lectureSeule' | 'synchronise'>

export interface Outils {
  espace: EspaceRangement
  rangerToile(tableau: string, parent: string, options?: { essai?: boolean; siPersonne?: boolean }): Promise<BilanRangement & { fait: boolean }>
  definirFavori(tableau: string, favori: boolean): Promise<void>
}

export interface Resultat {
  texte: string
  /** D'autres boutons pour l'avis, avant « Annuler » (« Voir »). */
  actions?: { libelle: string; faire(): void }[]
  correctifs: Correctif[]
  /** Défait le geste ; rend les correctifs qui le disent. */
  annuler?(): Promise<Correctif[]>
}

/** Toutes les toiles en jeu, arrivées du serveur, puis la place de chaque entrée (`null` : sa toile ne se lit pas). */
async function placesDe(espace: EspaceRangement, entrees: readonly EntreeBibliotheque[], autres: readonly string[] = []): Promise<(Place | null)[]> {
  const porteuses = [...new Set([...entrees.flatMap((e) => porteuseDe(e) ?? []), ...autres])]
  await quandPretes(espace, porteuses)
  return entrees.map((e) => {
    const toile = porteuseDe(e)
    if (toile === null) return null
    const element = e.element ?? carteDeLaToile(espace, toile, e.tableau)
    return element === null ? null : { toile, element }
  })
}

const rien = (): Resultat => ({ texte: t('biblio.annonce.rien'), correctifs: [] })

const CHAMPS_BILAN = ['nouveaux', 'perdus', 'permanents', 'liensOuverts', 'liensEteints'] as const

/**
 * Ce que change le rangement de plusieurs toiles : pour chaque ligne, le plus grand nombre d'une toile (les mêmes
 * personnes reçoivent souvent plusieurs toiles d'un même dossier ; les additionner les compterait plusieurs fois).
 */
export function bilanDe(bilans: readonly BilanRangement[]): BilanRangement {
  return Object.fromEntries(CHAMPS_BILAN.map((c) => [c, Math.max(0, ...bilans.map((b) => b[c]))])) as unknown as BilanRangement
}
export const changeQuelqueChose = (b: BilanRangement) => CHAMPS_BILAN.some((c) => b[c] > 0)

/**
 * Déplace ces entrées dans la toile `vers`. Ranger une toile ailleurs change qui voit ce qu'elle contient : le serveur
 * fait d'abord le bilan (qui y gagne ou y perd l'accès, les accès qui deviennent permanents, les liens de visiteurs
 * qui s'ouvrent ou s'éteignent), et `confirmer` le demande. Rend `null` si l'on renonce.
 */
export async function deplacerEntrees(
  o: Outils,
  entrees: readonly EntreeBibliotheque[],
  vers: { id: string; titre: string },
  confirmer: (bilan: BilanRangement) => Promise<boolean>,
): Promise<Resultat | null> {
  const mobiles = entrees.filter((e) => porteuseDe(e) !== vers.id && !(e.element === null && e.tableau === vers.id))
  if (mobiles.length === 0) return rien()
  const toiles = mobiles.filter((e) => e.element === null)
  const essais = await Promise.all(toiles.map((e) => o.rangerToile(e.tableau, vers.id, { essai: true })))
  const bilan = bilanDe(essais)
  if (changeQuelqueChose(bilan) && !(await confirmer(bilan))) return null
  const places = await placesDe(o.espace, mobiles, [vers.id])
  const voulues = mobiles.flatMap((e, i) => (places[i] ? [{ e, place: places[i]! }] : []))
  const d = deplacer(
    o.espace,
    voulues.map((x) => x.place),
    vers.id,
  )
  if (d.neufs.length === 0) return rien()
  const parties = new Map(d.neufs.map((n) => [`${n.de.toile}/${n.de.element}`, n.vers]))
  const rangees = d.toiles.map((x) => x.toile)
  await Promise.all(rangees.map((toile) => o.rangerToile(toile, vers.id).catch(() => {})))
  const correctifs: Correctif[] = voulues.flatMap(({ e, place }) => {
    const neuf = parties.get(`${place.toile}/${place.element}`)
    if (!neuf) return []
    const par = { ...e, element: e.element === null ? null : neuf.element, tableau: e.element === null ? e.tableau : neuf.toile, dans: vers.id, ou: vers.titre }
    return [{ type: 'remplacer' as const, de: cleDe(e), par }]
  })
  return {
    texte: tn('biblio.annonce.deplaces', correctifs.length, { toile: vers.titre || t('commun.sansTitre') }),
    correctifs,
    async annuler() {
      d.annuler()
      await Promise.all(d.toiles.map((x) => o.rangerToile(x.toile, x.de).catch(() => {})))
      return correctifs.flatMap((c) => {
        if (c.type !== 'remplacer') return []
        const avant = voulues.find((x) => cleDe(x.e) === c.de)!.e
        return [{ type: 'remplacer' as const, de: cleDe(c.par), par: avant }]
      })
    },
  }
}

/** Range ces entrées dans une toile neuve, posée sur `ou` (le « nouveau dossier avec la sélection » du Finder). */
export async function rangerDansUneNeuve(
  o: Outils,
  entrees: readonly EntreeBibliotheque[],
  ou: { id: string; titre: string },
  confirmer: (bilan: BilanRangement) => Promise<boolean>,
): Promise<(Resultat & { toile: string }) | null> {
  const toiles = entrees.filter((e) => e.element === null)
  const essais = await Promise.all(toiles.filter((e) => e.dans !== ou.id).map((e) => o.rangerToile(e.tableau, ou.id, { essai: true })))
  const bilan = bilanDe(essais)
  if (changeQuelqueChose(bilan) && !(await confirmer(bilan))) return null
  const places = await placesDe(o.espace, entrees, [ou.id])
  const voulues = entrees.flatMap((e, i) => (places[i] ? [{ e, place: places[i]! }] : []))
  const titre = t('tableau.nouveau')
  const r = rangerDansNeuve(
    o.espace,
    voulues.map((x) => x.place),
    ou.id,
    titre,
  )
  // La toile neuve n'existe sur le serveur qu'une fois déclarée : on l'attend avant d'y ranger les toiles.
  await quandPretes(o.espace, [r.toile])
  await Promise.all(r.toiles.map((x) => o.rangerToile(x.toile, r.toile).catch(() => {})))
  const parties = new Map(r.neufs.map((n) => [`${n.de.toile}/${n.de.element}`, n.vers]))
  const neuve: EntreeBibliotheque = {
    tableau: r.toile,
    element: null,
    genre: 'toile',
    titre,
    resume: { genre: 'toile', element: '', titre, boites: [] },
    ou: ou.titre,
    dans: ou.id,
    vu: null,
    favori: false,
    partage: false,
  }
  const correctifs: Correctif[] = [
    { type: 'ajouter', entrees: [neuve] },
    ...voulues.flatMap(({ e, place }) => {
      const n = parties.get(`${place.toile}/${place.element}`)
      if (!n) return []
      const par = { ...e, element: e.element === null ? null : n.element, tableau: e.element === null ? e.tableau : n.toile, dans: r.toile, ou: titre }
      return [{ type: 'remplacer' as const, de: cleDe(e), par }]
    }),
  ]
  return {
    toile: r.toile,
    texte: tn('biblio.annonce.deplaces', correctifs.length - 1, { toile: titre }),
    correctifs,
    async annuler() {
      r.annuler()
      await Promise.all(r.toiles.map((x) => o.rangerToile(x.toile, x.de).catch(() => {})))
      return [
        { type: 'retirer', cles: [cleDe(neuve)] },
        ...correctifs.flatMap((c) => (c.type === 'remplacer' ? [{ type: 'remplacer' as const, de: cleDe(c.par), par: voulues.find((x) => cleDe(x.e) === c.de)!.e }] : [])),
      ]
    },
  }
}

/** Met ces entrées à la corbeille de la toile qui les porte ; une toile y part avec ce qu'elle contient. */
export async function jeterEntrees(o: Outils, entrees: readonly EntreeBibliotheque[], toutes: readonly EntreeBibliotheque[]): Promise<Resultat> {
  const places = await placesDe(o.espace, entrees)
  const voulues = entrees.flatMap((e, i) => (places[i] ? [{ e, place: places[i]! }] : []))
  const j = jeter(
    o.espace,
    voulues.map((x) => x.place),
  )
  if (j.nombre === 0) return rien()
  // Ce que contiennent les toiles jetées disparaît avec elles.
  const parties = new Set(voulues.flatMap((x) => (x.e.element === null ? [x.e.tableau] : [])))
  for (let ajoute = true; ajoute; ) {
    ajoute = false
    for (const e of toutes) if (e.element === null && e.dans && parties.has(e.dans) && !parties.has(e.tableau)) ajoute = Boolean(parties.add(e.tableau))
  }
  const retirees = [...voulues.map((x) => x.e), ...toutes.filter((e) => parties.has(e.tableau) && !voulues.some((x) => x.e === e))]
  return {
    texte: tn('biblio.annonce.jetes', j.nombre),
    correctifs: [{ type: 'retirer', cles: retirees.map(cleDe) }],
    async annuler() {
      j.annuler()
      return [{ type: 'ajouter', entrees: retirees }]
    },
  }
}

/** Copie chaque entrée à côté de l'original, titrée « … (copie) ». */
export async function dupliquerEntrees(o: Outils, entrees: readonly EntreeBibliotheque[]): Promise<Resultat> {
  // Une toile se copie avec son contenu : il faut l'avoir.
  await placesDe(
    o.espace,
    entrees,
    entrees.flatMap((e) => (e.element === null ? [e.tableau] : [])),
  )
  const copies = entrees.flatMap((e) => {
    const c = dupliquer(o.espace, { toile: e.tableau, element: e.element }, e.dans ?? undefined)
    if (!c) return []
    const titre = t('rangement.copie', { titre: e.titre || t('commun.sansTitre') })
    return [{ entree: { ...e, tableau: c.tableau, element: c.element, titre, vu: null, favori: false, partage: false }, porteuse: e.element === null ? (e.dans ?? o.espace.racine) : e.tableau }]
  })
  if (copies.length === 0) return rien()
  return {
    texte: tn('biblio.annonce.copies', copies.length),
    correctifs: [{ type: 'ajouter', entrees: copies.map((c) => c.entree) }],
    async annuler() {
      jeter(
        o.espace,
        copies.flatMap(({ entree, porteuse }) => {
          const element = entree.element ?? carteDeLaToile(o.espace, porteuse, entree.tableau)
          return element ? [{ toile: porteuse, element }] : []
        }),
      )
      return [{ type: 'retirer', cles: copies.map((c) => cleDe(c.entree)) }]
    },
  }
}

/** Renomme une toile, une carte mentale ou un document ; les tuiles qu'une toile renommée porte suivent son nom. */
export async function renommerEntree(o: Outils, e: Pick<EntreeBibliotheque, 'tableau' | 'element' | 'titre'>, titre: string, toutes: readonly EntreeBibliotheque[]): Promise<Correctif[]> {
  const propre = titre.trim()
  if (propre === e.titre) return []
  await quandPretes(o.espace, [e.tableau])
  renommerChose(o.espace, { toile: e.tableau, element: e.element }, propre)
  return [
    { type: 'changer', cle: cleDe(e), champs: { titre: propre } },
    ...(e.element === null ? toutes.filter((x) => x.dans === e.tableau).map((x) => ({ type: 'changer' as const, cle: cleDe(x), champs: { ou: propre } })) : []),
  ]
}

/** Met ces toiles en favori, ou les en retire. */
export async function favoris(o: Outils, entrees: readonly EntreeBibliotheque[], favori: boolean): Promise<Correctif[]> {
  const toiles = entrees.filter((e) => e.element === null)
  await Promise.all(toiles.map((e) => o.definirFavori(e.tableau, favori)))
  return toiles.map((e) => ({ type: 'changer', cle: cleDe(e), champs: { favori } }))
}

/**
 * Des fichiers lâchés sur la bibliothèque (ou choisis par Fichier › Importer…), importés sur la toile `dans` : ses
 * cartes mentales, ses documents et ses toiles neuves s'y montrent tout de suite ; ce qui n'est qu'un fichier joint
 * reste sur la toile. Se défait en jetant ce qui est né.
 */
export async function importerEntrees(
  o: Outils,
  importer: (fichiers: File[], dans: string) => Promise<BilanImport>,
  fichiers: File[],
  dans: { id: string; titre: string },
  /** « Voir » : la toile, centrée sur ce premier fichier joint. */
  voir: (element: string) => void,
  maintenant = Date.now(),
): Promise<Resultat & { entrees: EntreeBibliotheque[] }> {
  const b = await importer(fichiers, dans.id)
  const poses = b.elements.filter((e) => !e.parent)
  // Ce qui n'a pas de tuile ici : un fichier joint, une image, posés sur la toile.
  const joints = poses.filter((e) => e.contenu.type !== 'arbre' && e.contenu.type !== 'document')
  const nombre = poses.length + b.toiles.length
  const refus = b.refuses.length ? tn('biblio.import.refuses', b.refuses.length, { noms: b.refuses.map((nom) => t('biblio.import.nom', { nom })).join(', ') }) : ''
  if (nombre === 0) return { texte: refus || t('biblio.import.rien'), correctifs: [], entrees: [] }
  // Importer, c'est toucher : ce qui arrive compte parmi les récents.
  const commun = { ou: dans.titre, dans: dans.id, vu: maintenant, favori: false, partage: false }
  const entrees: EntreeBibliotheque[] = [
    ...resumesDuTableau({ titre: '', elements: poses as never }).flatMap((resume) =>
      resume.genre === 'toile' ? [] : [{ tableau: dans.id, element: resume.element, genre: resume.genre, titre: resume.titre, resume, ...commun }],
    ),
    ...b.toiles.map(({ id, titre }) => ({
      tableau: id,
      element: null,
      genre: 'toile' as const,
      titre,
      resume: { genre: 'toile' as const, element: '' as const, titre, boites: [] },
      ...commun,
    })),
  ]
  const seul = nombre === 1 && joints.length === 1 ? (joints[0]!.contenu as { nom?: string }).nom : undefined
  const texte = seul ? t('biblio.import.pose', { nom: seul, toile: dans.titre }) : tn('biblio.import.fait', nombre, { toile: dans.titre })
  return {
    texte: texte + (refus ? ` ${refus}` : ''),
    entrees,
    // Ce qui est allé sur la toile sans tuile ici, on peut aller le voir.
    ...(joints.length > 0 ? { actions: [{ libelle: t('biblio.import.voir'), faire: () => voir(joints[0]!.id) }] } : {}),
    correctifs: [{ type: 'ajouter', entrees }],
    async annuler() {
      jeter(o.espace, [
        ...poses.map((e) => ({ toile: dans.id, element: e.id })),
        ...b.toiles.flatMap(({ id }) => {
          const carte = carteDeLaToile(o.espace, dans.id, id)
          return carte ? [{ toile: dans.id, element: carte }] : []
        }),
      ])
      return [{ type: 'retirer', cles: entrees.map(cleDe) }]
    },
  }
}

/**
 * Un dossier neuf, vide, rangé dans `ou` (le « Nouveau dossier » du Finder) : une toile, dans laquelle on glisse ensuite
 * ce qu'on veut y ranger. Se défait en jetant sa carte.
 */
export async function creerDossier(o: Outils, ou: { id: string; titre: string }): Promise<Resultat & { toile: string }> {
  await quandPretes(o.espace, [ou.id])
  const titre = t('biblio.dossier.nouveau')
  const { tableau } = creerDans(o.espace, ou.id, 'toile', titre)
  const neuf: EntreeBibliotheque = {
    tableau,
    element: null,
    genre: 'toile',
    titre,
    resume: { genre: 'toile', element: '', titre, boites: [] },
    ou: ou.titre,
    dans: ou.id,
    vu: null,
    favori: false,
    partage: false,
  }
  return {
    toile: tableau,
    texte: t('biblio.annonce.dossier', { toile: ou.titre }),
    correctifs: [{ type: 'ajouter', entrees: [neuf] }],
    async annuler() {
      const carte = carteDeLaToile(o.espace, ou.id, tableau)
      if (carte) jeter(o.espace, [{ toile: ou.id, element: carte }])
      return [{ type: 'retirer', cles: [cleDe(neuf)] }]
    },
  }
}
