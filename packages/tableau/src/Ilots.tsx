import { type ReactNode, createContext, useContext } from 'react'
import type { Id } from './coeur/tableau'
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
  /** De l'accueil au tableau ouvert, chacun avec son titre. */
  fil: { id: Id; titre: string }[]
  ouvrir(id: Id): void
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
  onClick(): void
}) {
  return (
    <Infobulle libelle={libelle} {...(raccourci ? { raccourci } : {})}>
      <button type="button" className={`notak-ilot-bouton${className ? ` ${className}` : ''}`} aria-label={libelle} aria-pressed={actif} disabled={inactif} onClick={onClick}>
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
 * Le fil d'un écran ouvert en grand : le chemin du tableau qui le porte, puis son titre. Un maillon y ramène : l'écran
 * se ferme d'abord, pour que ce qu'il tient s'enregistre, puis le tableau voulu s'ouvre. Les boutons de l'écran (le
 * retour, le panneau) ouvrent son îlot, comme sur le tableau.
 */
export function FilEcran({ titre, fermer, avant, apres }: { titre: ReactNode; fermer(): void; avant?: ReactNode; apres?: ReactNode }) {
  const entete = useEntete()
  const fil = entete?.fil ?? []
  // Le tableau qui porte l'écran, et celui d'au-dessus : plus haut, le chemin se lit dans le tableau.
  const vus = fil.slice(-2)
  return (
    <nav className="notak-ilot notak-fil notak-fil-ecran" aria-label={t('espace.fil')}>
      {avant && (
        <span className="notak-fil-tete">
          {avant}
          <FiletIlot />
        </span>
      )}
      {vus.map((s, i) => (
        <span key={s.id} className="notak-fil-bloc">
          <button
            type="button"
            className="notak-fil-segment"
            onClick={() => {
              fermer()
              if (i < vus.length - 1) entete?.ouvrir(s.id)
            }}
          >
            {s.titre || t('commun.sansTitre')}
          </button>
          <span className="notak-fil-sep" aria-hidden>
            <Icone nom="chevronDroite" taille={14} />
          </span>
        </span>
      ))}
      <span className="notak-fil-titre" aria-current="page">
        {titre}
      </span>
      {apres}
    </nav>
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
