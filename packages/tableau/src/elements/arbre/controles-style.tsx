import { type CSSProperties, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { Icone } from '../../icones'
import { Case as CaseCommune } from '../../communs'
import { t } from '../../langue'
import { Flottant } from './Flottant'

/**
 * Les petits contrôles de l'onglet Style, d'après ceux du panneau de Xmind (docs/XMIND.md § 5 bis) : une section
 * repliable, une liste déroulante, un bouton à vignette qui ouvre une grille, un champ combiné, un champ de mesure,
 * une bascule, une case, des boutons segmentés. Ils servent aussi aux autres onglets du panneau. Les teintes viennent
 * des variables de `fenetre.css` : le thème sombre suit.
 */

/** Ce qu'on met à la place d'une valeur quand plusieurs objets en ont de différentes. */
export const Multiple = () => <span className="notak-arbre-style-multiple">{t('arbre.style.multiple')}</span>

/** Trois points : la même chose, dans un bouton à vignette. */
export const Points = () => (
  <svg className="notak-arbre-style-points" width={22} height={10} viewBox="0 0 22 10" aria-hidden="true">
    <circle cx={3} cy={5} r={2} />
    <circle cx={11} cy={5} r={2} />
    <circle cx={19} cy={5} r={2} />
  </svg>
)

const Chevron = ({ taille = 12 }: { taille?: number }) => <Icone nom="chevronBas" taille={taille} trait={2} className="notak-arbre-style-chevron" />

// — La section —

/** Une section repliable : un chevron, un titre, un contrôle d'en-tête à droite. Dépliée au départ. */
export function Section({ titre, entete, ouverte = true, children }: { titre: string; entete?: ReactNode; ouverte?: boolean; children?: ReactNode }) {
  const [deplie, setDeplie] = useState(ouverte)
  useEffect(() => setDeplie(ouverte), [ouverte])
  const id = useId()
  return (
    <div className="notak-arbre-style-section" data-replie={deplie ? undefined : ''}>
      <div className="notak-arbre-style-entete">
        <button type="button" className="notak-arbre-style-titre" aria-expanded={deplie} aria-controls={id} title={titre} onClick={() => setDeplie((d) => !d)}>
          <Icone nom="chevronBas" taille={12} trait={2.6} className="notak-arbre-style-pli" />
          <span>{titre}</span>
        </button>
        {entete && <div className="notak-arbre-style-entete-controle">{entete}</div>}
      </div>
      <div id={id} className="notak-arbre-style-corps" hidden={!deplie}>
        {children}
      </div>
    </div>
  )
}

export const Separateur = () => <hr className="notak-arbre-style-separateur" />

/** Une rangée : un libellé à gauche, des contrôles à droite. */
export function Ligne({ libelle, children }: { libelle?: string; children?: ReactNode }) {
  return (
    <div className="notak-arbre-style-ligne">
      {libelle && <span className="notak-arbre-style-libelle">{libelle}</span>}
      {children}
    </div>
  )
}

/** Une rangée de contrôles côte à côte, écartés de 8 px. */
export const Rangee = ({ children, bas = true }: { children: ReactNode; bas?: boolean }) => (
  <div className="notak-arbre-style-rangee" data-bas={bas ? '' : undefined}>
    {children}
  </div>
)

/** Un petit libellé au-dessus d'un champ (« Ligne », « Fin »). */
export const Legende = ({ children }: { children: ReactNode }) => <span className="notak-arbre-style-legende">{children}</span>

// — Le popover —

/**
 * Une carte posée sous son ancre, qu'on ferme d'un clic dehors ou d'Échap. Elle vit dans le fond de la carte, hors du
 * panneau (qui coupe ce qui dépasse), et reste dans la fenêtre : par-dessous, retournée au-dessus si la place manque,
 * glissée ou bornée (le contenu défile) sinon (Flottant).
 */
export function Popover({
  ancre,
  fermer,
  largeur,
  className,
  children,
}: {
  ancre: RefObject<HTMLElement | null>
  fermer(): void
  largeur?: number
  className?: string
  children: ReactNode
}) {
  const carte = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node
      if (carte.current?.contains(cible) || ancre.current?.contains(cible)) return
      fermer()
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', echap, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', echap, true)
    }
  }, [ancre, fermer])
  // Le bord droit de la carte sur celui de l'ancre : le panneau est contre le bord droit de la fenêtre.
  return (
    <Flottant racine={carte} ancre={ancre.current} cote="bas" alignement="fin" largeur={largeur} hauteur={0} className={`notak-arbre-style-pop${className ? ` ${className}` : ''}`} role="dialog" data-popover="">
      {children}
    </Flottant>
  )
}

/** Ouvert ou fermé, pour un contrôle qui porte son popover. */
function useBascule(): [boolean, () => void, () => void] {
  const [ouvert, setOuvert] = useState(false)
  return [ouvert, () => setOuvert((o) => !o), () => setOuvert(false)]
}

// — La liste déroulante —

export interface OptionListe<V extends string | number> {
  valeur: V
  libelle: ReactNode
  /** Le style de la ligne : une police rendue dans sa propre police, par exemple. */
  style?: CSSProperties
  /** Un trait de séparation avant cette ligne. */
  separe?: boolean
}

/**
 * La liste déroulante de texte : un bouton de 24 px, un menu où la valeur courante porte une coche. `valeur` absente de
 * la liste : `affichage` dit ce qu'on montre ; `MULTIPLE` : « Multiple ».
 */
export function ListeTexte<V extends string | number>({
  valeur,
  options,
  choisir,
  affichage,
  multiple,
  inactif,
  titre,
  className,
  largeurMenu,
  hauteurMax,
}: {
  valeur: V | undefined
  options: readonly OptionListe<V>[]
  choisir(v: V): void
  affichage?: ReactNode
  multiple?: boolean
  inactif?: boolean
  titre: string
  className?: string
  largeurMenu?: number
  hauteurMax?: number
}) {
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, basculer, fermer] = useBascule()
  const courant = options.find((o) => o.valeur === valeur)
  return (
    <>
      <button ref={ancre} type="button" className={`notak-arbre-style-select${className ? ` ${className}` : ''}`} title={titre} aria-label={titre} aria-haspopup="listbox" aria-expanded={ouvert} disabled={inactif} onClick={basculer}>
        <span className="notak-arbre-style-select-texte" style={courant?.style}>
          {multiple ? <Multiple /> : (affichage ?? courant?.libelle)}
        </span>
        <Chevron />
      </button>
      {ouvert && (
        <Popover ancre={ancre} fermer={fermer} largeur={largeurMenu ?? Math.max(ancre.current?.offsetWidth ?? 148, 148)} className="notak-arbre-style-menu">
          <ul className="notak-arbre-style-liste" role="listbox" style={hauteurMax ? { maxHeight: hauteurMax } : undefined}>
            {options.map((o) => (
              <li key={String(o.valeur)} role="presentation">
                {o.separe && <hr className="notak-arbre-style-liste-sep" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={!multiple && o.valeur === valeur}
                  className="notak-arbre-style-ligne-menu"
                  onClick={() => {
                    choisir(o.valeur)
                    fermer()
                  }}
                >
                  <span className="notak-arbre-style-coche">{!multiple && o.valeur === valeur && <Icone nom="coche" taille={12} trait={2.4} />}</span>
                  <span className="notak-arbre-style-ligne-texte" style={o.style}>
                    {o.libelle}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  )
}

// — Le bouton à vignette et sa grille —

/** Un bouton de 72 × 24 px qui montre une vignette et ouvre une carte : la forme, le motif, la structure… */
export function BoutonVignette({
  vignette,
  multiple,
  inactif,
  titre,
  largeur = 168,
  className,
  children,
}: {
  vignette: ReactNode
  multiple?: boolean
  inactif?: boolean
  titre: string
  /** La largeur de la carte : 168 px (deux colonnes), 240 px (trois). */
  largeur?: number
  className?: string
  children: (fermer: () => void) => ReactNode
}) {
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, basculer, fermer] = useBascule()
  return (
    <>
      <button ref={ancre} type="button" className={`notak-arbre-style-vignette${className ? ` ${className}` : ''}`} title={titre} aria-label={titre} aria-haspopup="dialog" aria-expanded={ouvert} disabled={inactif} onClick={basculer}>
        <span className="notak-arbre-style-vignette-image">{multiple ? <Points /> : vignette}</span>
        <Chevron />
      </button>
      {ouvert && (
        <Popover ancre={ancre} fermer={fermer} largeur={largeur} className="notak-arbre-style-carte">
          {children(fermer)}
        </Popover>
      )}
    </>
  )
}

export interface Tuile<V extends string> {
  valeur: V
  vignette: ReactNode
  titre: string
}

/** Une grille de tuiles de 64 × 40 px ; un pied facultatif (« Aucun remplissage »). */
export function GrilleTuiles<V extends string>({
  tuiles,
  valeur,
  choisir,
  pied,
  titre,
}: {
  tuiles: readonly Tuile<V>[]
  valeur?: V | undefined
  choisir(v: V): void
  pied?: { libelle: string; faire(): void } | undefined
  titre?: string | undefined
}) {
  return (
    <div className="notak-arbre-style-grille-bloc">
      {titre && <div className="notak-arbre-style-grille-titre">{titre}</div>}
      <div className="notak-arbre-style-grille" role="group">
        {tuiles.map((x) => (
          <button key={x.valeur} type="button" className="notak-arbre-style-tuile" title={x.titre} aria-label={x.titre} aria-pressed={x.valeur === valeur} onClick={() => choisir(x.valeur)}>
            {x.vignette}
          </button>
        ))}
      </div>
      {pied && (
        <button type="button" className="notak-arbre-style-bouton notak-arbre-style-bouton-pied" onClick={pied.faire}>
          {pied.libelle}
        </button>
      )}
    </div>
  )
}

// — Les champs —

/** Un champ combiné : on tape une valeur, ou on la prend dans le menu du chevron. */
export function Combo({
  valeur,
  valeurs,
  min,
  max,
  valider,
  multiple,
  titre,
  inactif,
}: {
  valeur: number | undefined
  valeurs: readonly number[]
  min: number
  max: number
  valider(n: number): void
  multiple?: boolean
  titre: string
  inactif?: boolean
}) {
  const ancre = useRef<HTMLDivElement>(null)
  const [ouvert, basculer, fermer] = useBascule()
  const [saisie, setSaisie] = useState<string | null>(null)
  const montre = saisie ?? (multiple ? '' : valeur === undefined ? '' : String(Math.round(valeur * 10) / 10))
  const ecrire = () => {
    if (saisie === null) return
    const n = Number(saisie.replace(',', '.'))
    setSaisie(null)
    if (Number.isFinite(n) && saisie.trim() !== '') valider(Math.max(min, Math.min(max, Math.round(n * 10) / 10)))
  }
  return (
    <div ref={ancre} className="notak-arbre-style-combo" data-inactif={inactif ? '' : undefined}>
      <input
        className="notak-arbre-style-combo-champ"
        inputMode="decimal"
        value={montre}
        placeholder={multiple ? t('arbre.style.multiple') : undefined}
        title={titre}
        aria-label={titre}
        disabled={inactif}
        onChange={(e) => setSaisie(e.target.value)}
        onBlur={ecrire}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ecrire()
          }
          if (e.key === 'Escape') setSaisie(null)
        }}
      />
      <button type="button" className="notak-arbre-style-combo-zone" aria-label={titre} aria-haspopup="listbox" aria-expanded={ouvert} disabled={inactif} onClick={basculer} tabIndex={-1}>
        <Chevron />
      </button>
      {ouvert && (
        <Popover ancre={ancre} fermer={fermer} largeur={72} className="notak-arbre-style-menu">
          <ul className="notak-arbre-style-liste" role="listbox">
            {valeurs.map((v) => (
              <li key={v} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={v === valeur}
                  className="notak-arbre-style-ligne-menu"
                  onClick={() => {
                    valider(v)
                    fermer()
                  }}
                >
                  <span className="notak-arbre-style-coche">{v === valeur && <Icone nom="coche" taille={12} trait={2.4} />}</span>
                  <span className="notak-arbre-style-ligne-texte">{v}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </div>
  )
}

/** Un champ de mesure en px : vide quand la valeur est automatique (la largeur réelle s'affiche en gris). */
export function ChampMesure({
  valeur,
  indicatif,
  valider,
  titre,
  inactif,
  unite = 'PX',
}: {
  valeur: number | undefined
  /** Ce qu'on montre en gris quand il n'y a pas de valeur. */
  indicatif?: number | undefined
  valider(n: number): void
  titre: string
  inactif?: boolean
  unite?: string
}) {
  const [saisie, setSaisie] = useState<string | null>(null)
  const ecrire = () => {
    if (saisie === null) return
    const n = Number(saisie.replace(',', '.'))
    setSaisie(null)
    if (Number.isFinite(n) && saisie.trim() !== '') valider(Math.max(1, Math.round(n)))
  }
  return (
    <label className="notak-arbre-style-mesure" data-inactif={inactif ? '' : undefined}>
      <input
        className="notak-arbre-style-mesure-champ"
        inputMode="numeric"
        value={saisie ?? (valeur === undefined ? '' : String(Math.round(valeur)))}
        placeholder={indicatif === undefined ? undefined : String(Math.round(indicatif))}
        title={titre}
        aria-label={titre}
        disabled={inactif}
        onChange={(e) => setSaisie(e.target.value)}
        onBlur={ecrire}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ecrire()
          }
          if (e.key === 'Escape') setSaisie(null)
        }}
      />
      <span className="notak-arbre-style-unite">{unite}</span>
    </label>
  )
}

/** Un champ de texte court, écrit à Entrée ou en le quittant : un seul pas d'historique. */
export function ChampCourt({ valeur, valider, titre, className, longueur }: { valeur: string; valider(v: string): void; titre: string; className?: string; longueur?: number }) {
  const [saisie, setSaisie] = useState<string | null>(null)
  useEffect(() => setSaisie(null), [valeur])
  const ecrire = () => {
    if (saisie !== null && saisie !== valeur) valider(saisie)
    setSaisie(null)
  }
  return (
    <input
      className={className ?? 'notak-arbre-style-champ'}
      value={saisie ?? valeur}
      maxLength={longueur}
      title={titre}
      aria-label={titre}
      onChange={(e) => setSaisie(e.target.value)}
      onBlur={ecrire}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ecrire()
        }
      }}
    />
  )
}

// — Case, boutons —

export function Case({ cochee, changer, libelle, titre, inactif }: { cochee: boolean; changer(v: boolean): void; libelle: string; titre?: string; inactif?: boolean }) {
  return (
    <label className="notak-arbre-style-case" title={titre ?? libelle} data-inactif={inactif ? '' : undefined}>
      <CaseCommune option cochee={cochee} disabled={inactif} onChange={changer} />
      <span>{libelle}</span>
    </label>
  )
}

/** Un bouton d'action de 24 px : « défaut » (clair) ou « secondaire » (foncé). */
export function Bouton({ children, onClick, secondaire, inactif, titre, className, pleine }: { children: ReactNode; onClick?: () => void; secondaire?: boolean; inactif?: boolean; titre?: string; className?: string; pleine?: boolean }) {
  return (
    <button type="button" className={`notak-arbre-style-bouton${secondaire ? ' notak-arbre-style-secondaire' : ''}${pleine ? ' notak-arbre-style-pleine' : ''}${className ? ` ${className}` : ''}`} title={titre} disabled={inactif} onClick={onClick}>
      {children}
    </button>
  )
}

/** Un menu de quelques entrées sous un bouton (« Mettre à jour »). */
export function BoutonMenu({ libelle, titre, entrees, secondaire = true }: { libelle: string; titre: string; entrees: readonly { id: string; libelle: string; faire(): void }[]; secondaire?: boolean }) {
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, basculer, fermer] = useBascule()
  return (
    <>
      <button ref={ancre} type="button" className={`notak-arbre-style-bouton notak-arbre-style-pleine${secondaire ? ' notak-arbre-style-secondaire' : ''}`} title={titre} aria-haspopup="menu" aria-expanded={ouvert} onClick={basculer}>
        {libelle}
      </button>
      {ouvert && (
        <Popover ancre={ancre} fermer={fermer} largeur={Math.max(ancre.current?.offsetWidth ?? 200, 200)} className="notak-arbre-style-menu">
          <ul className="notak-arbre-style-liste" role="menu">
            {entrees.map((e) => (
              <li key={e.id} role="presentation">
                <button
                  type="button"
                  role="menuitem"
                  className="notak-arbre-style-ligne-menu"
                  onClick={() => {
                    e.faire()
                    fermer()
                  }}
                >
                  <span className="notak-arbre-style-ligne-texte">{e.libelle}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  )
}

/** Une carte vide : un pictogramme pâle et une phrase (« Sélectionner un objet à formater. »). */
export function EtatVide({ texte, icone = 'souris' }: { texte: string; icone?: 'souris' | 'pinceau' }) {
  return (
    <div className="notak-arbre-style-vide" role="status">
      <svg width={60} height={60} viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icone === 'souris' ? (
          <>
            <rect x={6} y={9} width={40} height={32} rx={7} />
            <path d="M14 19h14M14 26h9" />
            <path d="M34 33l18 7-8 3-3 8z" fill="currentColor" fillOpacity={0.35} />
          </>
        ) : (
          <>
            <path d="M44 10l6 6-20 20-8-2-2-8z" />
            <path d="M20 34c-4 1-8 5-8 12 7 0 11-4 12-8" />
          </>
        )}
      </svg>
      <p>{texte}</p>
    </div>
  )
}
