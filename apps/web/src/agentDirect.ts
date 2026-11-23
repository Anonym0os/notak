import { t, tn } from './langue'

/**
 * Le direct d'un tour de l'agent (23/11/2026) : ce que le journal du tour (`fram.journal`, relayé par le serveur) dit,
 * événement par événement, replié en ce que la bulle montre :
 *
 * - **la ligne vivante**, sous la question : la dernière chose que l'agent fait ou pense, qui change à chaque événement ;
 * - **le fil conducteur** : ses gestes (« J'ai lu le tableau »), ses pensées et ses étapes écrites, dans l'ordre, replié
 *   sous la réponse une fois le tour fini (« 5 étapes ») ;
 * - **son plan**, s'il en a un ;
 * - **la réponse**, au fil de l'eau.
 *
 * Tout est pur : le hook (`Agent.tsx`) garde un `Direct` par tour et y applique chaque lecture du journal.
 */

/** Un événement du journal, tel que le relais le rend (déjà relu, borné). */
export type EvenementAgent =
  | { seq: number; genre: 'etat'; etat: string }
  | { seq: number; genre: 'texte'; bloc: string; ajout: string; etape: boolean }
  | { seq: number; genre: 'pensee'; titre: string; resume?: string }
  | { seq: number; genre: 'geste'; id: string; statut: StatutGeste; phrase: string }
  | { seq: number; genre: 'plan'; etapes: EtapePlan[] }
  | { seq: number; genre: 'echec'; message: string }
  | { seq: number; genre: 'fin' }

export type StatutGeste = 'en_cours' | 'attente' | 'fait' | 'echec' | 'refuse'
export interface EtapePlan {
  titre: string
  statut: string
}

/** Un pas du fil conducteur : un geste (remplacé par le suivant de même id), une pensée, ou un bloc de texte d'étape. */
export type Etape =
  | { genre: 'geste'; cle: string; statut: StatutGeste; phrase: string }
  | { genre: 'pensee'; cle: string; titre: string; resume?: string }
  | { genre: 'texte'; cle: string; texte: string }

export interface Direct {
  /** Le dernier événement appliqué : une lecture qui en redonne un plus ancien ne le rejoue pas. */
  vu: number
  etat: string
  etapes: Etape[]
  plan: EtapePlan[] | null
  /** La réponse, bloc par bloc, dans l'ordre où ils sont apparus. */
  blocs: { bloc: string; texte: string }[]
  /** Ce que dit la ligne vivante. */
  ligne: string
  echec: string | null
  fin: boolean
}

export const directVide = (nom: string): Direct => ({
  vu: -1,
  etat: 'queued',
  etapes: [],
  plan: null,
  blocs: [],
  ligne: t('agent.direct.queued', { nom }),
  echec: null,
  fin: false,
})

/** Ce que la ligne vivante dit d'un état du tour. */
export function phraseDEtat(etat: string, nom: string): string {
  switch (etat) {
    case 'queued':
      return t('agent.direct.queued', { nom })
    case 'waiting':
      return t('agent.direct.waiting', { nom })
    case 'running':
      return t('agent.direct.running', { nom })
    case 'awaiting_approval':
      return t('agent.attendAccord', { nom })
    case 'cancelling':
      return t('agent.direct.cancelling', { nom })
    case 'cancelled':
      return t('agent.direct.cancelled', { nom })
    case 'failed':
      return t('agent.echec')
    case 'done':
      return t('agent.aRepondu', { nom })
    default:
      return t('agent.travaille', { nom })
  }
}

/** La dernière phrase d'un texte qui s'écrit, bornée : ce que la ligne vivante en montre. */
function derniereLigne(texte: string): string {
  const lignes = texte
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•#]+|\d+[.)])\s*/, '').replace(/[*_`]/g, '').trim())
    .filter(Boolean)
  const l = lignes.at(-1) ?? ''
  return l.length > 140 ? `…${l.slice(-139)}` : l
}

/** L'étape du plan qu'on fait : la première en cours, sinon la première à faire. */
const etapeCourante = (plan: readonly EtapePlan[]): EtapePlan | undefined => plan.find((e) => e.statut === 'en_cours') ?? plan.find((e) => e.statut === 'a_faire')

/** Applique au direct les événements d'une lecture du journal, dans l'ordre de leur numéro, une fois chacun. */
export function appliquer(avant: Direct, evenements: readonly EvenementAgent[], nom: string): Direct {
  const neufs = evenements.filter((e) => e.seq > avant.vu).sort((a, b) => a.seq - b.seq)
  if (neufs.length === 0) return avant
  let { vu, etat, plan, ligne, echec, fin } = avant
  const etapes = [...avant.etapes]
  const blocs = [...avant.blocs]
  for (const e of neufs) {
    if (e.seq <= vu) continue
    vu = e.seq
    switch (e.genre) {
      case 'etat':
        etat = e.etat
        ligne = phraseDEtat(e.etat, nom)
        break
      case 'texte': {
        if (e.etape) {
          const cle = `t:${e.bloc}`
          const i = etapes.findIndex((x) => x.cle === cle)
          const texte = (i >= 0 ? (etapes[i] as { texte: string }).texte : '') + e.ajout
          if (i >= 0) etapes[i] = { genre: 'texte', cle, texte }
          else etapes.push({ genre: 'texte', cle, texte })
          ligne = derniereLigne(texte) || ligne
        } else {
          const i = blocs.findIndex((x) => x.bloc === e.bloc)
          if (i >= 0) blocs[i] = { bloc: e.bloc, texte: blocs[i]!.texte + e.ajout }
          else blocs.push({ bloc: e.bloc, texte: e.ajout })
          ligne = t('agent.direct.ecrit', { nom })
        }
        break
      }
      case 'pensee':
        etapes.push({ genre: 'pensee', cle: `p:${e.seq}`, titre: e.titre, ...(e.resume ? { resume: e.resume } : {}) })
        ligne = e.titre
        break
      case 'geste': {
        // Un geste de même id remplace le précédent : « Je lis le tableau… » devient « J'ai lu le tableau ».
        const cle = `g:${e.id}`
        const i = etapes.findIndex((x) => x.cle === cle)
        const pas = { genre: 'geste' as const, cle, statut: e.statut, phrase: e.phrase }
        if (i >= 0) etapes[i] = pas
        else etapes.push(pas)
        ligne = e.phrase
        break
      }
      case 'plan':
        plan = e.etapes.length > 0 ? e.etapes : null
        ligne = (plan && etapeCourante(plan)?.titre) || ligne
        break
      case 'echec':
        echec = e.message || t('agent.echec')
        ligne = echec
        break
      case 'fin':
        fin = true
        break
    }
  }
  return { vu, etat, etapes, plan, blocs, ligne, echec, fin }
}

/** La réponse écrite jusqu'ici : ses blocs bout à bout, un paragraphe chacun. */
export const reponseDe = (d: Direct): string =>
  d.blocs
    .map((b) => b.texte.trim())
    .filter(Boolean)
    .join('\n\n')

/** Ce que le fil conducteur compte, replié sous la réponse : « 5 étapes ». */
export const resumeEtapes = (etapes: readonly Etape[]): string => tn('agent.etapes', etapes.length)

/** Une durée lisible, à la seconde : « 8 s », « 1 min 05 », « 1 h 02 ». */
export function duree(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return t('agent.duree.secondes', { s })
  const m = Math.floor(s / 60)
  if (m < 60) return t('agent.duree.minutes', { m, s: String(s % 60).padStart(2, '0') })
  return t('agent.duree.heures', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') })
}
