import { createHash } from 'node:crypto'
import type * as Y from 'yjs'
import { cleEntre } from '../../../packages/tableau/src/coeur/ordre.ts'
import { type DroitsTableau, permis } from '../../../packages/tableau/src/coeur/reglesDroits.ts'
import type { Arbre } from '../../../packages/tableau/src/coeur/tableau.ts'
import { type Lieu, adresseDe } from './adresses.ts'
import { type NomOperation, TYPES_DE_DOSSIER } from './agentsContrat.ts'
import { englobante, lirePourAgent, planDeLArbre, tachesDe } from '../../../packages/tableau/src/agents/lire.ts'
import {
  type Boite,
  type BrancheDemande,
  ECART,
  ECART_GROUPES,
  type ElementDemande,
  ErreurAgent,
  type GesteBranche,
  type Neuf,
  Scribe,
  boitesDe,
  carteDeToile,
  chevauche,
  construire,
  contenuDeTable,
  disposer,
  docDeTaches,
  gestesSurArbre,
  hauteurDe,
  placeLibre,
  placeParDefaut,
  placePres,
} from '../../../packages/tableau/src/agents/poser.ts'
import {
  ajouterAPage,
  blocsDePage,
  docDePage,
  docDeTitre,
  docDepuisMarkdown,
  idsDesBlocs,
  markdownDePage,
  markdownDepuisDoc,
  pageRiche,
  retirerDePage,
  texteSimple,
} from '../../../packages/tableau/src/agents/texte.ts'
import type { Base, Utilisateur } from './base.ts'
import { type Bilan, rienNeChange } from './rangement.ts'
import type { ElementLu, NoeudTexte, TableauLu } from './contenu.ts'

// La porte des agents (docs/AGENTS.md) : ce que fait chaque opération, au nom d'une personne et avec ses droits, ni
// plus ni moins. Une écriture est une seule transaction sur le document du tableau, préparée en entier avant d'écrire :
// une erreur n'en laisse rien. Les erreurs disent à l'agent quoi faire.

/** Une demande refusée : le statut HTTP, le code, et la phrase pour l'agent. */
export class ErreurPorte extends Error {
  readonly statut: 400 | 403 | 404 | 409 | 413 | 422 | 423
  readonly code: string
  constructor(statut: ErreurPorte['statut'], code: string, message: string) {
    super(message)
    this.statut = statut
    this.code = code
  }
}

/** Une entrée de la bibliothèque, telle que `GET /api/bibliotheque` la rend (ce que la porte en lit). */
export interface EntreeDeBibliotheque {
  tableau: string
  element: string | null
  /** `toile` (un dossier s'en distingue par `resume.dossier`), `arbre`, `document`… */
  genre: string
  titre: string
  resume: { dossier?: boolean }
  /** La toile qui la range (son titre, `ou`), si la personne la lit. */
  dans: string | null
  ou: string | null
  vu: number | null
  favori: boolean
  partage: boolean
  outil?: string
}

/** Les genres de la bibliothèque, dans les mots du contrat. */
export const GENRES_DE_BIBLIOTHEQUE = ['toile', 'dossier', 'page', 'carte_mentale'] as const

/** Ce que la porte demande au serveur : tout ce qui touche aux droits, aux tableaux et aux dossiers des fiches. */
export interface DependancesPorte {
  base: Base
  maintenant(): number
  /** L'adresse publique du serveur, pour les liens vers les tableaux. */
  origine: string | undefined
  droitsSur(u: Utilisateur, tableau: string): Promise<DroitsTableau | null>
  verrouille(u: Utilisateur, tableau: string): boolean
  lire(tableau: string): TableauLu
  /** Change le document du tableau au nom de la personne, avec l'agent (l'activité les dit ensemble). */
  modifier(tableau: string, u: Utilisateur, f: (doc: Y.Doc) => void): Promise<void>
  /**
   * Les éléments que quelqu'un écrit en ce moment sur ce tableau (la présence de la synchro, son champ `edition`), avec
   * son nom s'il le dit. Une page ouverte en grand l'est : son éditeur récrira son contenu, par-dessus ce qu'on y aurait mis.
   */
  enEdition(tableau: string): Map<string, string | null>
  /** Les cartes que la personne ne doit pas voir dans ce tableau. */
  caches(u: Utilisateur, t: TableauLu): Promise<Set<string>>
  /** Les cartes de dossiers générés par un outil que ce tableau porte : elles restent où elles sont. */
  generes(u: Utilisateur, tableau: string): Promise<Record<string, string>>
  /** L'outil qui a généré ce dossier (celui d'une fiche, ou celui qui les range), s'il y en a un : il reste tel quel. */
  genereParUnOutil(tableau: string): string | null
  /** La toile qui porte la carte de ce tableau, comme la bibliothèque le range ; `null` s'il n'est nulle part. */
  porteurDe(tableau: string): string | null
  /**
   * Range la toile sous `vers` (ses accès hérités suivent) et rend ce que cela change pour les autres ; `essai` ne fait
   * que compter. La personne doit posséder la toile et écrire dans `vers` ; sa carte, la porte la déplace elle-même.
   */
  rangerLaToile(u: Utilisateur, tableau: string, vers: string, essai: boolean): Promise<Bilan>
  /** Crée une toile dans `parent`, sa carte posée là ; rend son identifiant et celui de sa carte. */
  creerToile(u: Utilisateur, parent: string, titre: string, o: { dossier?: boolean; couleur?: string }): Promise<{ id: string; carte: string | null }>
  recents(u: Utilisateur, limite: number): Promise<{ tableau: string; titre: string; genre: string; modifie: number | null }[]>
  /** La bibliothèque de la personne : ses toiles et ses dossiers, et les pages et cartes mentales qu'ils portent. */
  bibliotheque(u: Utilisateur): Promise<EntreeDeBibliotheque[]>
  rechercher(u: Utilisateur, texte: string, limite: number): Promise<{ tableau: string; titre: string; element?: string; extrait?: string }[]>
  estDossier(tableau: string): boolean
  /** Le dossier d'une fiche de l'outil pour cette personne. */
  fiche(u: Utilisateur, cle: string): Promise<{ etat: 'present' | 'corbeille' | 'absent' | 'inaccessible'; tableau?: string; titre?: string }>
  /** Crée le dossier d'une fiche, comme le bouton de `/relier` ; `null` si la personne ne peut pas. */
  creerFiche(u: Utilisateur, cle: string, titre: string): Promise<string | null>
}

type Args = Record<string, unknown>
const ID_TABLEAU = /^[A-Za-z0-9_-]{8,64}$/

export function creerPorte(d: DependancesPorte) {
  const { base } = d
  const titreDe = (id: string) => base.tableau(id)?.titre
  /** L'accueil d'un espace : ce qu'il porte se montre dans la bibliothèque, comme ce que range un dossier. */
  const estAccueil = (id: string) => {
    const espace = base.tableau(id)?.espace
    return !!espace && base.espace(espace)?.racine === id
  }
  /** L'adresse d'une chose dans l'app, comme « Copier le lien » de la bibliothèque (`adresses.ts`). */
  const adresse = (lieu: Lieu, dossier?: boolean) =>
    adresseDe(lieu, { origine: d.origine, estDossier: (x) => (x === lieu.tableau && dossier !== undefined ? dossier : d.estDossier(x)), estAccueil })

  /** Les droits de la personne sur ce tableau ; ce qu'il faut pour le lire, ou pour l'écrire. */
  const acces = async (u: Utilisateur, tableau: string, ecrire: boolean): Promise<DroitsTableau> => {
    const introuvable = new ErreurPorte(404, 'tableau_introuvable', `Tableau introuvable : ${tableau}. Il n’existe pas, ou la personne ne le lit pas. Cherche-le avec trouver.`)
    if (!ID_TABLEAU.test(tableau) || !base.tableau(tableau)) throw introuvable
    const droits = await d.droitsSur(u, tableau)
    if (!droits) throw introuvable
    if (d.verrouille(u, tableau)) {
      throw new ErreurPorte(423, 'verrouille', 'Ce tableau est protégé par un mot de passe que la personne n’a pas encore saisi : elle doit l’ouvrir elle-même dans Notak.')
    }
    if (ecrire && !permis(droits, null, 'ecriture')) {
      throw new ErreurPorte(
        403,
        'lecture_seule',
        `La personne peut lire ce tableau sans pouvoir l’écrire (droits : ${droits.role}). Dis-le-lui : elle peut demander l’accès en édition, ou tu peux travailler dans un autre tableau.`,
      )
    }
    return droits
  }

  /** Un élément du tableau, là (pas à la corbeille, sauf `corbeille`), ou l'erreur qui dit de relire le tableau. */
  const present = (t: TableauLu, id: string, o: { corbeille?: boolean } = {}): ElementLu => {
    const e = t.elements.find((x) => x.id === id)
    if (!e) throw new ErreurAgent('element_introuvable', `Élément introuvable : ${id}. Relis le tableau avec lire_tableau avant de le modifier.`)
    if (!o.corbeille && e.corbeille !== undefined) throw new ErreurAgent('element_introuvable', `L’élément ${id} est à la corbeille : remets-le avec remettre_elements avant d’y toucher.`)
    return e
  }
  /** Ce qu'une écriture demande à un élément existant : là, et écrivable par la personne. */
  const element = (t: TableauLu, id: string, droits: DroitsTableau, o: { corbeille?: boolean } = {}): ElementLu => {
    const e = present(t, id, o)
    if (!permis(droits, id, 'ecriture')) throw new ErreurPorte(403, 'lecture_seule', `L’élément ${id} a ses propres droits : la personne ne peut pas l’écrire.`)
    return e
  }

  // ---- trouver ----

  const trouver = async (u: Utilisateur, a: Args) => {
    const limite = (a.limite as number | undefined) ?? (a.bibliotheque === true ? 50 : 20)
    const r: Record<string, unknown> = {
      personne: { nom: u.nom },
      espaces: base.espacesDe(u.id).map((e) => ({ id: e.id, nom: e.nom, accueil: e.racine, personnel: e.personnel })),
    }
    if (typeof a.fiche === 'string') r.fiche = await d.fiche(u, a.fiche)
    if (typeof a.dans === 'string') {
      await acces(u, a.dans, false)
      const t = d.lire(a.dans)
      const caches = await d.caches(u, t)
      const dans = a.dans
      // Les toiles et les dossiers qu'il range, puis ses pages et ses cartes mentales, ce que la bibliothèque y montre.
      const vivants = t.elements.filter((e) => e.corbeille === undefined && !caches.has(e.id))
      r.contenu = [
        ...vivants
          .filter((e) => e.contenu.type === 'tableau' && typeof e.contenu.cible === 'string' && base.tableau(e.contenu.cible))
          .map((e) => {
            const cible = e.contenu.cible as string
            const dossier = d.estDossier(cible)
            return { tableau: cible, titre: titreDe(cible) ?? '', genre: dossier ? 'dossier' : 'toile', element: e.id, adresse: adresse({ tableau: cible }, dossier) }
          }),
        ...vivants
          .filter((e) => e.contenu.type === 'document' || e.contenu.type === 'arbre')
          .map((e) => {
            const genre = e.contenu.type === 'document' ? 'page' : 'carte_mentale'
            const titre = e.contenu.type === 'document' ? String(e.contenu.titre ?? '') : (planDeLArbre(e.contenu as unknown as Arbre).plan.titre ?? '')
            return { genre, titre, element: e.id, adresse: adresse({ tableau: dans, element: e.id, type: genre }) }
          }),
      ].slice(0, 200)
    }
    if (a.bibliotheque === true) r.bibliotheque = await bibliotheque(u, a, limite)
    if (typeof a.texte === 'string') r.resultats = await d.rechercher(u, a.texte, limite)
    if (a.texte === undefined && a.dans === undefined && a.fiche === undefined && a.bibliotheque !== true) r.recents = await d.recents(u, limite)
    return r
  }

  /**
   * La bibliothèque, par pages de `limite` (50 par défaut) et d'un curseur à l'autre, les plus récentes d'abord : chaque
   * toile, dossier, page et carte mentale, avec ce qui la range (`dans`, son titre `ou`), son adresse, et si elle est en
   * favori ou partagée. Des champs légers : rien de ce qui ne sert qu'à dessiner une vignette.
   */
  const bibliotheque = async (u: Utilisateur, a: Args, limite: number) => {
    const voulus = new Set<string>((a.genres as string[] | undefined) ?? GENRES_DE_BIBLIOTHEQUE)
    const genreDe = (e: EntreeDeBibliotheque) =>
      e.genre === 'toile' ? (e.resume.dossier === true ? 'dossier' : 'toile') : e.genre === 'document' ? 'page' : e.genre === 'arbre' ? 'carte_mentale' : null
    const toutes = (await d.bibliotheque(u)).flatMap((e) => {
      const genre = genreDe(e)
      return genre && voulus.has(genre) ? [{ e, genre }] : []
    })
    const cle = (x: { e: EntreeDeBibliotheque }) => `${x.e.tableau}/${x.e.element ?? ''}`
    toutes.sort((p, q) => (q.e.vu ?? -1) - (p.e.vu ?? -1) || p.e.titre.localeCompare(q.e.titre, 'fr') || (cle(p) < cle(q) ? -1 : 1))
    const debut = typeof a.curseur === 'string' ? Number(a.curseur) : 0
    const tranche = toutes.slice(debut, debut + limite)
    return {
      entrees: tranche.map(({ e, genre }) => {
        const toile = e.element === null
        // L'accueil range tout ce qui n'est pas ailleurs : il ne se redit pas à chaque entrée.
        const range = e.dans !== null && !(toile && (e.dans === u.racine || estAccueil(e.dans)))
        return {
          genre,
          titre: e.titre || 'Sans titre',
          tableau: e.tableau,
          ...(toile ? {} : { element: e.element }),
          ...(range && toile ? { dans: e.dans } : {}),
          ...(range && e.ou ? { ou: e.ou } : {}),
          adresse: adresse({ tableau: e.tableau, element: e.element, type: genre }, genre === 'dossier' ? true : genre === 'toile' ? false : undefined),
          ...(e.favori ? { favori: true } : {}),
          ...(e.partage ? { partage: true } : {}),
          ...(e.outil ? { outil: e.outil } : {}),
        }
      }),
      total: toutes.length,
      ...(debut + limite < toutes.length ? { suite: String(debut + limite) } : {}),
    }
  }

  // ---- lire_tableau ----

  const lireTableau = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    const droits = await acces(u, id, false)
    const t = d.lire(id)
    const seulement = a.elements as string[] | undefined
    for (const x of seulement ?? []) {
      if (!t.elements.some((e) => e.id === x)) throw new ErreurAgent('element_introuvable', `Élément introuvable : ${x}. Lis le tableau entier (sans « elements ») pour retrouver ses identifiants.`)
    }
    const lu = lirePourAgent(t, { titreDe, corbeille: a.corbeille === true, ...(seulement ? { seulement } : {}), caches: await d.caches(u, t) })
    // Une page se lit avec l'empreinte de son texte entier (`attendu`), et une page ou une carte mentale avec son adresse.
    const parId = new Map(t.elements.map((e) => [e.id, e]))
    const elements = lu.elements.map((x) => {
      const el = x.id as string
      if (x.type === 'page') return { ...x, empreinte: empreinteDe(markdownDePage(parId.get(el)?.contenu.texte)), adresse: adresse({ tableau: id, element: el, type: 'page' }) }
      if (x.type === 'carte_mentale') return { ...x, adresse: adresse({ tableau: id, element: el, type: 'carte_mentale' }) }
      return x
    })
    return { tableau: { id, titre: titreDe(id) ?? t.titre, droits: droits.role, adresse: adresse({ tableau: id }), ...(t.dossier ? { dossier: true } : {}) }, ...lu, elements }
  }

  // ---- creer_tableau ----

  const creerTableau = async (u: Utilisateur, a: Args) => {
    const titre = (a.titre as string).trim()
    if (!titre) throw new ErreurAgent('arguments_invalides', 'titre : vide.')
    let parent: string
    if (typeof a.dans === 'string') {
      await acces(u, a.dans, true)
      parent = a.dans
    } else if (a.fiche && typeof a.fiche === 'object') {
      const f = a.fiche as { cle: string; titre?: string }
      const etat = await d.fiche(u, f.cle)
      if (etat.etat === 'present') parent = etat.tableau!
      else if (etat.etat === 'corbeille') throw new ErreurPorte(422, 'impossible', `Le dossier de la fiche ${f.cle} est à la corbeille : la personne doit le remettre dans Notak (ou depuis la fiche).`)
      else if (etat.etat === 'inaccessible') throw new ErreurPorte(403, 'lecture_seule', `Le dossier de la fiche ${f.cle} existe, mais la personne n’y a pas accès.`)
      else if (!f.titre?.trim()) throw new ErreurPorte(404, 'tableau_introuvable', `La fiche ${f.cle} n’a pas encore de dossier : redemande avec fiche.titre (le nom de la fiche) pour le créer.`)
      else {
        const cree = await d.creerFiche(u, f.cle, f.titre.trim())
        if (!cree) throw new ErreurPorte(403, 'lecture_seule', 'La personne ne peut pas créer de dossier là où l’outil range ses fiches.')
        parent = cree
      }
      await acces(u, parent, true)
    } else {
      parent = u.racine
      await acces(u, parent, true)
    }
    const { id, carte } = await d.creerToile(u, parent, titre, { ...(a.dossier === true ? { dossier: true } : {}), ...(typeof a.couleur === 'string' ? { couleur: a.couleur } : {}) })
    // `carte` : l'élément qui le range dans `dans` ; le jeter (jeter_elements) met le tableau à la corbeille, comme dans l'app.
    return { tableau: { id, titre, adresse: adresse({ tableau: id }, a.dossier === true) }, dans: { id: parent, titre: titreDe(parent) ?? '' }, ...(carte ? { carte } : {}) }
  }

  // ---- ajouter_elements ----

  const ajouter = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    const droits = await acces(u, id, true)
    const demandes = a.elements as ElementDemande[]
    // Un dossier, et l'accueil d'un espace, se montrent dans la bibliothèque, qui n'y montre que des pages, des cartes
    // mentales et des liens : une note posée là ne se verrait pas.
    if (d.estDossier(id) || estAccueil(id) || id === u.racine) {
      const autres = demandes.filter((x) => !(TYPES_DE_DOSSIER as readonly string[]).includes(x.type))
      if (autres.length) {
        const ou = d.estDossier(id) ? `le dossier « ${titreDe(id) ?? ''} »` : 'l’accueil'
        throw new ErreurPorte(
          422,
          'impossible',
          `On ne range dans ${ou} que des pages, des cartes mentales et des liens (${autres.map((x) => `« ${x.type} »`).join(', ')} ne s’y verrait pas). Pour le reste, crée un tableau dedans (creer_tableau), puis pose-y les éléments.`,
        )
      }
    }
    const place = (a.place ?? {}) as { pres_de?: string; cote?: 'droite' | 'dessous' | 'gauche' | 'dessus'; dans_colonne?: string; x?: number; y?: number; disposition?: 'ligne' | 'pile' | 'grille' }
    const maintenant = d.maintenant()
    const crees: Record<string, unknown>[] = []
    // Une ligne ne relie que ce que la personne voit : les cartes qu'elle ne doit pas voir n'existent pas pour elle.
    const caches = demandes.some((x) => x.type === 'ligne') ? await d.caches(u, d.lire(id)) : new Set<string>()
    await d.modifier(id, u, (doc) => {
      const scribe = new Scribe(doc)
      const t = scribe.lire()
      if (place.dans_colonne) {
        const col = element(t, place.dans_colonne, droits)
        if (col.contenu.type !== 'colonne') throw new ErreurAgent('impossible', `${place.dans_colonne} n’est pas une colonne (c’est un élément « ${col.contenu.type} »).`)
        const neufs = demandes.map((x, i) => construire(x, maintenant + i, true))
        let ordre = derniereCle(t, col.id)
        doc.transact(() => {
          for (const [i, n] of neufs.entries()) {
            ordre = cleEntre(ordre, undefined)
            const e = { ...n.element, x: col.x, y: col.y, parent: col.id, ordre }
            scribe.poser(e)
            crees.push({ id: e.id, type: demandes[i]!.type, colonne: col.id, l: e.largeur, h: hauteurDe(e), adresse: adresse({ tableau: id, element: e.id, type: demandes[i]!.type }) })
          }
        })
        return
      }
      // Les lignes se posent après le reste : leurs bouts « #n » visent les éléments de la demande, une fois créés.
      const neufs: (Neuf | null)[] = demandes.map((x, i) => (x.type === 'ligne' ? null : construire(x, maintenant + i * 64)))
      for (const [i, x] of demandes.entries()) {
        if (x.type !== 'ligne') continue
        const bout = (champ: 'de' | 'vers'): string => {
          const vise = x[champ]
          if (!vise) throw new ErreurAgent('arguments_invalides', `elements[${i}] : une ligne demande « de » et « vers » (les deux éléments qu’elle relie).`)
          const rang = /^#(\d+)$/.exec(vise)
          if (rang) {
            const n = Number(rang[1])
            const cible = demandes[n - 1]
            if (!cible || n < 1) throw new ErreurAgent('arguments_invalides', `elements[${i}].${champ} : « ${vise} » ne vise aucun élément de la demande (de #1 à #${demandes.length}).`)
            if (cible.type === 'ligne') throw new ErreurAgent('impossible', `elements[${i}].${champ} : « ${vise} » est une ligne ; une ligne relie deux éléments, pas deux lignes.`)
            return neufs[n - 1]!.element.id
          }
          const e = present(t, vise)
          if (caches.has(vise)) throw new ErreurAgent('element_introuvable', `Élément introuvable : ${vise}. Relis le tableau avec lire_tableau avant de le relier.`)
          if (e.contenu.type === 'ligne') throw new ErreurAgent('impossible', `elements[${i}].${champ} : ${vise} est une ligne ; une ligne relie deux éléments, pas deux lignes.`)
          if ((e as { verrou?: boolean }).verrou) throw new ErreurAgent('impossible', `elements[${i}].${champ} : ${vise} est verrouillé sur la toile ; on n’y accroche rien tant qu’il l’est.`)
          if (e.parent || e.nonTrie !== undefined) throw new ErreurAgent('impossible', `elements[${i}].${champ} : ${vise} n’est pas posé sur la toile (rangé dans une colonne) ; relie plutôt sa colonne.`)
          return vise
        }
        neufs[i] = construire({ ...x, de: bout('de'), vers: bout('vers') }, maintenant + i * 64)
      }
      const poses = neufs.map((n, i) => (demandes[i]!.type === 'ligne' ? null : n!))
      const tailles = poses.flatMap((n) => (n ? [{ l: Math.round(n.element.largeur), h: hauteurDe(n.element, n.enfants.length) }] : []))
      const bloc = disposer(tailles, place.disposition ?? 'ligne')
      const occupees = boitesDe(t)
      let origine: { x: number; y: number }
      if (place.pres_de) {
        const boite = boiteDe(t, present(t, place.pres_de))
        origine = placePres(occupees, boite, place.cote ?? 'droite', bloc.l, bloc.h)
      } else if (place.x !== undefined || place.y !== undefined) {
        origine = placeLibre(occupees, bloc.l, bloc.h, { x: place.x ?? 0, y: place.y ?? 0 }, 'bas')
      } else origine = placeParDefaut(occupees, bloc.l, bloc.h)
      doc.transact(() => {
        const parRang: Record<string, unknown>[] = []
        let k = 0
        for (const [i, n] of poses.entries()) {
          if (!n) continue
          const p = bloc.places[k]!
          const h = tailles[k]!.h
          k++
          const e = { ...n.element, x: origine.x + p.x, y: origine.y + p.y }
          scribe.poser(e, n.arbre)
          for (const enfant of n.enfants) scribe.poser({ ...enfant, x: e.x, y: e.y })
          parRang[i] = {
            id: e.id,
            type: demandes[i]!.type,
            x: e.x,
            y: e.y,
            l: Math.round(e.largeur),
            h,
            ...(n.enfants.length ? { elements: n.enfants.map((x) => x.id) } : {}),
            ...(n.arbre ? { plan: planDeLArbre(n.arbre).plan } : {}),
            adresse: adresse({ tableau: id, element: e.id, type: demandes[i]!.type }),
          }
        }
        // Les lignes, au-dessus de ce qu'elles relient ; elles ne prennent pas de place sur la toile.
        for (const [i, n] of neufs.entries()) {
          if (demandes[i]!.type !== 'ligne') continue
          const e = n!.element
          scribe.poser(e)
          const c = e.contenu as unknown as { depart: { element: string }; arrivee: { element: string } }
          parRang[i] = { id: e.id, type: 'ligne', de: c.depart.element, vers: c.arrivee.element, adresse: adresse({ tableau: id, element: e.id, type: 'ligne' }) }
        }
        crees.push(...parRang)
      })
    })
    return { crees }
  }

  // ---- modifier_elements ----

  interface Modification {
    id: string
    texte?: string
    ajouter_texte?: string
    retirer_blocs?: string[]
    attendu?: string
    titre?: string
    couleur?: string
    taches?: { texte: string; faite?: boolean }[]
    cocher?: { rang: number; faite: boolean }[]
    lignes?: string[][]
    branches?: GesteBranche[]
    x?: number
    y?: number
    colonne?: string
    rang?: number
  }

  const modifier = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    const droits = await acces(u, id, true)
    const modifications = a.modifications as Modification[]
    const generes = modifications.some((m) => m.x !== undefined || m.y !== undefined || m.colonne !== undefined) ? await d.generes(u, id) : {}
    const modifies: string[] = []
    const plans: Record<string, unknown> = {}
    // Ce que chaque champ changé valait avant la demande, dans les mots de l'opération : de quoi la défaire.
    const avant: Record<string, Record<string, unknown>> = {}
    const plansAvant: Record<string, unknown> = {}
    // L'empreinte du texte de chaque page dont le texte change, tel qu'il sera : de quoi enchaîner, ou défaire sans écraser.
    const empreintes: Record<string, string> = {}
    // Ce que quelqu'un écrit en ce moment : une page ouverte en écriture ne se récrit pas (son éditeur la récrirait).
    const editeurs = d.enEdition(id)
    await d.modifier(id, u, (doc) => {
      const scribe = new Scribe(doc)
      const t = scribe.lire()
      // Tout se prépare d'abord : une erreur au dixième changement n'en laisse pas neuf.
      const copies = new Map<string, Record<string, unknown>>()
      const cartes = new Map<string, { avant: Arbre; apres: Arbre }>()
      const textesDePage = new Set<string>()
      for (const [i, m] of modifications.entries()) {
        const e = element(t, m.id, droits)
        const ou = `modifications[${i}]`
        const brut = copies.get(m.id) ?? structuredClone(scribe.brut(m.id)!)
        delete brut.plan
        const c = brut.contenu as Record<string, unknown>
        const type = c.type as string
        const titre = type === 'note' && c.variante === 'titre'
        const page = type === 'document'
        const refus = (champ: string, pour: string) =>
          new ErreurAgent('impossible', `${ou}.${champ} ne vaut que pour ${pour} ; ${m.id} est un élément « ${titre ? 'titre' : type === 'arbre' ? 'carte_mentale' : page ? 'page' : type} ».`)
        const gestesDeTexte = [m.texte, m.ajouter_texte, m.retirer_blocs].filter((x) => x !== undefined).length
        if (gestesDeTexte > 1) throw new ErreurAgent('arguments_invalides', `${ou} : texte, ajouter_texte et retirer_blocs ne vont pas ensemble ; un seul par modification.`)
        if (page) {
          if (gestesDeTexte || m.titre !== undefined || m.couleur !== undefined) {
            const qui = editeurs.get(m.id)
            if (qui !== undefined) {
              throw new ErreurPorte(
                423,
                'en_edition',
                `${ou} : la page « ${String(e.contenu.titre ?? '')} » est ouverte en écriture${qui ? ` (par ${qui})` : ''} ; rien n’a changé. Dis-le à la personne : une fois la page refermée, tu pourras la modifier.`,
              )
            }
          }
          if (gestesDeTexte && textesDePage.has(m.id)) throw new ErreurAgent('arguments_invalides', `${ou} : le texte de la page ${m.id} change déjà dans cette demande ; un seul changement de texte par page et par demande.`)
          if (m.attendu !== undefined && empreinteDe(markdownDePage(e.contenu.texte)) !== m.attendu) {
            throw new ErreurPorte(
              409,
              'modifie_depuis',
              `${ou} : la page « ${String(e.contenu.titre ?? '')} » a changé depuis que tu l’as lue ou modifiée (quelqu’un l’a retouchée) ; rien n’a changé. Relis-la avec lire_tableau, et dis-le à la personne avant de récrire ce qu’elle a fait.`,
            )
          }
        } else if (m.attendu !== undefined) throw refus('attendu', 'une page')
        // La valeur d'avant, notée la première fois que la demande touche ce champ.
        const noter = (champ: string, valeur: () => unknown) => {
          const deja = (avant[m.id] ??= {})
          if (!(champ in deja)) deja[champ] = valeur()
        }
        const initial = e.contenu as Record<string, unknown>
        if (m.texte !== undefined || (m.ajouter_texte !== undefined && !page)) {
          noter('texte', () => (titre ? texteSimple(initial.texte as NoeudTexte) : page ? markdownDePage(initial.texte) : markdownDepuisDoc(initial.texte)))
        }
        if (m.titre !== undefined && type !== 'arbre') {
          noter('titre', () => (titre ? texteSimple(initial.texte as NoeudTexte) : type === 'table' && initial.avecTitre === false ? '' : String(initial.titre ?? '')))
        }
        if (m.couleur !== undefined) noter('couleur', () => (typeof initial.couleur === 'string' ? initial.couleur : 'aucune'))
        if (m.taches !== undefined) noter('taches', () => tachesDe(initial.texte).map(({ texte, faite }) => ({ texte, faite })))
        if (m.cocher !== undefined) {
          const faites = tachesDe(initial.texte)
          const deja = (avant[m.id] ??= {})
          const liste = (deja.cocher as { rang: number; faite: boolean }[] | undefined) ?? []
          for (const x of m.cocher) if (faites[x.rang] && !liste.some((l) => l.rang === x.rang)) liste.push({ rang: x.rang, faite: faites[x.rang]!.faite })
          deja.cocher = liste
        }
        if (m.lignes !== undefined) noter('lignes', () => (Array.isArray(initial.cellules) ? structuredClone(initial.cellules) : []))
        if ((m.titre !== undefined || m.branches !== undefined) && type === 'arbre' && !(m.id in plansAvant)) plansAvant[m.id] = planDeLArbre(scribe.arbre(m.id)!).plan
        if (m.x !== undefined || m.y !== undefined || m.colonne !== undefined) {
          noter('place', () => placeDe(t, e))
          if ((e as { verrou?: boolean }).verrou) throw new ErreurAgent('impossible', `${ou} : ${m.id} est verrouillé sur la toile ; la personne doit le déverrouiller pour qu’il bouge.`)
          if (genereDe(e, generes)) throw new ErreurAgent('impossible', `${ou} : ${m.id} est la carte du dossier d’une fiche de ${genereDe(e, generes)} ; elle reste où elle est.`)
          if (m.colonne !== undefined) {
            if (m.x !== undefined || m.y !== undefined) throw new ErreurAgent('arguments_invalides', `${ou} : donne x et y (sur la toile) ou colonne (dans une colonne), pas les deux.`)
            const col = element(t, m.colonne, droits)
            if (col.contenu.type !== 'colonne') throw new ErreurAgent('impossible', `${ou}.colonne : ${m.colonne} n’est pas une colonne.`)
            if (type === 'colonne' || type === 'ligne') throw new ErreurAgent('impossible', `${ou} : un élément « ${type} » ne se range pas dans une colonne.`)
            const freres = t.elements
              .filter((x) => x.parent === col.id && x.corbeille === undefined && x.id !== m.id)
              .sort((p, q) => ((p.ordre ?? '') < (q.ordre ?? '') ? -1 : 1))
            const rang = Math.min(m.rang ?? freres.length, freres.length)
            const ordre = cleEntre(freres[rang - 1]?.ordre, freres[rang]?.ordre)
            delete brut.nonTrie
            Object.assign(brut, { parent: col.id, ordre, x: col.x, y: col.y })
          } else {
            delete brut.parent
            delete brut.ordre
            delete brut.nonTrie
            if (m.x !== undefined) brut.x = m.x
            if (m.y !== undefined) brut.y = m.y
          }
        }
        if (m.texte !== undefined) {
          if (page) {
            if (pageRiche(initial)) {
              throw new ErreurAgent(
                'impossible',
                `${ou}.texte : la page « ${String(initial.titre ?? '')} » porte ce que son Markdown ne dit pas (une image, des colonnes, un tableau, un passage commenté, une couleur…) : son texte ne se remplace pas d’un bloc. Ajoute à la fin avec ajouter_texte, ou demande à la personne de la retoucher.`,
              )
            }
            c.texte = docDePage(m.texte)
            textesDePage.add(m.id)
          } else if (type === 'note') c.texte = titre ? docDeTitre(m.texte) : docDepuisMarkdown(m.texte)
          else throw refus('texte', 'une note, un titre ou une page')
        }
        if (m.ajouter_texte !== undefined) {
          if (page) {
            const blocs = blocsDePage(m.ajouter_texte, idsDesBlocs(c.texte))
            if (blocs.length === 0) throw new ErreurAgent('arguments_invalides', `${ou}.ajouter_texte : rien à ajouter (que des lignes vides).`)
            c.texte = ajouterAPage(c.texte, blocs)
            textesDePage.add(m.id)
            // Le défaire : retirer ces blocs-là, et rien d'autre.
            const deja = (avant[m.id] ??= {})
            if (!('texte' in deja)) deja.retirer_blocs = [...((deja.retirer_blocs as string[] | undefined) ?? []), ...blocs.map((b) => b.attrs!.id as string)]
          } else if (type === 'note' && !titre) {
            const ajout = docDepuisMarkdown(m.ajouter_texte).content ?? []
            const blocs = (c.texte as NoeudTexte | undefined)?.content ?? []
            const vide = blocs.length === 0 || (blocs.length === 1 && blocs[0]!.type === 'paragraph' && !blocs[0]!.content?.length)
            c.texte = { type: 'doc', content: [...(vide ? [] : blocs), ...ajout] }
          } else throw refus('ajouter_texte', 'une note ou une page')
        }
        if (m.retirer_blocs !== undefined) {
          if (!page) throw refus('retirer_blocs', 'une page')
          const { doc: reste, retires } = retirerDePage(c.texte, new Set(m.retirer_blocs))
          c.texte = reste
          textesDePage.add(m.id)
          // Le défaire : remettre à la fin ce qui est parti (là où était un ajout qu'on défait).
          if (retires.length) noter('ajouter_texte', () => markdownDePage({ type: 'doc', content: retires }))
        }
        if (m.titre !== undefined) {
          const neuf = m.titre.trim()
          if (titre) c.texte = docDeTitre(neuf)
          else if (type === 'taches' || type === 'lien') {
            if (neuf) c.titre = neuf
            else delete c.titre
          } else if (type === 'colonne' || page) c.titre = neuf
          else if (type === 'table') {
            if (neuf) Object.assign(c, { titre: neuf, avecTitre: true })
            else delete c.avecTitre
          } else if (type === 'arbre') {
            const avant = cartes.get(m.id)?.avant ?? scribe.arbre(m.id)!
            const courant = cartes.get(m.id)?.apres ?? avant
            const central = planDeLArbre(courant).plan.id
            cartes.set(m.id, { avant, apres: gestesSurArbre(courant, [{ action: 'renommer', sujet: central, titre: neuf || 'Sujet central' }], m.id) })
          } else throw refus('titre', 'une liste de tâches, une colonne, une table, un lien, un titre, une page ou une carte mentale')
        }
        if (m.couleur !== undefined) {
          if (!['note', 'taches', 'colonne', 'lien', 'document'].includes(type) || titre) throw refus('couleur', 'une note, une liste de tâches, une colonne, un lien ou une page')
          delete c.fond
          if (m.couleur === 'aucune') delete c.couleur
          else c.couleur = m.couleur
        }
        if (m.taches !== undefined) {
          if (type !== 'taches') throw refus('taches', 'une liste de tâches')
          c.texte = docDeTaches(m.taches)
        }
        if (m.cocher !== undefined) {
          if (type !== 'taches') throw refus('cocher', 'une liste de tâches')
          const items = itemsDeTaches(c.texte as NoeudTexte)
          for (const x of m.cocher) {
            const item = items[x.rang]
            if (!item) throw new ErreurAgent('element_introuvable', `${ou}.cocher : pas de tâche au rang ${x.rang} (la liste en a ${items.length}, à partir de 0). Relis le tableau.`)
            item.attrs = { ...(item.attrs ?? {}), checked: x.faite }
          }
        }
        if (m.lignes !== undefined) {
          if (type !== 'table') throw refus('lignes', 'une table')
          const lu = contenuDeTable(m.lignes, e.largeur, typeof c.titre === 'string' && c.avecTitre !== false ? c.titre : undefined)
          const memeLargeur = Array.isArray(c.largeurs) && (c.largeurs as unknown[]).length === (lu.cellules as unknown[][])[0]!.length
          Object.assign(c, { cellules: lu.cellules, formats: lu.formats, ...(memeLargeur ? {} : { largeurs: lu.largeurs }) })
        }
        if (m.branches !== undefined) {
          if (type !== 'arbre') throw refus('branches', 'une carte mentale')
          const avant = cartes.get(m.id)?.avant ?? scribe.arbre(m.id)!
          const courant = cartes.get(m.id)?.apres ?? avant
          cartes.set(m.id, { avant, apres: gestesSurArbre(courant, m.branches, m.id) })
        }
        copies.set(m.id, brut)
        if (!modifies.includes(m.id)) modifies.push(m.id)
      }
      // Le texte de chaque page, tel qu'il sera : son empreinte. Renvoyer `avant` défait le changement, sauf si la page a
      // été retouchée d'ici là (`attendu`).
      for (const x of textesDePage) {
        empreintes[x] = empreinteDe(markdownDePage((copies.get(x)!.contenu as Record<string, unknown>).texte))
        avant[x] = { ...avant[x], attendu: empreintes[x] }
      }
      doc.transact(() => {
        for (const [x, brut] of copies) scribe.changer(x, () => brut)
        for (const [x, { avant, apres }] of cartes) {
          scribe.ecrireArbre(x, avant, apres)
          plans[x] = planDeLArbre(apres).plan
        }
      })
    })
    return { modifies, avant, ...(Object.keys(empreintes).length ? { empreintes } : {}), ...(Object.keys(plans).length ? { plans, plans_avant: plansAvant } : {}) }
  }

  // ---- modifier_tableau ----

  const modifierTableau = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    await acces(u, id, true)
    const titre = typeof a.titre === 'string' ? a.titre.replace(/\s+/g, ' ').trim().slice(0, 200) : undefined
    const outil = d.genereParUnOutil(id)
    if (outil) {
      throw new ErreurPorte(422, 'impossible', `« ${titreDe(id) ?? ''} » est un dossier que ${outil} a fait (celui d’une fiche, ou celui qui les range) : il reste tel que ${outil} l’a fait. Range plutôt ce qu’il faut dedans.`)
    }
    if (a.dossier !== undefined && (estAccueil(id) || id === u.racine)) throw new ErreurPorte(422, 'impossible', 'L’accueil d’un espace reste l’accueil : il ne se montre pas en dossier.')
    const t = d.lire(id)
    // Ce que valait chaque champ changé : renvoyé tel quel, il défait le changement.
    const avant: Record<string, unknown> = {}
    if (titre !== undefined) avant.titre = titreDe(id) ?? t.titre
    if (a.couleur !== undefined) avant.couleur = typeof t.couleur === 'string' ? t.couleur : 'aucune'
    if (a.dossier !== undefined) avant.dossier = t.dossier === true
    await d.modifier(id, u, (doc) => {
      const meta = doc.getMap<unknown>('meta')
      doc.transact(() => {
        if (titre !== undefined) meta.set('titre', titre)
        if (a.couleur === 'aucune') meta.delete('couleur')
        else if (typeof a.couleur === 'string') meta.set('couleur', a.couleur)
        if (a.dossier === true) meta.set('dossier', true)
        else if (a.dossier === false) meta.delete('dossier')
      })
    })
    // La base, tout de suite : la recherche, la bibliothèque et les autres demandes le lisent là.
    if (titre !== undefined) base.changerTitre(id, titre)
    const dossier = a.dossier === undefined ? d.estDossier(id) : a.dossier === true
    return { tableau: { id, titre: titreDe(id) ?? titre ?? '', adresse: adresse({ tableau: id }, dossier), ...(dossier ? { dossier: true } : {}) }, avant }
  }

  // ---- deplacer ----

  const deplacer = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    const vers = a.vers as string
    const droits = await acces(u, id, false)
    const nom = (x: string) => `« ${titreDe(x) || 'Sans titre'} »`
    if (droits.role !== 'proprietaire') throw new ErreurPorte(403, 'interdit', `Seul le propriétaire de ${nom(id)} peut le ranger ailleurs ; la personne ne l’est pas (droits : ${droits.role}).`)
    await acces(u, vers, true)
    if (estAccueil(id) || id === u.racine) throw new ErreurPorte(422, 'impossible', 'L’accueil d’un espace ne se range pas ailleurs : c’est lui qui range tout le reste.')
    const outil = d.genereParUnOutil(id)
    if (outil) throw new ErreurPorte(422, 'impossible', `${nom(id)} est un dossier que ${outil} a fait : il reste là où ${outil} l’a mis.`)
    if (vers === id) throw new ErreurPorte(422, 'impossible', `${nom(id)} ne se range pas dans lui-même.`)
    if (base.descendants(id).includes(vers)) throw new ErreurPorte(422, 'impossible', `${nom(vers)} est rangé dans ${nom(id)} : un tableau ne se range pas dans ce qu’il contient.`)
    if ((base.tableau(vers)?.espace ?? null) !== (base.tableau(id)?.espace ?? null)) {
      throw new ErreurPorte(422, 'impossible', `${nom(id)} et ${nom(vers)} ne sont pas dans le même espace : un tableau ne change pas d’espace ainsi.`)
    }
    const de = d.porteurDe(id) ?? base.tableau(id)?.parent ?? null
    const ancienne = de ? d.lire(de).elements.find((e) => e.contenu.type === 'tableau' && e.contenu.cible === id && !e.contenu.raccourci) : undefined
    if (ancienne?.corbeille !== undefined) throw new ErreurPorte(422, 'impossible', `${nom(id)} est à la corbeille : la personne doit le remettre avant de le ranger ailleurs.`)
    // Sa carte part de là où elle est : il faut pouvoir l'y retirer, comme dans la bibliothèque.
    if (ancienne && de && de !== vers) {
      const ici = await d.droitsSur(u, de)
      if (!ici || !permis(ici, ancienne.id, 'ecriture')) {
        throw new ErreurPorte(403, 'lecture_seule', `La carte de ${nom(id)} est sur un tableau que la personne ne peut pas modifier : elle ne peut pas le ranger ailleurs d’ici.`)
      }
    }
    const dit = (x: string | null) => (x ? { id: x, titre: titreDe(x) ?? '' } : null)
    const resultat = (bilan: Bilan) => ({
      tableau: { id, titre: titreDe(id) ?? '', adresse: adresse({ tableau: id }) },
      de: dit(de),
      vers: dit(vers),
      acces: accesDuBilan(bilan),
    })
    // Déjà là : rien à faire.
    if (de === vers && base.tableau(id)?.parent === vers) return { ...resultat(SANS_CHANGEMENT), ...(ancienne ? { carte: ancienne.id } : {}), avant: { dans: vers } }
    const bilan = await d.rangerLaToile(u, id, vers, true)
    if (a.essai === true) return { essai: true, ...resultat(bilan) }
    if (!rienNeChange(bilan) && a.accepter_acces !== true) {
      throw new ErreurPorte(
        409,
        'acces_change',
        `Ranger ${nom(id)} dans ${nom(vers)} change qui y a accès : ${phraseDuBilan(bilan)}. Rien n’a bougé. Demande l’accord de la personne, puis recommence avec accepter_acces.`,
      )
    }
    await d.rangerLaToile(u, id, vers, false)
    // Sa carte : recréée chez `vers` (son icône, son image, sa couleur), puis retirée de l'ancien porteur, comme le
    // transfert de la bibliothèque. Une carte déjà chez `vers` sert telle quelle.
    let carte: string | null = null
    await d.modifier(vers, u, (doc) => {
      const scribe = new Scribe(doc)
      const t = scribe.lire()
      const deja = t.elements.find((e) => e.contenu.type === 'tableau' && e.contenu.cible === id && !e.contenu.raccourci && e.corbeille === undefined)
      if (deja) {
        carte = deja.id
        return
      }
      const neuve = carteDeToile(t, id, d.maintenant(), ancienne)
      doc.transact(() => scribe.poser(neuve))
      carte = neuve.id
    })
    if (ancienne && de && de !== vers) {
      await d.modifier(de, u, (doc) => {
        const scribe = new Scribe(doc)
        doc.transact(() => scribe.retirer(ancienne.id))
      })
    }
    return { ...resultat(bilan), ...(carte ? { carte } : {}), avant: { dans: de } }
  }

  // ---- ranger ----

  interface Groupe {
    titre?: string
    elements: string[]
    en_colonne?: boolean
    couleur?: string
  }

  const ranger = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    const droits = await acces(u, id, true)
    const generes = await d.generes(u, id)
    const groupes = a.groupes as Groupe[]
    const enLignes = a.disposition === 'lignes'
    const maintenant = d.maintenant()
    const resultat: { ranges: Record<string, unknown>[]; titres: string[]; colonnes: string[]; cadre?: Boite; avant: Record<string, unknown> } = {
      ranges: [],
      titres: [],
      colonnes: [],
      avant: {},
    }
    await d.modifier(id, u, (doc) => {
      const scribe = new Scribe(doc)
      const t = scribe.lire()
      const parId = new Map(t.elements.map((e) => [e.id, e]))
      const nommes = new Set<string>()
      for (const [i, g] of groupes.entries()) {
        for (const x of g.elements) {
          const e = element(t, x, droits)
          if (nommes.has(x)) throw new ErreurAgent('impossible', `groupes[${i}] : ${x} est déjà dans un autre groupe ; chaque élément ne va que dans un groupe.`)
          if (e.contenu.type === 'ligne') throw new ErreurAgent('impossible', `groupes[${i}] : ${x} est une ligne ; elle suit les éléments qu’elle relie, ne la range pas.`)
          if ((e as { verrou?: boolean }).verrou) throw new ErreurAgent('impossible', `groupes[${i}] : ${x} est verrouillé sur la toile ; la personne doit le déverrouiller pour qu’il bouge.`)
          if (genereDe(e, generes)) throw new ErreurAgent('impossible', `groupes[${i}] : ${x} est la carte du dossier d’une fiche de ${genereDe(e, generes)} ; elle reste où elle est.`)
          if (g.en_colonne && e.contenu.type === 'colonne') throw new ErreurAgent('impossible', `groupes[${i}] : ${x} est une colonne ; une colonne ne se range pas dans une colonne.`)
          nommes.add(x)
        }
      }
      const normal = (s: string) => s.trim().toLocaleLowerCase('fr')
      const reutilises = new Set<string>()
      // Chaque groupe : ses pièces dans l'ordre (le titre d'abord), ou sa colonne.
      type Piece = { id: string; l: number; h: number; neuf?: ElementLu }
      const plan = groupes.map((g, i) => {
        if (g.en_colonne) {
          const existante = t.elements.find(
            (e) => e.contenu.type === 'colonne' && e.corbeille === undefined && !nommes.has(e.id) && !reutilises.has(e.id) && g.titre && normal(String(e.contenu.titre ?? '')) === normal(g.titre),
          )
          if (existante) {
            element(t, existante.id, droits)
            reutilises.add(existante.id)
          }
          const col = existante ?? construire({ type: 'colonne', titre: g.titre ?? '', ...(g.couleur ? { couleur: g.couleur } : {}) }, maintenant + i).element
          const autres = existante ? t.elements.filter((e) => e.parent === existante.id && e.corbeille === undefined && !nommes.has(e.id)).length : 0
          return { g, colonne: { id: col.id, l: Math.round(col.largeur), h: hauteurDe(col, autres + g.elements.length), ...(existante ? {} : { neuf: col }) } as Piece, pieces: [] as Piece[] }
        }
        const pieces: Piece[] = []
        let elements = g.elements
        if (g.titre?.trim()) {
          const estTitre = (e: ElementLu | undefined) => e?.contenu.type === 'note' && e.contenu.variante === 'titre' && normal(texteSimple(e.contenu.texte as NoeudTexte)) === normal(g.titre!)
          const dedans = elements.find((x) => estTitre(parId.get(x)))
          const ailleurs = dedans ? undefined : t.elements.find((e) => estTitre(e) && e.corbeille === undefined && !e.parent && !nommes.has(e.id) && !reutilises.has(e.id))
          if (dedans) elements = [dedans, ...elements.filter((x) => x !== dedans)]
          else if (ailleurs) {
            element(t, ailleurs.id, droits)
            reutilises.add(ailleurs.id)
            pieces.push({ id: ailleurs.id, l: Math.round(ailleurs.largeur), h: hauteurDe(ailleurs) })
          } else {
            const neuf = construire({ type: 'titre', texte: g.titre }, maintenant + i).element
            pieces.push({ id: neuf.id, l: Math.round(neuf.largeur), h: hauteurDe(neuf), neuf })
          }
        }
        for (const x of elements) {
          const e = parId.get(x)!
          const enfants = t.elements.filter((y) => y.parent === x && y.corbeille === undefined).length
          pieces.push({ id: x, l: Math.round(e.largeur), h: hauteurDe(e, enfants) })
        }
        return { g, pieces }
      })
      // Les places relatives : chaque groupe en pile (ou en rangée, disposé en lignes), les groupes côte à côte.
      const places = new Map<string, { x: number; y: number }>()
      let curseur = 0
      let largeur = 0
      let hauteur = 0
      for (const p of plan) {
        const pieces = 'colonne' in p && p.colonne ? [p.colonne] : p.pieces
        let l = 0
        let h = 0
        if (enLignes) {
          // Le titre au-dessus, le reste côte à côte.
          let x = 0
          let y = 0
          const [tete, ...reste] = p.g.titre?.trim() && !p.g.en_colonne ? pieces : [undefined, ...pieces]
          if (tete) {
            places.set(tete.id, { x: 0, y: curseur })
            y = tete.h + ECART
            l = tete.l
          }
          let haut = 0
          for (const q of reste as Piece[]) {
            places.set(q.id, { x, y: curseur + y })
            x += q.l + ECART
            haut = Math.max(haut, q.h)
          }
          l = Math.max(l, x - ECART)
          h = y + haut
          curseur += h + ECART_GROUPES
          largeur = Math.max(largeur, l)
          hauteur = curseur - ECART_GROUPES
        } else {
          let y = 0
          for (const q of pieces) {
            places.set(q.id, { x: curseur, y })
            y += q.h + ECART
            l = Math.max(l, q.l)
          }
          h = y - ECART
          curseur += l + ECART_GROUPES
          largeur = curseur - ECART_GROUPES
          hauteur = Math.max(hauteur, h)
        }
      }
      // Où commence le rangement : là où sont déjà les éléments rangés, sauf s'il recouvrirait le reste.
      const bouges = new Set([...nommes, ...reutilises])
      const autres = boitesDe(t, bouges)
      const ici = boitesDe(t).filter((b) => bouges.has(b.id))
      let origine = (a.origine as { x: number; y: number } | undefined) ?? (ici.length ? { x: englobante(ici).x, y: englobante(ici).y } : placeParDefaut(autres, largeur, hauteur))
      if (autres.some((o) => chevauche({ ...origine, l: largeur, h: hauteur }, o, ECART))) origine = placeParDefaut(autres, largeur, hauteur)
      resultat.cadre = { ...origine, l: largeur, h: hauteur }
      // Où était tout ce qui bouge : de quoi défaire le rangement (modifier_elements avec x et y, ou colonne et rang).
      for (const x of bouges) {
        const e = parId.get(x)
        if (e) resultat.avant[x] = placeDe(t, e)
      }
      doc.transact(() => {
        for (const p of plan) {
          if ('colonne' in p && p.colonne) {
            const col = p.colonne
            const ou = places.get(col.id)!
            const x = origine.x + ou.x
            const y = origine.y + ou.y
            if (col.neuf) {
              scribe.poser({ ...col.neuf, x, y })
              resultat.colonnes.push(col.id)
            } else scribe.changer(col.id, (e) => ({ ...sansPlace(e), x, y }))
            let ordre = derniereCle(t, col.id, nommes)
            p.g.elements.forEach((x2, rang) => {
              ordre = cleEntre(ordre, undefined)
              const k = ordre
              scribe.changer(x2, (e) => ({ ...sansPlace(e), x, y, parent: col.id, ordre: k }))
              resultat.ranges.push({ id: x2, colonne: col.id, rang })
            })
            continue
          }
          for (const q of p.pieces) {
            const ou = places.get(q.id)!
            const x = origine.x + ou.x
            const y = origine.y + ou.y
            if (q.neuf) {
              scribe.poser({ ...q.neuf, x, y })
              resultat.titres.push(q.id)
            } else scribe.changer(q.id, (e) => ({ ...sansPlace(e), x, y }))
            if (!q.neuf) resultat.ranges.push({ id: q.id, x, y })
          }
        }
      })
    })
    return resultat
  }

  // ---- jeter_elements, remettre_elements ----

  const jeter = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    const droits = await acces(u, id, true)
    const generes = await d.generes(u, id)
    const jetes: string[] = []
    const deja: string[] = []
    await d.modifier(id, u, (doc) => {
      const scribe = new Scribe(doc)
      const t = scribe.lire()
      const voulus = new Set<string>()
      for (const x of a.elements as string[]) {
        const e = element(t, x, droits, { corbeille: true })
        if (e.corbeille !== undefined) {
          deja.push(x)
          continue
        }
        if ((e as { verrou?: boolean }).verrou) throw new ErreurAgent('impossible', `${x} est verrouillé sur la toile : la personne doit le déverrouiller pour le jeter.`)
        if (genereDe(e, generes)) throw new ErreurAgent('impossible', `${x} est la carte du dossier d’une fiche de ${genereDe(e, generes)} : il se jette depuis l’outil ou par la personne, pas ici.`)
        voulus.add(x)
      }
      // Les lignes accrochées partent avec ce qu'elles relient, comme dans l'app.
      for (const e of t.elements) if (e.corbeille === undefined && e.contenu.type === 'ligne' && accrochee(e, voulus)) voulus.add(e.id)
      // Ce que range une colonne jetée part avec elle, sans quitter sa colonne.
      const partants = t.elements.filter((e) => voulus.has(e.id) && !(e.parent && voulus.has(e.parent)))
      const quand = d.maintenant()
      doc.transact(() => {
        for (const e of partants) scribe.changer(e.id, (x) => ({ ...sansPlace(x), x: Math.round(e.x), y: Math.round(e.y), corbeille: quand }))
      })
      jetes.push(...(a.elements as string[]).filter((x) => voulus.has(x)))
    })
    return { jetes, deja }
  }

  const remettre = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    const droits = await acces(u, id, true)
    const remis: string[] = []
    const deja: string[] = []
    await d.modifier(id, u, (doc) => {
      const scribe = new Scribe(doc)
      const t = scribe.lire()
      const voulus = new Map<string, number>()
      for (const x of a.elements as string[]) {
        const e = element(t, x, droits, { corbeille: true })
        if (e.corbeille === undefined) deja.push(x)
        else voulus.set(x, e.corbeille)
      }
      // Les lignes jetées en même temps que ce qu'elles relient reviennent avec, quand leurs deux bouts sont de nouveau
      // sur la toile (sinon elles pendraient vers un élément resté à la corbeille).
      const instants = new Set(voulus.values())
      const revenus = new Set(voulus.keys())
      const surLaToile = (x: string) => revenus.has(x) || t.elements.some((y) => y.id === x && y.corbeille === undefined)
      for (const e of t.elements) {
        if (e.contenu.type !== 'ligne' || e.corbeille === undefined || !instants.has(e.corbeille) || !accrochee(e, revenus)) continue
        if (boutsDe(e).every(surLaToile)) voulus.set(e.id, e.corbeille)
      }
      doc.transact(() => {
        for (const x of voulus.keys()) {
          scribe.changer(x, (e) => {
            const { corbeille: _c, ...reste } = e
            return reste
          })
          if ((a.elements as string[]).includes(x)) remis.push(x)
        }
      })
    })
    return { remis, deja }
  }

  const operations: Record<NomOperation, (u: Utilisateur, a: Args) => Promise<Record<string, unknown>>> = {
    trouver,
    lire_tableau: lireTableau,
    creer_tableau: creerTableau,
    ajouter_elements: ajouter,
    modifier_elements: modifier,
    modifier_tableau: modifierTableau,
    deplacer,
    ranger,
    jeter_elements: jeter,
    remettre_elements: remettre,
  }

  return {
    /** Fait l'opération au nom de la personne ; une erreur de l'agent devient une `ErreurPorte`. */
    async executer(u: Utilisateur, operation: NomOperation, a: Args): Promise<Record<string, unknown>> {
      try {
        return await operations[operation](u, a)
      } catch (e) {
        if (e instanceof ErreurAgent) throw new ErreurPorte(e.code === 'element_introuvable' ? 404 : e.code === 'impossible' ? 422 : 400, e.code, e.message)
        throw e
      }
    },
  }
}

const SANS_CHANGEMENT: Bilan = { nouveaux: 0, perdus: 0, permanents: 0, liensOuverts: 0, liensEteints: 0, membresPerdus: 0, membresNouveaux: 0 }

/** Ce qu'un rangement change pour les autres, dans les mots du contrat, avec la phrase qui le dit. */
function accesDuBilan(b: Bilan) {
  return {
    change: !rienNeChange(b),
    gagnent: b.nouveaux,
    perdent: b.perdus,
    deviennent_permanents: b.permanents,
    liens_ouverts: b.liensOuverts,
    liens_eteints: b.liensEteints,
    membres_perdent: b.membresPerdus,
    membres_gagnent: b.membresNouveaux,
    resume: rienNeChange(b) ? 'Personne d’autre n’y gagne ni n’y perd l’accès.' : `${phraseDuBilan(b).replace(/^./, (x) => x.toUpperCase())}.`,
  }
}

/** « 2 personnes ou équipes y gagneraient l'accès, 1 lien de visiteur s'éteindrait » : ce que change un rangement. */
function phraseDuBilan(b: Bilan): string {
  const n = (k: number, un: string, plusieurs: string) => (k > 0 ? [`${k} ${k > 1 ? plusieurs : un}`] : [])
  return [
    ...n(b.nouveaux, 'personne ou équipe y gagnerait l’accès', 'personnes ou équipes y gagneraient l’accès'),
    ...n(b.perdus, 'personne ou équipe le perdrait', 'personnes ou équipes le perdraient'),
    ...n(b.permanents, 'accès limité dans le temps deviendrait permanent', 'accès limités dans le temps deviendraient permanents'),
    ...n(b.liensOuverts, 'lien de visiteur y mènerait', 'liens de visiteurs y mèneraient'),
    ...n(b.liensEteints, 'lien de visiteur n’y mènerait plus', 'liens de visiteurs n’y mèneraient plus'),
    ...n(b.membresPerdus, 'membre de l’espace ne le verrait plus', 'membres de l’espace ne le verraient plus'),
    ...n(b.membresNouveaux, 'membre de l’espace le verrait', 'membres de l’espace le verraient'),
  ].join(', ')
}

/** L'empreinte du texte d'une page (son Markdown) : ce que `attendu` compare, pour ne rien récrire qui ait changé depuis. */
export const empreinteDe = (texte: string) => createHash('sha256').update(texte).digest('hex').slice(0, 16)

/** La boîte d'un élément sur la toile ; rangé dans une colonne, celle de sa colonne. */
function boiteDe(t: TableauLu, e: ElementLu): Boite {
  const sur = e.parent ? (t.elements.find((x) => x.id === e.parent) ?? e) : e
  return boitesDe({ ...t, elements: [{ ...sur, parent: undefined, corbeille: undefined, nonTrie: undefined } as ElementLu] })[0] ?? { x: Math.round(sur.x), y: Math.round(sur.y), l: Math.round(sur.largeur), h: 6 }
}

/** Où est un élément, dans les mots de `modifier_elements` : sur la toile (`x`, `y`) ou dans une colonne (`colonne`, `rang`). */
function placeDe(t: TableauLu, e: ElementLu): { x: number; y: number } | { colonne: string; rang: number } {
  if (!e.parent) return { x: Math.round(e.x), y: Math.round(e.y) }
  const freres = t.elements.filter((x) => x.parent === e.parent && x.corbeille === undefined).sort((p, q) => ((p.ordre ?? '') < (q.ordre ?? '') ? -1 : 1))
  return { colonne: e.parent, rang: Math.max(0, freres.findIndex((x) => x.id === e.id)) }
}

/** La plus haute clé d'ordre parmi ce que range la colonne (sauf `sans`), pour poser à la suite. */
function derniereCle(t: TableauLu, colonne: string, sans: ReadonlySet<string> = new Set()): string | undefined {
  let k: string | undefined
  for (const e of t.elements) if (e.parent === colonne && !sans.has(e.id) && typeof e.ordre === 'string' && (k === undefined || e.ordre > k)) k = e.ordre
  return k
}

/** L'outil dont cette carte mène au dossier généré d'une fiche (`generes` : par toile), ou `undefined`. */
function genereDe(e: ElementLu, generes: Record<string, string>): string | undefined {
  const c = e.contenu
  return c.type === 'tableau' && !c.raccourci && typeof c.cible === 'string' ? generes[c.cible] : undefined
}

/** Un élément sans sa place dans une colonne ni dans les non triés : il va sur la toile. */
function sansPlace(e: Record<string, unknown>): Record<string, unknown> {
  const { parent: _p, ordre: _o, nonTrie: _n, ...reste } = e
  return reste
}

/** Les éléments auxquels une ligne est accrochée (un bout libre, posé sur la toile, n'en est pas un). */
function boutsDe(e: ElementLu): string[] {
  const bout = (b: unknown) => (b && typeof b === 'object' ? (b as { element?: unknown }).element : undefined)
  return [bout(e.contenu.depart), bout(e.contenu.arrivee)].filter((x): x is string => typeof x === 'string')
}

/** Une ligne accrochée, par son départ ou son arrivée, à l'un de ces éléments. */
function accrochee(e: ElementLu, ids: ReadonlySet<string>): boolean {
  return boutsDe(e).some((x) => ids.has(x))
}

/** Les cases d'une liste de tâches, à plat dans l'ordre de lecture : les mêmes rangs que `tachesDe`. */
function itemsDeTaches(doc: NoeudTexte | undefined): NoeudTexte[] {
  const sortie: NoeudTexte[] = []
  const parcourir = (n: NoeudTexte | undefined) => {
    for (const liste of n?.content ?? []) {
      if (liste.type !== 'taskList') continue
      for (const item of liste.content ?? []) {
        sortie.push(item)
        parcourir({ type: 'doc', content: (item.content ?? []).slice(1) })
      }
    }
  }
  parcourir(doc)
  return sortie
}

export type { BrancheDemande }
