import {
  type AccesTableaux,
  type Coffre,
  type DepotLocal,
  ErreurDossier,
  ID_INDEX,
  type Id,
  creerMagasinYjs,
  nouvelId,
  ouvrirCoffre,
} from '@notak/tableau'
import { t } from '../langue'
import { type PoigneeDossier, dossierNavigateur } from './dossierNavigateur'
import { type EspaceLocal, accueilIntact, espaceIntact } from './espace'

/**
 * « Synchroniser avec un dossier » (expérimental, Chrome et Edge sur ordinateur) : l'espace local est recopié en
 * continu dans un dossier que la personne choisit, par exemple dans son iCloud Drive, son OneDrive ou son Dropbox ;
 * un autre ordinateur qui choisit le même dossier retrouve les mêmes tableaux. Le format et ses garanties sont dans
 * `docs/STOCKAGE.md` ; ici, on ne fait que le brancher :
 * - un seul onglet synchronise à la fois (Web Locks) ;
 * - ce qui change, dans n'importe quel onglet, part dans les secondes qui suivent ;
 * - on relit le dossier toutes les 30 s et au retour sur l'onglet ;
 * - une fois par jour, on compacte et on garde une version.
 */

export type EtatSynchro =
  | { mode: 'indisponible' }
  | { mode: 'aucune' }
  | { mode: 'a-reprendre'; nom: string }
  | { mode: 'active'; nom: string; meneur: boolean; derniere?: number; enAttente?: boolean; erreur?: string; accueilChange?: boolean }

const RELIRE = 30_000
const APRES_CHANGEMENT = 4_000
const JOUR = 24 * 3600 * 1000

// --- Un petit dépôt clé-valeur dans IndexedDB -----------------------------------------------------------------------

function ouvrirBase(nom: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(nom, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('valeurs')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
export function depotIndexedDb(nom: string): DepotLocal {
  const base = ouvrirBase(nom)
  const faire = async <T>(mode: IDBTransactionMode, f: (m: IDBObjectStore) => IDBRequest<T>) => {
    const db = await base
    return new Promise<T>((resolve, reject) => {
      const r = f(db.transaction('valeurs', mode).objectStore('valeurs'))
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
  }
  return {
    lire: async <T>(cle: string) => (await faire<T | undefined>('readonly', (m) => m.get(cle))) ?? undefined,
    ecrire: async (cle, valeur) => void (await faire('readwrite', (m) => m.put(valeur, cle))),
  }
}

const reglages = () => depotIndexedDb('notak:local:reglages')
const CLE_DOSSIER = 'dossier'

// --- L'état, que le panneau suit ------------------------------------------------------------------------------------

let etat: EtatSynchro = { mode: 'aucune' }
const ecouteurs = new Set<() => void>()
const changer = (e: EtatSynchro) => {
  etat = e
  for (const f of ecouteurs) f()
}
export const lireEtatSynchro = () => etat
export const ecouterSynchro = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

type AvecSelecteur = { showDirectoryPicker?(o: unknown): Promise<PoigneeDossier> }
const possible = () => typeof window !== 'undefined' && typeof (window as unknown as AvecSelecteur).showDirectoryPicker === 'function'

/** Un nom lisible pour cet appareil, dans la liste des appareils du dossier. */
export function nomAppareil(ua = navigator.userAgent): string {
  const navigateur = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : 'Safari'
  const systeme = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : ''
  return systeme ? `${navigateur} · ${systeme}` : navigateur
}

// --- La boucle ------------------------------------------------------------------------------------------------------

let arret: (() => void) | null = null
let relancer: (() => void) | null = null

/** L'accès du coffre aux tableaux locaux, index compris (il voyage comme un tableau de plus). */
function acces({ index, reseau }: EspaceLocal): AccesTableaux {
  return {
    lister: async () => [ID_INDEX, ...index.lister().map((e) => e.id)],
    avec: (id, f) => (id === ID_INDEX ? Promise.resolve(f(index.doc)) : reseau.avec(id, f)),
  }
}

/**
 * L'index venu du dossier a pu changer d'accueil (deux appareils qui avaient chacun le leur). L'ancien accueil,
 * s'il contient quelque chose, est rangé dans le nouveau ; vide, il disparaît. La page devra se recharger.
 */
async function verifierAccueil(el: EspaceLocal): Promise<'vide' | 'range' | null> {
  const { index, reseau, espace } = el
  const ancien = espace.racine
  const nouveau = index.racine()
  if (ancien === nouveau) return null
  if (await accueilIntact(el, ancien).catch(() => false)) {
    index.retirer(ancien)
    return 'vide'
  }
  index.declarer(ancien, index.entree(ancien)?.titre || t('local.ancienAccueil'), nouveau)
  await reseau.avec(nouveau, (doc) => {
    const m = creerMagasinYjs(doc, nouveau)
    const la = m.lire().elements.filter((e) => !e.parent && e.contenu.type !== 'ligne')
    if (!la.some((e) => e.contenu.type === 'tableau' && e.contenu.cible === ancien)) {
      const x = la.length ? Math.max(...la.map((e) => e.x + e.largeur)) + 4 : 5
      const y = la.length ? Math.min(...la.map((e) => e.y)) : 5
      m.faire([{ type: 'creer', element: { id: nouvelId(), x, y, largeur: 10, contenu: { type: 'tableau', cible: ancien } } }])
    }
    m.detruire()
  })
  return 'range'
}

const message = (e: unknown) =>
  e instanceof ErreurDossier
    ? e.cause === 'lecture-seule'
      ? t('synchro.lectureSeule')
      : e.cause === 'plein'
        ? t('synchro.plein')
        : t('synchro.introuvable')
    : t('synchro.erreur')

async function boucle(el: EspaceLocal, poignee: PoigneeDossier, signal: { arrete: boolean }) {
  const depot = depotIndexedDb('notak:local:coffre')
  const nom = poignee.name
  let coffre: Coffre
  try {
    coffre = await ouvrirCoffre({ dossier: dossierNavigateur(poignee), depot, tableaux: acces(el), nom: nomAppareil(), plateforme: 'web' })
  } catch (e) {
    changer({ mode: 'active', nom, meneur: true, erreur: message(e) })
    return
  }
  const sales = new Set<Id>()
  let premier = true
  let minuteur: ReturnType<typeof setTimeout> | undefined
  let enCours: Promise<void> | null = null

  const cycle = async () => {
    try {
      const debut = premier
      if (premier) {
        // Un appareil neuf qui rejoint un dossier prend l'accueil du dossier, plutôt que d'imposer le sien, vide.
        if (await espaceIntact(el, el.espace.racine)) el.index.cederAccueil()
        premier = false
      } else if (sales.size > 0) {
        const liste = [...sales]
        sales.clear()
        await coffre.enregistrer(liste)
      }
      const r = await coffre.relire()
      if (debut) {
        // Le dossier n'avait pas d'accueil : on garde le sien. Puis tout ce qui a changé avant la synchro part.
        el.index.garderAccueil()
        await coffre.enregistrer()
      }
      const accueil = r.tableaux.includes(ID_INDEX) ? await verifierAccueil(el) : null
      // L'accueil d'ici était vide : rien à perdre, on repart tout de suite de celui du dossier.
      if (accueil === 'vide') return void setTimeout(() => location.assign('/'), 300)
      const accueilChange = accueil === 'range'
      const derniere = (await depot.lire<number>('synchro:menage')) ?? 0
      if (Date.now() - derniere > JOUR) {
        await coffre.compacter()
        await coffre.versionner()
        await depot.ecrire('synchro:menage', Date.now())
      }
      changer({ mode: 'active', nom, meneur: true, derniere: Date.now(), enAttente: r.enAttente, ...(accueilChange ? { accueilChange } : {}) })
    } catch (e) {
      changer({ mode: 'active', nom, meneur: true, derniere: Date.now(), erreur: message(e) })
    }
  }
  const lancer = () => {
    if (signal.arrete) return
    enCours = (enCours ?? Promise.resolve()).then(cycle).finally(() => (enCours = null))
  }
  const planifier = (delai: number) => {
    clearTimeout(minuteur)
    minuteur = setTimeout(lancer, delai)
  }

  const cesser = el.reseau.ecouterChangements((id) => {
    sales.add(id)
    planifier(APRES_CHANGEMENT)
  })
  const visible = () => document.visibilityState === 'visible' && lancer()
  document.addEventListener('visibilitychange', visible)
  const regulier = setInterval(() => document.visibilityState === 'visible' && lancer(), RELIRE)
  relancer = lancer
  changer({ mode: 'active', nom, meneur: true })
  lancer()

  await new Promise<void>((fin) => {
    arret = () => {
      signal.arrete = true
      fin()
    }
  })
  cesser()
  clearInterval(regulier)
  clearTimeout(minuteur)
  document.removeEventListener('visibilitychange', visible)
  relancer = null
  // Ce qui reste à envoyer part quand même.
  if (sales.size > 0) await coffre.enregistrer([...sales]).catch(() => {})
}

/** Démarre la synchro : dans cet onglet s'il est le premier, sinon il attend son tour (un autre onglet la mène). */
function demarrer(el: EspaceLocal, poignee: PoigneeDossier) {
  arret?.()
  const signal = { arrete: false }
  const locks = (navigator as Navigator & { locks?: { request(n: string, f: () => Promise<void>): Promise<void> } }).locks
  changer({ mode: 'active', nom: poignee.name, meneur: false })
  if (locks) void locks.request('notak:local:synchro', () => (signal.arrete ? Promise.resolve() : boucle(el, poignee, signal)))
  else void boucle(el, poignee, signal)
  arret = () => {
    signal.arrete = true
  }
}

// --- Ce que le panneau appelle --------------------------------------------------------------------------------------

/** Au lancement : reprend la synchro si un dossier a été choisi et que le navigateur le permet encore. */
export async function initialiserSynchro(el: EspaceLocal) {
  if (!possible()) return changer({ mode: 'indisponible' })
  const poignee = await reglages()
    .lire<PoigneeDossier>(CLE_DOSSIER)
    .catch(() => undefined)
  if (!poignee) return changer({ mode: 'aucune' })
  const permission = (await poignee.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt')) ?? 'granted'
  if (permission === 'granted') demarrer(el, poignee)
  else changer({ mode: 'a-reprendre', nom: poignee.name })
}

/** Choisir un dossier (sur un geste) : on y range un sous-dossier `Notak`, sauf s'il s'appelle déjà ainsi. */
export async function choisirDossier(el: EspaceLocal) {
  const w = window as unknown as AvecSelecteur
  let poignee: PoigneeDossier
  try {
    poignee = await w.showDirectoryPicker!({ mode: 'readwrite', id: 'notak' })
  } catch {
    return
  }
  let deja = poignee.name === 'Notak'
  if (!deja) for await (const [nom] of poignee.entries()) if (nom === 'appareils') deja = true
  const cible = deja ? poignee : await poignee.getDirectoryHandle('Notak', { create: true })
  // Le navigateur peut refuser de s'en souvenir : la synchro tourne quand même, le temps de la session.
  await reglages()
    .ecrire(CLE_DOSSIER, cible)
    .catch(() => {})
  demarrer(el, cible)
}

/** Reprendre après un rechargement : le navigateur redemande la permission, sur un geste. */
export async function reprendreSynchro(el: EspaceLocal) {
  const poignee = await reglages().lire<PoigneeDossier>(CLE_DOSSIER)
  if (!poignee) return changer({ mode: 'aucune' })
  if ((await poignee.requestPermission?.({ mode: 'readwrite' })) === 'denied') return
  demarrer(el, poignee)
}

export function synchroniserMaintenant() {
  relancer?.()
}

export async function arreterSynchro() {
  arret?.()
  arret = null
  await reglages().ecrire(CLE_DOSSIER, undefined)
  changer({ mode: 'aucune' })
}
