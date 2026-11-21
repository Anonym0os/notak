import { type FormEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Icone } from '@notak/tableau'
import { t } from './langue'
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

export interface EtatTour {
  tour: string
  etat: string
  fini: boolean
  texte: string | null
  echec: string | null
  cartes: unknown[]
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
export const demanderAgent = (tableau: string, message: string) => appeler<{ tour: string; etat: string }>(chemin(tableau), { message })
export const lireTourAgent = (tableau: string, tour: string) => appeler<EtatTour>(`${chemin(tableau)}/tours/${encodeURIComponent(tour)}`)

/** Le gras, l'italique et le code d'une ligne, en éléments React : rien de ce que l'agent écrit ne devient du HTML. */
function enLigne(texte: string): ReactNode[] {
  const morceaux: ReactNode[] = []
  const motif = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g
  let fin = 0
  for (const m of texte.matchAll(motif)) {
    if (m.index > fin) morceaux.push(texte.slice(fin, m.index))
    const v = m[0]
    if (v.startsWith('**')) morceaux.push(<strong key={m.index}>{v.slice(2, -2)}</strong>)
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
 * Le bouton de l'agent d'un outil rattaché (Fram, pour Silak) et son panneau : le fil de ce qu'on lui a demandé sur ce
 * tableau, l'état « Fram travaille… », sa réponse. L'agent agit sur le tableau lui-même, et ses gestes arrivent par la
 * synchro, sous les yeux de la personne. Rien ne paraît si le serveur n'a pas d'agent, si la personne n'est pas liée à
 * l'outil, ou si l'outil ne le lui ouvre pas encore.
 */
export function Agent({ tableau }: { tableau: string }) {
  const { ouvert, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  const [etat, setEtat] = useState<EtatAgent | null>(null)
  const [tour, setTour] = useState<string | null>(null)
  const [attendCartes, setAttendCartes] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [dit, setDit] = useState<string | null>(null)
  const fil = useRef<HTMLOListElement>(null)

  const relire = useCallback(async () => {
    try {
      const e = await lireAgent(tableau)
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

  useEffect(() => {
    if (ouvert) void relire()
  }, [ouvert, relire])

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
        setErreur(t('agent.long', { nom: etat?.agent ?? '' }))
        return
      }
      minuteur = setTimeout(() => void suivre(), SUIVRE_MS)
    }
    minuteur = setTimeout(() => void suivre(), 600)
    return () => {
      vivant = false
      clearTimeout(minuteur)
    }
  }, [tour, tableau, relire, etat?.agent])

  // Le fil descend jusqu'au dernier échange.
  useEffect(() => {
    const l = fil.current
    if (l) l.scrollTop = l.scrollHeight
  }, [etat?.echanges?.length, dit, tour, ouvert])

  const envoyer = async (e?: FormEvent) => {
    e?.preventDefault()
    const texte = message.trim()
    if (!texte || envoi || tour) return
    setEnvoi(true)
    setErreur(null)
    setDit(texte)
    try {
      const r = await demanderAgent(tableau, texte.slice(0, MESSAGE_MAX))
      setMessage('')
      setTour(r.tour)
    } catch (x) {
      setDit(null)
      setErreur((x as Error).message || t('agent.echec'))
    } finally {
      setEnvoi(false)
    }
  }

  const touche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void envoyer()
    }
  }

  if (!etat?.disponible) return null
  const nom = etat.agent
  const echanges = etat.echanges ?? []

  return (
    <div className="agent" ref={ancre}>
      <button type="button" ref={bouton} className="bouton" aria-expanded={ouvert} onClick={basculer} title={t('agent.demander', { nom })}>
        <Icone nom="idee" taille={16} />
        {nom}
        {tour && <span className="agent-pastille" aria-label={t('agent.travaille', { nom })} />}
      </button>
      {ouvert && (
        <div className="app-panneau agent-panneau" ref={panneau} role="dialog" aria-label={t('agent.demander', { nom })}>
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
              </li>
            )}
            {tour && (
              <li className="agent-travaille" aria-live="polite">
                {attendCartes ? t('agent.cartes', { nom }) : t('agent.travaille', { nom })}
              </li>
            )}
          </ol>
          {erreur && (
            <p className="agent-erreur" role="alert">
              {erreur}
            </p>
          )}
          <form className="agent-saisie" onSubmit={(e) => void envoyer(e)}>
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
        </div>
      )}
    </div>
  )
}
