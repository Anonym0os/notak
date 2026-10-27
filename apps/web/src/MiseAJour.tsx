import { useEffect, useId, useMemo, useSyncExternalStore } from 'react'
import { estBureau, estPageServeur, invoquer, reglerMajAuto } from './bureau'
import { relireAcces } from './bureau/etat'
import { t } from './langue'
import { ecouterNouvelleVersion, nouvelleVersion } from './pwa'
import { useBandeau } from './bandeaux'
import { type BlocNotes, lireNotes } from './serveur/miseAJourServeur'

/**
 * Les mises à jour de l'app de bureau, côté page. La coque fait le travail (`apps/bureau/src-tauri/src/mise_a_jour.rs`) :
 * elle cherche une version plus récente, la télécharge, vérifie sa signature, et ne répond qu'une fois tout prêt. La
 * page n'a donc qu'une chose à dire : « Notak 0.3.0 est prête », avec « Redémarrer » ; sinon, la mise à jour se pose
 * d'elle-même quand on quitte Notak. Rien n'interrompt le travail, rien ne se télécharge sous les yeux.
 *
 * La recherche ne joint que GitHub, où les versions sont publiées, et n'envoie rien de l'espace. On peut la couper
 * (« Où sont mes tableaux ? », les réglages de l'app) et la lancer à la main. Couper ou non est un réglage de la coque,
 * donc de l'ordinateur : il vaut sur la page des toiles d'ici comme sur celle d'un serveur, qui le montre sans pouvoir
 * le changer. La coque garde aussi sa dernière réponse quelques heures : une page qui se charge ne redemande pas à
 * GitHub ce qu'il vient de dire, sauf « Rechercher maintenant ».
 */

/** Ce que la coque répond (`mise_a_jour::Etat`) ; `verifie` : quand GitHub a dit « rien de neuf ». */
export type ReponseCoque =
  | { etat: 'indisponible'; version: string }
  | { etat: 'a-jour'; version: string; verifie?: number }
  | { etat: 'prete'; version: string; nouvelle: string; notes: string | null; date: string | null }

/** Ce qui a fait échouer une recherche ou une installation (`mise_a_jour::EchecMaj`), tel que la page le dit. */
export type EchecMaj = 'reseau' | 'delai' | 'signature' | 'emplacement' | 'espace_disque' | 'autre'

const TEXTES_ECHEC: Record<EchecMaj, string> = {
  reseau: 'maj.erreur.reseau',
  delai: 'maj.erreur.delai',
  signature: 'maj.erreur.signature',
  emplacement: 'maj.erreur.emplacement',
  espace_disque: 'maj.erreur.espace_disque',
  autre: 'maj.erreur.autre',
}
const ECHECS = new Set(Object.keys(TEXTES_ECHEC))
/** Les échecs dont l'issue est de reprendre Notak à sa source : la page des versions s'offre à côté. */
const VERS_LES_VERSIONS = new Set<EchecMaj>(['signature', 'emplacement', 'autre'])

/** Le code d'un échec. Ce que la coque ne classe pas, ou une coque d'avant ces codes (une phrase), est `autre`. */
export function echecMaj(e: unknown): EchecMaj {
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'string' && ECHECS.has(code) ? (code as EchecMaj) : 'autre'
}

/**
 * Tauri refuse une commande qu'il ne connaît pas, ou qu'aucune capacité ne permet (une coque d'avant les mises à jour),
 * par une phrase qui la nomme ; seulement celle-là : le « Not Found » d'un téléchargement n'en est pas une.
 */
const commandeInconnue = (e: unknown) => typeof e === 'string' && /\bpreparer_mise_a_jour\b.*\bnot (?:found|allowed)\b/i.test(e)

export interface EtatMiseAJour {
  /** La version qui tourne, une fois connue. */
  version: string | null
  phase: 'inconnue' | 'cherche' | 'indisponible' | 'a-jour' | 'prete' | 'pose' | 'erreur'
  nouvelle?: string
  notes?: string | null
  /** Quand GitHub a répondu pour la dernière fois. */
  verifie?: number
  erreur?: EchecMaj
  /** « Plus tard » : le bandeau se tait jusqu'à la prochaine version, sur cette page et les suivantes (`CLE_ECARTEE`). */
  ecartee?: string
  /** La coque n'a pas pu installer `nouvelle` : elle a perdu la mise à jour téléchargée, qu'il faut chercher de nouveau. */
  echecInstallation?: boolean
}

/** Au lancement, le temps que l'espace s'ouvre ; puis toutes les six heures, pour qui ne quitte jamais Notak. */
export const PREMIERE_RECHERCHE_MS = 8_000
export const INTERVALLE_RECHERCHE_MS = 6 * 3600_000
/** Avant de redémarrer : le temps qu'IndexedDB ait écrit le dernier geste. */
const AVANT_REDEMARRAGE_MS = 400

/** « Plus tard », retenu par l'origine de la page : un rechargement, ou un retour depuis l'autre page, ne le redemande pas. */
const CLE_ECARTEE = 'notak:bureau:maj-ecartee'

function lireEcartee(): string | undefined {
  try {
    return localStorage.getItem(CLE_ECARTEE) ?? undefined
  } catch {
    return undefined
  }
}

let etat: EtatMiseAJour = { version: null, phase: 'inconnue', ecartee: lireEcartee() }
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
  // La version qui tourne se dit même quand rien ne se cherche.
  if (a?.version && !etat.version) changer({ version: a.version })
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
  if (r.etat === 'a-jour') return { version: r.version, phase: 'a-jour', verifie: r.verifie ?? maintenant }
  return { version: r.version, phase: r.etat, verifie: maintenant }
}

/**
 * Demande à la coque s'il y a du neuf. `parLaPersonne` (« Rechercher maintenant ») : la coque redemande à GitHub même
 * s'il vient de répondre, et une erreur se dit, au lieu de se taire jusqu'au prochain essai.
 */
export async function chercherMiseAJour(parLaPersonne = false): Promise<void> {
  if (!estBureau() || etat.phase === 'cherche' || etat.phase === 'pose' || etat.phase === 'indisponible') return
  const avant = etat.phase
  changer({ phase: 'cherche', erreur: undefined })
  try {
    changer({ ...apresReponse(await invoquer<ReponseCoque>('preparer_mise_a_jour', { parLaPersonne }), Date.now()), echecInstallation: undefined })
  } catch (e) {
    // Une coque d'avant les mises à jour ne connaît pas la commande : elle ne se met simplement pas à jour seule.
    if (commandeInconnue(e)) return changer({ phase: 'indisponible' })
    // Le détail, souvent en anglais, sert à qui cherche : l'écran dit ce qui s'est passé, d'après son code.
    console.warn('Notak : la recherche d’une mise à jour a échoué', e)
    const code = echecMaj(e)
    // Une signature refusée ne se règle pas en réessayant : elle se dit même quand la recherche allait d'elle-même.
    changer(parLaPersonne || code === 'signature' ? { phase: 'erreur', erreur: code } : { phase: avant })
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
    console.warn('Notak : la mise à jour n’a pas pu s’installer', e)
    changer({ phase: 'erreur', erreur: echecMaj(e), echecInstallation: true })
  }
}

export function ecarter(): void {
  const version = etat.nouvelle
  changer({ ecartee: version })
  try {
    if (version) localStorage.setItem(CLE_ECARTEE, version)
  } catch {
    // Sans stockage, « plus tard » vaut pour cette page seulement.
  }
}

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
/** La page des versions : de quoi réinstaller Notak quand il ne peut plus se mettre à jour seul. */
export const PAGE_VERSIONS = 'https://github.com/Anonym0os/notak/releases/latest'

/** Des notes de version sont une page de texte : au-delà, rien de plus ne s'apprend. */
const NOTES_MAX = 4000

/** Les notes reçues avec la nouvelle version (`latest.json`, tirées de `docs/NOUVEAUTES.md`), en paragraphes et puces. */
const blocsDe = (notes: string | null | undefined): BlocNotes[] => (notes ? lireNotes(notes.slice(0, NOTES_MAX)) : [])

/** La page d'une version sur GitHub, dans le navigateur. */
function LienVersion({ version, texte }: { version: string; texte: string }) {
  return (
    <a className="bouton-lien" href={pageDeVersion(version)} target="_blank" rel="noopener noreferrer">
      {texte}
    </a>
  )
}

/**
 * « Nouveautés », dépliées sur place : du texte, rien d'interprété. La page de la version sur GitHub reste à côté ;
 * sans notes, c'est elle que « Nouveautés » ouvre (`LienVersion`).
 */
function NotesDeVersion({ blocs, version }: { blocs: BlocNotes[]; version: string }) {
  return (
    <details className="maj-notes">
      <summary>{t('maj.nouveautes')}</summary>
      <div className="maj-notes-corps">
        {blocs.map((b, i) =>
          b.type === 'liste' ? (
            <ul key={i}>
              {b.puces.map((p, j) => (
                <li key={j}>{p}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{b.texte}</p>
          ),
        )}
      </div>
      <LienVersion version={version} texte={t('maj.notesNavigateur')} />
    </details>
  )
}

/** Ce qui s'est passé, et quoi faire ; la page des versions quand c'est là qu'est l'issue. */
function TexteEchec({ code }: { code: EchecMaj }) {
  return (
    <>
      {t(TEXTES_ECHEC[code])}
      {VERS_LES_VERSIONS.has(code) && (
        <>
          {' '}
          <a href={PAGE_VERSIONS} target="_blank" rel="noopener noreferrer">
            {t('maj.pageVersions')}
          </a>
        </>
      )}
    </>
  )
}

/**
 * Le bandeau du bas, une fois la nouvelle version prête : redémarrer maintenant, ou la laisser se poser en quittant. Si
 * la coque n'a pas pu l'installer, il le dit (même pour qui avait dit « plus tard ») et offre de la chercher de nouveau :
 * la mise à jour téléchargée est perdue côté coque. Quand l'échec a une cause qu'un nouvel essai ne lèvera pas (la place,
 * l'emplacement, la signature), il la dit, au lieu de promettre qu'elle se posera en quittant.
 */
export function BandeauMiseAJour() {
  const bandeau = useBandeau<HTMLElement>()
  const e = useMiseAJour()
  const blocs = useMemo(() => blocsDe(e.notes), [e.notes])
  if (e.echecInstallation && e.nouvelle) {
    const cherche = e.phase === 'cherche'
    const cause = e.erreur && e.erreur !== 'autre' && e.erreur !== 'reseau' && e.erreur !== 'delai' ? e.erreur : null
    return (
      <aside ref={bandeau} className="bandeau bandeau-mise-a-jour" role="alert">
        <span>
          {cause ? (
            <>
              {t('maj.installEchecCourt', { version: e.nouvelle })} <TexteEchec code={cause} />
            </>
          ) : (
            t('maj.installEchec', { version: e.nouvelle })
          )}
        </span>
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
      {!blocs.length && <LienVersion version={e.nouvelle} texte={t('maj.nouveautes')} />}
      <button type="button" className="bouton-lien" onClick={ecarter} disabled={e.phase === 'pose'}>
        {t('maj.plusTard')}
      </button>
      <button type="button" className="bouton bouton-plein" onClick={() => void redemarrer()} disabled={e.phase === 'pose'}>
        {e.phase === 'pose' ? t('maj.pose') : t('maj.redemarrer')}
      </button>
      {/* Dépliées, sous les boutons : le bandeau garde sa rangée. */}
      {blocs.length > 0 && <NotesDeVersion blocs={blocs} version={e.nouvelle} />}
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
  const blocs = useMemo(() => blocsDe(e.notes), [e.notes])
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
            ? t(e.echecInstallation ? 'maj.echecInstallation' : 'maj.echec')
            : e.phase === 'indisponible'
              ? t('maj.indisponible')
              : ''
  return (
    <>
      <h3>{t('maj.titre')}</h3>
      {/* Toujours là, dont seul le texte change : « à jour » ou l'échec d'une recherche qu'on a lancée s'annonce, avec ce
          qu'il y a à faire. */}
      <p role="status">
        <strong>{version}</strong>
        {ligne && ` · ${ligne}`}
        {e.phase === 'erreur' && e.erreur && (
          <small className="rangement-note">
            <TexteEchec code={e.erreur} />
          </small>
        )}
      </p>
      {(e.phase === 'prete' || e.phase === 'pose') &&
        e.nouvelle &&
        (blocs.length ? <NotesDeVersion blocs={blocs} version={e.nouvelle} /> : <LienVersion version={e.nouvelle} texte={t('maj.nouveautes')} />)}
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
