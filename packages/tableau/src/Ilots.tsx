import { type ReactNode, createContext, useContext } from 'react'
import type { Id } from './coeur/tableau'
import { FilDAriane, type Niveau, usePlaceDuFil } from './FilDAriane'
import { Icone, type NomIcone } from './icones'
import { Infobulle } from './Infobulle'
import { t } from './langue'
import './ilots.css'

/**
 * La barre du haut, la même pour le tableau, la carte mentale et le document : des îlots, pilules blanches flottantes de
 * 36 px posées à 16 px du bord. À gauche le retour (et le panneau de gauche), puis le fil ; au centre les outils de
 * l'écran quand il en a ; à droite, toujours dans le même ordre, l'historique, le partage, le compte, puis le panneau
 * de droite. Un bouton enfoncé passe en sombre plein.
 */

/** Ce que l'espace prête aux écrans ouverts en grand : le chemin du tableau, et les îlots de l'application. */
export interface EnteteEspace {
  /** De l'accueil au tableau ouvert, chacun avec son titre et ce qu'il est (l'accueil, un dossier, une toile). */
  fil: Niveau[]
  /** Mène à un niveau du fil : la racine de l'espace, à la bibliothèque quand l'application en a une. */
  ouvrir(id: Id): void
  /** Mène à la bibliothèque, quand l'application en a une : une maison en tête du fil. */
  bibliotheque?(): void
  /** Les présents et le bouton « Partager ». */
  partage?: ReactNode
  /** Les notifications, le compte et les réglages. */
  compte?: ReactNode
}

export const ContexteEntete = createContext<EnteteEspace | null>(null)

export const useEntete = () => useContext(ContexteEntete)

export function Ilot({ children, className, etiquette }: { children: ReactNode; className?: string; etiquette?: string }) {
  return (
    <div className={`notak-ilot${className ? ` ${className}` : ''}`} role={etiquette ? 'group' : undefined} aria-label={etiquette}>
      {children}
    </div>
  )
}

export const FiletIlot = () => <span className="notak-ilot-filet" aria-hidden />

export function BoutonIlot({
  icone,
  libelle,
  raccourci,
  actif,
  inactif,
  retenu,
  className,
  onClick,
}: {
  icone: NomIcone
  libelle: string
  className?: string
  raccourci?: string
  /** Un bouton à bascule : enfoncé, il passe en sombre plein. */
  actif?: boolean
  inactif?: boolean
  /** Tenu dans son état par autre chose : il pâlit et ignore le clic, mais son infobulle dit pourquoi. */
  retenu?: boolean
  onClick(): void
}) {
  return (
    <Infobulle libelle={libelle} {...(raccourci ? { raccourci } : {})}>
      <button
        type="button"
        className={`notak-ilot-bouton${className ? ` ${className}` : ''}`}
        aria-label={libelle}
        aria-pressed={actif}
        aria-disabled={retenu || undefined}
        disabled={inactif}
        onClick={retenu ? undefined : onClick}
      >
        <Icone nom={icone} taille={20} trait={1.5} />
      </button>
    </Infobulle>
  )
}

/** Annuler et rétablir, dans leur îlot. */
export function IlotHistorique({ annuler, retablir, peutAnnuler = true, peutRetablir = true }: { annuler(): void; retablir(): void; peutAnnuler?: boolean; peutRetablir?: boolean }) {
  return (
    <Ilot className="notak-historique">
      <BoutonIlot icone="annuler" libelle={t('espace.annuler')} raccourci="⌘Z" inactif={!peutAnnuler} onClick={annuler} />
      <BoutonIlot icone="retablir" libelle={t('espace.retablir')} raccourci="⇧⌘Z" inactif={!peutRetablir} onClick={retablir} />
    </Ilot>
  )
}

/**
 * Le fil d'un écran ouvert en grand, une page ou une carte mentale (`genre`), à ranger au bout de son îlot de gauche
 * (`notak-ilot-fil`), après un filet : le même que celui de la toile, le chemin du tableau qui le porte puis son titre,
 * les niveaux du milieu dans « … » quand l'îlot n'a plus de place. Un niveau y ramène : l'écran se ferme d'abord, pour
 * que ce qu'il tient s'enregistre, puis le tableau voulu s'ouvre. Avec une bibliothèque, la maison qui y mène vient
 * avant le fil, dans l'îlot, comme dans la toile. `bande` : l'îlot partage sa bande avec les îlots de droite (la page),
 * et prend ce qu'ils lui laissent ; sinon, il s'en tient à sa largeur maximale (la carte, dont la barre vit au milieu).
 */
export function FilEcran({ titre, nom, genre, bande = false, fermer, apres }: { titre: ReactNode; nom?: string; genre: 'page' | 'carte'; bande?: boolean; fermer(): void; apres?: ReactNode }) {
  const entete = useEntete()
  const [place, fil] = usePlaceDuFil(bande ? 'ilot-zone' : 'ilot')
  const niveaux = entete?.fil ?? []
  const porteur = niveaux.at(-1)?.id
  return (
    <>
      {entete?.bibliotheque && (
        <>
          <BoutonIlot
            icone="maison"
            className="notak-fil-maison"
            libelle={t('espace.bibliotheque')}
            raccourci="⌥⌘O"
            onClick={() => {
              fermer()
              entete.bibliotheque!()
            }}
          />
          <FiletIlot />
        </>
      )}
      <FilDAriane
        ref={fil}
        className="notak-fil-ecran"
        niveaux={niveaux}
        ici={{ genre, titre: nom ?? (typeof titre === 'string' ? titre : ''), contenu: titre, ...(nom ? { infobulle: nom } : {}) }}
        aller={(id) => {
          fermer()
          // Le tableau qui porte l'écran est déjà dessous : le fermer suffit.
          if (id !== porteur) entete?.ouvrir(id)
        }}
        place={place}
        apres={apres}
      />
    </>
  )
}

/** Les îlots que l'application prête aux écrans ouverts en grand : leurs touches sont les siennes, pas celles de l'écran. */
export const ILOTS_APPLICATION = '.notak-ilot-partage, .notak-ilot-compte > :not(.notak-note-menu-ancre)'

/**
 * Échap dans un écran ouvert en grand, un menu de l'application ouvert dans ses îlots (partage, notifications, compte) :
 * la surcouche arrête la touche avant le document, où l'application l'écoute ; on referme donc le menu par son bouton,
 * qui bascule, et on y laisse le focus. Vrai si un menu s'est fermé : l'écran, lui, reste ouvert.
 */
export function fermerMenuDesIlots(racine: HTMLElement): boolean {
  const bouton = racine.querySelector<HTMLElement>(
    '.notak-ilot-partage [aria-expanded="true"], .notak-ilot-compte > :not(.notak-note-menu-ancre) [aria-expanded="true"]',
  )
  if (!bouton) return false
  bouton.click()
  bouton.focus()
  return true
}

/** L'îlot du partage, que l'application prête à tous les écrans : les présents, puis « Partager ». */
export function IlotPartage() {
  const partage = useEntete()?.partage
  return partage ? <Ilot className="notak-ilot-partage">{partage}</Ilot> : null
}

/**
 * Le dernier îlot de droite : les boutons propres à l'écran (export, plus), un filet, puis le compte que l'application
 * prête (notifications, compte, réglages).
 */
export function IlotCompte({ children }: { children?: ReactNode }) {
  const compte = useEntete()?.compte
  if (!children && !compte) return null
  return (
    <Ilot className="notak-ilot-compte">
      {children}
      {children && compte && <FiletIlot />}
      {compte}
    </Ilot>
  )
}
