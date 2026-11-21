import { type FormEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { type EspaceNavigable, Icone } from '@notak/tableau'
import { t, tn } from './langue'
import { usePanneau } from './panneaux'

/** Un échange du fil de l'agent sur ce tableau, tel que l'outil le garde. */
export interface EchangeAgent {
  qui: 'personne' | 'fram'
  texte: string
  quand: string
}

/** L'agent pour cette personne, sur ce tableau : `disponible` faux, le panneau ne paraît pas. */
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
export const demanderAgent = (tableau: string, message: string, selection: SelectionAgent = []) =>
  appeler<{ tour: string; etat: string }>(chemin(tableau), selection.length > 0 ? { message, selection } : { message })

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

/** Les liens (http et https seulement), le gras, l'italique et le code d'une ligne, en éléments React : rien de ce que l'agent écrit ne devient du HTML. */
function enLigne(texte: string): ReactNode[] {
  const morceaux: ReactNode[] = []
  const motif = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g
  let fin = 0
  for (const m of texte.matchAll(motif)) {
    if (m.index > fin) morceaux.push(texte.slice(fin, m.index))
    const v = m[0]
    const lien = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(v)
    if (lien)
      morceaux.push(
        <a key={m.index} href={lien[2]} target="_blank" rel="noopener noreferrer">
          {lien[1]}
        </a>,
      )
    else if (v.startsWith('**')) morceaux.push(<strong key={m.index}>{v.slice(2, -2)}</strong>)
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
 * L'agent pour ce tableau : s'il est là pour cette personne (`disponible`), le fil de ce qu'on lui a demandé ici, le
 * tour en cours suivi jusqu'à son repos (trois minutes au plus), et l'envoi d'une demande. Le bouton du bureau et la
 * feuille du téléphone le partagent.
 */
export function useAgent(tableau: string, espace?: EspaceNavigable) {
  const [etat, setEtat] = useState<EtatAgent | null>(null)
  const [tour, setTour] = useState<string | null>(null)
  const [attendCartes, setAttendCartes] = useState(false)
  const [cartes, setCartes] = useState<CarteAgent[]>([])
  // Relancé à chaque réponse aux cartes : le suivi du même tour reprend, avec ses trois minutes.
  const [relance, setRelance] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [dit, setDit] = useState<string | null>(null)
  const [avecSelection, setAvecSelection] = useState(0)

  // Chaque envoi ouvre une génération : un fil relu AVANT lui, et revenu après (un outil lent), est d'avant la demande et
  // l'effacerait de l'écran ; il est ignoré. Le fil relu à la fin du tour, lui, la contient.
  const generation = useRef(0)
  const relire = useCallback(async () => {
    const lancee = generation.current
    try {
      const e = await lireAgent(tableau)
      if (lancee !== generation.current) return
      setEtat(e)
      setDit(null)
      if (e.tour?.id) setTour(e.tour.id)
    } catch {
      // Le fil reste tel qu'il était ; la prochaine ouverture le relira.
    }
  }, [tableau])

  // À l'ouverture du tableau : l'agent est-il là pour cette personne ?
  useEffect(() => {
    let vivant = true
    setEtat(null)
    setTour(null)
    setErreur(null)
    lireAgent(tableau).then(
      (e) => {
        if (!vivant) return
        setEtat(e)
        if (e.tour?.id) setTour(e.tour.id)
      },
      () => vivant && setEtat(null),
    )
    return () => {
      vivant = false
    }
  }, [tableau])

  const nom = etat?.agent ?? ''
  // Le tour en cours se relit jusqu'à son repos, trois minutes au plus.
  useEffect(() => {
    if (!tour) return
    let vivant = true
    const debut = Date.now()
    let minuteur: ReturnType<typeof setTimeout>
    const suivre = async () => {
      try {
        const e = await lireTourAgent(tableau, tour)
        if (!vivant) return
        setAttendCartes(e.etat === 'awaiting_approval')
        setCartes(e.etat === 'awaiting_approval' ? e.cartes : [])
        if (e.fini) {
          if (e.etat === 'failed') setErreur(e.echec || t('agent.echec'))
          setTour(null)
          void relire()
          return
        }
      } catch {
        // Une lecture manquée n'arrête pas le suivi : la suivante dira où il en est.
      }
      if (!vivant) return
      if (Date.now() - debut > SUIVRE_MAX_MS) {
        setTour(null)
        setErreur(t('agent.long', { nom }))
        return
      }
      minuteur = setTimeout(() => void suivre(), SUIVRE_MS)
    }
    minuteur = setTimeout(() => void suivre(), 600)
    return () => {
      vivant = false
      clearTimeout(minuteur)
    }
  }, [tour, tableau, relire, nom, relance])

  const envoyer = async () => {
    const texte = message.trim()
    if (!texte || envoi || tour) return
    setEnvoi(true)
    setErreur(null)
    generation.current++
    setDit(texte)
    const selection = selectionDe(espace, tableau)
    setAvecSelection(selection.length)
    try {
      const r = await demanderAgent(tableau, texte.slice(0, MESSAGE_MAX), selection)
      setMessage('')
      setTour(r.tour)
    } catch (x) {
      setDit(null)
      setErreur((x as Error).message || t('agent.echec'))
    } finally {
      setEnvoi(false)
    }
  }

  /** Répond aux cartes du tour en cours : l'outil reprend le tour, et le suivi avec lui. */
  const decider = async (reponses: { id: string; accord: boolean; toujours: boolean }[]) => {
    if (!tour || reponses.length === 0) return
    setErreur(null)
    try {
      await deciderCartes(tableau, tour, reponses)
      setCartes([])
      setAttendCartes(false)
      setRelance((n) => n + 1)
    } catch (x) {
      setErreur((x as Error).message || t('agent.echec'))
    }
  }

  return { disponible: etat?.disponible === true, nom, echanges: etat?.echanges ?? [], tour, attendCartes, cartes, decider, erreur, message, setMessage, envoi, dit, avecSelection, relire, envoyer }
}

export type Agent = ReturnType<typeof useAgent>

/** Le fil, l'état du tour et la saisie : le contenu du panneau, au bureau comme au téléphone. Relit le fil à l'ouverture. */
export function FilAgent({ agent }: { agent: Agent }) {
  const { nom, echanges, tour, attendCartes, cartes, decider, erreur, message, setMessage, envoi, dit, avecSelection, relire, envoyer } = agent
  const fil = useRef<HTMLOListElement>(null)

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
            {t('agent.vide', { nom })}
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
          <li className="agent-cartes" aria-live="polite">
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
        {tour && cartes.length === 0 && (
          <li className="agent-travaille" aria-live="polite">
            {attendCartes ? t('agent.cartesAilleurs', { nom }) : t('agent.travaille', { nom })}
          </li>
        )}
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
          placeholder={t('agent.placeholder', { nom })}
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

/**
 * Le bouton de l'agent d'un outil rattaché (Fram, pour Silak) et son panneau : le fil de ce qu'on lui a demandé sur ce
 * tableau, l'état « Fram travaille… », sa réponse. L'agent agit sur le tableau lui-même, et ses gestes arrivent par la
 * synchro, sous les yeux de la personne. Rien ne paraît si le serveur n'a pas d'agent, si la personne n'est pas liée à
 * l'outil, ou si l'outil ne le lui ouvre pas encore.
 */
export function Agent({ tableau, espace }: { tableau: string; espace?: EspaceNavigable }) {
  const { ouvert, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  const agent = useAgent(tableau, espace)
  if (!agent.disponible) return null
  const { nom } = agent

  return (
    <div className="agent" ref={ancre}>
      <button type="button" ref={bouton} className="bouton" aria-expanded={ouvert} onClick={basculer} title={t('agent.demander', { nom })}>
        <Icone nom="idee" taille={16} />
        {nom}
        {agent.tour && <span className="agent-pastille" aria-label={t('agent.travaille', { nom })} />}
      </button>
      {ouvert && (
        <div className="app-panneau agent-panneau" ref={panneau} role="dialog" aria-label={t('agent.demander', { nom })}>
          <FilAgent agent={agent} />
        </div>
      )}
    </div>
  )
}
