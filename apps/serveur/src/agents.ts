import type * as Y from 'yjs'
import { cleEntre } from '../../../packages/tableau/src/coeur/ordre.ts'
import { type DroitsTableau, permis } from '../../../packages/tableau/src/coeur/reglesDroits.ts'
import type { Arbre } from '../../../packages/tableau/src/coeur/tableau.ts'
import type { NomOperation } from './agentsContrat.ts'
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
import { docDeTitre, docDepuisMarkdown, markdownDepuisDoc, texteSimple } from '../../../packages/tableau/src/agents/texte.ts'
import type { Base, Utilisateur } from './base.ts'
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
  /** Les cartes que la personne ne doit pas voir dans ce tableau. */
  caches(u: Utilisateur, t: TableauLu): Promise<Set<string>>
  /** Les cartes de dossiers générés par un outil que ce tableau porte : elles restent où elles sont. */
  generes(u: Utilisateur, tableau: string): Promise<Record<string, string>>
  /** Crée une toile dans `parent`, sa carte posée là ; rend son identifiant et celui de sa carte. */
  creerToile(u: Utilisateur, parent: string, titre: string, o: { dossier?: boolean; couleur?: string }): Promise<{ id: string; carte: string | null }>
  recents(u: Utilisateur, limite: number): Promise<{ tableau: string; titre: string; genre: string; modifie: number | null }[]>
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
  /** L'adresse d'un tableau dans l'app (`Partage.tsx`) ; un dossier s'ouvre dans la bibliothèque, jamais en toile. */
  const adresse = (id: string, dossier = d.estDossier(id)) =>
    dossier ? `${d.origine ?? ''}/?dossier=${encodeURIComponent(id)}` : `${d.origine ?? ''}/t/${encodeURIComponent(id)}`

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
    const limite = (a.limite as number | undefined) ?? 20
    const r: Record<string, unknown> = {
      personne: { nom: u.nom },
      espaces: base.espacesDe(u.id).map((e) => ({ id: e.id, nom: e.nom, accueil: e.racine, personnel: e.personnel })),
    }
    if (typeof a.fiche === 'string') r.fiche = await d.fiche(u, a.fiche)
    if (typeof a.dans === 'string') {
      await acces(u, a.dans, false)
      const t = d.lire(a.dans)
      const caches = await d.caches(u, t)
      r.contenu = t.elements
        .filter((e) => e.contenu.type === 'tableau' && e.corbeille === undefined && !caches.has(e.id) && typeof e.contenu.cible === 'string' && base.tableau(e.contenu.cible))
        .slice(0, 200)
        .map((e) => {
          const cible = e.contenu.cible as string
          return { tableau: cible, titre: titreDe(cible) ?? '', genre: d.estDossier(cible) ? 'dossier' : 'toile', element: e.id }
        })
    }
    if (typeof a.texte === 'string') r.resultats = await d.rechercher(u, a.texte, limite)
    if (a.texte === undefined && a.dans === undefined && a.fiche === undefined) r.recents = await d.recents(u, limite)
    return r
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
    return { tableau: { id, titre: titreDe(id) ?? t.titre, droits: droits.role, adresse: adresse(id), ...(t.dossier ? { dossier: true } : {}) }, ...lu }
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
    return { tableau: { id, titre, adresse: adresse(id, a.dossier === true) }, dans: { id: parent, titre: titreDe(parent) ?? '' }, ...(carte ? { carte } : {}) }
  }

  // ---- ajouter_elements ----

  const ajouter = async (u: Utilisateur, a: Args) => {
    const id = a.tableau as string
    const droits = await acces(u, id, true)
    const demandes = a.elements as ElementDemande[]
    const place = (a.place ?? {}) as { pres_de?: string; cote?: 'droite' | 'dessous' | 'gauche' | 'dessus'; dans_colonne?: string; x?: number; y?: number; disposition?: 'ligne' | 'pile' | 'grille' }
    const maintenant = d.maintenant()
    const crees: Record<string, unknown>[] = []
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
            crees.push({ id: e.id, type: demandes[i]!.type, colonne: col.id, l: e.largeur, h: hauteurDe(e) })
          }
        })
        return
      }
      const neufs: Neuf[] = demandes.map((x, i) => construire(x, maintenant + i * 64))
      const tailles = neufs.map((n) => ({ l: Math.round(n.element.largeur), h: hauteurDe(n.element, n.enfants.length) }))
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
        for (const [i, n] of neufs.entries()) {
          const p = bloc.places[i]!
          const e = { ...n.element, x: origine.x + p.x, y: origine.y + p.y }
          scribe.poser(e, n.arbre)
          for (const enfant of n.enfants) scribe.poser({ ...enfant, x: e.x, y: e.y })
          crees.push({
            id: e.id,
            type: demandes[i]!.type,
            x: e.x,
            y: e.y,
            l: Math.round(e.largeur),
            h: tailles[i]!.h,
            ...(n.enfants.length ? { elements: n.enfants.map((x) => x.id) } : {}),
            ...(n.arbre ? { plan: planDeLArbre(n.arbre).plan } : {}),
          })
        }
      })
    })
    return { crees }
  }

  // ---- modifier_elements ----

  interface Modification {
    id: string
    texte?: string
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
    await d.modifier(id, u, (doc) => {
      const scribe = new Scribe(doc)
      const t = scribe.lire()
      // Tout se prépare d'abord : une erreur au dixième changement n'en laisse pas neuf.
      const copies = new Map<string, Record<string, unknown>>()
      const cartes = new Map<string, { avant: Arbre; apres: Arbre }>()
      for (const [i, m] of modifications.entries()) {
        const e = element(t, m.id, droits)
        const ou = `modifications[${i}]`
        const brut = copies.get(m.id) ?? structuredClone(scribe.brut(m.id)!)
        delete brut.plan
        const c = brut.contenu as Record<string, unknown>
        const type = c.type as string
        const titre = type === 'note' && c.variante === 'titre'
        const refus = (champ: string, pour: string) =>
          new ErreurAgent('impossible', `${ou}.${champ} ne vaut que pour ${pour} ; ${m.id} est un élément « ${titre ? 'titre' : type === 'arbre' ? 'carte_mentale' : type} ».`)
        // La valeur d'avant, notée la première fois que la demande touche ce champ.
        const noter = (champ: string, valeur: () => unknown) => {
          const deja = (avant[m.id] ??= {})
          if (!(champ in deja)) deja[champ] = valeur()
        }
        const initial = e.contenu as Record<string, unknown>
        if (m.texte !== undefined) noter('texte', () => (titre ? texteSimple(initial.texte as NoeudTexte) : markdownDepuisDoc(initial.texte)))
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
          if (type !== 'note') throw refus('texte', 'une note ou un titre')
          c.texte = titre ? docDeTitre(m.texte) : docDepuisMarkdown(m.texte)
        }
        if (m.titre !== undefined) {
          const neuf = m.titre.trim()
          if (titre) c.texte = docDeTitre(neuf)
          else if (type === 'taches' || type === 'lien') {
            if (neuf) c.titre = neuf
            else delete c.titre
          } else if (type === 'colonne') c.titre = neuf
          else if (type === 'table') {
            if (neuf) Object.assign(c, { titre: neuf, avecTitre: true })
            else delete c.avecTitre
          } else if (type === 'arbre') {
            const avant = cartes.get(m.id)?.avant ?? scribe.arbre(m.id)!
            const courant = cartes.get(m.id)?.apres ?? avant
            const central = planDeLArbre(courant).plan.id
            cartes.set(m.id, { avant, apres: gestesSurArbre(courant, [{ action: 'renommer', sujet: central, titre: neuf || 'Sujet central' }], m.id) })
          } else throw refus('titre', 'une liste de tâches, une colonne, une table, un lien, un titre ou une carte mentale')
        }
        if (m.couleur !== undefined) {
          if (!['note', 'taches', 'colonne', 'lien'].includes(type) || titre) throw refus('couleur', 'une note, une liste de tâches, une colonne ou un lien')
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
      doc.transact(() => {
        for (const [x, brut] of copies) scribe.changer(x, () => brut)
        for (const [x, { avant, apres }] of cartes) {
          scribe.ecrireArbre(x, avant, apres)
          plans[x] = planDeLArbre(apres).plan
        }
      })
    })
    return { modifies, avant, ...(Object.keys(plans).length ? { plans, plans_avant: plansAvant } : {}) }
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
      // Les lignes jetées en même temps que ce qu'elles relient reviennent avec.
      const instants = new Set(voulus.values())
      for (const e of t.elements) {
        if (e.contenu.type === 'ligne' && e.corbeille !== undefined && instants.has(e.corbeille) && accrochee(e, new Set(voulus.keys()))) voulus.set(e.id, e.corbeille)
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

/** Une ligne accrochée, par son départ ou son arrivée, à l'un de ces éléments. */
function accrochee(e: ElementLu, ids: ReadonlySet<string>): boolean {
  const bout = (b: unknown) => (b && typeof b === 'object' ? (b as { element?: unknown }).element : undefined)
  return [bout(e.contenu.depart), bout(e.contenu.arrivee)].some((x) => typeof x === 'string' && ids.has(x))
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
