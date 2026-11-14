import {
  type EspaceNavigable,
  type Place,
  carteDeLaToile,
  creerDans,
  deplacer,
  dupliquer,
  jeter,
  montrerEnDossier,
  quandPretes,
  rangerDansNeuve,
  renommerChose,
  resumesDuTableau,
} from '@notak/tableau'
import type { BilanRangement, EntreeBibliotheque } from '../api'
import type { BilanImport } from '../importation'
import { t, tn } from '../langue'
import type { Correctif } from './correctifs'
import { immobile, regroupeUnOutil } from './modele'
import { cleDe, porteuseDe } from './selection'

/**
 * Ce que font les gestes de la bibliothèque : chaque tuile est un élément d'une toile (sa carte, pour une toile), et
 * chaque geste passe par les toiles de l'espace comme s'il était fait sur elles. Le serveur range les toiles (leurs
 * accès suivent le dossier). Chaque geste rend ce qu'il dit, les correctifs à montrer d'ici que le serveur suive, et de
 * quoi le défaire.
 */

/** Ce que la bibliothèque demande à l'espace pour ranger. */
export type EspaceRangement = Pick<EspaceNavigable, 'racine' | 'magasin' | 'tableau' | 'ecouter' | 'creerTableau' | 'renommer' | 'lectureSeule' | 'synchronise' | 'entrer'>

export interface Outils {
  espace: EspaceRangement
  rangerToile(tableau: string, parent: string, options?: { essai?: boolean; siPersonne?: boolean }): Promise<BilanRangement & { fait: boolean }>
  /** `element` : ce que la toile porte (une page, une photo…) ; sans lui, la toile. */
  definirFavori(tableau: string, favori: boolean, element?: string | null): Promise<void>
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

/** Ce qu'on dit des dossiers qu'un outil a posés, restés où il les a mis : rien s'il n'y en a pas. */
export function resteEnPlace(laisses: readonly EntreeBibliotheque[]): string {
  const premier = laisses[0]
  if (!premier) return ''
  return tn('biblio.pose.reste', laisses.length, { titre: premier.titre || t('commun.sansTitre'), outil: premier.outil ?? '' })
}

/** Le texte d'un geste, suivi de ce qui n'a pas bougé ; ce dernier seul quand rien d'autre n'a été fait. */
const avecLaisses = (texte: string, laisses: readonly EntreeBibliotheque[]): string => [texte, resteEnPlace(laisses)].filter(Boolean).join('. ')

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
 * qui s'ouvrent ou s'éteignent), et `confirmer` le demande. Rend `null` si l'on renonce. Un dossier qu'un outil a posé
 * reste où il est, et l'avis le dit.
 */
export async function deplacerEntrees(
  o: Outils,
  entrees: readonly EntreeBibliotheque[],
  vers: { id: string; titre: string },
  confirmer: (bilan: BilanRangement) => Promise<boolean>,
): Promise<Resultat | null> {
  const laisses = entrees.filter(immobile)
  const mobiles = entrees.filter((e) => !immobile(e) && porteuseDe(e) !== vers.id && !(e.element === null && e.tableau === vers.id))
  if (mobiles.length === 0) return laisses.length > 0 ? { texte: resteEnPlace(laisses), correctifs: [] } : rien()
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
    texte: avecLaisses(tn('biblio.annonce.deplaces', correctifs.length, { toile: vers.titre || t('commun.sansTitre') }), laisses),
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

/**
 * Range ces entrées dans une toile neuve, posée sur `ou` (le « nouveau dossier avec la sélection » du Finder). Un
 * dossier qu'un outil a posé n'y va pas : il reste où il est, et l'avis le dit.
 */
export async function rangerDansUneNeuve(
  o: Outils,
  choisies: readonly EntreeBibliotheque[],
  ou: { id: string; titre: string },
  confirmer: (bilan: BilanRangement) => Promise<boolean>,
): Promise<(Resultat & { toile: string }) | null> {
  const laisses = choisies.filter(immobile)
  const entrees = choisies.filter((e) => !immobile(e))
  if (entrees.length === 0) return null
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
    texte: avecLaisses(tn('biblio.annonce.deplaces', correctifs.length - 1, { toile: titre }), laisses),
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

/** Ce qu'une toile porte et que la bibliothèque montre en tuiles. Le reste (notes, colonnes, formes…) ne se voit que sur une toile. */
export const TYPES_EN_TUILE: ReadonlySet<string> = new Set(['tableau', 'document', 'arbre', 'image', 'lien', 'fichier'])

/** Combien d'éléments la toile d'un dossier porte encore, que sa liste ne montre pas (d'après son plan). */
export const restesDe = (e: Pick<EntreeBibliotheque, 'resume'>): number =>
  e.resume.genre === 'toile' ? e.resume.boites.filter((b) => !TYPES_EN_TUILE.has(b[5])).length : 0

/**
 * Un dossier ne se montre qu'en liste : ce que sa toile porte encore et qu'aucune tuile ne montre (des notes, une colonne,
 * des formes, posées quand il était une toile) part dans une toile neuve, rangée dans le dossier et nommée comme lui.
 * Une ligne suit les éléments qu'elle relie ; ce que range une colonne part avec elle. Se défait.
 */
export async function rangerLesRestes(o: Outils, dossier: { id: string; titre: string }): Promise<Resultat> {
  await quandPretes(o.espace, [dossier.id])
  const places = o.espace
    .magasin(dossier.id)
    .lire()
    .elements.filter((e) => e.corbeille === undefined && !e.parent && e.contenu.type !== 'ligne' && !TYPES_EN_TUILE.has(e.contenu.type))
    .map((e) => ({ toile: dossier.id, element: e.id }))
  if (places.length === 0) return rien()
  const r = rangerDansNeuve(o.espace, places, dossier.id, dossier.titre)
  await quandPretes(o.espace, [r.toile])
  const neuve: EntreeBibliotheque = {
    tableau: r.toile,
    element: null,
    genre: 'toile',
    titre: dossier.titre,
    resume: { genre: 'toile', element: '', titre: dossier.titre, boites: [] },
    ou: dossier.titre,
    dans: dossier.id,
    vu: null,
    favori: false,
    partage: false,
  }
  return {
    texte: tn('biblio.annonce.deplaces', places.length, { toile: dossier.titre }),
    correctifs: [{ type: 'ajouter', entrees: [neuve] }],
    async annuler() {
      r.annuler()
      return [{ type: 'retirer', cles: [cleDe(neuve)] }]
    },
  }
}

/**
 * Met ces entrées à la corbeille de la toile qui les porte ; une toile y part avec ce qu'elle contient. Le dossier qui
 * range ceux d'un outil n'y va pas (`regroupeUnOutil`), et l'avis le dit.
 */
export async function jeterEntrees(o: Outils, choisies: readonly EntreeBibliotheque[], toutes: readonly EntreeBibliotheque[]): Promise<Resultat> {
  const laisses = choisies.filter(regroupeUnOutil)
  const entrees = choisies.filter((e) => !regroupeUnOutil(e))
  const places = await placesDe(o.espace, entrees)
  const voulues = entrees.flatMap((e, i) => (places[i] ? [{ e, place: places[i]! }] : []))
  const j = jeter(
    o.espace,
    voulues.map((x) => x.place),
  )
  if (j.nombre === 0) return laisses.length > 0 ? { texte: resteEnPlace(laisses), correctifs: [] } : rien()
  // Ce que contiennent les toiles jetées disparaît avec elles.
  const parties = new Set(voulues.flatMap((x) => (x.e.element === null ? [x.e.tableau] : [])))
  for (let ajoute = true; ajoute; ) {
    ajoute = false
    for (const e of toutes) if (e.element === null && e.dans && parties.has(e.dans) && !parties.has(e.tableau)) ajoute = Boolean(parties.add(e.tableau))
  }
  const retirees = [...voulues.map((x) => x.e), ...toutes.filter((e) => parties.has(e.tableau) && !voulues.some((x) => x.e === e))]
  return {
    texte: avecLaisses(tn('biblio.annonce.jetes', j.nombre), laisses),
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

/** Renomme une toile, ou ce qu'elle porte (sa page, sa photo…) ; les tuiles qu'une toile renommée porte suivent son nom. */
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

/** Met ces entrées en favori, ou les en retire : des toiles, et ce qu'elles portent. */
export async function favoris(o: Outils, entrees: readonly EntreeBibliotheque[], favori: boolean): Promise<Correctif[]> {
  await Promise.all(entrees.map((e) => o.definirFavori(e.tableau, favori, e.element)))
  return entrees.map((e) => ({ type: 'changer', cle: cleDe(e), champs: { favori } }))
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
  // Ce qui ne s'ouvre pas en grand : un fichier joint, une photo, posés sur la toile, qu'on peut aller y voir.
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
  // Un dossier est une toile qui se montre en dossier : la bibliothèque l'ouvre en liste.
  await quandPretes(o.espace, [tableau])
  montrerEnDossier(o.espace, tableau, true)
  const neuf: EntreeBibliotheque = {
    tableau,
    element: null,
    genre: 'toile',
    titre,
    resume: { genre: 'toile', element: '', titre, boites: [], dossier: true },
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

/**
 * Montre une toile en dossier (la bibliothèque l'ouvre en liste de ce qu'elle porte), ou de nouveau en toile. Rien
 * d'autre ne change ; se défait.
 */
export async function montrerEntreeEnDossier(o: Outils, e: EntreeBibliotheque, oui: boolean): Promise<Resultat | null> {
  if (e.element !== null || e.resume.genre !== 'toile') return null
  await quandPretes(o.espace, [e.tableau])
  const resumeVoulu = (dossier: boolean) => {
    const { dossier: _d, ...r } = e.resume as Extract<EntreeBibliotheque['resume'], { genre: 'toile' }>
    return dossier ? { ...r, dossier: true as const } : r
  }
  const poser = (dossier: boolean): Correctif[] => {
    if (!montrerEnDossier(o.espace, e.tableau, dossier)) throw new Error(t('biblio.annonce.lectureSeule'))
    return [{ type: 'changer', cle: cleDe(e), champs: { resume: resumeVoulu(dossier) } }]
  }
  const correctifs = poser(oui)
  return {
    texte: t(oui ? 'biblio.annonce.enDossier' : 'biblio.annonce.enToile', { titre: e.titre || t('commun.sansTitre') }),
    correctifs,
    async annuler() {
      return poser(!oui)
    },
  }
}
