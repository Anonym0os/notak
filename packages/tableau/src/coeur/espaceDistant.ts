import * as Y from 'yjs'
import type { Point } from './geometrie'
import type { Presence, ServicePresence } from '../elements/types'
import type { EspaceNavigable } from './espace'
import { type MagasinYjs, creerMagasinYjs } from './magasinYjs'
import { type Id, nouvelId } from './tableau'

/** Le morceau de l'awareness de y-protocols dont on se sert : de quoi ne pas dépendre de ce paquet. */
export interface AwarenessMinimale {
  clientID: number
  getStates(): Map<number, Record<string, unknown>>
  setLocalStateField(champ: string, valeur: unknown): void
  on(evenement: 'change', f: () => void): void
  off(evenement: 'change', f: () => void): void
}

/** Le lien d'un document avec le serveur. */
export interface Connexion {
  awareness: AwarenessMinimale | null
  /** Le serveur n'accepte de ce compte que la lecture (ou refuse tout). */
  lectureSeule(): boolean
  /** Le serveur a refusé l'accès (retiré, ou jamais donné) : plus rien ne se joue sur ce tableau. */
  refuse(): boolean
  /** Le document a rattrapé celui du serveur. */
  synchronise(): boolean
  /** Le lien avec le serveur est ouvert. */
  enLigne?(): boolean
  /** Des modifications faites ici n'ont pas encore été reçues par le serveur. */
  enAttente?(): boolean
  detruire(): void
}

/** Tout ce que l'espace demande au réseau et au navigateur ; les essais le remplacent. */
export interface Reseau {
  /** Garde le document hors ligne. Rend de quoi arrêter. */
  persister?(id: Id, doc: Y.Doc): () => void
  /** Relie le document au serveur. `surEtat` est appelé quand la connexion change d'état. */
  connecter(id: Id, doc: Y.Doc, surEtat: () => void): Connexion
  /**
   * Annonce un nouveau tableau au serveur. Échoue d'une erreur ordinaire si le réseau manque (on réessaie),
   * d'une erreur portant `definitif: true` si le serveur refuse (on s'arrête).
   */
  declarer(id: Id, titre: string, parent?: Id): Promise<void>
  fermer?(): void
}

export interface Utilisateur {
  id: string
  nom: string
  couleur: string
  /** Le fichier de sa photo. */
  photo?: string
}

/** Où garder les déclarations pas encore reçues par le serveur, pour les reprendre au prochain chargement. */
export interface Memoire {
  lire(): Declaration[]
  ecrire(d: Declaration[]): void
}
export interface Declaration {
  id: Id
  titre: string
  parent?: Id
}

export interface OptionsEspaceDistant {
  racine: Id
  utilisateur: Utilisateur
  reseau: Reseau
  memoire?: Memoire
  /** Combien de temps un tableau que plus rien ne regarde reste ouvert, en ms. */
  delaiFermeture?: number
  /** Pause avant de renvoyer une déclaration qui a échoué, en ms. */
  delaiReprise?: number
}

export interface EspaceDistant extends EspaceNavigable {
  /** Le tableau a rattrapé le serveur : son contenu est celui d'aujourd'hui. */
  synchronise(id: Id): boolean
  /** Le serveur refuse ce tableau à ce compte. */
  refuse(id: Id): boolean
  /** Le compte a changé de nom, de couleur ou de photo : les tableaux ouverts le disent aux autres sans attendre. */
  changerUtilisateur(u: Utilisateur): void
  /** Ferme tout : à la déconnexion. */
  detruire(): void
}

interface Entree {
  id: Id
  doc: Y.Doc
  magasin: MagasinYjs
  arreterPersistance: (() => void) | undefined
  connexion: Connexion | null
  /** Combien de fois on le retient, la vue et les renvois ensemble. */
  retenus: number
  /** Combien de fois la vue le retient : c'est elle qui fait ouvrir les tableaux de ses renvois. */
  pleins: number
  fermeture: ReturnType<typeof setTimeout> | undefined
  cibles: Map<Id, () => void>
  arreterCibles: (() => void) | undefined
  presence: ServicePresence
  signalPresence: () => void
  fermee: boolean
}

const DELAI_FERMETURE = 30_000
const DELAI_REPRISE = 5_000

const estPoint = (v: unknown): v is Point =>
  !!v && typeof v === 'object' && Number.isFinite((v as Point).x) && Number.isFinite((v as Point).y)

/** Ce que l'awareness d'un client dit de lui, relu avec méfiance : ça vient d'un autre navigateur. */
export function presenceDe(client: number, etat: Record<string, unknown>): Presence | null {
  const u = etat.utilisateur as Partial<Presence['utilisateur']> | undefined
  if (!u || typeof u.id !== 'string' || typeof u.nom !== 'string' || typeof u.couleur !== 'string') return null
  const selection = Array.isArray(etat.selection) ? etat.selection.filter((s): s is string => typeof s === 'string') : []
  return {
    client,
    utilisateur: { id: u.id, nom: u.nom, couleur: u.couleur, ...(typeof u.photo === 'string' && u.photo ? { photo: u.photo } : {}) },
    curseur: estPoint(etat.curseur) ? { x: etat.curseur.x, y: etat.curseur.y } : null,
    selection,
    edition: typeof etat.edition === 'string' ? etat.edition : null,
  }
}

/** L'espace d'un compte : les tableaux sont des documents Yjs, ouverts à la demande et refermés quand plus rien ne les regarde. */
export function creerEspaceDistant(options: OptionsEspaceDistant): EspaceDistant {
  const { racine, reseau, memoire } = options
  let utilisateur = options.utilisateur
  const delaiFermeture = options.delaiFermeture ?? DELAI_FERMETURE
  const delaiReprise = options.delaiReprise ?? DELAI_REPRISE
  const entrees = new Map<Id, Entree>()
  const ecouteurs = new Set<() => void>()
  const parents = new Map<Id, Id>()
  const declarations = new Map<Id, Promise<void>>()
  let detruit = false

  const notifier = () => {
    for (const f of ecouteurs) f()
  }

  // --- Les déclarations au serveur, reprises tant qu'il n'a pas répondu ---------------------------------

  let enAttente: Declaration[] = memoire?.lire() ?? []
  const retirer = (id: Id) => {
    enAttente = enAttente.filter((d) => d.id !== id)
    memoire?.ecrire(enAttente)
  }
  const declarer = (d: Declaration): Promise<void> => {
    const deja = declarations.get(d.id)
    if (deja) return deja
    if (!enAttente.some((x) => x.id === d.id)) {
      enAttente = [...enAttente, d]
      memoire?.ecrire(enAttente)
    }
    const essai = async (): Promise<void> => {
      for (;;) {
        if (detruit) return
        try {
          await reseau.declarer(d.id, d.titre, d.parent)
          retirer(d.id)
          return
        } catch (e) {
          if ((e as { definitif?: boolean }).definitif) {
            retirer(d.id)
            return
          }
          await new Promise((r) => setTimeout(r, delaiReprise))
        }
      }
    }
    const p = essai()
    declarations.set(d.id, p)
    return p
  }
  for (const d of enAttente) void declarer(d)

  // --- Un document ouvert -----------------------------------------------------------------------------------

  const connecter = (e: Entree) => {
    if (e.fermee || detruit || e.connexion) return
    e.connexion = reseau.connecter(e.id, e.doc, notifier)
    const awareness = e.connexion.awareness
    if (awareness) {
      awareness.setLocalStateField('utilisateur', utilisateur)
      awareness.on('change', e.signalPresence)
    }
    e.signalPresence()
  }

  const creerPresence = (e: Entree, signal: { f: () => void }): ServicePresence => {
    const locaux = new Set<() => void>()
    let local: { curseur: Point | null; selection: Id[]; edition: Id | null } = { curseur: null, selection: [], edition: null }
    let cache: Presence[] | null = null
    signal.f = () => {
      cache = null
      for (const f of locaux) f()
    }
    return {
      moi: () => utilisateur,
      canal: () => e.connexion?.awareness ?? null,
      signaler(etat) {
        local = {
          curseur: etat.curseur === undefined ? local.curseur : etat.curseur,
          selection: etat.selection ?? local.selection,
          edition: etat.edition === undefined ? local.edition : etat.edition,
        }
        const a = e.connexion?.awareness
        if (!a) return
        if (etat.curseur !== undefined) a.setLocalStateField('curseur', local.curseur)
        if (etat.selection) a.setLocalStateField('selection', local.selection)
        if (etat.edition !== undefined) a.setLocalStateField('edition', local.edition)
      },
      autres() {
        if (cache) return cache
        const a = e.connexion?.awareness
        const liste: Presence[] = []
        if (a) {
          for (const [client, etat] of a.getStates()) {
            if (client === a.clientID) continue
            const p = presenceDe(client, etat)
            if (p) liste.push(p)
          }
        }
        liste.sort((x, y) => x.client - y.client)
        return (cache = liste)
      },
      ecouter(f) {
        locaux.add(f)
        return () => locaux.delete(f)
      },
    }
  }

  const ouvrir = (id: Id): Entree => {
    let e = entrees.get(id)
    if (e) return e
    const doc = new Y.Doc()
    const magasin = creerMagasinYjs(doc, id, { auteur: () => (utilisateur ? { id: utilisateur.id, nom: utilisateur.nom, couleur: utilisateur.couleur } : undefined) })
    const signal = { f: () => {} }
    const entree: Entree = {
      id,
      doc,
      magasin,
      arreterPersistance: reseau.persister?.(id, doc),
      connexion: null,
      retenus: 0,
      pleins: 0,
      fermeture: undefined,
      cibles: new Map(),
      arreterCibles: undefined,
      presence: undefined as unknown as ServicePresence,
      signalPresence: () => signal.f(),
      fermee: false,
    }
    entree.presence = creerPresence(entree, signal)
    magasin.ecouter(notifier)
    entrees.set(id, entree)
    // Un tableau tout juste déclaré attend l'accord du serveur pour s'y relier : sans lui, il serait refusé.
    const attente = declarations.get(id)
    if (attente) void attente.then(() => connecter(entree))
    else connecter(entree)
    armerFermeture(entree)
    return entree
  }

  const fermer = (e: Entree) => {
    if (e.fermee) return
    e.fermee = true
    clearTimeout(e.fermeture)
    e.arreterCibles?.()
    for (const rendre of e.cibles.values()) rendre()
    e.cibles.clear()
    e.connexion?.awareness?.off('change', e.signalPresence)
    e.connexion?.detruire()
    e.arreterPersistance?.()
    e.magasin.detruire()
    e.doc.destroy()
    entrees.delete(e.id)
  }

  function armerFermeture(e: Entree) {
    clearTimeout(e.fermeture)
    if (e.retenus > 0) return
    e.fermeture = setTimeout(() => e.retenus === 0 && fermer(e), delaiFermeture)
  }

  /** Les tableaux vers lesquels celui-ci a des renvois, retenus pour que leurs titres restent à jour. */
  const suivreCibles = (e: Entree) => {
    const synchroniser = () => {
      const voulues = new Set(
        e.magasin.lire().elements.flatMap((x) => (x.contenu.type === 'tableau' && x.contenu.cible !== e.id ? [x.contenu.cible] : [])),
      )
      for (const [id, rendre] of e.cibles) {
        if (voulues.has(id)) continue
        rendre()
        e.cibles.delete(id)
      }
      for (const id of voulues) if (!e.cibles.has(id)) e.cibles.set(id, retenirTableau(id, false))
    }
    synchroniser()
    // Seule la liste des cibles compte : on ne se réveille que si elle change.
    let signature = [...e.cibles.keys()].sort().join()
    const arreter = e.magasin.ecouter(() => {
      const t = e.magasin.lire().elements.flatMap((x) => (x.contenu.type === 'tableau' ? [x.contenu.cible] : []))
      const s = [...new Set(t)].sort().join()
      if (s === signature) return
      signature = s
      synchroniser()
    })
    return arreter
  }

  function retenirTableau(id: Id, plein: boolean): () => void {
    const e = ouvrir(id)
    e.retenus++
    clearTimeout(e.fermeture)
    if (plein && ++e.pleins === 1) e.arreterCibles = suivreCibles(e)
    let rendu = false
    return () => {
      if (rendu) return
      rendu = true
      e.retenus--
      if (plein && --e.pleins === 0) {
        e.arreterCibles?.()
        e.arreterCibles = undefined
        for (const rendre of e.cibles.values()) rendre()
        e.cibles.clear()
      }
      armerFermeture(e)
    }
  }

  // --- L'interface ------------------------------------------------------------------------------------------

  const chemin = (id: Id): Id[] => {
    const c = [id]
    for (let p = parents.get(id); p !== undefined && !c.includes(p); p = parents.get(p)) c.unshift(p)
    return c
  }

  return {
    racine,
    magasin: (id) => ouvrir(id).magasin,
    tableau: (id) => ouvrir(id).magasin.lire(),
    existe: () => true,
    creerTableau(titre, parent) {
      const id = nouvelId()
      const declaration: Declaration = { id, titre, ...(parent !== undefined ? { parent } : {}) }
      void declarer(declaration)
      const e = ouvrir(id)
      e.magasin.remplacer({ titre, elements: [] })
      return id
    },
    renommer(id, titre) {
      const e = ouvrir(id)
      if (e.connexion?.lectureSeule()) return
      const t = e.magasin.lire()
      if (t.titre !== titre) e.magasin.remplacer({ ...t, titre })
    },
    ecouter(f) {
      ecouteurs.add(f)
      return () => ecouteurs.delete(f)
    },
    chemin,
    parent(id) {
      const c = chemin(id)
      return c.length > 1 ? c[c.length - 2]! : null
    },
    entrer(id, depuis) {
      if (id === racine) return
      // Entrer dans un ancêtre par un renvoi ne retourne pas le chemin : on garde celui qu'on connaît.
      if (depuis === null || chemin(depuis).includes(id)) return
      parents.set(id, depuis)
    },
    retenir: (id) => retenirTableau(id, true),
    presence: (id) => ouvrir(id).presence,
    lectureSeule: (id) => entrees.get(id)?.connexion?.lectureSeule() ?? false,
    refuse: (id) => entrees.get(id)?.connexion?.refuse() ?? false,
    synchronise: (id) => entrees.get(id)?.connexion?.synchronise() ?? false,
    envoi: (id) => {
      const c = entrees.get(id)?.connexion
      if (!c || c.enLigne?.() === false) return 'hors-ligne'
      return c.enAttente?.() ? 'envoi' : 'enregistre'
    },
    changerUtilisateur(u) {
      utilisateur = u
      for (const e of entrees.values()) e.connexion?.awareness?.setLocalStateField('utilisateur', u)
    },
    detruire() {
      detruit = true
      for (const e of [...entrees.values()]) fermer(e)
      ecouteurs.clear()
      reseau.fermer?.()
    },
  }
}
