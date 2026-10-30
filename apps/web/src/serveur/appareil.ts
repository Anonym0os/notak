/**
 * La connexion de l'app de bureau par un code (RFC 8628). La fenêtre de l'app ne peut pas passer chez Google, Microsoft
 * ou GitHub, qui refusent les fenêtres intégrées : la page demande un code au serveur, ouvre sa page de confirmation
 * dans le navigateur de la personne (où elle est connectée), puis interroge le serveur jusqu'à l'accord. La réponse
 * qui l'accorde pose la session en cookie (`apps/serveur/src/auth.ts`) : la page n'a plus qu'à relire `/api/moi`.
 *
 * Ce fichier ne sait rien de React : la machine d'états seule, pour qu'on la fasse tourner avec de faux minuteurs.
 */

/** Le seul client admis à demander un code (`CLIENT_BUREAU`, côté serveur) ; la page « Autoriser » le vérifie aussi. */
export const CLIENT_BUREAU = 'notak-bureau'
const SUBVENTION = 'urn:ietf:params:oauth:grant-type:device_code'
/** La page où l'on confirme (`PAGE_AUTORISER`, côté serveur). */
export const PAGE_AUTORISER = '/bureau/autoriser'

/** Ce que le serveur dit : ni moins d'une seconde entre deux essais, ni un code qui vivrait des heures. */
const INTERVALLE_DEFAUT_S = 5
const INTERVALLE_MAX_S = 60
const VALIDITE_DEFAUT_S = 600
const VALIDITE_MAX_S = 1800
/** « Ralentissez » : la RFC veut cinq secondes de plus à chaque fois. */
const RALENTIR_MS = 5_000
/** Des essais qui échouent d'affilée, coupure ou serveur en panne, avant de renoncer. */
const ECHECS_MAX = 4

/** Pourquoi la demande n'a pas pu se faire, ou a été interrompue (`ferme` : la feuille de connexion d'iOS fermée). */
export type CauseEchec = 'reseau' | 'ancien' | 'trop_d_essais' | 'serveur' | 'session' | 'ferme'

export type EtatAppareil =
  /** Le code se demande. */
  | { type: 'demande' }
  /** Le code est montré, le navigateur s'ouvre ; on interroge le serveur. `expire` : l'heure (ms) où il ne vaut plus. */
  | { type: 'attente'; code: string; lien: string; expire: number }
  /** Accordé dans le navigateur : la session est posée. */
  | { type: 'accorde' }
  /** Le code ne vaut plus : trop attendu, ou déjà servi. */
  | { type: 'expire' }
  /** Refusé dans le navigateur. */
  | { type: 'refuse' }
  | { type: 'echec'; cause: CauseEchec; attente?: number }

export interface OptionsAppareil {
  surEtat(etat: EtatAppareil): void
  /** Ouvre cette adresse dans le navigateur de la personne. */
  ouvrir(adresse: string): void
  /** L'origine de la page : c'est elle qui fait le lien, pas ce que le serveur en dit. */
  origine?: string
  maintenant?: () => number
}

export interface Appareil {
  /** Rouvre la page de confirmation dans le navigateur (il ne s'est pas ouvert, ou la personne l'a fermé). */
  rouvrir(): void
  /** Arrête sans rien dire : on ne parle plus au serveur, le code se périmera tout seul. */
  annuler(): void
}

/** L'adresse qui ramène l'app iOS au premier plan : elle déclare le schéma `notak` (`Info.ios.plist`), sans plus. */
export const RETOUR_APP_IOS = 'notak://'
/** Où la page d'accord renvoie, l'accord donné, quand l'app l'a ouverte dans sa feuille de connexion : la feuille se ferme. */
export const FIN_FEUILLE_IOS = 'notak://autorise'

/** La page d'accord, telle que l'app iOS l'ouvre dans sa feuille de connexion : `retour=app` lui dit d'y renvoyer. */
export function lienPourLaFeuille(lien: string): string {
  const u = new URL(lien)
  u.searchParams.set('retour', 'app')
  return u.href
}

/** La page d'accord est dans la feuille de connexion de l'app iOS (`lienPourLaFeuille`), pas dans un navigateur. */
export const ouverteParLApp = (recherche: string = location.search): boolean => new URLSearchParams(recherche).get('retour') === 'app'

/**
 * La page est lue sur un iPhone ou un iPad, où l'app a ouvert Safari et où `notak://` la ramène. Un iPad se dit
 * Macintosh, mais un Macintosh n'a pas d'écran tactile.
 */
export function navigateurIos(nav: { userAgent?: string; maxTouchPoints?: number } = navigator): boolean {
  const ua = nav.userAgent ?? ''
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)
}

/** Le code tel qu'on le montre : par groupes de quatre, pour le comparer d'un coup d'œil. */
export const grouperCode = (code: string): string => (code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}` : code)

/** Le code tel qu'un lecteur d'écran le dit : lettre par lettre, par groupes (« ABCD EFGH » se lirait comme deux mots). */
export const epeler = (code: string): string =>
  grouperCode(code)
    .split(' ')
    .map((groupe) => [...groupe].join(' '))
    .join(', ')

/** Un code tel que le serveur le donne ou que la personne le tape : sans espace ni tiret, en capitales. */
export const normaliserCode = (brut: string): string => brut.replace(/[\s-]/g, '').toUpperCase()

/** Un code plausible : des lettres et des chiffres, ni vide ni démesuré. Le serveur juge du reste. */
export const codePlausible = (code: string): boolean => /^[A-Z0-9]{4,16}$/.test(code)

/** L'adresse de la page où confirmer ce code, construite d'ici : on n'envoie pas la personne où le serveur dirait. */
export function lienDeConfirmation(code: string, origine: string): string {
  const u = new URL(PAGE_AUTORISER, origine)
  u.searchParams.set('user_code', code)
  return u.href
}

const entierBorne = (v: unknown, defaut: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(Math.floor(v), max) : defaut)

export function lancerConnexionParCode({ surEtat, ouvrir, origine = location.origin, maintenant = Date.now }: OptionsAppareil): Appareil {
  const arret = new AbortController()
  let minuteur: ReturnType<typeof setTimeout> | undefined
  let lien: string | null = null
  let fini = false

  const dire = (etat: EtatAppareil) => {
    if (!fini) surEtat(etat)
  }
  /** Un état final : plus de minuteur, plus de requête. */
  const terminer = (etat: EtatAppareil) => {
    if (fini) return
    dire(etat)
    fini = true
    clearTimeout(minuteur)
    arret.abort()
  }
  const poster = (chemin: string, corps: unknown) =>
    fetch(chemin, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      signal: arret.signal,
    })
  const ouvrirLeLien = () => {
    try {
      if (lien) ouvrir(lien)
    } catch {
      // Un navigateur qui ne s'ouvre pas ne doit pas arrêter l'attente : la personne a « Rouvrir ».
    }
  }
  const attenteDe = (r: Response) => {
    const s = Number(r.headers.get('retry-after'))
    return s > 0 ? s : undefined
  }

  const demarrer = async () => {
    dire({ type: 'demande' })
    let r: Response
    try {
      r = await poster('/api/auth/device/code', { client_id: CLIENT_BUREAU })
    } catch {
      return terminer({ type: 'echec', cause: 'reseau' })
    }
    if (fini) return
    if (r.status === 429) return terminer({ type: 'echec', cause: 'trop_d_essais', attente: attenteDe(r) })
    // Un serveur d'avant les codes ne connaît pas la route (404), ou refuse ce client (400 `invalid_client`).
    if (r.status === 404 || r.status === 400) return terminer({ type: 'echec', cause: 'ancien' })
    const corps = r.ok ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null
    const code = typeof corps?.user_code === 'string' ? normaliserCode(corps.user_code) : ''
    const appareil = corps?.device_code
    if (fini) return
    if (!corps || !codePlausible(code) || typeof appareil !== 'string' || !appareil) return terminer({ type: 'echec', cause: 'serveur' })

    const expire = maintenant() + entierBorne(corps.expires_in, VALIDITE_DEFAUT_S, VALIDITE_MAX_S) * 1000
    let intervalle = entierBorne(corps.interval, INTERVALLE_DEFAUT_S, INTERVALLE_MAX_S) * 1000
    let echecs = 0
    lien = lienDeConfirmation(code, origine)

    const planifier = () => {
      // Au plus tard à l'heure où le code s'éteint : c'est alors que la page le dit, sans attendre un essai de plus.
      minuteur = setTimeout(sonder, Math.max(0, Math.min(intervalle, expire - maintenant())))
    }
    const rater = () => (++echecs >= ECHECS_MAX ? terminer({ type: 'echec', cause: 'reseau' }) : planifier())

    async function sonder() {
      if (fini) return
      if (maintenant() >= expire) return terminer({ type: 'expire' })
      let reponse: Response
      try {
        reponse = await poster('/api/auth/device/token', { grant_type: SUBVENTION, device_code: appareil, client_id: CLIENT_BUREAU })
      } catch {
        return fini ? undefined : rater()
      }
      if (fini) return
      if (reponse.ok) return terminer({ type: 'accorde' })
      if (reponse.status >= 500) return rater()
      const erreur = ((await reponse.json().catch(() => null)) as { error?: unknown } | null)?.error
      if (fini) return
      if (reponse.status === 429) {
        // Trop de demandes : on ralentit, au moins autant que le serveur le demande.
        intervalle = Math.max(intervalle + RALENTIR_MS, (attenteDe(reponse) ?? 0) * 1000)
        echecs = 0
        return planifier()
      }
      switch (erreur) {
        case 'authorization_pending':
          echecs = 0
          return planifier()
        case 'slow_down':
          echecs = 0
          intervalle += RALENTIR_MS
          return planifier()
        // `invalid_grant` : un code que le serveur ne connaît plus, ou qui a déjà servi.
        case 'expired_token':
        case 'invalid_grant':
          return terminer({ type: 'expire' })
        case 'access_denied':
          return terminer({ type: 'refuse' })
        default:
          return terminer({ type: 'echec', cause: 'serveur' })
      }
    }

    dire({ type: 'attente', code, lien, expire })
    planifier()
    // Le navigateur s'ouvre de lui-même ; sans geste de la personne la webview peut le refuser, d'où « Rouvrir ».
    ouvrirLeLien()
  }

  void demarrer()
  return {
    rouvrir() {
      if (!fini) ouvrirLeLien()
    },
    annuler() {
      if (fini) return
      fini = true
      clearTimeout(minuteur)
      arret.abort()
    },
  }
}
