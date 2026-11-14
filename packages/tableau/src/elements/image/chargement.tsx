import { type SyntheticEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../../langue'
import { estCopieLocale, useProgressionEnvoi } from '../envois'

/**
 * Où en est l'image d'une carte, du dépôt à sa version nette. Une photo lourde passe par plusieurs mains : l'appareil
 * qui la dépose en fait un aperçu réduit et l'envoie ; le serveur en fabrique, à la première demande, la copie à la
 * taille de la carte (un JPEG progressif, qui se peindrait par gros pavés si on le montrait en cours de route), que le
 * navigateur charge et décode. Tant que ce n'est pas fini, la carte le dit, au lieu d'avoir l'air cassée.
 *
 * - `attente` : rien à peindre encore ; le fichier part d'un autre appareil, ou son adresse se cherche ;
 * - `envoi` : il part d'ici ; `part`, de 0 à 1, quand on la connaît ;
 * - `conversion` : il est reçu ; sa copie se fabrique, se charge et se décode, la carte garde l'aperçu en attendant ;
 * - `prete` : la copie du serveur est peinte ;
 * - `echec` : introuvable, ou illisible.
 */
export type EtatChargement = { etape: 'attente' | 'conversion' | 'prete' | 'echec' } | { etape: 'envoi'; part?: number }

/** Où en est la balise `img` qui peint l'adresse : encore en train de la charger, peinte, ou en erreur. */
export type EtatBalise = 'charge' | 'prete' | 'erreur'

export interface IndicesChargement {
  /** Ce que peint la carte : `undefined` rien encore, `null` introuvable. */
  adresse: string | null | undefined
  /** Le fichier est encore en route, d'ici ou d'un autre appareil. */
  enRoute: boolean
  /** L'envoi parti d'ici : la part envoyée (0 à 1), -1 si on ne la connaît pas, `null` s'il n'y en a pas. */
  progression: number | null
  /** Ce qu'on peint est l'aperçu fait par l'appareil, pas encore une copie du serveur. */
  apercu: boolean
  /** Où en est la balise qui le peint. */
  balise: EtatBalise
}

export function etatChargement({ adresse, enRoute, progression, apercu, balise }: IndicesChargement): EtatChargement {
  if (adresse === null) return { etape: 'echec' }
  if (progression !== null) return progression >= 0 ? { etape: 'envoi', part: progression } : { etape: 'envoi' }
  if (enRoute || adresse === undefined) return { etape: 'attente' }
  if (balise === 'erreur') return { etape: 'echec' }
  if (apercu || balise === 'charge') return { etape: 'conversion' }
  return { etape: 'prete' }
}

export const enCours = (e: EtatChargement) => e.etape !== 'prete' && e.etape !== 'echec'

/**
 * Ce que devient l'image qui charge : cachée tant que sa balise n'a rien de complet (le JPEG progressif s'y peindrait
 * par pavés), passée tant qu'elle ne peint que l'aperçu ; `undefined`, telle quelle.
 */
export function voileDe(e: EtatChargement, balise: EtatBalise): 'cachee' | 'passee' | undefined {
  if (!enCours(e)) return undefined
  return balise === 'charge' ? 'cachee' : 'passee'
}

/**
 * Le temps d'un chargement qui ne se remarque pas : en deçà, l'image arrive comme avant, sans anneau ni fondu. Une
 * image du cache, une petite copie sur un bon réseau, n'en montrent rien.
 */
export const DELAI_VISIBLE = 250

/**
 * Vrai quand le chargement dure depuis `delai` ms ; le reste une fois fini, pour que l'image arrive en fondu, et
 * repart de faux au chargement suivant.
 */
export function useLent(enCoursDeChargement: boolean, delai = DELAI_VISIBLE): boolean {
  const [lent, setLent] = useState(false)
  useLayoutEffect(() => {
    if (!enCoursDeChargement) return
    setLent(false)
    const minuteur = setTimeout(() => setLent(true), delai)
    return () => clearTimeout(minuteur)
  }, [enCoursDeChargement, delai])
  return lent
}

/**
 * Où en est la balise `img` de cette adresse. Une image que le navigateur a déjà (son cache, une copie décodée à
 * part) est complète dès qu'on la pose : elle se dit peinte avant d'être montrée, sans voile ni clignotement. Une
 * autre l'est à son `load` ; après un chargement lent (`lente`, lu au moment du `load`), une fois décodée, pour que
 * le fondu parte d'une image entière et non d'une image que le navigateur décode encore.
 */
export function useBalise(adresse: string | null | undefined, lente: { readonly current: boolean }) {
  const ref = useRef<HTMLImageElement>(null)
  const [vue, setVue] = useState<{ adresse: string; etat: EtatBalise } | null>(null)
  useLayoutEffect(() => {
    if (adresse && ref.current?.complete) setVue({ adresse, etat: 'prete' })
  }, [adresse])
  const balise: EtatBalise = adresse && vue?.adresse === adresse ? vue.etat : 'charge'
  const finir = (etat: EtatBalise) => adresse && setVue((v) => (v?.adresse === adresse && v.etat === etat ? v : { adresse, etat }))
  return {
    balise,
    props: {
      ref,
      onLoad: (e: SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget
        if (!lente.current || typeof img.decode !== 'function') return void finir('prete')
        img.decode().then(
          () => finir('prete'),
          () => finir('prete'),
        )
      },
      onError: () => void finir('erreur'),
    },
  }
}

/**
 * La copie que la carte de chaque image (par son id) peint entière, déjà chargée : la visionneuse s'y ouvre, et y passe
 * d'une image à l'autre, en attendant la sienne.
 */
const copiesDesCartes = new Map<string, string>()
export const copieDeCarte = (id: string): string | undefined => copiesDesCartes.get(id)

/**
 * L'état de chargement de la carte d'une image : ce qu'elle montre (`etat`), si l'anneau se voit, et ce que portent
 * son cadre et sa balise. `decodee` : l'adresse peinte a été décodée avant d'être montrée (une copie plus fine, qui
 * prend la place d'une autre) : elle est prête, quoi qu'en dise encore la balise.
 */
export function useChargementCarte({ id, fichier, adresse, decodee, enRoute }: { id: string; fichier: string; adresse: string | null | undefined; decodee: boolean; enRoute: boolean }) {
  const progression = useProgressionEnvoi(fichier)
  const lente = useRef(false)
  const { balise: lue, props } = useBalise(adresse, lente)
  const balise: EtatBalise = decodee && lue === 'charge' ? 'prete' : lue
  // Seulement une copie entière : une copie à moitié chargée se peindrait dans la visionneuse pavé par pavé.
  const entiere = adresse && balise === 'prete' ? adresse : undefined
  useEffect(() => {
    if (!entiere) return
    copiesDesCartes.set(id, entiere)
    return () => {
      if (copiesDesCartes.get(id) === entiere) copiesDesCartes.delete(id)
    }
  }, [id, entiere])
  const etat = etatChargement({ adresse, enRoute, progression, apercu: estCopieLocale(adresse), balise })
  const lent = useLent(enCours(etat))
  lente.current = lent
  const voile = voileDe(etat, balise)
  return {
    etat,
    voile,
    anneau: enCours(etat) && lent,
    img: { ...props, 'data-chargement': voile, 'data-fondu': lent || undefined },
  }
}

/** Ce que dit l'anneau, pour qui lit l'écran à haute voix. */
const libelleDe = (e: EtatChargement) => t(e.etape === 'envoi' ? 'image.envoiEnCours' : e.etape === 'attente' ? 'image.attente' : 'image.chargement')

/**
 * L'anneau d'une image qui charge, au centre, sur une pastille sombre qui se lit sur toute photo : la part envoyée
 * quand on la connaît, la roue sinon. Il garde sa taille à l'écran quel que soit le zoom de la toile.
 */
export function AnneauChargement({ etat }: { etat: EtatChargement }) {
  const part = etat.etape === 'envoi' ? etat.part : undefined
  return (
    <span
      className="notak-image-charge"
      role="progressbar"
      aria-label={libelleDe(etat)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={part === undefined ? undefined : Math.round(part * 100)}
    >
      <span className="notak-image-charge-pastille">
        {part === undefined ? (
          <span className="notak-roue" />
        ) : (
          <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden>
            <circle className="notak-image-charge-piste" cx={10} cy={10} r={8} />
            <circle className="notak-image-charge-part" cx={10} cy={10} r={8} pathLength={1} style={{ strokeDashoffset: 1 - part }} />
          </svg>
        )}
      </span>
    </span>
  )
}
