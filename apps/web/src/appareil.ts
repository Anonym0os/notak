/**
 * Sur quoi tourne la page : un navigateur, la coque de bureau (macOS, Windows, Linux) ou la coque mobile (iOS, un
 * jour Android). La coque le dit elle-même avant tout script (`window.__NOTAK_PLATEFORME__`, posé par le plugin
 * `appareil`, `apps/bureau/plugins/appareil`) ; sans elle, on lit ce que le navigateur veut bien dire. La racine du
 * document le porte (`data-plateforme`, `data-idiome`, `data-mobile`) pour que les styles s'y accrochent, et le
 * plugin précise le reste quand on le lui demande (`infos()` : modèle, version du système, zones sûres).
 *
 * `bureau.ts` reste le pont vers la coque (`estBureau`, `invoquer`) : ici, seulement la question « où suis-je ? ».
 */

export type Plateforme = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'web'
/** Téléphone, tablette ou ordinateur : ce qui décide de la mise en page, pas la taille de la fenêtre. */
export type Idiome = 'telephone' | 'tablette' | 'ordinateur'

/** Ce que la coque mobile sait de l'appareil (`plugin:appareil|infos`). */
export interface InfosAppareil {
  plateforme: Plateforme
  idiome: Idiome
  /** « 17.5 » : la version du système. */
  systeme?: string
  /** « iPad14,3 » : le modèle, tel que le système le nomme. */
  modele?: string
  /** La version de l'app (CFBundleShortVersionString) et son numéro de build. */
  version?: string
  build?: string
  /** Les bords que le système occupe (encoche, barre d'accueil), en px CSS. */
  zonesSures?: { haut: number; droite: number; bas: number; gauche: number }
}

/** Ce qu'on lit de la fenêtre ; un type à part pour que les essais en fabriquent une. */
export interface FenetreAvecCoque {
  __TAURI_INTERNALS__?: { invoke(commande: string, arguments_?: unknown): Promise<unknown> }
  __NOTAK_PLATEFORME__?: string
  navigator?: { userAgent?: string; maxTouchPoints?: number; platform?: string }
  screen?: { width: number; height: number }
  document?: Document
}

const PLATEFORMES: readonly Plateforme[] = ['macos', 'windows', 'linux', 'ios', 'android']

/**
 * La plateforme, sans attendre : ce que la coque a écrit (`std::env::consts::OS` côté Rust : `macos`, `windows`,
 * `linux`, `ios`, `android`), sinon ce que dit le navigateur. Dans une coque d'avant le plugin, on lit l'agent
 * utilisateur : un iPad se dit Macintosh, mais un Macintosh n'a pas d'écran tactile.
 */
export function plateforme(fenetre: FenetreAvecCoque = window as unknown as FenetreAvecCoque): Plateforme {
  const dite = fenetre.__NOTAK_PLATEFORME__
  if (dite && (PLATEFORMES as readonly string[]).includes(dite)) return dite as Plateforme
  if (!fenetre.__TAURI_INTERNALS__) return 'web'
  const ua = fenetre.navigator?.userAgent ?? ''
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows/.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/.test(ua)) return (fenetre.navigator?.maxTouchPoints ?? 0) > 1 ? 'ios' : 'macos'
  return 'linux'
}

export const estMobile = (p: Plateforme = plateforme()): boolean => p === 'ios' || p === 'android'

/**
 * L'idiome, sans attendre : sur iOS, un écran dont le petit côté fait au moins 744 pt (l'iPad mini) est une
 * tablette ; le plugin le confirmera d'après `UIDevice`. Ailleurs, un ordinateur.
 */
export function idiome(fenetre: FenetreAvecCoque = window as unknown as FenetreAvecCoque, p: Plateforme = plateforme(fenetre)): Idiome {
  if (!estMobile(p)) return 'ordinateur'
  const ecran = fenetre.screen
  const petitCote = ecran ? Math.min(ecran.width, ecran.height) : 0
  return petitCote >= 744 ? 'tablette' : 'telephone'
}

/** Pose la plateforme et l'idiome sur la racine du document ; les styles s'y accrochent (`styles/ios.css`). */
export function marquerAppareil(document: Document, p: Plateforme, i: Idiome): void {
  const racine = document.documentElement
  racine.dataset.plateforme = p
  racine.dataset.idiome = i
  racine.toggleAttribute('data-mobile', estMobile(p))
}

let infos: Promise<InfosAppareil | null> | null = null

/** Ce que la coque mobile sait de l'appareil ; `null` hors d'elle, ou si elle ne répond pas. Demandé une fois. */
export function infosAppareil(fenetre: FenetreAvecCoque = window as unknown as FenetreAvecCoque): Promise<InfosAppareil | null> {
  infos ??= (async () => {
    const coque = fenetre.__TAURI_INTERNALS__
    if (!coque || !estMobile(plateforme(fenetre))) return null
    try {
      const i = (await coque.invoke('plugin:appareil|infos')) as InfosAppareil
      if (i && typeof i === 'object' && i.idiome && fenetre.document) marquerAppareil(fenetre.document, i.plateforme, i.idiome)
      return i
    } catch {
      return null
    }
  })()
  return infos
}

/** Pour les essais : oublie la réponse gardée. */
export const oublierInfos = () => void (infos = null)
