import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { type EspaceNavigable, ICONE_DU_GENRE, Icone, type NomIcone, extensionDe, genreDe, langue, tailleLisible } from '@notak/tableau'
import { type Direct, type Etape, type EvenementAgent, appliquer, directVide, duree, reponseDe, resumeEtapes } from './agentDirect'
import type { Ici } from './ici'
import { t, tn } from './langue'
import { allerDansLApp, cheminDansLApp, suivreAdresse } from './naviguer'

/** Un échange du fil de l'agent, tel que l'outil le garde : un seul fil par personne, d'où qu'elle écrive. */
export interface EchangeAgent {
  qui: 'personne' | 'fram'
  texte: string
  quand: string
}

/** Une partie précédente de la conversation : quand, et ce qu'on y a fait, résumé par l'outil. */
export interface PartieAgent {
  id: string
  debut: string
  fin: string
  resume: string
}

/** L'agent pour cette personne : `disponible` faux, la bulle ne paraît pas. */
export interface EtatAgent {
  agent: string
  disponible: boolean
  echanges?: EchangeAgent[]
  tour?: { id: string; etat: string } | null
  parties?: PartieAgent[]
}

/** Une carte : un geste de l'agent qui attend l'accord de la personne. `definitif` : il ne se rattrape pas. */
export interface CarteAgent {
  id: string
  resume: string
  definitif: boolean
}

export interface EtatTour {
  tour: string
  etat: string
  fini: boolean
  texte: string | null
  echec: string | null
  cartes: CarteAgent[]
  /** Ce que le tour a créé (porte v2), tel que le relais le rend : à relire par `creesLus`. Facultatif. */
  crees?: unknown
  /** Ce que l'agent veut montrer à la personne (porte v2) : à relire par `ouvertureLue`. Facultatif. */
  ouvrir?: unknown
}

/** Ce qu'un tour a créé (une page, une carte mentale, une toile…), avec le chemin de l'application qui l'ouvre. */
export interface Cree {
  type: string
  titre: string
  tableau: string
  element: string | null
  chemin: string
}

/** Ce que l'agent veut montrer : un tableau, ou un élément sur lui ; `chemin`, l'adresse que le relais en donne. */
export interface Ouverture {
  tableau: string
  element: string | null
  chemin: string | null
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const texteBorne = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Le chemin qui ouvre ce tableau, ou cet élément sur lui ; un dossier s'y montre dans la bibliothèque (`EspaceNotak`). */
const cheminPour = (tableau: string, element: string | null): string =>
  `/t/${encodeURIComponent(tableau)}${element ? `/e/${encodeURIComponent(element)}` : ''}`

/**
 * Ce que le relais dit qu'un tour a créé (`crees`), relu sans lui faire confiance : des identifiants de Notak, un titre
 * borné, et une adresse que l'application sait ouvrir (sinon, celle du tableau ou de l'élément). Vingt au plus.
 */
export function creesLus(brut: unknown): Cree[] {
  if (!Array.isArray(brut)) return []
  return brut.slice(0, 20).flatMap((x) => {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {}
    const tableau = typeof o.tableau === 'string' && ID.test(o.tableau) ? o.tableau : null
    const element = typeof o.element === 'string' && ID.test(o.element) ? o.element : null
    if (!tableau) return []
    const adresse = typeof o.adresse === 'string' ? cheminDansLApp(o.adresse) : null
    return [{ type: texteBorne(o.type, 40), titre: texteBorne(o.titre, 120), tableau, element, chemin: adresse ?? cheminPour(tableau, element) }]
  })
}

/** Ce que l'agent veut montrer (`ouvrir`), relu de même ; `null` s'il n'a rien à montrer. */
export function ouvertureLue(brut: unknown): Ouverture | null {
  const o = brut && typeof brut === 'object' ? (brut as Record<string, unknown>) : null
  const tableau = typeof o?.tableau === 'string' && ID.test(o.tableau) ? o.tableau : null
  if (!tableau) return null
  return {
    tableau,
    element: typeof o?.element === 'string' && ID.test(o.element) ? o.element : null,
    chemin: typeof o?.adresse === 'string' ? cheminDansLApp(o.adresse) : null,
  }
}

/**
 * Le chemin d'une ouverture : l'adresse que le relais en donne (un dossier s'ouvre dans la bibliothèque), sinon celle de
 * la même création, sinon celle du tableau ou de l'élément.
 */
export const cheminDeLOuverture = (o: Ouverture, crees: readonly Cree[]): string =>
  o.chemin ?? crees.find((c) => c.tableau === o.tableau && c.element === o.element)?.chemin ?? cheminPour(o.tableau, o.element)

/** Une réponse telle qu'on la compare d'un fil à l'autre : le texte du tour fini et celui du fil relu. */
const cleReponse = (texte: string): string => texte.replace(/\s+/g, ' ').trim()

/** Le journal d'un tour se relit chaque seconde, aussi longtemps qu'il dure : un tour peut prendre vingt minutes. */
const SUIVRE_MS = 1000
/** Une lecture manquée attend un peu plus à chaque fois, dix secondes au plus. */
const SUIVRE_MAX_ATTENTE_MS = 10_000
const MESSAGE_MAX = 8000
/** Les pièces d'un message, au plus, et ce que pèse chacune : le serveur les borne de même. */
export const PIECES_MAX = 10
export const PIECE_MAX = 25 * 1024 * 1024

const chemin = (tableau: string) => `/api/tableaux/${encodeURIComponent(tableau)}/agent`

async function appeler<T>(adresse: string, corps?: unknown): Promise<T> {
  const r = await fetch(adresse, {
    method: corps === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
  })
  const lu = (await r.json().catch(() => null)) as (T & { erreur?: string; code?: string }) | null
  if (!r.ok || !lu) throw Object.assign(new Error(lu?.erreur ?? t('agent.echec')), { code: lu?.code, statut: r.status })
  return lu
}

export const lireAgent = (tableau: string) => appeler<EtatAgent>(chemin(tableau))
/**
 * Une demande, rattachée à ce tableau ; `ouvert` : la page ou la carte ouverte en grand d'où l'on écrit ; `pieces` : les
 * identifiants des fichiers joints, déjà partis. Pendant un tour, l'outil la met en file (`etat: "waiting"`).
 */
export const demanderAgent = (tableau: string, message: string, selection: SelectionAgent = [], ouvert: string | null = null, pieces: string[] = []) =>
  appeler<{ tour: string; etat: string }>(chemin(tableau), {
    message,
    ...(selection.length > 0 ? { selection } : {}),
    ...(ouvert ? { ouvert } : {}),
    ...(pieces.length > 0 ? { pieces } : {}),
  })

/** Ce que la personne a sélectionné sur le tableau, chaque élément avec un extrait de ce qu'il dit. */
export type SelectionAgent = { id: string; texte: string }[]

const EXTRAIT = 120

/** Le texte d'un contenu d'élément, quelle que soit sa forme (note, titre, liste, document) : ses chaînes lisibles mises bout à bout. */
export function extraitDe(contenu: unknown): string {
  const morceaux: string[] = []
  let longueur = 0
  const parcourir = (v: unknown, cle?: string) => {
    if (longueur >= EXTRAIT) return
    if (typeof v === 'string') {
      if (cle === 'text' || cle === 'texte' || cle === 'titre' || cle === 'libelle') {
        const propre = v.replace(/\s+/g, ' ').trim()
        if (propre) {
          morceaux.push(propre)
          longueur += propre.length + 1
        }
      }
      return
    }
    if (Array.isArray(v)) for (const x of v) parcourir(x)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) parcourir(x, k)
  }
  parcourir(contenu)
  const texte = morceaux.join(' ')
  return texte.length > EXTRAIT ? `${texte.slice(0, EXTRAIT - 1)}…` : texte
}

/**
 * La sélection de la personne sur ce tableau, lue dans sa présence (que la toile tient à jour) au moment d'envoyer, chaque
 * élément avec un extrait de ce qu'il dit, ou son genre. Hors connexion ou sans sélection : rien.
 */
export function selectionDe(espace: EspaceNavigable | undefined, tableau: string): SelectionAgent {
  const canal = espace?.presence?.(tableau)?.canal?.() as { getLocalState?(): Record<string, unknown> | null } | null | undefined
  const ids = canal?.getLocalState?.()?.selection
  if (!Array.isArray(ids) || ids.length === 0) return []
  const elements = espace?.tableau(tableau)?.elements ?? []
  return ids
    .filter((x): x is string => typeof x === 'string')
    .slice(0, 50)
    .map((id) => {
      const contenu = elements.find((e) => e.id === id)?.contenu as { type?: string } | undefined
      return { id, texte: extraitDe(contenu) || contenu?.type || 'élément' }
    })
}
/** Une lecture du journal d'un tour : ce qui s'est passé depuis `suite`, et où il en est. */
export interface JournalTour extends EtatTour {
  suite: number | string | null
  /** D'autres événements attendent déjà : relire tout de suite. */
  encore: boolean
  evenements: EvenementAgent[]
}

export const lireJournal = (tableau: string, tour: string, depuis: number | string | null) =>
  appeler<JournalTour>(`${chemin(tableau)}/tours/${encodeURIComponent(tour)}/journal${depuis === null ? '' : `?depuis=${encodeURIComponent(String(depuis))}`}`)
export const arreterTour = (tableau: string, tour: string) => appeler<{ tour: string; etat: string }>(`${chemin(tableau)}/tours/${encodeURIComponent(tour)}/arreter`, {})

/** Une pièce part seule, ses octets tels quels, son nom dans l'adresse ; le serveur la relaie à l'outil. */
export async function envoyerPiece(tableau: string, fichier: Blob, nom: string): Promise<{ piece: string; nom: string; taille: number }> {
  const r = await fetch(`${chemin(tableau)}/pieces?nom=${encodeURIComponent(nom)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': fichier.type || 'application/octet-stream' },
    body: fichier,
  })
  const lu = (await r.json().catch(() => null)) as { piece?: string; nom?: string; taille?: number; erreur?: string } | null
  if (!r.ok || typeof lu?.piece !== 'string') throw new Error(lu?.erreur || t('agent.piece.echec'))
  return { piece: lu.piece, nom: lu.nom ?? nom, taille: lu.taille ?? fichier.size }
}
export const deciderCartes = (tableau: string, tour: string, cartes: { id: string; accord: boolean; toujours: boolean }[]) =>
  appeler<{ tour: string; etat: string }>(`${chemin(tableau)}/tours/${encodeURIComponent(tour)}/cartes`, { cartes })

/**
 * Les liens, le gras, l'italique et le code d'une ligne, en éléments React : rien de ce que l'agent écrit ne devient du
 * HTML. Un lien vise le web (http, https), ou Notak : un chemin de l'application (`/t/…`, `/?dossier=…`) ou `notak://`.
 * Vers Notak, un clic y mène sans quitter l'application (`naviguer.ts`) ; vers ailleurs, un nouvel onglet.
 */
function enLigne(texte: string): ReactNode[] {
  const morceaux: ReactNode[] = []
  const motif = /(\[[^\]\n]+\]\((?:https?:\/\/|notak:\/\/|\/(?!\/))[^\s)]*\)|\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g
  let fin = 0
  for (const m of texte.matchAll(motif)) {
    if (m.index > fin) morceaux.push(texte.slice(fin, m.index))
    const v = m[0]
    const lien = /^\[([^\]]+)\]\(([^\s)]*)\)$/.exec(v)
    if (lien) {
      const adresse = lien[2]!
      morceaux.push(
        <a key={m.index} href={adresse} target="_blank" rel="noopener noreferrer" onClick={(e) => void suivreAdresse(e, adresse)}>
          {lien[1]}
        </a>,
      )
    } else if (v.startsWith('**')) morceaux.push(<strong key={m.index}>{v.slice(2, -2)}</strong>)
    else if (v.startsWith('`')) morceaux.push(<code key={m.index}>{v.slice(1, -1)}</code>)
    else morceaux.push(<em key={m.index}>{v.slice(1, -1)}</em>)
    fin = m.index + v.length
  }
  if (fin < texte.length) morceaux.push(texte.slice(fin))
  return morceaux
}

/**
 * La réponse de l'agent, souvent en Markdown : des paragraphes, des listes (à puces ou numérotées), des titres rendus
 * en gras, et l'en-ligne d'`enLigne`. Le reste se lit tel qu'il est écrit.
 */
export function TexteAgent({ texte }: { texte: string }) {
  const blocs = texte.replace(/\r\n/g, '\n').split(/\n{2,}/)
  return (
    <>
      {blocs.map((bloc, i) => {
        const lignes = bloc.split('\n').filter((l) => l.trim())
        if (lignes.length === 0) return null
        const puce = /^\s*(?:[-*•]|\d+[.)])\s+/
        if (lignes.every((l) => puce.test(l))) {
          const Liste = /^\s*\d/.test(lignes[0]!) ? 'ol' : 'ul'
          return (
            <Liste key={i}>
              {lignes.map((l, j) => (
                <li key={j}>{enLigne(l.replace(puce, ''))}</li>
              ))}
            </Liste>
          )
        }
        return (
          <p key={i}>
            {lignes.map((l, j) => {
              const titre = /^#{1,6}\s+/.exec(l)
              const contenu = titre ? <strong>{enLigne(l.slice(titre[0].length))}</strong> : enLigne(l)
              return (
                <span key={j}>
                  {j > 0 && <br />}
                  {contenu}
                </span>
              )
            })}
          </p>
        )
      })}
    </>
  )
}

/**
 * Le tour qu'on suit : son id, le tableau d'où il est parti, où ses routes sont gardées, et s'il vient de cet onglet.
 * Seul l'onglet qui a envoyé la demande suit l'intention d'ouvrir de l'agent : un autre onglet, ou la page rechargée
 * qui retrouve le tour dans le fil, ne bouge pas sous les yeux de la personne.
 */
interface TourSuivi {
  id: string
  tableau: string
  envoye: boolean
}

/** Une pièce jointe au message qu'on écrit : partie dès qu'on l'ajoute, prête quand l'outil a rendu son identifiant. */
export interface PieceAgent {
  cle: string
  nom: string
  taille: number
  type: string
  /** Une vignette, pour une image (une adresse `blob:` de ce navigateur). */
  apercu: string | null
  etat: 'envoi' | 'prete' | 'refusee'
  id: string | null
  erreur: string | null
}

/** Un message envoyé, tel que la bulle le montre tant que le fil de l'outil ne l'a pas repris. */
interface Envoi {
  cle: string
  texte: string
  pieces: PieceAgent[]
  selection: number
}

/** Un message écrit pendant un tour : en file chez l'outil, il partira à la fin du tour en cours. */
interface EnAttente extends Envoi {
  /** Le tour que l'outil lui a donné ; `null` tant que la demande n'a pas répondu. */
  tour: string | null
  tableau: string
}

/** Ce qu'un tour fini laisse sous sa réponse : ce qu'il a créé, et son fil conducteur, replié. */
export interface ApresTour {
  reponse: string
  crees: Cree[]
  etapes: Etape[]
  duree: number
  arrete: boolean
}

/**
 * Les fichiers qu'on veut joindre, triés avant tout envoi : 25 Mo chacun au plus, dix par message, aucun vide. Rend
 * ceux qui partent, et ce qu'il faut dire des autres.
 */
export function trierFichiers(dejaLa: number, fichiers: readonly File[]): { acceptes: File[]; avis: string | null } {
  const acceptes: File[] = []
  const refus: string[] = []
  let tropNombreux = false
  for (const f of fichiers) {
    if (f.size > PIECE_MAX) refus.push(t('agent.piece.tropGrosse', { nom: f.name || t('agent.piece.sansNom') }))
    else if (f.size === 0) refus.push(t('agent.piece.vide', { nom: f.name || t('agent.piece.sansNom') }))
    else if (dejaLa + acceptes.length >= PIECES_MAX) tropNombreux = true
    else acceptes.push(f)
  }
  if (tropNombreux) refus.push(t('agent.piece.tropNombreuses', { n: PIECES_MAX }))
  return { acceptes, avis: refus.length > 0 ? refus.join(' ') : null }
}

/** Le nom d'une pièce : celui du fichier ; une image collée (« image.png », toujours le même) prend un numéro. */
export function nomDePiece(f: File, n: number): string {
  const nom = f.name?.trim()
  if (nom && !/^image\.\w+$/i.test(nom)) return nom
  const ext = (nom && extensionDe(nom)) || f.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png'
  return t('agent.piece.collee', { n, ext })
}

/** Ce qui s'ouvre en grand et qu'une demande peut dire ouvert : une page, une carte mentale. */
const OUVRABLES: ReadonlySet<string> = new Set(['document', 'arbre'])

/**
 * La page ou la carte ouverte en grand d'où l'on écrit, si l'adresse en nomme une : la demande la porte (`ouvert`), et
 * le relais la met en tête de la sélection. Un élément que l'adresse ne fait que montrer (une note) n'est pas ouvert.
 */
export function ouvertDe(espace: EspaceNavigable | undefined, ici: Ici): string | null {
  if (!ici.element) return null
  const type = espace?.tableau(ici.tableau)?.elements.find((e) => e.id === ici.element)?.contenu.type
  return type && OUVRABLES.has(type) ? ici.element : null
}

/**
 * L'agent, pour cette personne : une seule conversation, qui la suit d'une vue à l'autre. Deux choses distinctes :
 *
 * - **d'où l'on écrit** (`ici`, lu dans l'adresse) : le tableau auquel une demande se rattache, la sélection qui part
 *   avec elle sur une toile, la page ou la carte ouverte en grand ;
 * - **le fil affiché** : les échanges, et le tour en cours, suivi depuis le tableau d'où il est parti. L'agent peut
 *   mener la personne ailleurs pendant qu'il travaille : le fil reste à l'écran, et le tour se suit jusqu'au bout.
 *
 * Le tour se suit en direct (`fram.journal`), chaque seconde, aussi longtemps qu'il dure : ce que l'agent fait, son
 * plan, sa réponse au fil de l'eau, ce qu'il crée. On peut l'arrêter, et lui écrire pendant ce temps : le message part
 * aussitôt, l'outil le met en file, et la bulle le montre « en attente » jusqu'à son tour. Les pièces partent dès
 * qu'on les joint ; le message ne porte que leurs identifiants.
 *
 * La première vue d'où le relais répond dit si l'agent est là pour la personne ; on ne le redemande plus ensuite. Le
 * fil se relit à l'ouverture du panneau et à la fin de chaque tour.
 */
export function useAgent(ici: Ici | null, espace?: EspaceNavigable) {
  const [agent, setAgent] = useState<{ nom: string; disponible: boolean } | null>(null)
  const [echanges, setEchanges] = useState<EchangeAgent[]>([])
  const [parties, setParties] = useState<PartieAgent[]>([])
  const [tour, setTour] = useState<TourSuivi | null>(null)
  const [attendCartes, setAttendCartes] = useState(false)
  const [cartes, setCartes] = useState<CarteAgent[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)
  /** La question du tour en cours, tant que le fil relu ne l'a pas reprise. */
  const [dit, setDit] = useState<Envoi | null>(null)
  const [enAttente, setEnAttente] = useState<EnAttente[]>([])
  /** Les messages envoyés depuis l'ouverture de la page : leurs pièces se montrent sous eux dans le fil. */
  const [envois, setEnvois] = useState<Envoi[]>([])
  /** Les tours finis depuis l'ouverture de la page : la bulle en tire sa pastille « réponse non lue ». */
  const [reponses, setReponses] = useState(0)
  /** Ce que chaque tour fini laisse sous sa réponse (ses créations, son fil conducteur), par le texte de la réponse. */
  const [apres, setApres] = useState<ApresTour[]>([])
  /** Le direct du tour en cours, et ce qu'il a déjà créé. */
  const [direct, setDirect] = useState<Direct | null>(null)
  const [creesTour, setCreesTour] = useState<Cree[]>([])
  const [debutTour, setDebutTour] = useState(0)
  const [arret, setArret] = useState(false)
  const [pieces, setPieces] = useState<PieceAgent[]>([])
  const [avis, setAvis] = useState<string | null>(null)
  /** Les tours dont l'intention d'ouvrir a été suivie : une fois chacun. */
  const ouvertures = useRef(new Set<string>())
  /** Les tours finis : un fil relu juste après peut encore en dire un en cours, qu'on ne suit pas une seconde fois. */
  const finis = useRef(new Set<string>())
  /** Combien de fois l'agent a mené la personne ailleurs : la feuille du téléphone se range pour qu'elle voie où. */
  const [menes, setMenes] = useState(0)
  const iciCourant = useRef(ici)
  iciCourant.current = ici
  const tourCourant = useRef(tour)
  tourCourant.current = tour
  const ditCourant = useRef(dit)
  ditCourant.current = dit
  const attenteCourante = useRef(enAttente)
  attenteCourante.current = enAttente
  const piecesCourantes = useRef(pieces)
  piecesCourantes.current = pieces
  const promesses = useRef(new Map<string, Promise<string | null>>())
  const compteur = useRef(0)

  // Chaque envoi ouvre une génération : un fil relu AVANT lui, et revenu après (un outil lent), est d'avant la demande et
  // l'effacerait de l'écran ; il est ignoré. Le fil relu à la fin du tour, lui, la contient.
  const generation = useRef(0)
  /** Relit le fil depuis ce tableau (à défaut, d'où l'on écrit), et apprend au passage si l'agent est là. */
  const relire = useCallback(async (depuis?: string) => {
    const tableau = depuis ?? iciCourant.current?.tableau
    if (!tableau) return
    const lancee = generation.current
    try {
      const e = await lireAgent(tableau)
      if (lancee !== generation.current) return
      setAgent({ nom: e.agent, disponible: e.disponible })
      if (!e.disponible) return
      setEchanges(e.echanges ?? [])
      setParties(Array.isArray(e.parties) ? e.parties : [])
      // Un tour en cours, lancé d'un autre onglet ou avant un rechargement : il se suit aussi.
      const enCours = e.tour?.id
      if (enCours && !finis.current.has(enCours)) setTour((avant) => avant ?? { id: enCours, tableau, envoye: false })
    } catch {
      // Le fil reste tel qu'il était ; la prochaine ouverture le relira.
    }
  }, [])

  // Tant qu'on ne sait pas si l'agent est là, chaque tableau neuf le demande, une fois : une toile qu'on ne fait que
  // lire peut refuser, et un serveur sans agent répond 404 à tout, qu'on ne redemande pas à chaque pas.
  const tableau = ici?.tableau ?? null
  const connu = agent !== null
  const demandes = useRef(new Set<string>())
  useEffect(() => {
    if (!tableau || connu || demandes.current.has(tableau)) return
    demandes.current.add(tableau)
    void relire(tableau)
  }, [tableau, connu, relire])

  const nom = agent?.nom ?? ''
  const nomCourant = useRef(nom)
  nomCourant.current = nom

  // Le tour en cours se suit en direct, depuis le tableau d'où il est parti, jusqu'à sa fin : aucune coupure.
  const idTour = tour?.id ?? null
  const origine = tour?.tableau ?? null
  const envoye = tour?.envoye ?? false
  useEffect(() => {
    if (!idTour || !origine) return
    let vivant = true
    let depuis: number | string | null = null
    let rates = 0
    let minuteur: ReturnType<typeof setTimeout>
    const debut = Date.now()
    let courant = directVide(nomCourant.current)
    setDirect(courant)
    setCreesTour([])
    setDebutTour(debut)
    setArret(false)

    /** Le tour est fini : sa réponse rejoint le fil, son fil conducteur se replie dessous, et le suivant en file part. */
    const terminer = (j: JournalTour, lus: Cree[]) => {
      finis.current.add(idTour)
      const texte = (j.texte ?? reponseDe(courant)).trim()
      const arrete = j.etat === 'cancelled'
      setApres((avant) => [...avant, { reponse: cleReponse(texte), crees: lus, etapes: courant.etapes, duree: Date.now() - debut, arrete }])
      if (j.etat === 'failed') setErreur(j.echec || courant.echec || t('agent.echec'))
      // La question et la réponse rejoignent le fil tout de suite ; le fil relu les redira dans les mots de l'outil.
      const question = ditCourant.current
      const quand = new Date().toISOString()
      setEchanges((avant) => [
        ...avant,
        ...(question && !dejaDans(avant, question.texte) ? [{ qui: 'personne' as const, texte: question.texte, quand }] : []),
        ...(texte ? [{ qui: 'fram' as const, texte, quand }] : []),
      ])
      setReponses((n) => n + 1)
      setCartes([])
      setAttendCartes(false)
      // Le message suivant en file : l'outil l'a déjà lancé, on le suit.
      const suivant = attenteCourante.current.find((x) => x.tour && x.tour !== idTour)
      setEnAttente((l) => l.filter((x) => x !== suivant && x.tour !== idTour))
      if (suivant?.tour) {
        setDit(suivant)
        setTour({ id: suivant.tour, tableau: suivant.tableau, envoye: true })
      } else {
        setDit(null)
        setTour(null)
      }
      void relire(origine)
    }

    const suivre = async () => {
      let attente = SUIVRE_MS
      try {
        const j = await lireJournal(origine, idTour, depuis)
        if (!vivant) return
        rates = 0
        depuis = j.suite ?? depuis
        courant = appliquer(courant, Array.isArray(j.evenements) ? j.evenements : [], nomCourant.current)
        setDirect(courant)
        const accord = j.etat === 'awaiting_approval'
        setAttendCartes(accord)
        setCartes(accord ? j.cartes : [])
        const lus = creesLus(j.crees)
        setCreesTour(lus)
        // « Ouvre-la » : l'agent montre ce qu'il a fait, une fois, et seulement dans l'onglet qui lui a écrit.
        const ouverture = ouvertureLue(j.ouvrir)
        if (envoye && ouverture && !ouvertures.current.has(idTour)) {
          ouvertures.current.add(idTour)
          allerDansLApp(cheminDeLOuverture(ouverture, lus))
          setMenes((n) => n + 1)
        }
        if (j.fini) return terminer(j, lus)
        if (j.encore) attente = 0
      } catch (x) {
        // Une lecture manquée n'arrête pas le suivi : la suivante dira où il en est. Un tour que l'outil ne connaît
        // plus (404, trois fois) cesse d'être suivi : le fil relu dira ce qu'il en reste.
        rates++
        attente = Math.min(SUIVRE_MAX_ATTENTE_MS, SUIVRE_MS * 2 ** Math.min(rates, 4))
        if ((x as { statut?: number }).statut === 404 && rates >= 3) {
          setTour(null)
          setDit(null)
          void relire(origine)
          return
        }
      }
      if (!vivant) return
      minuteur = setTimeout(() => void suivre(), attente)
    }
    minuteur = setTimeout(() => void suivre(), 0)
    return () => {
      vivant = false
      clearTimeout(minuteur)
    }
  }, [idTour, origine, envoye, relire])

  /** Joint des fichiers au message : ceux qui passent les limites partent aussitôt, les autres sont dits. */
  const joindre = (fichiers: readonly File[]) => {
    const ou = iciCourant.current
    if (!ou || fichiers.length === 0) return
    const { acceptes, avis: dire } = trierFichiers(piecesCourantes.current.length, fichiers)
    setAvis(dire)
    const neuves = acceptes.map((f): PieceAgent & { fichier: File } => {
      const cle = `piece-${++compteur.current}`
      const apercu = f.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null
      return { cle, nom: nomDePiece(f, compteur.current), taille: f.size, type: f.type, apercu, etat: 'envoi', id: null, erreur: null, fichier: f }
    })
    if (neuves.length === 0) return
    piecesCourantes.current = [...piecesCourantes.current, ...neuves]
    setPieces((avant) => [...avant, ...neuves.map(({ fichier: _f, ...p }) => p)])
    const changer = (cle: string, quoi: Partial<PieceAgent>) => setPieces((avant) => avant.map((p) => (p.cle === cle ? { ...p, ...quoi } : p)))
    for (const p of neuves) {
      promesses.current.set(
        p.cle,
        envoyerPiece(ou.tableau, p.fichier, p.nom).then(
          (r) => {
            changer(p.cle, { etat: 'prete', id: r.piece })
            return r.piece
          },
          (x: Error) => {
            changer(p.cle, { etat: 'refusee', erreur: x.message || t('agent.piece.echec') })
            return null
          },
        ),
      )
    }
  }

  const retirer = (cle: string) => {
    const p = piecesCourantes.current.find((x) => x.cle === cle)
    if (p?.apercu) URL.revokeObjectURL?.(p.apercu)
    promesses.current.delete(cle)
    piecesCourantes.current = piecesCourantes.current.filter((x) => x.cle !== cle)
    setPieces((avant) => avant.filter((x) => x.cle !== cle))
    setAvis(null)
  }

  const envoyer = async () => {
    const texte = message.trim()
    const ou = iciCourant.current
    const jointes = piecesCourantes.current
    if ((!texte && jointes.length === 0) || envoi || !ou) return
    if (jointes.some((p) => p.etat === 'refusee')) {
      setAvis(t('agent.piece.aRetirer'))
      return
    }
    setEnvoi(true)
    setErreur(null)
    setAvis(null)
    generation.current++
    // Le champ se vide tout de suite ; un échec y remet ce qu'on avait écrit et joint.
    setMessage('')
    setPieces([])
    piecesCourantes.current = []
    const envoiNeuf: Envoi = { cle: `envoi-${++compteur.current}`, texte, pieces: jointes, selection: 0 }
    const pendantAvant = tourCourant.current !== null
    if (pendantAvant) setEnAttente((l) => [...l, { ...envoiNeuf, tour: null, tableau: ou.tableau }])
    else setDit(envoiNeuf)
    const remettre = (raison: string) => {
      if (pendantAvant) setEnAttente((l) => l.filter((x) => x.cle !== envoiNeuf.cle))
      else setDit((d) => (d?.cle === envoiNeuf.cle ? null : d))
      setMessage((m) => m || texte)
      piecesCourantes.current = [...jointes, ...piecesCourantes.current]
      setPieces((p) => [...jointes, ...p])
      setErreur(raison)
    }
    try {
      // Les pièces sont parties en les joignant ; le message attend qu'elles soient toutes arrivées.
      const ids = await Promise.all(jointes.map((p) => (p.id ? Promise.resolve(p.id) : (promesses.current.get(p.cle) ?? Promise.resolve(null)))))
      if (ids.some((x) => !x)) {
        // Une pièce a été refusée pendant l'attente : elle revient au champ, marquée, avec les autres.
        const relues = jointes.map((p, i) => (ids[i] ? { ...p, etat: 'prete' as const, id: ids[i]! } : { ...p, etat: 'refusee' as const, erreur: p.erreur ?? t('agent.piece.echec') }))
        remettre(t('agent.piece.aRetirer'))
        setPieces((p) => [...relues, ...p.slice(jointes.length)])
        return
      }
      // La sélection se lit dans la présence de la toile qu'on regarde. Hors d'une toile, il n'y en a pas, et la
      // demander ouvrirait le tableau du dossier pour rien.
      const selection = ou.vue === 'toile' || ou.vue === 'element' ? selectionDe(espace, ou.tableau) : []
      const parti = { ...envoiNeuf, selection: selection.length }
      const r = await demanderAgent(ou.tableau, texte.slice(0, MESSAGE_MAX), selection, ouvertDe(espace, ou), ids as string[])
      setEnvois((l) => [...l, parti])
      if (tourCourant.current) {
        // Un tour tourne : le message attend en file, avec le tour que l'outil lui a donné.
        if (pendantAvant) setEnAttente((l) => l.map((x) => (x.cle === parti.cle ? { ...x, ...parti, tour: r.tour } : x)))
        else {
          setDit((d) => (d?.cle === parti.cle ? null : d))
          setEnAttente((l) => [...l, { ...parti, tour: r.tour, tableau: ou.tableau }])
        }
      } else {
        // Le tour d'avant a fini pendant l'envoi : celui-ci part tout de suite.
        if (pendantAvant) setEnAttente((l) => l.filter((x) => x.cle !== parti.cle))
        setDit(parti)
        setTour({ id: r.tour, tableau: ou.tableau, envoye: true })
      }
    } catch (x) {
      remettre((x as Error).message || t('agent.echec'))
    } finally {
      setEnvoi(false)
    }
  }

  /** Répond aux cartes du tour en cours : l'outil reprend le tour, que le direct suit toujours. */
  const decider = async (choix: { id: string; accord: boolean; toujours: boolean }[]) => {
    if (!tour || choix.length === 0) return
    setErreur(null)
    try {
      await deciderCartes(tour.tableau, tour.id, choix)
      setCartes([])
      setAttendCartes(false)
    } catch (x) {
      setErreur((x as Error).message || t('agent.echec'))
    }
  }

  /** Arrête le tour en cours : l'outil l'arrête au prochain pas, et le journal en dit la fin. */
  const arreter = async () => {
    if (!tour || arret) return
    setArret(true)
    setErreur(null)
    try {
      await arreterTour(tour.tableau, tour.id)
    } catch (x) {
      setArret(false)
      setErreur((x as Error).message || t('agent.echec'))
    }
  }

  // La page ou la carte ouverte d'où l'on écrit : la saisie en parle.
  const ouvert = ici ? ouvertDe(espace, ici) : null
  const genreOuvert = ouvert ? (espace?.tableau(ici!.tableau)?.elements.find((e) => e.id === ouvert)?.contenu.type ?? null) : null

  return {
    disponible: agent?.disponible === true,
    nom,
    ici,
    genreOuvert,
    echanges,
    parties,
    apres,
    envois,
    tour: idTour,
    direct,
    creesTour,
    debutTour,
    arret,
    arreter,
    attendCartes,
    cartes,
    decider,
    erreur,
    message,
    setMessage,
    envoi,
    dit,
    enAttente,
    pieces,
    avis,
    joindre,
    retirer,
    reponses,
    menes,
    relire,
    envoyer,
  }
}

export type Agent = ReturnType<typeof useAgent>

/** Ce texte est-il déjà, de la personne, dans la fin du fil (après la dernière réponse de l'agent) ? */
function dejaDans(echanges: readonly EchangeAgent[], texte: string): boolean {
  const cle = cleReponse(texte)
  for (let i = echanges.length - 1; i >= 0; i--) {
    const x = echanges[i]!
    if (x.qui === 'fram') return false
    if (cleReponse(x.texte) === cle) return true
  }
  return false
}

/**
 * Les messages que la bulle montre d'elle-même (la question du tour en cours, ceux en file) et que le fil relu ne dit
 * pas encore : un fil relu pendant le tour peut déjà les porter, et ils ne paraissent pas deux fois.
 */
export function messagesLocaux<T extends { texte: string }>(echanges: readonly EchangeAgent[], locaux: readonly T[]): T[] {
  const restants: string[] = []
  for (let i = echanges.length - 1; i >= 0; i--) {
    const x = echanges[i]!
    if (x.qui === 'fram') break
    restants.push(cleReponse(x.texte))
  }
  return locaux.filter((m) => {
    const i = restants.indexOf(cleReponse(m.texte))
    if (i < 0) return true
    restants.splice(i, 1)
    return false
  })
}

/**
 * Sous quelle réponse du fil va ce que chaque tour fini a laissé : celle dont le texte est celui du tour, en partant des
 * plus récentes (deux réponses peuvent se dire pareil). Une réponse que le fil relu dit autrement (l'outil peut la
 * remettre en forme) le prend sur la dernière réponse de l'agent. Une même adresse n'a qu'une puce.
 */
export function apresParEchange(echanges: readonly EchangeAgent[], apres: readonly ApresTour[]): Map<number, ApresTour> {
  let derniere = -1
  echanges.forEach((x, i) => {
    if (x.qui === 'fram') derniere = i
  })
  const sous = new Map<number, ApresTour>()
  for (const a of [...apres].reverse()) {
    let i = derniere
    for (let j = echanges.length - 1; j >= 0; j--) {
      const x = echanges[j]!
      if (x.qui === 'fram' && !sous.has(j) && cleReponse(x.texte) === a.reponse) {
        i = j
        break
      }
    }
    if (i < 0) continue
    // On remonte le temps : ce qu'un tour plus ancien a laissé passe devant.
    const deja = sous.get(i)
    const crees: Cree[] = []
    for (const x of [...a.crees, ...(deja?.crees ?? [])]) if (!crees.some((d) => d.chemin === x.chemin)) crees.push(x)
    sous.set(i, deja ? { ...a, crees, etapes: [...a.etapes, ...deja.etapes], duree: deja.duree + a.duree, arrete: deja.arrete || a.arrete } : { ...a, crees })
  }
  return sous
}

/** Sous quel message de la personne vont les pièces de chaque envoi : celui qui a son texte, le plus récent d'abord. */
export function piecesParEchange(echanges: readonly EchangeAgent[], envois: readonly { texte: string; pieces: PieceAgent[] }[]): Map<number, PieceAgent[]> {
  const sous = new Map<number, PieceAgent[]>()
  const pris = new Set<number>()
  for (const e of [...envois].reverse()) {
    if (e.pieces.length === 0) continue
    const cle = cleReponse(e.texte)
    for (let i = echanges.length - 1; i >= 0; i--) {
      const x = echanges[i]!
      if (x.qui !== 'personne' || pris.has(i) || cleReponse(x.texte) !== cle) continue
      pris.add(i)
      sous.set(i, e.pieces)
      break
    }
  }
  return sous
}

/** L'icône d'une création, selon son genre dans les mots de la porte (`genreDeLElement` du serveur). */
const ICONES_CREES: Record<string, NomIcone> = {
  page: 'document',
  carte_mentale: 'carteMentale',
  toile: 'tableau',
  tableau: 'tableau',
  dossier: 'dossier',
  note: 'note',
  titre: 'titre',
  taches: 'tache',
  colonne: 'colonne',
  lien: 'lien',
  ligne: 'ligne',
  image: 'image',
  fichier: 'fichier',
}

/** « Ouvrir « … » » pour chaque création : un lien de l'application, qu'un clic suit sans la quitter. */
function PucesOuvrir({ crees }: { crees: Cree[] }) {
  return (
    <div className="agent-puces">
      {crees.map((c) => (
        <a key={c.chemin} className="agent-puce" href={c.chemin} onClick={(e) => void suivreAdresse(e, c.chemin)}>
          <Icone nom={ICONES_CREES[c.type] ?? 'ouvrir'} taille={14} />
          <span>{t('agent.ouvrir', { titre: c.titre || t('commun.sansTitre') })}</span>
        </a>
      ))}
    </div>
  )
}

/** L'icône d'un geste selon où il en est ; en cours, un petit cercle qui tourne. */
const ICONE_DU_STATUT: Record<string, NomIcone | null> = { en_cours: null, attente: 'sablier', fait: 'coche', echec: 'attention', refuse: 'fermer' }

/** Le fil conducteur d'un tour : ses gestes, ses pensées, ses étapes écrites, dans l'ordre. */
function ListeEtapes({ etapes, nom }: { etapes: readonly Etape[]; nom: string }) {
  return (
    <ol className="agent-etapes">
      {etapes.map((e) => (
        <li key={e.cle} className={`agent-etape agent-etape-${e.genre}`} data-statut={e.genre === 'geste' ? e.statut : undefined}>
          {e.genre === 'geste' ? (
            <>
              <span className="agent-etape-signe" aria-hidden="true">
                {ICONE_DU_STATUT[e.statut] ? <Icone nom={ICONE_DU_STATUT[e.statut]!} taille={12} trait={2} /> : <span className="agent-tourne" />}
              </span>
              <span>{e.phrase}</span>
            </>
          ) : e.genre === 'pensee' ? (
            <>
              <span className="agent-etape-signe" aria-hidden="true">
                <Icone nom="idee" taille={12} trait={1.75} />
              </span>
              <span>
                <span className="agent-pensee-titre">{e.titre}</span>
                {e.resume && <span className="agent-pensee-resume">{e.resume}</span>}
              </span>
            </>
          ) : (
            <>
              <span className="agent-etape-signe" aria-hidden="true">
                <Icone nom="commentaire" taille={12} trait={1.75} />
              </span>
              <div className="agent-texte agent-etape-texte" aria-label={t('agent.etape.texte', { nom })}>
                <TexteAgent texte={e.texte} />
              </div>
            </>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Le temps écoulé depuis le début du tour, à la seconde : la ligne vivante ne reste jamais figée. */
function Chrono({ debut }: { debut: number }) {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(minuteur)
  }, [])
  return <span className="agent-chrono">{duree(maintenant - debut)}</span>
}

/** Pendant le tour, on ne montre que les derniers pas : les plus anciens se déplient. */
const ETAPES_VISIBLES = 6

/** Le tour en cours, en direct : la ligne vivante, le plan, le fil conducteur, la réponse qui s'écrit, ce qui est créé. */
function TourEnDirect({ agent }: { agent: Agent }) {
  const { nom, direct, creesTour, debutTour, arret, arreter, attendCartes, cartes, decider } = agent
  const [tout, setTout] = useState(false)
  if (!direct) return null
  const reponse = reponseDe(direct)
  const caches = tout ? 0 : Math.max(0, direct.etapes.length - ETAPES_VISIBLES)
  const ligne = attendCartes && cartes.length === 0 ? t('agent.cartesAilleurs', { nom }) : direct.ligne
  return (
    <li className="agent-echange agent-lui agent-direct">
      <strong>{nom}</strong>
      <div className="agent-direct-ligne" data-attend={attendCartes ? '' : undefined}>
        <span className="agent-direct-point" aria-hidden="true" />
        <span className="agent-direct-phrase">{arret ? t('agent.direct.cancelling', { nom }) : ligne}</span>
        <Chrono debut={debutTour} />
        <button type="button" className="bouton bouton-nu agent-arreter" onClick={() => void arreter()} disabled={arret} aria-label={t('agent.arreter.long', { nom })}>
          <span className="agent-arreter-carre" aria-hidden="true" />
          {t('agent.arreter')}
        </button>
      </div>
      {direct.plan && (
        <ol className="agent-plan" aria-label={t('agent.plan')}>
          {direct.plan.map((e, i) => (
            <li key={i} data-statut={e.statut}>
              {e.titre}
            </li>
          ))}
        </ol>
      )}
      {caches > 0 && (
        <button type="button" className="bouton bouton-nu agent-etapes-avant" onClick={() => setTout(true)}>
          {tn('agent.etapesAvant', caches)}
        </button>
      )}
      {direct.etapes.length > 0 && <ListeEtapes etapes={direct.etapes.slice(caches)} nom={nom} />}
      {reponse && (
        <div className="agent-texte agent-ecrit">
          <TexteAgent texte={reponse} />
        </div>
      )}
      {cartes.length > 0 && (
        <div className="agent-cartes">
          <strong>{t('agent.cartes', { nom })}</strong>
          {cartes.map((c) => (
            <div key={c.id} className="agent-carte">
              <p>
                {c.resume}
                {c.definitif && <span className="agent-definitif">{t('agent.definitif')}</span>}
              </p>
              <div className="agent-carte-gestes">
                <button type="button" className="bouton" onClick={() => void decider([{ id: c.id, accord: true, toujours: false }])}>
                  {t('agent.autoriser')}
                </button>
                {!c.definitif && (
                  <button type="button" className="bouton" onClick={() => void decider([{ id: c.id, accord: true, toujours: true }])}>
                    {t('agent.toujours')}
                  </button>
                )}
                <button type="button" className="bouton" onClick={() => void decider([{ id: c.id, accord: false, toujours: false }])}>
                  {t('agent.refuser')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {creesTour.length > 0 && <PucesOuvrir crees={creesTour} />}
    </li>
  )
}

/** Les pièces d'un message : une vignette pour une image, l'icône de son genre sinon, son nom et sa taille. */
function Pieces({ pieces, retirer }: { pieces: readonly PieceAgent[]; retirer?: (cle: string) => void }) {
  return (
    <ul className={`agent-pieces${retirer ? '' : ' agent-pieces-envoyees'}`} aria-label={t('agent.pieces')}>
      {pieces.map((p) => (
        <li key={p.cle} className="agent-piece" data-etat={p.etat}>
          {p.apercu ? (
            <img className="agent-piece-vignette" src={p.apercu} alt="" />
          ) : (
            <span className="agent-piece-vignette agent-piece-icone" aria-hidden="true">
              <Icone nom={ICONE_DU_GENRE[genreDe(p.nom, p.type)]} taille={18} trait={1.5} />
            </span>
          )}
          <span className="agent-piece-texte">
            <span className="agent-piece-nom" title={p.nom}>
              {p.nom}
            </span>
            <small>{p.etat === 'refusee' ? p.erreur : p.etat === 'envoi' && retirer ? t('agent.piece.envoi') : tailleLisible(p.taille)}</small>
          </span>
          {p.etat === 'envoi' && retirer && <span className="agent-tourne agent-piece-envoi" aria-hidden="true" />}
          {retirer && (
            <button type="button" className="bouton bouton-nu agent-piece-retirer" aria-label={t('agent.piece.retirer', { nom: p.nom })} onClick={() => retirer(p.cle)}>
              <Icone nom="fermer" taille={12} trait={2} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Un message de la personne que la bulle montre d'elle-même : la question du tour, ou un message en file. */
function MessageLocal({ envoi, attente }: { envoi: Envoi; attente?: boolean }) {
  return (
    <li className="agent-echange agent-moi" data-attente={attente ? '' : undefined}>
      <strong>{attente ? t('agent.enAttente') : t('agent.vous')}</strong>
      {envoi.pieces.length > 0 && <Pieces pieces={envoi.pieces} />}
      {envoi.texte && <p>{envoi.texte}</p>}
      {envoi.selection > 0 && <small className="agent-selection">{tn('agent.avecSelection', envoi.selection)}</small>}
    </li>
  )
}

/** Quand une partie précédente a eu lieu : « 22 nov., 09:00 – 09:40 ». */
function periode(p: PartieAgent): string {
  const debut = new Date(p.debut)
  const fin = new Date(p.fin)
  if (Number.isNaN(debut.getTime())) return ''
  const jour = new Intl.DateTimeFormat(langue(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  if (Number.isNaN(fin.getTime())) return jour.format(debut)
  const meme = debut.toDateString() === fin.toDateString()
  return `${jour.format(debut)} – ${meme ? new Intl.DateTimeFormat(langue(), { hour: '2-digit', minute: '2-digit' }).format(fin) : jour.format(fin)}`
}

/** « Plus tôt » : les parties précédentes de la conversation, chacune avec son résumé, de la plus ancienne à la dernière. */
function PlusTot({ parties }: { parties: readonly PartieAgent[] }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <li className="agent-plus-tot">
      <button type="button" className="bouton bouton-nu agent-plus-tot-bouton" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <Icone nom={ouvert ? 'chevronBas' : 'chevronDroite'} taille={12} trait={2} />
        {ouvert ? t('agent.plusTot.replier') : tn('agent.plusTot', parties.length)}
      </button>
      {ouvert && (
        <ol className="agent-parties">
          {[...parties].reverse().map((p) => (
            <li key={p.id} className="agent-partie">
              <small>{periode(p)}</small>
              <div className="agent-texte">
                <TexteAgent texte={p.resume.trim() || t('agent.partie.sansResume')} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

/** Le glisser vient-il du système, avec des fichiers ? Un élément glissé de la toile n'en porte pas. */
export const avecFichiers = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')

/** Le fil, le tour en direct et la saisie : le contenu de la bulle, au bureau comme au téléphone. Relit le fil à l'ouverture. */
export function FilAgent({ agent }: { agent: Agent }) {
  const { nom, ici, genreOuvert, echanges, parties, apres, envois, tour, erreur, message, setMessage, envoi, dit, enAttente, pieces, avis, joindre, retirer, relire, envoyer } = agent
  const fil = useRef<HTMLOListElement>(null)
  const champ = useRef<HTMLTextAreaElement>(null)
  const choix = useRef<HTMLInputElement>(null)
  /** Le fil suit le bas tant qu'on y est ; remonté pour relire, il ne bouge plus sous les yeux. */
  const enBas = useRef(true)
  const survols = useRef(0)
  const [depot, setDepot] = useState(false)
  const sous = apresParEchange(echanges, apres)
  const jointes = piecesParEchange(echanges, envois)
  const [question, ...enFile] = messagesLocaux(echanges, [...(dit ? [dit] : []), ...enAttente])
  // La question n'est montrée d'elle-même que si c'est bien elle ; sinon (le fil la porte), tout est en file.
  const ditMontre = dit && question === dit ? dit : null
  const attentes = (ditMontre ? enFile : [question, ...enFile]).filter((x): x is Envoi => !!x && x !== dit)
  // Depuis la bibliothèque, on ne parle pas d'« un tableau » : ce qu'on peut demander n'y est pas le même.
  const biblio = ici?.vue === 'bibliotheque' || ici?.vue === 'dossier'

  useEffect(() => {
    void relire()
  }, [relire])

  // Le fil descend avec ce qui s'écrit, si l'on est en bas.
  useLayoutEffect(() => {
    const l = fil.current
    if (l && enBas.current) l.scrollTop = l.scrollHeight
  })

  // Le champ grandit avec ce qu'on écrit, jusqu'à sa hauteur maximale.
  useLayoutEffect(() => {
    const c = champ.current
    if (!c) return
    // La hauteur compte les bordures (`border-box`) : sans elles, deux pixels débordent et une barre paraît. Au-delà de
    // sa hauteur maximale seulement, le champ défile.
    c.style.height = 'auto'
    const bordures = c.offsetHeight - c.clientHeight
    c.style.height = `${c.scrollHeight + bordures}px`
    c.style.overflowY = c.scrollHeight + bordures > c.offsetHeight ? 'auto' : 'hidden'
  }, [message])

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    void envoyer()
  }
  const touche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void envoyer()
    }
  }
  // ⌘V d'une ou plusieurs images (ou de fichiers copiés) : elles se joignent. Du texte copié d'un traitement de texte
  // ou d'un tableur porte souvent une image de lui-même en prime : c'est son texte qu'on veut.
  const coller = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const fichiers = [...(e.clipboardData?.files ?? [])]
    if (fichiers.length === 0) return
    const types = [...(e.clipboardData.types ?? [])]
    if (e.clipboardData.getData('text/plain').trim() && types.includes('text/html')) return
    e.preventDefault()
    joindre(fichiers)
  }
  // Des fichiers déposés n'importe où sur la conversation : ils se joignent, et la toile dessous n'en reçoit rien.
  const entrer = (e: DragEvent) => {
    if (!avecFichiers(e)) return
    e.preventDefault()
    e.stopPropagation()
    survols.current++
    setDepot(true)
  }
  const survoler = (e: DragEvent) => {
    if (!avecFichiers(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }
  const sortir = (e: DragEvent) => {
    if (!avecFichiers(e)) return
    survols.current = Math.max(0, survols.current - 1)
    if (survols.current === 0) setDepot(false)
  }
  const lacher = (e: DragEvent) => {
    if (!avecFichiers(e)) return
    e.preventDefault()
    e.stopPropagation()
    survols.current = 0
    setDepot(false)
    joindre([...e.dataTransfer.files])
    champ.current?.focus({ preventScroll: true })
  }

  const vide = echanges.length === 0 && !dit && !tour && enAttente.length === 0
  return (
    <div className="agent-conversation" onDragEnter={entrer} onDragOver={survoler} onDragLeave={sortir} onDrop={lacher} data-depot={depot ? '' : undefined}>
      <ol
        className="agent-fil"
        ref={fil}
        onScroll={(e) => {
          const l = e.currentTarget
          enBas.current = l.scrollHeight - l.scrollTop - l.clientHeight < 48
        }}
      >
        {parties.length > 0 && <PlusTot parties={parties} />}
        {vide && (
          <li className="app-panneau-vide agent-vide">
            <Icone nom="idee" taille={22} trait={1.5} />
            {t(biblio ? 'agent.vide.bibliotheque' : 'agent.vide', { nom })}
          </li>
        )}
        {echanges.map((x, i) => {
          const a = sous.get(i)
          return (
            <li key={`${x.quand}-${i}`} className={`agent-echange agent-${x.qui === 'fram' ? 'lui' : 'moi'}`}>
              <strong>{x.qui === 'fram' ? nom : t('agent.vous')}</strong>
              {jointes.get(i) && <Pieces pieces={jointes.get(i)!} />}
              {x.qui === 'fram' ? (
                <div className="agent-texte">
                  <TexteAgent texte={x.texte} />
                </div>
              ) : (
                x.texte && <p>{x.texte}</p>
              )}
              {a && a.etapes.length > 0 && (
                <details className="agent-repli">
                  <summary>
                    {resumeEtapes(a.etapes)} · {duree(a.duree)}
                    {a.arrete && <span className="agent-arrete">{t('agent.arrete')}</span>}
                  </summary>
                  <ListeEtapes etapes={a.etapes} nom={nom} />
                </details>
              )}
              {a && a.etapes.length === 0 && a.arrete && <small className="agent-arrete">{t('agent.arrete')}</small>}
              {a && a.crees.length > 0 && <PucesOuvrir crees={a.crees} />}
            </li>
          )
        })}
        {ditMontre && <MessageLocal envoi={ditMontre} />}
        {tour && <TourEnDirect agent={agent} />}
        {attentes.map((m) => (
          <MessageLocal key={m.cle} envoi={m} attente />
        ))}
      </ol>
      {erreur && (
        <p className="agent-erreur" role="alert">
          {erreur}
        </p>
      )}
      <form className="agent-saisie" onSubmit={soumettre}>
        {pieces.length > 0 && <Pieces pieces={pieces} retirer={retirer} />}
        {avis && (
          <p className="agent-avis" role="status">
            {avis}
          </p>
        )}
        <div className="agent-saisie-ligne">
          <button
            type="button"
            className="bouton bouton-nu agent-joindre"
            aria-label={t('agent.joindre')}
            title={t('agent.joindre.limites', { n: PIECES_MAX })}
            onClick={() => choix.current?.click()}
            disabled={pieces.length >= PIECES_MAX}
          >
            <Icone nom="trombone" taille={18} trait={1.75} />
          </button>
          <input
            ref={choix}
            type="file"
            multiple
            hidden
            tabIndex={-1}
            onChange={(e) => {
              joindre([...(e.currentTarget.files ?? [])])
              e.currentTarget.value = ''
            }}
          />
          <textarea
            ref={champ}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={touche}
            onPaste={coller}
            placeholder={
              tour
                ? t('agent.placeholder.pendant', { nom })
                : t(
                    biblio ? 'agent.placeholder.bibliotheque' : genreOuvert === 'document' ? 'agent.placeholder.page' : genreOuvert === 'arbre' ? 'agent.placeholder.carte' : 'agent.placeholder',
                    { nom },
                  )
            }
            aria-label={t('agent.demander', { nom })}
            rows={1}
            maxLength={MESSAGE_MAX}
            autoFocus
          />
          <button type="submit" className="bouton agent-envoyer" disabled={(!message.trim() && pieces.length === 0) || envoi} aria-label={t('agent.envoyer')}>
            <Icone nom="envoyer" taille={16} />
          </button>
        </div>
      </form>
      {depot && (
        <div className="agent-depot" aria-hidden="true">
          <Icone nom="trombone" taille={22} trait={1.5} />
          {t('agent.depot', { n: PIECES_MAX })}
        </div>
      )}
    </div>
  )
}
