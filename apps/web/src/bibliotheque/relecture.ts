import { useEffect } from 'react'
import { dansCoque } from '../bureau'

/** Entre deux relectures, page regardée : assez court pour qu'un dossier créé ailleurs paraisse sans qu'on l'attende. */
export const RELIRE_MS = 15_000
/** Deux relectures ne se suivent pas de plus près : le retour au premier plan et le focus de la fenêtre vont ensemble. */
export const ECART_MIN_MS = 1_500

/**
 * Un serveur ne prévient de rien : ce qu'un autre outil, un autre appareil ou une autre personne y range (le dossier
 * d'une fiche de Silak, la toile d'un collègue) n'arrive que si l'on relit. La page se relit donc d'elle-même :
 * - en revenant sur elle (l'onglet repris, l'app revenue au premier plan, la fenêtre de nouveau active) ;
 * - toutes les quinze secondes tant qu'on la regarde, et jamais cachée ;
 * - dans l'app, à ⌘R (Ctrl+R, F5), comme le navigateur le fait de toute la page.
 * `relire` doit être sans bruit : une liste inchangée ne bouge pas, une panne passagère ne la remplace pas.
 */
export function useRelecture(relire: () => void, actif: boolean, fenetre: Window = window): void {
  useEffect(() => {
    if (!actif) return
    const document = fenetre.document
    // La page vient de se lire en s'ouvrant.
    let derniere = Date.now()
    const maintenant = (force: boolean) => {
      if (document.hidden) return
      const n = Date.now()
      if (!force && n - derniere < ECART_MIN_MS) return
      derniere = n
      relire()
    }
    const auRetour = () => maintenant(false)
    const touche = (e: KeyboardEvent) => {
      const r = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r'
      if (!(r || (e.key === 'F5' && !e.metaKey && !e.ctrlKey && !e.altKey))) return
      // Le navigateur recharge la page, et elle se relit : on ne lui prend pas son geste.
      if (!dansCoque(fenetre)) return
      e.preventDefault()
      maintenant(true)
    }
    const minuteur = fenetre.setInterval(auRetour, RELIRE_MS)
    fenetre.addEventListener('focus', auRetour)
    fenetre.addEventListener('pageshow', auRetour)
    fenetre.addEventListener('keydown', touche)
    document.addEventListener('visibilitychange', auRetour)
    return () => {
      fenetre.clearInterval(minuteur)
      fenetre.removeEventListener('focus', auRetour)
      fenetre.removeEventListener('pageshow', auRetour)
      fenetre.removeEventListener('keydown', touche)
      document.removeEventListener('visibilitychange', auRetour)
    }
  }, [relire, actif, fenetre])
}

/** Deux lectures de la bibliothèque disent-elles la même chose ? Alors la page garde la sienne, et rien ne bouge. */
export const memeLecture = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
