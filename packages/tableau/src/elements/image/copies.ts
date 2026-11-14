import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { PX_PAR_UG } from '../../coeur/camera'
import type { Element, Image } from '../../coeur/tableau'
import { ecouterVue } from '../../vueZoom'
import { estCopieLocale, fichierRecu, useTenirCopie } from '../envois'
import type { ContexteToile } from '../types'
import { adresseALargeur, finesse, largeurCadrePx, largeurEntiereAffichee, palierPour } from './tailles'

/**
 * Le temps sans nouvelle échelle au bout duquel le zoom est posé. La toile publie la sienne (`vueZoom`) à chaque image
 * d'une molette ou d'une animation, et tous les 150 ms d'un pincement : on attend qu'elle se taise pour choisir une
 * copie, une fois, au lieu d'en demander une à chaque image du geste.
 */
export const DELAI_ZOOM_POSE = 300

const attentifs = new Set<() => void>()
let minuteur: ReturnType<typeof setTimeout> | undefined
let lacher: (() => void) | undefined

/** Prévient `f` quand l'échelle de la toile a changé puis n'a plus bougé depuis `DELAI_ZOOM_POSE` ms ; rend de quoi arrêter. */
export function ecouterZoomPose(f: () => void): () => void {
  attentifs.add(f)
  // Un seul minuteur pour toutes les cartes : une toile de cent photos n'en relance pas cent à chaque image du geste.
  lacher ??= ecouterVue(() => {
    clearTimeout(minuteur)
    minuteur = setTimeout(() => {
      for (const g of [...attentifs]) g()
    }, DELAI_ZOOM_POSE)
  })
  return () => {
    attentifs.delete(f)
    if (attentifs.size > 0) return
    lacher?.()
    lacher = undefined
    clearTimeout(minuteur)
  }
}

let observateur: IntersectionObserver | undefined
const observes = new Map<HTMLElement, (vu: boolean) => void>()

/**
 * Prévient `f` quand `noeud` entre à l'écran ou en sort, défilement et zoom de la toile compris (ils passent par des
 * transformations, que l'observateur voit). Un seul observateur pour toutes les cartes ; rend de quoi arrêter.
 */
function observer(noeud: HTMLElement, f: (vu: boolean) => void): () => void {
  observateur ??= new IntersectionObserver((entrees) => {
    for (const e of entrees) observes.get(e.target as HTMLElement)?.(e.isIntersecting)
  })
  observes.set(noeud, f)
  observateur.observe(noeud)
  return () => {
    observes.delete(noeud)
    observateur?.unobserve(noeud)
    if (observes.size > 0) return
    observateur?.disconnect()
    observateur = undefined
  }
}

/**
 * L'adresse à peindre : la voulue, mais une autre copie du même fichier (`cle`) ne prend la place de celle qu'on voit
 * qu'une fois décodée : l'image ne passe jamais par le vide, et reste nette de ce qu'on a pendant que la suivante
 * arrive. La première adresse d'un fichier, celle d'un autre fichier, se montrent aussitôt ; `depart`, une copie déjà
 * chargée ailleurs (celle de la carte, pour la visionneuse), tient lieu de première. `decodee` : l'adresse peinte est
 * passée par ici décodée, ou était déjà chargée ; sinon elle se charge dans la balise même.
 */
export function useAdressePrete(voulue: string | undefined, cle: string, depart?: string): { adresse: string | undefined; decodee: boolean } {
  const [prete, setPrete] = useState<{ cle: string; adresse: string; decodee: boolean } | null>(() => (depart ? { cle, adresse: depart, decodee: true } : null))
  const garde = prete?.cle === cle ? prete : undefined
  const montree = garde?.adresse
  useEffect(() => {
    if (!voulue || voulue === montree) return
    // Sans `decode` (un environnement d'essai), rien ne dit quand elle est prête : elle passe tout de suite.
    if (!montree || !('decode' in HTMLImageElement.prototype)) return setPrete({ cle, adresse: voulue, decodee: false })
    let vivant = true
    const img = new Image()
    img.src = voulue
    img.decode().then(
      () => vivant && setPrete({ cle, adresse: voulue, decodee: true }),
      // Illisible, la nouvelle n'efface pas la copie qu'on voit ; sauf l'aperçu d'un envoi, qui n'est plus l'image une
      // fois le fichier reçu : la balise dira ce qu'il en est, au lieu d'un aperçu qui attendrait pour toujours.
      () => vivant && estCopieLocale(montree) && setPrete({ cle, adresse: voulue, decodee: false }),
    )
    return () => {
      vivant = false
    }
  }, [voulue, montree, cle])
  return garde ? { adresse: garde.adresse, decodee: garde.decodee } : { adresse: voulue, decodee: false }
}

/**
 * L'adresse que peint la carte d'une image : la copie du plus petit palier net pour sa largeur à l'écran, zoom et
 * densité compris. `Cadre` est mémoïsé et la caméra n'est pas une de ses props, si bien qu'un zoom ne redessine pas la
 * carte : elle se remesure d'elle-même quand le zoom s'est posé, ou quand elle entre dans la vue (`suivre`, posé sur
 * son cadre), et passe à la copie au-dessus si la sienne ne suffit plus. À l'écran, elle ne fait que monter ; hors de
 * l'écran, elle ne charge rien de plus grand, et revient à ce que le zoom demande : une photo de 48 Mpx regardée de
 * près ne garde pas son original en mémoire une fois qu'on est passé à autre chose.
 */
export function useCopieDeCarte(element: Element<Image>, contexte: ContexteToile, adresse: string | null | undefined) {
  const { contenu } = element
  // Le palier choisi pour ce fichier ; 0 tant qu'aucun ne l'est.
  const garde = useRef({ fichier: '', palier: 0 as number | null })
  if (garde.current.fichier !== contenu.fichier) garde.current = { fichier: contenu.fichier, palier: 0 }
  // Tant que rien ne dit le contraire (pas encore d'observation, un outil a pris la place du cadre), elle est à l'écran.
  const aEcran = useRef(true)
  const [, remesurer] = useReducer((n: number) => n + 1, 0)
  const voulu = () => {
    const cadre = largeurCadrePx(element.largeur, element.parent !== undefined, PX_PAR_UG, contexte.camera.echelle)
    return palierPour(contenu, largeurEntiereAffichee(contenu, cadre), window.devicePixelRatio || 1)
  }
  const courant = useRef({ voulu, adresse })
  courant.current = { voulu, adresse }

  const verifier = useCallback(() => {
    const { voulu: lire, adresse: a } = courant.current
    const avant = garde.current.palier
    if (!a || avant === 0) return
    const palier = lire()
    if (aEcran.current ? finesse(palier) <= finesse(avant) : finesse(palier) >= finesse(avant)) return
    garde.current.palier = palier
    if (adresseALargeur(a, palier) !== adresseALargeur(a, avant)) remesurer()
  }, [])
  useEffect(() => ecouterZoomPose(verifier), [verifier])

  /** Sur le cadre de l'image, pour savoir s'il est à l'écran. */
  const suivre = useCallback(
    (noeud: HTMLElement | null) => {
      if (!noeud || typeof IntersectionObserver === 'undefined') return
      let attente: ReturnType<typeof setTimeout> | undefined
      const arreter = observer(noeud, (vu) => {
        aEcran.current = vu
        clearTimeout(attente)
        // On se remesure une fois la vue posée : une carte que traverse un défilement rapide ne charge rien.
        attente = setTimeout(verifier, DELAI_ZOOM_POSE)
      })
      return () => {
        arreter()
        clearTimeout(attente)
        aEcran.current = true
      }
    },
    [verifier],
  )

  // Au rendu, l'image qu'on voit monte à ce que demande sa taille (redimensionnée, recadrée, tournée) ; la première
  // adresse se choisit, elle, où qu'elle soit.
  if (adresse && (garde.current.palier === 0 || aEcran.current)) {
    const palier = voulu()
    if (finesse(palier) > finesse(garde.current.palier)) garde.current.palier = palier
  }
  // L'envoi parti d'ici et le fichier qu'il a reçu sont la même image : la carte garde l'aperçu de l'appareil jusqu'à
  // ce que la copie du serveur soit décodée, au lieu de passer par le vide puis de la peindre pavé par pavé (le serveur
  // les fait en JPEG progressif).
  const lignee = useRef({ fichier: contenu.fichier, cle: contenu.fichier })
  if (lignee.current.fichier !== contenu.fichier) {
    const suite = fichierRecu(lignee.current.fichier) === contenu.fichier
    lignee.current = { fichier: contenu.fichier, cle: suite ? lignee.current.cle : contenu.fichier }
  }
  const prete = useAdressePrete(adresse ? adresseALargeur(adresse, garde.current.palier) : undefined, lignee.current.cle)
  // L'aperçu qu'on peint encore reste à nous jusque-là : l'envoi fini ne le rend pas au navigateur sous nos yeux.
  useTenirCopie(adresse ? prete.adresse : undefined)
  return { adresse: adresse ? prete.adresse : adresse, decodee: !!adresse && prete.decodee, suivre }
}
