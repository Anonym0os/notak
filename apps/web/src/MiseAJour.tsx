import { useSyncExternalStore } from 'react'
import { estBureau, invoquer } from './bureau'
import { t } from './langue'
import { ecouterNouvelleVersion, nouvelleVersion } from './pwa'

/**
 * Les mises à jour de l'app de bureau, côté page. La coque fait le travail (`apps/bureau/src-tauri/src/mise_a_jour.rs`) :
 * elle cherche une version plus récente, la télécharge, vérifie sa signature, et ne répond qu'une fois tout prêt. La
 * page n'a donc qu'une chose à dire : « Notak 0.3.0 est prête », avec « Redémarrer » ; sinon, la mise à jour se pose
 * d'elle-même quand on quitte Notak. Rien n'interrompt le travail, rien ne se télécharge sous les yeux.
 *
 * La recherche ne joint que GitHub, où les versions sont publiées, et n'envoie rien de l'espace. On peut la couper
 * (« Où sont mes tableaux ? ») et la lancer à la main.
 */

/** Ce que la coque répond (`mise_a_jour::Etat`). */
export type ReponseCoque =
  | { etat: 'indisponible'; version: string }
  | { etat: 'a-jour'; version: string }
  | { etat: 'prete'; version: string; nouvelle: string; notes: string | null; date: string | null }

export interface EtatMiseAJour {
  /** La version qui tourne, une fois connue. */
  version: string | null
  phase: 'inconnue' | 'cherche' | 'indisponible' | 'a-jour' | 'prete' | 'pose' | 'erreur'
  nouvelle?: string
  notes?: string | null
  /** Quand la coque a répondu pour la dernière fois. */
  verifie?: number
  erreur?: string
  /** « Plus tard » : le bandeau se tait jusqu'à la prochaine version. */
  ecartee?: string
}

const CLE_AUTO = 'notak:bureau:maj-auto'
/** Au lancement, le temps que l'espace s'ouvre ; puis toutes les six heures, pour qui ne quitte jamais Notak. */
export const PREMIERE_RECHERCHE_MS = 8_000
export const INTERVALLE_MS = 6 * 3600_000
/** Avant de redémarrer : le temps qu'IndexedDB ait écrit le dernier geste. */
const AVANT_REDEMARRAGE_MS = 400

let etat: EtatMiseAJour = { version: null, phase: 'inconnue' }
const ecouteurs = new Set<() => void>()
const changer = (e: Partial<EtatMiseAJour>) => {
  etat = { ...etat, ...e }
  for (const f of ecouteurs) f()
}
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}
export const lireMiseAJour = () => etat
export const useMiseAJour = () => useSyncExternalStore(ecouter, lireMiseAJour)

export function rechercheAuto(): boolean {
  try {
    return localStorage.getItem(CLE_AUTO) !== '0'
  } catch {
    return true
  }
}
export function reglerRechercheAuto(oui: boolean): void {
  try {
    localStorage.setItem(CLE_AUTO, oui ? '1' : '0')
  } catch {
    // Sans stockage, le réglage vaut le temps de la session.
  }
  changer({})
  if (oui) void chercherMiseAJour()
}

/** Ce que devient l'état après une réponse de la coque. */
export function apresReponse(r: ReponseCoque, maintenant: number): Partial<EtatMiseAJour> {
  if (r.etat === 'prete') return { version: r.version, phase: 'prete', nouvelle: r.nouvelle, notes: r.notes, verifie: maintenant }
  return { version: r.version, phase: r.etat, verifie: maintenant }
}

/** Demande à la coque s'il y a du neuf. `parLaPersonne` : une erreur se dit, au lieu de se taire jusqu'au prochain essai. */
export async function chercherMiseAJour(parLaPersonne = false): Promise<void> {
  if (!estBureau() || etat.phase === 'cherche' || etat.phase === 'pose' || etat.phase === 'indisponible') return
  const avant = etat.phase
  changer({ phase: 'cherche', erreur: undefined })
  try {
    changer(apresReponse(await invoquer<ReponseCoque>('preparer_mise_a_jour'), Date.now()))
  } catch (e) {
    // Une coque d'avant les mises à jour ne connaît pas la commande : elle ne se met simplement pas à jour seule.
    if (/not found|not allowed/i.test(String(e))) return changer({ phase: 'indisponible' })
    changer(parLaPersonne ? { phase: 'erreur', erreur: String(e) } : { phase: avant })
  }
}

/** Pose la mise à jour prête et relance Notak. */
export async function redemarrer(): Promise<void> {
  if (etat.phase !== 'prete') return
  changer({ phase: 'pose' })
  await new Promise((fin) => setTimeout(fin, AVANT_REDEMARRAGE_MS))
  try {
    await invoquer('installer_mise_a_jour')
  } catch (e) {
    changer({ phase: 'erreur', erreur: String(e) })
  }
}

export const ecarter = () => changer({ ecartee: etat.nouvelle })

let lancee = false
/** Dans l'app de bureau : une première recherche au lancement, puis une toutes les six heures, si on ne l'a pas coupée. */
export function lancerMisesAJour(): void {
  if (lancee || !estBureau()) return
  lancee = true
  const tenter = () => {
    if (rechercheAuto()) void chercherMiseAJour()
  }
  setTimeout(tenter, PREMIERE_RECHERCHE_MS)
  setInterval(tenter, INTERVALLE_MS)
}

/** L'adresse des nouveautés d'une version, sur la page de publication. */
export const pageDeVersion = (version: string) => `https://github.com/Anonym0os/notak/releases/tag/v${encodeURIComponent(version)}`

/** Le bandeau du bas, une fois la nouvelle version prête : redémarrer maintenant, ou la laisser se poser en quittant. */
export function BandeauMiseAJour() {
  const e = useMiseAJour()
  if ((e.phase !== 'prete' && e.phase !== 'pose') || !e.nouvelle || e.ecartee === e.nouvelle) return null
  return (
    <aside className="bandeau bandeau-mise-a-jour" role="status">
      <span>{t('maj.prete', { version: e.nouvelle })}</span>
      <a className="bouton-lien" href={pageDeVersion(e.nouvelle)} target="_blank" rel="noopener noreferrer">
        {t('maj.nouveautes')}
      </a>
      <button type="button" className="bouton-lien" onClick={ecarter} disabled={e.phase === 'pose'}>
        {t('maj.plusTard')}
      </button>
      <button type="button" className="bouton bouton-plein" onClick={() => void redemarrer()} disabled={e.phase === 'pose'}>
        {e.phase === 'pose' ? t('maj.pose') : t('maj.redemarrer')}
      </button>
    </aside>
  )
}

/** Il y a si longtemps, en mots : « à l'instant », « il y a 3 h ». */
function ilYa(quand: number, maintenant = Date.now()): string {
  const minutes = Math.round((maintenant - quand) / 60_000)
  if (minutes < 1) return t('maj.alInstant')
  if (minutes < 60) return t('maj.ilYaMin', { n: minutes })
  return t('maj.ilYaH', { n: Math.round(minutes / 60) })
}

/** La section « Mises à jour » du panneau « Où sont mes tableaux ? », dans l'app de bureau. */
export function SectionMiseAJour() {
  const e = useMiseAJour()
  const auto = rechercheAuto()
  const version = e.version ? `Notak ${e.version}` : 'Notak'
  const ligne =
    e.phase === 'cherche'
      ? t('maj.cherche')
      : e.phase === 'prete' || e.phase === 'pose'
        ? t('maj.preteCourt', { version: e.nouvelle ?? '' })
        : e.phase === 'a-jour'
          ? `${t('maj.aJour')}${e.verifie ? ` · ${ilYa(e.verifie)}` : ''}`
          : e.phase === 'erreur'
            ? t('maj.echec')
            : e.phase === 'indisponible'
              ? t('maj.indisponible')
              : ''
  return (
    <>
      <h3>{t('maj.titre')}</h3>
      <p>
        <strong>{version}</strong>
        {ligne && ` · ${ligne}`}
      </p>
      {e.phase === 'erreur' && e.erreur && <small className="rangement-note">{e.erreur}</small>}
      {e.phase !== 'indisponible' && (
        <>
          <div className="rangement-actions">
            {e.phase === 'prete' || e.phase === 'pose' ? (
              <button type="button" className="bouton bouton-plein" onClick={() => void redemarrer()} disabled={e.phase === 'pose'}>
                {e.phase === 'pose' ? t('maj.pose') : t('maj.redemarrer')}
              </button>
            ) : (
              <button type="button" className="bouton" onClick={() => void chercherMiseAJour(true)} disabled={e.phase === 'cherche'}>
                {t('maj.chercher')}
              </button>
            )}
          </div>
          <label className="rangement-choix">
            <input type="checkbox" checked={auto} onChange={(x) => reglerRechercheAuto(x.target.checked)} />
            {t('maj.auto')}
          </label>
          <small className="rangement-note">{t('maj.ceQuiPart')}</small>
        </>
      )}
    </>
  )
}

/** La version web : une nouvelle version a pris la main sous la page ouverte (`pwa.ts`) ; un clic la recharge. */
export function BandeauNouvelleVersion() {
  const arrivee = useSyncExternalStore(ecouterNouvelleVersion, nouvelleVersion)
  if (!arrivee) return null
  return (
    <aside className="bandeau bandeau-mise-a-jour" role="status">
      <span>{t('maj.webArrivee')}</span>
      <button type="button" className="bouton bouton-plein" onClick={() => location.reload()}>
        {t('maj.recharger')}
      </button>
    </aside>
  )
}
