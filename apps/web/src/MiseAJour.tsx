import { useEffect, useId, useSyncExternalStore } from 'react'
import { estBureau, estPageServeur, invoquer, reglerMajAuto } from './bureau'
import { relireAcces } from './bureau/etat'
import { t } from './langue'
import { ecouterNouvelleVersion, nouvelleVersion } from './pwa'
import { useBandeau } from './bandeaux'

/**
 * Les mises à jour de l'app de bureau, côté page. La coque fait le travail (`apps/bureau/src-tauri/src/mise_a_jour.rs`) :
 * elle cherche une version plus récente, la télécharge, vérifie sa signature, et ne répond qu'une fois tout prêt. La
 * page n'a donc qu'une chose à dire : « Notak 0.3.0 est prête », avec « Redémarrer » ; sinon, la mise à jour se pose
 * d'elle-même quand on quitte Notak. Rien n'interrompt le travail, rien ne se télécharge sous les yeux.
 *
 * La recherche ne joint que GitHub, où les versions sont publiées, et n'envoie rien de l'espace. On peut la couper
 * (« Où sont mes tableaux ? », les réglages de l'app) et la lancer à la main. Couper ou non est un réglage de la coque,
 * donc de l'ordinateur : il vaut sur la page des toiles d'ici comme sur celle d'un serveur, qui le montre sans pouvoir
 * le changer.
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
  /** La coque n'a pas pu installer `nouvelle` : elle a perdu la mise à jour téléchargée, qu'il faut chercher de nouveau. */
  echecInstallation?: boolean
}

/** Au lancement, le temps que l'espace s'ouvre ; puis toutes les six heures, pour qui ne quitte jamais Notak. */
export const PREMIERE_RECHERCHE_MS = 8_000
export const INTERVALLE_RECHERCHE_MS = 6 * 3600_000
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

/** La recherche automatique, telle que la coque la retient (`acces`) ; vraie tant qu'on ne l'a pas lue. */
let majAuto = true
export const rechercheAuto = (): boolean => majAuto

/** Relit le réglage à la coque (qui n'en change pas sans nous) ; la réponse se garde. */
export async function actualiserRechercheAuto(): Promise<boolean> {
  const a = await relireAcces()
  if (a && a.majAuto !== majAuto) {
    majAuto = a.majAuto
    changer({})
  }
  return majAuto
}

/** Règle la recherche automatique, sur la page des toiles d'ici seulement : la coque refuse à celle d'un serveur. */
export async function reglerRechercheAuto(oui: boolean): Promise<void> {
  if (estPageServeur()) return
  const avant = majAuto
  majAuto = oui
  changer({})
  try {
    await reglerMajAuto(oui)
  } catch {
    // La coque n'a pas retenu le choix : la case redit ce qui vaut.
    majAuto = avant
    changer({})
    return
  }
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
    changer({ ...apresReponse(await invoquer<ReponseCoque>('preparer_mise_a_jour'), Date.now()), echecInstallation: undefined })
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
    changer({ phase: 'erreur', erreur: String(e), echecInstallation: true })
  }
}

export const ecarter = () => changer({ ecartee: etat.nouvelle })

let lancee = false
/** Dans l'app de bureau : une première recherche au lancement, puis une toutes les six heures, si on ne l'a pas coupée. */
export function lancerMisesAJour(): void {
  if (lancee || !estBureau()) return
  lancee = true
  // Le réglage se relit à chaque fois : il a pu changer depuis l'autre page (les toiles d'ici, ou un serveur).
  const tenter = async () => {
    if (await actualiserRechercheAuto()) void chercherMiseAJour()
  }
  setTimeout(() => void tenter(), PREMIERE_RECHERCHE_MS)
  setInterval(() => void tenter(), INTERVALLE_RECHERCHE_MS)
}

/** L'adresse des nouveautés d'une version, sur la page de publication. */
export const pageDeVersion = (version: string) => `https://github.com/Anonym0os/notak/releases/tag/v${encodeURIComponent(version)}`

/**
 * Le bandeau du bas, une fois la nouvelle version prête : redémarrer maintenant, ou la laisser se poser en quittant. Si
 * la coque n'a pas pu l'installer, il le dit (même pour qui avait dit « plus tard ») et offre de la chercher de nouveau :
 * la mise à jour téléchargée est perdue côté coque.
 */
export function BandeauMiseAJour() {
  const bandeau = useBandeau<HTMLElement>()
  const e = useMiseAJour()
  if (e.echecInstallation && e.nouvelle) {
    const cherche = e.phase === 'cherche'
    return (
      <aside ref={bandeau} className="bandeau bandeau-mise-a-jour" role="alert">
        <span>{t('maj.installEchec', { version: e.nouvelle })}</span>
        <button type="button" className="bouton-lien" onClick={() => changer({ echecInstallation: undefined })}>
          {t('commun.fermer')}
        </button>
        <button type="button" className="bouton bouton-plein" aria-disabled={cherche || undefined} onClick={() => void chercherMiseAJour(true)}>
          {t('bandeau.reessayer')}
        </button>
      </aside>
    )
  }
  if ((e.phase !== 'prete' && e.phase !== 'pose') || !e.nouvelle || e.ecartee === e.nouvelle) return null
  return (
    <aside ref={bandeau} className="bandeau bandeau-mise-a-jour" role="status">
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

/** La section « Mises à jour » du panneau « Où sont mes tableaux ? » et des réglages de l'app, dans l'app de bureau. */
export function SectionMiseAJour() {
  const e = useMiseAJour()
  const aide = useId()
  useEffect(() => {
    void actualiserRechercheAuto()
  }, [])
  const auto = rechercheAuto()
  // Sur la page d'un serveur, la case dit ce qui vaut sans pouvoir le changer.
  const surServeur = estPageServeur()
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
      {/* Toujours là, dont seul le texte change : « à jour » ou l'échec d'une recherche qu'on a lancée s'annonce. */}
      <p role="status">
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
              // `aria-disabled` et non `disabled` : le bouton qu'on vient de presser garde le curseur pendant la recherche.
              <button type="button" className="bouton" onClick={() => void chercherMiseAJour(true)} aria-disabled={e.phase === 'cherche' || undefined}>
                {t('maj.chercher')}
              </button>
            )}
          </div>
          <label className="rangement-choix">
            <input type="checkbox" checked={auto} disabled={surServeur} aria-describedby={surServeur ? aide : undefined} onChange={(x) => void reglerRechercheAuto(x.target.checked)} />
            {t('maj.auto')}
          </label>
          {surServeur && (
            <small id={aide} className="rangement-note">
              {t('maj.autoServeur')}
            </small>
          )}
          <small className="rangement-note">{t('maj.ceQuiPart')}</small>
        </>
      )}
    </>
  )
}

/** La version web : une nouvelle version a pris la main sous la page ouverte (`pwa.ts`) ; un clic la recharge. */
export function BandeauNouvelleVersion() {
  const bandeau = useBandeau<HTMLElement>()
  const arrivee = useSyncExternalStore(ecouterNouvelleVersion, nouvelleVersion)
  if (!arrivee) return null
  return (
    <aside ref={bandeau} className="bandeau bandeau-mise-a-jour" role="status">
      <span>{t('maj.webArrivee')}</span>
      <button type="button" className="bouton bouton-plein" onClick={() => location.reload()}>
        {t('maj.recharger')}
      </button>
    </aside>
  )
}
