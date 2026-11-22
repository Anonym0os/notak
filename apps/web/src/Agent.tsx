import { type FormEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { type EspaceNavigable, Icone, type NomIcone } from '@notak/tableau'
import type { Ici } from './ici'
import { t, tn } from './langue'
import { allerDansLApp, cheminDansLApp, suivreAdresse } from './naviguer'

/** Un échange du fil de l'agent, tel que l'outil le garde : un seul fil par personne, d'où qu'elle écrive. */
export interface EchangeAgent {
  qui: 'personne' | 'fram'
  texte: string
  quand: string
}

/** L'agent pour cette personne : `disponible` faux, la bulle ne paraît pas. */
export interface EtatAgent {
  agent: string
  disponible: boolean
  echanges?: EchangeAgent[]
  tour?: { id: string; etat: string } | null
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

/** Un tour se relit à ce rythme, et trois minutes au plus : au-delà, l'agent répondra dans le fil. */
const SUIVRE_MS = 1500
export const SUIVRE_MAX_MS = 180_000
const MESSAGE_MAX = 8000

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
/** Une demande, rattachée à ce tableau ; `ouvert` : la page ou la carte ouverte en grand d'où l'on écrit. */
export const demanderAgent = (tableau: string, message: string, selection: SelectionAgent = [], ouvert: string | null = null) =>
  appeler<{ tour: string; etat: string }>(chemin(tableau), { message, ...(selection.length > 0 ? { selection } : {}), ...(ouvert ? { ouvert } : {}) })

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
export const lireTourAgent = (tableau: string, tour: string) => appeler<EtatTour>(`${chemin(tableau)}/tours/${encodeURIComponent(tour)}`)
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
 * La première vue d'où le relais répond dit si l'agent est là pour la personne ; on ne le redemande plus ensuite. Le
 * fil se relit à l'ouverture du panneau et à la fin de chaque tour.
 */
export function useAgent(ici: Ici | null, espace?: EspaceNavigable) {
  const [agent, setAgent] = useState<{ nom: string; disponible: boolean } | null>(null)
  const [echanges, setEchanges] = useState<EchangeAgent[]>([])
  const [tour, setTour] = useState<TourSuivi | null>(null)
  const [attendCartes, setAttendCartes] = useState(false)
  const [cartes, setCartes] = useState<CarteAgent[]>([])
  // Relancé à chaque réponse aux cartes : le suivi du même tour reprend, avec ses trois minutes.
  const [relance, setRelance] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [dit, setDit] = useState<string | null>(null)
  const [avecSelection, setAvecSelection] = useState(0)
  /** Les tours finis depuis l'ouverture de la page : la bulle en tire sa pastille « réponse non lue ». */
  const [reponses, setReponses] = useState(0)
  /** Ce que chaque réponse a créé, par son texte : les puces « Ouvrir » qui la suivent dans le fil. */
  const [crees, setCrees] = useState<{ reponse: string; crees: Cree[] }[]>([])
  /** Les tours dont l'intention d'ouvrir a été suivie : une fois chacun. */
  const ouvertures = useRef(new Set<string>())
  /** Combien de fois l'agent a mené la personne ailleurs : la feuille du téléphone se range pour qu'elle voie où. */
  const [menes, setMenes] = useState(0)
  const iciCourant = useRef(ici)
  iciCourant.current = ici

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
      setDit(null)
      // Un tour en cours, lancé d'un autre onglet ou avant un rechargement : il se suit aussi.
      const enCours = e.tour?.id
      if (enCours) setTour((avant) => avant ?? { id: enCours, tableau, envoye: false })
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
  // Le tour en cours se relit jusqu'à son repos, trois minutes au plus, depuis le tableau d'où il est parti.
  const idTour = tour?.id ?? null
  const origine = tour?.tableau ?? null
  const envoye = tour?.envoye ?? false
  useEffect(() => {
    if (!idTour || !origine) return
    let vivant = true
    const debut = Date.now()
    let minuteur: ReturnType<typeof setTimeout>
    const suivre = async () => {
      try {
        const e = await lireTourAgent(origine, idTour)
        if (!vivant) return
        setAttendCartes(e.etat === 'awaiting_approval')
        setCartes(e.etat === 'awaiting_approval' ? e.cartes : [])
        const lus = creesLus(e.crees)
        // « Ouvre-la » : l'agent montre ce qu'il a fait, une fois, et seulement dans l'onglet qui lui a écrit.
        const ouverture = ouvertureLue(e.ouvrir)
        if (envoye && ouverture && !ouvertures.current.has(idTour)) {
          ouvertures.current.add(idTour)
          allerDansLApp(cheminDeLOuverture(ouverture, lus))
          setMenes((n) => n + 1)
        }
        if (e.fini) {
          if (lus.length > 0) setCrees((avant) => [...avant, { reponse: cleReponse(e.texte ?? ''), crees: lus }])
          if (e.etat === 'failed') setErreur(e.echec || t('agent.echec'))
          setTour(null)
          setReponses((n) => n + 1)
          void relire(origine)
          return
        }
      } catch {
        // Une lecture manquée n'arrête pas le suivi : la suivante dira où il en est.
      }
      if (!vivant) return
      if (Date.now() - debut > SUIVRE_MAX_MS) {
        setTour(null)
        setErreur(t('agent.long', { nom: nomCourant.current }))
        return
      }
      minuteur = setTimeout(() => void suivre(), SUIVRE_MS)
    }
    minuteur = setTimeout(() => void suivre(), 600)
    return () => {
      vivant = false
      clearTimeout(minuteur)
    }
  }, [idTour, origine, envoye, relire, relance])

  const envoyer = async () => {
    const texte = message.trim()
    const ou = iciCourant.current
    if (!texte || envoi || tour || !ou) return
    setEnvoi(true)
    setErreur(null)
    generation.current++
    setDit(texte)
    // La sélection se lit dans la présence de la toile qu'on regarde. Hors d'une toile, il n'y en a pas, et la demander
    // ouvrirait le tableau du dossier pour rien.
    const selection = ou.vue === 'toile' || ou.vue === 'element' ? selectionDe(espace, ou.tableau) : []
    setAvecSelection(selection.length)
    try {
      const r = await demanderAgent(ou.tableau, texte.slice(0, MESSAGE_MAX), selection, ouvertDe(espace, ou))
      setMessage('')
      setTour({ id: r.tour, tableau: ou.tableau, envoye: true })
    } catch (x) {
      setDit(null)
      setErreur((x as Error).message || t('agent.echec'))
    } finally {
      setEnvoi(false)
    }
  }

  /** Répond aux cartes du tour en cours : l'outil reprend le tour, et le suivi avec lui. */
  const decider = async (choix: { id: string; accord: boolean; toujours: boolean }[]) => {
    if (!tour || choix.length === 0) return
    setErreur(null)
    try {
      await deciderCartes(tour.tableau, tour.id, choix)
      setCartes([])
      setAttendCartes(false)
      setRelance((n) => n + 1)
    } catch (x) {
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
    crees,
    tour: idTour,
    attendCartes,
    cartes,
    decider,
    erreur,
    message,
    setMessage,
    envoi,
    dit,
    avecSelection,
    reponses,
    menes,
    relire,
    envoyer,
  }
}

export type Agent = ReturnType<typeof useAgent>

/**
 * Sous quelle réponse du fil va chaque création : celle dont le texte est celui du tour fini. Une réponse que le fil
 * relu dit autrement (l'outil peut la remettre en forme) prend ses puces sur la dernière réponse de l'agent. Une même
 * adresse n'a qu'une puce.
 */
export function pucesParEchange(echanges: readonly EchangeAgent[], crees: readonly { reponse: string; crees: Cree[] }[]): Map<number, Cree[]> {
  const parTexte = new Map<string, number>()
  let derniere = -1
  echanges.forEach((x, i) => {
    if (x.qui !== 'fram') return
    parTexte.set(cleReponse(x.texte), i)
    derniere = i
  })
  const puces = new Map<number, Cree[]>()
  for (const c of crees) {
    const i = parTexte.get(c.reponse) ?? derniere
    if (i < 0) continue
    const liste = puces.get(i) ?? []
    for (const x of c.crees) if (!liste.some((d) => d.chemin === x.chemin)) liste.push(x)
    puces.set(i, liste)
  }
  return puces
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

/** Le fil, l'état du tour et la saisie : le contenu de la bulle, au bureau comme au téléphone. Relit le fil à l'ouverture. */
export function FilAgent({ agent }: { agent: Agent }) {
  const { nom, ici, genreOuvert, echanges, crees, tour, attendCartes, cartes, decider, erreur, message, setMessage, envoi, dit, avecSelection, relire, envoyer } = agent
  const fil = useRef<HTMLOListElement>(null)
  const puces = pucesParEchange(echanges, crees)
  // Depuis la bibliothèque, on ne parle pas d'« un tableau » : ce qu'on peut demander n'y est pas le même.
  const biblio = ici?.vue === 'bibliotheque' || ici?.vue === 'dossier'

  useEffect(() => {
    void relire()
  }, [relire])

  // Le fil descend jusqu'au dernier échange.
  useEffect(() => {
    const l = fil.current
    if (l) l.scrollTop = l.scrollHeight
  }, [echanges.length, dit, tour])

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

  return (
    <>
      <ol className="agent-fil" ref={fil}>
        {echanges.length === 0 && !dit && (
          <li className="app-panneau-vide agent-vide">
            <Icone nom="idee" taille={22} trait={1.5} />
            {t(biblio ? 'agent.vide.bibliotheque' : 'agent.vide', { nom })}
          </li>
        )}
        {echanges.map((x, i) => (
          <li key={`${x.quand}-${i}`} className={`agent-echange agent-${x.qui === 'fram' ? 'lui' : 'moi'}`}>
            <strong>{x.qui === 'fram' ? nom : t('agent.vous')}</strong>
            {x.qui === 'fram' ? (
              <div className="agent-texte">
                <TexteAgent texte={x.texte} />
              </div>
            ) : (
              <p>{x.texte}</p>
            )}
            {puces.get(i) && <PucesOuvrir crees={puces.get(i)!} />}
          </li>
        ))}
        {dit && (
          <li className="agent-echange agent-moi">
            <strong>{t('agent.vous')}</strong>
            <p>{dit}</p>
            {avecSelection > 0 && <small className="agent-selection">{tn('agent.avecSelection', avecSelection)}</small>}
          </li>
        )}
        {tour && cartes.length > 0 && (
          <li className="agent-cartes">
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
          </li>
        )}
        {tour && cartes.length === 0 && <li className="agent-travaille">{attendCartes ? t('agent.cartesAilleurs', { nom }) : t('agent.travaille', { nom })}</li>}
      </ol>
      {erreur && (
        <p className="agent-erreur" role="alert">
          {erreur}
        </p>
      )}
      <form className="agent-saisie" onSubmit={soumettre}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={touche}
          placeholder={t(
            biblio ? 'agent.placeholder.bibliotheque' : genreOuvert === 'document' ? 'agent.placeholder.page' : genreOuvert === 'arbre' ? 'agent.placeholder.carte' : 'agent.placeholder',
            { nom },
          )}
          aria-label={t('agent.demander', { nom })}
          rows={2}
          maxLength={MESSAGE_MAX}
          autoFocus
        />
        <button type="submit" className="bouton agent-envoyer" disabled={!message.trim() || envoi || tour !== null} aria-label={t('agent.envoyer')}>
          <Icone nom="envoyer" taille={16} />
        </button>
      </form>
    </>
  )
}
