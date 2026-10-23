/**
 * La fin d'une lecture, que YouTube et Vimeo annoncent par `postMessage` à qui les intègre : la carte revient alors à
 * son aperçu. Les autres fournisseurs n'ont pas de message de fin à écouter.
 */
const ORIGINES: Record<string, RegExp> = {
  youtube: /^https:\/\/www\.youtube(-nocookie)?\.com$/,
  vimeo: /^https:\/\/player\.vimeo\.com$/,
}

/** Ce fournisseur dit-il quand sa lecture se termine ? */
export const annonceLaFin = (fournisseur: string) => fournisseur in ORIGINES

const lire = (donnees: unknown): Record<string, unknown> | null => {
  if (typeof donnees === 'string') {
    try {
      const v: unknown = JSON.parse(donnees)
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return donnees && typeof donnees === 'object' ? (donnees as Record<string, unknown>) : null
}

/** Ce message, venu de cette origine, dit-il que la lecture est finie (état « terminé » de YouTube, événement `finish` de Vimeo) ? */
export function finDeLecture(fournisseur: string, origine: string, donnees: unknown): boolean {
  if (!ORIGINES[fournisseur]?.test(origine)) return false
  const m = lire(donnees)
  if (!m) return false
  if (fournisseur === 'vimeo') return m.event === 'finish'
  const info = m.info as { playerState?: unknown } | number | undefined
  return (m.event === 'onStateChange' && info === 0) || (m.event === 'infoDelivery' && typeof info === 'object' && info?.playerState === 0)
}

/** Ce que la carte envoie au lecteur pour qu'il lui parle : l'inscription aux événements. */
export function abonnement(fournisseur: string): { message: string; origine: string } | null {
  if (fournisseur === 'youtube') return { message: JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), origine: 'https://www.youtube-nocookie.com' }
  if (fournisseur === 'vimeo') return { message: JSON.stringify({ method: 'addEventListener', value: 'finish' }), origine: 'https://player.vimeo.com' }
  return null
}

/**
 * Écoute le lecteur de cette iframe et prévient à la fin de la lecture. L'inscription est répétée jusqu'à la première
 * réponse : le lecteur n'écoute pas encore quand l'iframe vient de se charger. Rend de quoi arrêter l'écoute.
 */
export function ecouterFin(iframe: HTMLIFrameElement, fournisseur: string, fini: () => void): () => void {
  const a = abonnement(fournisseur)
  if (!a) return () => {}
  let repondu = false
  const ecouteur = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return
    repondu = true
    if (finDeLecture(fournisseur, e.origin, e.data)) fini()
  }
  window.addEventListener('message', ecouteur)
  const envoyer = () => iframe.contentWindow?.postMessage(a.message, a.origine)
  envoyer()
  let essais = 0
  const minuteur = setInterval(() => {
    if (repondu || ++essais > 10) return clearInterval(minuteur)
    envoyer()
  }, 1000)
  return () => {
    window.removeEventListener('message', ecouteur)
    clearInterval(minuteur)
  }
}
