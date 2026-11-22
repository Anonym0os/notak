import { type FormEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { type EspaceNavigable, Icone } from '@notak/tableau'
import type { Ici } from './ici'
import { t, tn } from './langue'
import { suivreAdresse } from './naviguer'

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
}

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

/** Le tour qu'on suit : son id, et le tableau d'où il est parti, où ses routes sont gardées. */
interface TourSuivi {
  id: string
  tableau: string
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
      if (enCours) setTour((avant) => avant ?? { id: enCours, tableau })
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
        if (e.fini) {
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
  }, [idTour, origine, relire, relance])

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
      setTour({ id: r.tour, tableau: ou.tableau })
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
    relire,
    envoyer,
  }
}

export type Agent = ReturnType<typeof useAgent>

/** Le fil, l'état du tour et la saisie : le contenu de la bulle, au bureau comme au téléphone. Relit le fil à l'ouverture. */
export function FilAgent({ agent }: { agent: Agent }) {
  const { nom, ici, genreOuvert, echanges, tour, attendCartes, cartes, decider, erreur, message, setMessage, envoi, dit, avecSelection, relire, envoyer } = agent
  const fil = useRef<HTMLOListElement>(null)
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
