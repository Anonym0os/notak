import { useLayoutEffect, useRef, useState } from 'react'
import type { Arbre, Id } from '../../coeur/tableau'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { BoutonIcone } from './Fenetre'
import { MenuContextuel } from './MenuContextuel'
import type { ActionsInsertion } from './actionsMenu'
import { menuPlus } from './menus'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'
import { type BoutonBarre, type MesuresBarre, type Repli, calculerRepli, placerBarre } from './repliBarre'

interface Props {
  arbre: Arbre
  lecture: Lecture
  /** Les sujets choisis. */
  choisis: Id[]
  /** Le sujet sur lequel agir quand rien n'est choisi. */
  courant: Id
  faire(g: Geste): void
  /** Commencer une relation depuis le sujet courant. */
  relier(): void
  /** Ce que la barre et le menu « + » posent sur la carte : chaque entrée ouvre son éditeur ou son sélecteur. */
  actions: ActionsInsertion
}

/** Ce qui est actif selon la sélection (docs/XMIND.md § 15) : l'étiquette et l'insertion de lien attendent un sujet, la tâche et la pièce jointe un seul. */
export function etatBarre(choisis: readonly Id[]) {
  const n = choisis.length
  return {
    etiquette: n >= 1,
    tache: n === 1,
    aFaire: n >= 1,
    note: n === 1,
    lienWeb: n >= 1,
    lienSujet: n === 1,
    piece: n === 1,
    audio: n === 1,
    vignette: n >= 1,
    image: n === 1,
    equation: n === 1,
  }
}

/** Ce que la carte laisse autour de la barre, mesuré sur ses voisines : l'en-tête à gauche (maison, panneau, titre) et le bloc de droite. */
function mesurer(hote: HTMLElement, titreConnu: { current: number }): MesuresBarre | null {
  const zone = hote.getBoundingClientRect()
  const nom = hote.querySelector('.notak-arbre-nom')?.getBoundingClientRect()
  const droite = hote.querySelector('.notak-arbre-droite')?.getBoundingClientRect()
  if (zone.width <= 0 || !nom || !droite) return null
  // Le titre replié ne se mesure plus (il n'est plus affiché) : on garde sa dernière largeur, les seuils restent les mêmes dans les deux sens.
  if (nom.width > 0) titreConnu.current = nom.width
  const debutTitre = nom.width > 0 ? nom.left - zone.left : (hote.querySelector('.notak-arbre-entete')?.getBoundingClientRect().right ?? zone.left) - zone.left + 12
  return { largeur: zone.width, debutTitre, titre: titreConnu.current || 100, droite: zone.right - droite.left }
}

const memes = (a: MesuresBarre | null, b: MesuresBarre | null) => a === b || (!!a && !!b && a.largeur === b.largeur && a.debutTitre === b.debutTitre && a.titre === b.titre && a.droite === b.droite)

/**
 * La barre d'outils flottante, au centre en haut de la carte, comme celle de Xmind (docs/XMIND.md § 8) : Relation,
 * Résumé, Limite, Zone, Étiquette, Tâche, puis « + » et son menu Insérer. Quand la place manque, elle replie le titre
 * puis ses boutons, de droite à gauche, dans le menu « + » (`repliBarre.ts`) : elle ne recouvre jamais le titre ni les
 * pastilles de droite, panneau de côté ouvert ou non.
 */
export function Outils({ lecture: l, choisis, faire, relier, actions }: Props) {
  const [inserer, setInserer] = useState(false)
  const racine = useRef<HTMLDivElement>(null)
  const plus = useRef<HTMLButtonElement>(null)
  const titreConnu = useRef(0)
  const [mesures, setMesures] = useState<MesuresBarre | null>(null)
  // Mesure à chaque changement de taille de la zone (panneau de côté qui s'ouvre, fenêtre qui bouge) et de ce qui l'entoure.
  useLayoutEffect(() => {
    const hote = racine.current?.parentElement
    if (!hote) return
    const relever = () => setMesures((avant) => { const m = mesurer(hote, titreConnu); return memes(avant, m) ? avant : m })
    relever()
    // La fenêtre qui change de taille, au cas où l'observateur manque.
    window.addEventListener('resize', relever)
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(relever)
    observateur?.observe(hote)
    for (const voisin of hote.querySelectorAll('.notak-arbre-entete, .notak-arbre-droite')) observateur?.observe(voisin)
    return () => {
      window.removeEventListener('resize', relever)
      observateur?.disconnect()
    }
  }, [])
  const repli: Repli = calculerRepli(mesures)
  const etat = etatBarre(choisis)
  const sansCentral = choisis.length > 0 && !choisis.includes(l.central)
  const fermer = () => setInserer(false)
  const boutons: Record<BoutonBarre, { icone: NomIcone; libelle: string; touche?: string; inactif: boolean; agir(): void }> = {
    relation: { icone: 'arbreRelation', libelle: t('arbre.relationAide'), touche: '⌘ ⇧ R', inactif: choisis.length > 2, agir: relier },
    resume: { icone: 'arbreResume', libelle: t('arbre.resumeAide'), inactif: !sansCentral, agir: () => faire({ type: 'resume', ids: choisis }) },
    limite: { icone: 'arbreLimite', libelle: t('arbre.limiteAide'), touche: '⌘ ⇧ B', inactif: !sansCentral, agir: () => faire({ type: 'limite', ids: choisis }) },
    zone: { icone: 'arbreEncadre', libelle: t('arbre.zoneAide'), touche: '⌘ ⌥ Z', inactif: false, agir: actions.zone },
    etiquette: { icone: 'etiquette', libelle: t('arbre.etiquetteAide'), touche: '⌘ ⇧ L', inactif: !etat.etiquette, agir: actions.etiquettes },
    tache: { icone: 'arbreTache', libelle: t('arbre.tacheAide'), inactif: !etat.tache, agir: actions.tache },
  }
  const entrees: Record<string, () => void> = {
    'inserer.note': actions.note,
    'inserer.aFaire': actions.aFaire,
    'inserer.pageWeb': actions.lienWeb,
    'inserer.lienSujet': actions.lienSujet,
    'inserer.piece': actions.pieceJointe,
    'inserer.audio': actions.noteAudio,
    'inserer.autocollant': actions.autocollant,
    'inserer.illustration': actions.illustration,
    'inserer.image': actions.imageLocale,
    'inserer.equation': actions.equation,
  }
  for (const [id, b] of Object.entries(boutons)) entrees[`replie.${id}`] = b.agir
  const placement = mesures && !repli.masquee ? { left: placerBarre(mesures, repli), transform: 'none' } : undefined
  return (
    // Un clic sur la barre ne prend pas le focus : le clavier reste à la carte. Elle garde ses touches, hors Échap.
    <div
      ref={racine}
      className="notak-arbre-outils notak-arbre-pilule"
      role="toolbar"
      aria-label={t('type.arbre')}
      data-titre={repli.titreReplie ? 'replie' : undefined}
      hidden={repli.masquee}
      style={placement}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
    >
      {repli.visibles.map((id) => {
        const b = boutons[id]
        return <BoutonIcone key={id} icone={b.icone} libelle={b.libelle} touche={b.touche} inactif={b.inactif} onClick={b.agir} />
      })}
      <button ref={plus} type="button" className="notak-arbre-bouton notak-arbre-plus" aria-label={t('arbre.inserer')} aria-haspopup="menu" aria-expanded={inserer} onClick={() => setInserer((x) => !x)}>
        <Icone nom="ajouter" taille={24} trait={1.5} />
        <Icone nom="chevronBas" taille={12} trait={2} />
      </button>
      {inserer && (
        <MenuContextuel
          ancre={plus.current}
          items={menuPlus(etat, repli.replies.map((id) => ({ id, inactif: boutons[id].inactif })))}
          etiquette={t('arbre.inserer')}
          choisir={(id) => (fermer(), entrees[id]?.())}
          fermer={fermer}
        />
      )}
    </div>
  )
}
