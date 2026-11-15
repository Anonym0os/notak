import { type ReactNode, useSyncExternalStore } from 'react'
import type { Commentaire } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t, tn } from '../../langue'

/**
 * Le fil résolu, partout le même (Figma, Linear, Notion) : la question est réglée, le fil reste lisible mais passe au
 * second plan. Sa fiche s'annonce « ✓ Résolu · Rouvrir » et ses messages s'estompent ; son épingle passe au vert, une
 * coche à la place du compte ; dans une liste, les fils résolus se rangent à part, sous « Résolus », repliés tant qu'on
 * ne demande pas à les voir. Répondre rouvre le fil (`ajouterMessage`). La visionneuse PDF reprend ces briques.
 */

/** Le fil est-il résolu ? */
export const estResolu = (fil: Commentaire | undefined): boolean => fil?.resolu === true

/** Le vert d'un fil résolu : celui de la ligne « Résolu » d'avant, plus soutenu pour l'épingle. */
export const VERT_RESOLU = '#2f9a5a'

/** « ✓ Résolu », et « Rouvrir » pour qui peut écrire : la tête d'un fil résolu. */
export function BandeauResolu({ rouvrir, n }: { rouvrir?: () => void; n?: number }) {
  return (
    <p className="notak-resolu" role="status">
      <Icone nom="resoudre" taille={15} />
      <span className="notak-resolu-mot">{t('commentaire.resolu')}</span>
      {n !== undefined && <span className="notak-resolu-compte">{tn('commentaire.messages', n)}</span>}
      {rouvrir && (
        <button type="button" className="notak-resolu-rouvrir" onPointerDown={(e) => e.stopPropagation()} onClick={rouvrir}>
          {t('commentaire.rouvrir')}
        </button>
      )}
    </p>
  )
}

/** « Résoudre » : une coche ronde, au survol du premier message d'un fil ouvert. */
export function BoutonResoudre({ resoudre, className }: { resoudre(): void; className: string }) {
  return (
    <button type="button" className={className} aria-label={t('commentaire.resoudreFil')} title={t('commentaire.resoudreFil')} onPointerDown={(e) => e.stopPropagation()} onClick={resoudre}>
      <Icone nom="resoudre" taille={16} />
    </button>
  )
}

/** Les fils ouverts d'abord, les résolus à part, chacun dans son ordre. */
export function partagerResolus<T>(liste: readonly T[], fil: (x: T) => Commentaire | undefined): { ouverts: T[]; resolus: T[] } {
  const ouverts: T[] = []
  const resolus: T[] = []
  for (const x of liste) (estResolu(fil(x)) ? resolus : ouverts).push(x)
  return { ouverts, resolus }
}

// « Afficher les résolus » : un réglage de la personne, le même pour toutes les listes, retenu d'une visite à l'autre.
const CLE_RESOLUS = 'notak.commentaires.resolus'
const abonnes = new Set<() => void>()
let afficher: boolean | null = null

function lireAfficher(): boolean {
  if (afficher !== null) return afficher
  try {
    afficher = localStorage.getItem(CLE_RESOLUS) === 'afficher'
  } catch {
    afficher = false
  }
  return afficher
}

/** Montre ou cache les fils résolus des listes. */
export function afficherResolus(oui: boolean) {
  afficher = oui
  try {
    if (oui) localStorage.setItem(CLE_RESOLUS, 'afficher')
    else localStorage.removeItem(CLE_RESOLUS)
  } catch {}
  for (const f of abonnes) f()
}

/** Les fils résolus sont-ils montrés dans les listes ? Cachés par défaut. */
export function useAfficherResolus(): boolean {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    lireAfficher,
    () => false,
  )
}

/**
 * La rubrique « Résolus (n) » d'une liste de fils : un en-tête qui la déplie ou la replie (« Afficher les résolus »),
 * les fils résolus dessous quand elle est dépliée. Rien quand il n'y en a pas.
 */
export function GroupeResolus({ n, children }: { n: number; children: ReactNode }) {
  const ouvert = useAfficherResolus()
  if (n === 0) return null
  return (
    <section className="notak-resolus" data-ouvert={ouvert || undefined}>
      <button type="button" className="notak-resolus-entete" aria-expanded={ouvert} title={ouvert ? t('commentaire.masquerResolus') : t('commentaire.afficherResolus')} onClick={() => afficherResolus(!ouvert)}>
        <Icone nom={ouvert ? 'chevronBas' : 'chevronDroite'} taille={14} />
        <span>{t('commentaire.resolus', { n })}</span>
      </button>
      {ouvert && children}
    </section>
  )
}

/** Pour les essais : le réglage relu du stockage. */
export function oublierAffichageResolus() {
  afficher = null
}
