/**
 * Ce que la page `/diagnostic` relève, sans rien afficher : ce que la webview sait faire, et ce qu'un stylet envoie.
 * Fait pour la phase 0 de `docs/IOS.md` (cocher sur un vrai iPad ce que WKWebView fait des hypothèses du code), mais
 * utile partout : la même page, ouverte dans Safari ou Chrome, dit pourquoi telle fonction manque.
 */

export interface Capacite {
  nom: string
  present: boolean
  /** Ce qu'on attend dans la coque iOS : sert à lire la liste d'un coup d'œil. */
  attenduSurIos: 'present' | 'absent' | 'indifferent'
}

interface FenetreADiagnostiquer {
  isSecureContext?: boolean
  crypto?: { subtle?: unknown }
  indexedDB?: unknown
  BroadcastChannel?: unknown
  navigator?: {
    locks?: unknown
    share?: unknown
    canShare?: (d: unknown) => boolean
    clipboard?: { read?: unknown; readText?: unknown; writeText?: unknown }
    serviceWorker?: unknown
    storage?: { estimate?: unknown; persist?: unknown }
    mediaDevices?: { getUserMedia?: unknown }
    maxTouchPoints?: number
  }
  showSaveFilePicker?: unknown
  showDirectoryPicker?: unknown
  visualViewport?: unknown
  PointerEvent?: { prototype?: { getCoalescedEvents?: unknown; getPredictedEvents?: unknown; altitudeAngle?: unknown } }
  document?: { documentElement?: { requestFullscreen?: unknown } }
  EyeDropper?: unknown
}

/** Les capacités qui changent ce que fait Notak, et ce qu'on attend de chacune dans la coque iOS. */
export function capacites(f: FenetreADiagnostiquer): Capacite[] {
  const n = f.navigator ?? {}
  const fichier = typeof File === 'function' ? new File([new Uint8Array([1])], 'x.notak') : null
  return [
    { nom: 'isSecureContext', present: f.isSecureContext === true, attenduSurIos: 'present' },
    { nom: 'crypto.subtle', present: !!f.crypto?.subtle, attenduSurIos: 'present' },
    { nom: 'indexedDB', present: !!f.indexedDB, attenduSurIos: 'present' },
    { nom: 'BroadcastChannel', present: typeof f.BroadcastChannel === 'function', attenduSurIos: 'present' },
    { nom: 'navigator.locks', present: !!n.locks, attenduSurIos: 'present' },
    { nom: 'navigator.storage.estimate', present: typeof n.storage?.estimate === 'function', attenduSurIos: 'present' },
    { nom: 'navigator.storage.persist', present: typeof n.storage?.persist === 'function', attenduSurIos: 'indifferent' },
    { nom: 'navigator.share', present: typeof n.share === 'function', attenduSurIos: 'present' },
    { nom: 'navigator.canShare({ files })', present: !!(fichier && n.canShare?.({ files: [fichier] })), attenduSurIos: 'present' },
    { nom: 'navigator.clipboard.read', present: typeof n.clipboard?.read === 'function', attenduSurIos: 'present' },
    { nom: 'navigator.clipboard.writeText', present: typeof n.clipboard?.writeText === 'function', attenduSurIos: 'present' },
    { nom: 'getUserMedia', present: typeof n.mediaDevices?.getUserMedia === 'function', attenduSurIos: 'present' },
    { nom: 'visualViewport', present: !!f.visualViewport, attenduSurIos: 'present' },
    { nom: 'PointerEvent.getCoalescedEvents', present: typeof f.PointerEvent?.prototype?.getCoalescedEvents === 'function', attenduSurIos: 'present' },
    { nom: 'PointerEvent.getPredictedEvents', present: typeof f.PointerEvent?.prototype?.getPredictedEvents === 'function', attenduSurIos: 'present' },
    { nom: 'PointerEvent.altitudeAngle', present: !!f.PointerEvent?.prototype && 'altitudeAngle' in f.PointerEvent.prototype, attenduSurIos: 'indifferent' },
    { nom: 'requestFullscreen', present: typeof f.document?.documentElement?.requestFullscreen === 'function', attenduSurIos: 'indifferent' },
    { nom: 'serviceWorker', present: !!n.serviceWorker, attenduSurIos: 'absent' },
    { nom: 'showSaveFilePicker', present: typeof f.showSaveFilePicker === 'function', attenduSurIos: 'absent' },
    { nom: 'showDirectoryPicker', present: typeof f.showDirectoryPicker === 'function', attenduSurIos: 'absent' },
    { nom: 'EyeDropper', present: typeof f.EyeDropper === 'function', attenduSurIos: 'absent' },
  ]
}

/** Ce qu'un événement de pointeur dit du stylet, en nombres lisibles. */
export interface ReleveStylet {
  type: string
  pression: number
  inclinaisonX: number
  inclinaisonY: number
  altitude: number | null
  azimut: number | null
  boutons: number
  /** Points groupés dans cet événement (`getCoalescedEvents`) : plus d'un, c'est un trait fin. */
  groupes: number
  /** Points prédits (`getPredictedEvents`). */
  predits: number
  /** Un `pointermove` de stylet sans contact : le survol de l'Apple Pencil. */
  survol: boolean
}

interface EvenementPointeur {
  type: string
  pointerType: string
  pressure: number
  tiltX: number
  tiltY: number
  altitudeAngle?: number
  azimuthAngle?: number
  buttons: number
  getCoalescedEvents?(): unknown[]
  getPredictedEvents?(): unknown[]
}

export function releverStylet(e: EvenementPointeur): ReleveStylet {
  const arrondi = (v: number) => Math.round(v * 1000) / 1000
  return {
    type: e.pointerType,
    pression: arrondi(e.pressure),
    inclinaisonX: Math.round(e.tiltX),
    inclinaisonY: Math.round(e.tiltY),
    altitude: typeof e.altitudeAngle === 'number' ? arrondi(e.altitudeAngle) : null,
    azimut: typeof e.azimuthAngle === 'number' ? arrondi(e.azimuthAngle) : null,
    boutons: e.buttons,
    groupes: e.getCoalescedEvents?.().length ?? 0,
    predits: e.getPredictedEvents?.().length ?? 0,
    survol: e.pointerType === 'pen' && e.type === 'pointermove' && e.buttons === 0 && e.pressure === 0,
  }
}

/** Le relevé complet, en texte, à coller dans la case de `docs/IOS.md`. */
export function releveEnTexte(o: { plateforme: string; idiome: string; agent: string; infos: unknown; capacites: Capacite[]; stylet: ReleveStylet | null; stockage: unknown }): string {
  return JSON.stringify(
    {
      plateforme: o.plateforme,
      idiome: o.idiome,
      agent: o.agent,
      infos: o.infos,
      capacites: Object.fromEntries(o.capacites.map((c) => [c.nom, c.present])),
      stylet: o.stylet,
      stockage: o.stockage,
    },
    null,
    2,
  )
}
