import {
  type EspaceNavigable,
  type Place,
  carteDeLaToile,
  deplacer,
  dupliquer,
  jeter,
  quandPretes,
  rangerDansNeuve,
  renommerChose,
} from '@notak/tableau'
import type { EntreeBibliotheque } from '../api'
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
  rangerToile(tableau: string, parent: string, options?: { essai?: boolean; siPersonne?: boolean }): Promise<{ nouveaux: number; fait: boolean }>
  definirFavori(tableau: string, favori: boolean): Promise<void>
}

export interface Resultat {
  texte: string
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

/**
 * Déplace ces entrées dans la toile `vers`. Ranger une toile chez d'autres leur ouvre ce qu'elle contient : le serveur
 * compte d'abord qui y gagnerait l'accès, et `confirmer` le demande. Rend `null` si l'on renonce.
 */
export async function deplacerEntrees(
  o: Outils,
  entrees: readonly EntreeBibliotheque[],
  vers: { id: string; titre: string },
  confirmer: (nouveaux: number) => Promise<boolean>,
): Promise<Resultat | null> {
  const mobiles = entrees.filter((e) => porteuseDe(e) !== vers.id && !(e.element === null && e.tableau === vers.id))
  if (mobiles.length === 0) return rien()
  const toiles = mobiles.filter((e) => e.element === null)
  const essais = await Promise.all(toiles.map((e) => o.rangerToile(e.tableau, vers.id, { essai: true })))
  const nouveaux = Math.max(0, ...essais.map((x) => x.nouveaux))
  if (nouveaux > 0 && !(await confirmer(nouveaux))) return null
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
  confirmer: (nouveaux: number) => Promise<boolean>,
): Promise<(Resultat & { toile: string }) | null> {
  const toiles = entrees.filter((e) => e.element === null)
  const essais = await Promise.all(toiles.filter((e) => e.dans !== ou.id).map((e) => o.rangerToile(e.tableau, ou.id, { essai: true })))
  if (Math.max(0, ...essais.map((x) => x.nouveaux)) > 0 && !(await confirmer(Math.max(...essais.map((x) => x.nouveaux))))) return null
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
