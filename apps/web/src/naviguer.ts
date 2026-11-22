import { demanderAMontrer } from '@notak/tableau'
import { allerA } from './chemin'

/**
 * Les liens de Notak qu'un texte cite (une réponse de l'agent, ce qu'il vient de créer) mènent dans l'application, sans
 * la quitter. Sur le web, l'onglet change de page sans recharger. Dans l'app de bureau et sur un iPhone, la coque envoie
 * tout lien `target="_blank"` au navigateur (`apps/bureau/src-tauri/src/lib.rs`), et la fenêtre resterait où elle est :
 * le lien est donc suivi ici, avant elle.
 *
 * Un lien est de Notak s'il vise ce serveur : l'adresse de la page, celle que le serveur déclare (`NOTAK_ORIGINE`, d'où
 * l'agent tire ses liens), ou un lien `notak://` vers l'une d'elles. Et seulement les pages qu'on ouvre d'un lien, comme
 * ceux de `lien.rs` : la bibliothèque et un dossier (`/?dossier=…`, ce qu'il range `&element=…`), une toile
 * (`/t/<toile>`), un élément en grand (`/t/<toile>/e/<élément>`). Le reste (une page publiée, l'API, un autre site) garde
 * ce que fait le navigateur.
 */

/** L'adresse que le serveur déclare (`Instance.adresse`), retenue une fois l'instance lue. */
let declaree: URL | null = null

export function retenirAdresseDuServeur(adresse: string | undefined): void {
  try {
    declaree = adresse ? new URL(adresse) : null
  } catch {
    declaree = null
  }
}

/** Les paramètres que la bibliothèque lit dans son adresse (`bibliotheque/modele.ts`) : les autres ne passent pas. */
const PARAMETRES = ['dossier', 'element', 'vue', 'type'] as const

const chezNous = (u: URL): boolean => {
  const ici = [new URL(location.href), ...(declaree ? [declaree] : [])]
  if (u.protocol === 'notak:') return ici.some((o) => o.host.toLowerCase() === u.host.toLowerCase())
  return (u.protocol === 'https:' || u.protocol === 'http:') && ici.some((o) => o.origin === u.origin)
}

/** Le chemin de l'application qu'ouvre ce lien, s'il est de Notak (voir plus haut) ; `null` sinon. */
export function cheminDansLApp(adresse: string): string | null {
  let u: URL
  try {
    u = new URL(adresse, location.href)
  } catch {
    return null
  }
  if (!chezNous(u)) return null
  const chemin = u.pathname.replace(/\/+$/, '') || '/'
  if (chemin === '/' || chemin === '/bibliotheque') {
    const p = new URLSearchParams()
    for (const cle of PARAMETRES) {
      const v = u.searchParams.get(cle)
      if (v) p.set(cle, v)
    }
    const q = p.toString()
    return q ? `/?${q}` : '/'
  }
  const m = /^\/t\/([^/]+)(?:\/e\/([^/]+))?$/.exec(chemin)
  if (!m) return null
  return m[2] ? `/t/${m[1]}/e/${m[2]}` : `/t/${m[1]}`
}

/**
 * Va à ce chemin de l'application. Un élément porte `{ element }` dans son entrée d'historique, comme depuis la
 * bibliothèque : le refermer ramène d'où l'on vient. Déjà là, il se remontre (on a pu s'en éloigner sur la toile).
 */
export function allerDansLApp(chemin: string): void {
  const m = /^\/t\/[^/]+\/e\/([^/]+)$/.exec(chemin)
  const element = m ? decodeURIComponent(m[1]!) : null
  if (element && chemin === location.pathname + location.search) demanderAMontrer(element)
  allerA(chemin, element ? { etat: { element } } : {})
}

/** Ce qu'il faut savoir d'un clic sur un lien : React comme le DOM le donnent. */
export interface ClicLien {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
  preventDefault(): void
}

/**
 * Le clic sur un lien : vers Notak, un clic simple y va dans l'application, et rend vrai. ⌘, Ctrl, Maj, Alt ou le bouton
 * du milieu gardent ce que fait le navigateur (un nouvel onglet), comme un lien vers un autre site.
 */
export function suivreAdresse(e: ClicLien, adresse: string): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  const chemin = cheminDansLApp(adresse)
  if (!chemin) return false
  e.preventDefault()
  allerDansLApp(chemin)
  return true
}
