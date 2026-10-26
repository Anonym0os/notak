import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { Flottant } from './Flottant'
import { COLONNES_GRILLE, GRILLE_COULEURS, assemblerCouleur, decouperCouleur, degradeConique, estCouleur, normaliserHex } from './carte/couleurs'

/**
 * Les contrôles du panneau de format, d'après les mesures de l'onglet « Map » de Xmind (docs/XMIND.md § 9) : une
 * ligne et sa bascule, un champ à libellé, une liste déroulante, un nuancier, une vignette cliquable, la fenêtre qui
 * s'ouvre à côté du panneau. L'onglet Carte s'en sert ; l'onglet Style les reprend. Le style est dans
 * `onglet-carte.css`, tiré des variables de `fenetre.css` : le thème sombre suit.
 */

/* ------------------------------------------------------------------ mise en page */

/** Un bloc du panneau : un titre facultatif, puis ses lignes. Deux blocs se séparent par un `Separateur`. */
export function Bloc({ titre, children, className }: { titre?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`notak-arbre-reglages-bloc${className ? ` ${className}` : ''}`}>
      {titre && <h4 className="notak-arbre-reglages-titre">{titre}</h4>}
      {children}
    </section>
  )
}

/** Le filet entre deux blocs. */
export function Separateur() {
  return <hr className="notak-arbre-reglages-separateur" />
}

/** Une ligne d'un bloc : le libellé à gauche, le contrôle à droite. `aide` : l'infobulle de toute la ligne. */
export function LigneReglage({ libelle, aide, inactif, children }: { libelle: string; aide?: string | undefined; inactif?: boolean | undefined; children?: ReactNode }) {
  return (
    <div className="notak-arbre-reglages-ligne" title={aide} data-inactif={inactif ? '' : undefined}>
      <span className="notak-arbre-reglages-libelle">{libelle}</span>
      {children}
    </div>
  )
}

/** Un champ vertical : un petit libellé gris au-dessus de son contrôle (liste, nuancier). */
export function Champ({ libelle, aide, children, className }: { libelle: string; aide?: string | undefined; children: ReactNode; className?: string }) {
  return (
    <div className={`notak-arbre-reglages-champ${className ? ` ${className}` : ''}`} title={aide}>
      <span className="notak-arbre-reglages-champ-libelle">{libelle}</span>
      {children}
    </div>
  )
}

/** La phrase d'aide sous un contrôle. */
export function Aide({ children }: { children: ReactNode }) {
  return <p className="notak-arbre-reglages-aide">{children}</p>
}

/* ------------------------------------------------------------------ bascule */

/** L'interrupteur : une case à cocher masquée, une piste et une poignée. Seul lui est cliquable, pas la ligne. */
export function Bascule({ actif, onChange, inactif, libelle }: { actif: boolean; onChange(actif: boolean): void; inactif?: boolean | undefined; libelle: string }) {
  return (
    <span className="notak-arbre-reglages-bascule" data-actif={actif ? '' : undefined} data-inactif={inactif ? '' : undefined}>
      <input type="checkbox" role="switch" checked={actif} disabled={inactif} aria-label={libelle} onChange={(e) => onChange(e.target.checked)} />
      <span className="notak-arbre-reglages-piste" aria-hidden />
    </span>
  )
}

/** Une ligne à bascule : le libellé, l'infobulle de la ligne, la bascule à droite. */
export function LigneBascule({ libelle, aide, actif, onChange, inactif }: { libelle: string; aide?: string | undefined; actif: boolean; onChange(actif: boolean): void; inactif?: boolean | undefined }) {
  return (
    <LigneReglage libelle={libelle} aide={aide} inactif={inactif}>
      <Bascule actif={actif} onChange={onChange} inactif={inactif} libelle={libelle} />
    </LigneReglage>
  )
}

/* ------------------------------------------------------------------ fenêtre flottante */

interface PropsPopover {
  /** Le bouton qui l'ouvre : elle se pose à côté, et un clic sur lui ne la ferme pas (c'est son bouton qui la bascule). */
  ancre: HTMLElement | null
  ouvert: boolean
  fermer(): void
  /** `gauche` : à gauche du panneau, en haut de l'ancre (les grands choix). `dessous` : sous l'ancre (les listes). Quand la place manque, elle passe de l'autre côté (Flottant.tsx). */
  cote?: 'gauche' | 'dessous'
  /** Sa largeur en px, ou `ancre` : celle du bouton. */
  largeur?: number | 'ancre'
  /** Sa hauteur en px, quand la mise en page ne la dit pas (jamais dans un navigateur). */
  hauteur?: number
  className?: string
  etiquette?: string
  children: ReactNode
}

/**
 * Une fenêtre flottante, sortie du panneau (qui coupe ce qui déborde) et posée dans la carte ouverte, pour que les
 * variables de thème s'y appliquent. Elle reste dans la fenêtre du navigateur (Flottant) et se ferme au clic dehors et à
 * Échap, jamais au choix : c'est à son contenu de la fermer quand il doit.
 */
export function Popover({ ancre, ouvert, fermer, cote = 'dessous', largeur = 'ancre', hauteur = 320, className, etiquette, children }: PropsPopover) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node
      // Un menu contextuel ou une boîte ouverts depuis la fenêtre sont posés à côté d'elle : les cliquer ne la ferme pas.
      if (ref.current?.contains(cible) || ancre?.contains(cible) || (cible as Element).closest?.('.notak-arbre-ctx, .notak-arbre-reglages-voile')) return
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
  }, [ouvert, ancre, fermer])
  if (!ouvert || !ancre) return null
  return (
    <Flottant
      racine={ref}
      ancre={ancre}
      {...(cote === 'gauche' ? { cote: 'gauche', bord: '.notak-arbre-cote', ecart: 8 } : { cote: 'bas', ecart: 4, alignement: largeur === 'ancre' ? 'debut' : 'fin' })}
      largeur={largeur}
      hauteur={hauteur}
      className={`notak-arbre-reglages-popover${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label={etiquette}
      onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
    >
      {children}
    </Flottant>
  )
}

/** Un bouton qui ouvre une fenêtre, et l'état qui va avec : le bouton en est l'ancre. */
export function useOuvrable(): { ancre: HTMLElement | null; poser(n: HTMLElement | null): void; ouvert: boolean; ouvrir(): void; fermer(): void; basculer(): void } {
  const [ancre, poser] = useState<HTMLElement | null>(null)
  const [ouvert, setOuvert] = useState(false)
  return { ancre, poser, ouvert, ouvrir: () => setOuvert(true), fermer: () => setOuvert(false), basculer: () => setOuvert((o) => !o) }
}

/* ------------------------------------------------------------------ liste déroulante */

export interface OptionListe {
  valeur: string
  libelle: string
  /** La pile de police qui écrit le libellé (la liste des polices montre chaque nom dans sa police). */
  pile?: string | undefined
  /** Un filet avant cette ligne. */
  separateurAvant?: boolean | undefined
}

/**
 * La liste déroulante du panneau : un bouton de 24 px (le choix courant, un chevron) et, dessous, la liste avec une
 * coche devant le choix courant. Elle se ferme au choix.
 */
export function Liste({
  valeur,
  options,
  onChoisir,
  libelle,
  aide,
  texte,
  hauteurMax = 276,
}: {
  valeur: string
  options: readonly OptionListe[]
  onChoisir(valeur: string): void
  /** Ce que lit un lecteur d'écran. */
  libelle: string
  aide?: string | undefined
  /** Le texte du bouton quand la valeur n'est dans aucune option (une largeur de ligne venue d'un fichier). */
  texte?: string | undefined
  hauteurMax?: number
}) {
  const o = useOuvrable()
  const courant = options.find((x) => x.valeur === valeur)
  return (
    <>
      <button ref={o.poser} type="button" className="notak-arbre-reglages-select" aria-haspopup="listbox" aria-expanded={o.ouvert} aria-label={libelle} title={aide} onClick={o.basculer}>
        <span className="notak-arbre-reglages-select-texte" style={courant?.pile ? { fontFamily: courant.pile } : undefined}>
          {courant?.libelle ?? texte ?? valeur}
        </span>
        <Icone nom="chevronBas" taille={12} trait={2} />
      </button>
      <Popover ancre={o.ancre} ouvert={o.ouvert} fermer={o.fermer} largeur="ancre" hauteur={hauteurMax} className="notak-arbre-reglages-liste" etiquette={libelle}>
        <div role="listbox" aria-label={libelle} className="notak-arbre-reglages-options" style={{ maxHeight: hauteurMax }}>
          {options.map((x, i) => (
            <div key={`${i}:${x.valeur}`} role="presentation">
              {x.separateurAvant && <hr className="notak-arbre-reglages-separateur" />}
              <button
                type="button"
                role="option"
                aria-selected={x.valeur === valeur}
                className="notak-arbre-reglages-option"
                onClick={() => {
                  onChoisir(x.valeur)
                  o.fermer()
                }}
              >
                <span className="notak-arbre-reglages-coche">{x.valeur === valeur && <Icone nom="coche" taille={12} trait={2} />}</span>
                <span style={x.pile ? { fontFamily: x.pile } : undefined}>{x.libelle}</span>
              </button>
            </div>
          ))}
        </div>
      </Popover>
    </>
  )
}

/* ------------------------------------------------------------------ couleurs */

/** Les rangées de couleurs d'un nuancier, sous la grille : celles du thème, celles qu'on a prises récemment. */
function RangeeCouleurs({ titre, couleurs, valeur, choisir }: { titre: string; couleurs: readonly string[]; valeur: string | undefined; choisir(c: string): void }) {
  if (couleurs.length === 0) return null
  return (
    <details open className="notak-arbre-reglages-pliant">
      <summary>{titre}</summary>
      <div className="notak-arbre-reglages-grille-couleurs" style={{ gridTemplateColumns: `repeat(${COLONNES_GRILLE}, 24px)` }}>
        {couleurs.map((c, i) => (
          <Case key={`${c}${i}`} couleur={c} actif={valeur?.toLowerCase() === c.toLowerCase()} choisir={choisir} />
        ))}
      </div>
    </details>
  )
}

function Case({ couleur, actif, choisir }: { couleur: string; actif: boolean; choisir(c: string): void }) {
  return (
    <button type="button" className="notak-arbre-reglages-case-couleur" aria-label={couleur} aria-pressed={actif} title={couleur} style={{ ['--c' as string]: couleur }} onClick={() => choisir(couleur)} />
  )
}

/**
 * Le nuancier : la grille de 45 couleurs, le champ hexadécimal et l'opacité, le sélecteur natif, puis les couleurs du
 * thème et celles prises récemment. Une case émet tout de suite et ferme ; l'hexa et l'opacité émettent à Entrée ou en
 * quittant le champ ; le sélecteur natif, quand on le lâche (une émission à chaque mouvement noierait l'historique).
 */
export function Nuancier({
  valeur,
  onChoisir,
  fermer,
  couleursTheme = [],
  recentes = [],
  reinitialiser,
}: {
  valeur: string | undefined
  onChoisir(valeur: string): void
  fermer(): void
  couleursTheme?: readonly string[]
  recentes?: readonly string[]
  /** Un bouton « Couleur du thème » qui retire la couleur choisie. */
  reinitialiser?: (() => void) | undefined
}) {
  const { hex, opacite } = valeur && estCouleur(valeur) ? decouperCouleur(valeur) : { hex: '#ffffff', opacite: 100 }
  const [saisieHex, setSaisieHex] = useState(hex.slice(1))
  const [saisieOpacite, setSaisieOpacite] = useState(String(opacite))
  const natif = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setSaisieHex(hex.slice(1))
    setSaisieOpacite(String(opacite))
  }, [hex, opacite])
  const opaciteSaisie = () => {
    const n = Number.parseFloat(saisieOpacite)
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100
  }
  const valider = () => onChoisir(assemblerCouleur(normaliserHex(saisieHex), opaciteSaisie()))
  // Le sélecteur natif émet un `input` à chaque mouvement : on n'écrit dans la carte qu'à son `change`.
  useEffect(() => {
    const n = natif.current
    if (!n) return
    const fin = () => onChoisir(assemblerCouleur(n.value, opaciteSaisie()))
    n.addEventListener('change', fin)
    return () => n.removeEventListener('change', fin)
  })
  const choisir = (c: string) => {
    onChoisir(c)
    fermer()
  }
  const surEntree = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    valider()
  }
  return (
    <div className="notak-arbre-reglages-nuancier">
      <div className="notak-arbre-reglages-grille-couleurs" style={{ gridTemplateColumns: `repeat(${COLONNES_GRILLE}, 24px)` }}>
        {GRILLE_COULEURS.map((c) => (
          <Case key={c} couleur={c} actif={!!valeur && decouperCouleur(valeur).hex === c && opacite === 100} choisir={choisir} />
        ))}
      </div>
      <div className="notak-arbre-reglages-saisie-couleur">
        <span className="notak-arbre-reglages-diese">#</span>
        <input type="text" className="notak-arbre-reglages-hex" value={saisieHex} maxLength={7} spellCheck={false} aria-label={t('arbre.carte.hex')} onChange={(e) => setSaisieHex(e.target.value)} onBlur={valider} onKeyDown={surEntree} />
        <span className="notak-arbre-reglages-filet-vertical" />
        <input
          type="number"
          className="notak-arbre-reglages-opacite"
          min={0}
          max={100}
          value={saisieOpacite}
          aria-label={t('arbre.carte.opacite')}
          onChange={(e) => setSaisieOpacite(e.target.value)}
          onBlur={valider}
          onKeyDown={surEntree}
        />
        <span className="notak-arbre-reglages-pourcent">%</span>
        <span className="notak-arbre-reglages-apercu-couleur" style={{ ['--c' as string]: assemblerCouleur(normaliserHex(saisieHex), opaciteSaisie()) }} />
        <input ref={natif} type="color" className="notak-arbre-reglages-natif" value={normaliserHex(saisieHex)} aria-label={t('arbre.carte.selecteurNatif')} onChange={(e) => setSaisieHex(e.target.value.slice(1))} />
      </div>
      <RangeeCouleurs titre={t('arbre.carte.themeActuel')} couleurs={couleursTheme} valeur={valeur} choisir={choisir} />
      <RangeeCouleurs titre={t('arbre.carte.recemment')} couleurs={recentes} valeur={valeur} choisir={choisir} />
      {reinitialiser && (
        <button
          type="button"
          className="notak-arbre-reglages-lien"
          onClick={() => {
            reinitialiser()
            fermer()
          }}
        >
          {t('arbre.carte.couleurTheme')}
        </button>
      )}
    </div>
  )
}

/**
 * La pastille de couleur : 72 × 24 px, remplie de la couleur ; sans valeur, un trait en diagonale la barre (ou, si
 * `defaut` dit ce qu'on voit en attendant, cette couleur). Un clic ouvre le nuancier.
 */
export function PastilleCouleur({
  valeur,
  defaut,
  onChoisir,
  libelle,
  couleursTheme,
  recentes,
  reinitialiser,
}: {
  valeur: string | undefined
  /** La couleur qu'on voit quand rien n'est choisi. */
  defaut?: string | undefined
  onChoisir(valeur: string): void
  libelle: string
  couleursTheme?: readonly string[]
  recentes?: readonly string[]
  reinitialiser?: (() => void) | undefined
}) {
  const o = useOuvrable()
  const montre = valeur ?? defaut
  return (
    <>
      <button
        ref={o.poser}
        type="button"
        className="notak-arbre-reglages-pastille"
        aria-label={libelle}
        aria-haspopup="dialog"
        aria-expanded={o.ouvert}
        data-aucune={montre ? undefined : ''}
        style={montre ? { ['--c' as string]: montre } : undefined}
        onClick={o.basculer}
      />
      <Popover ancre={o.ancre} ouvert={o.ouvert} fermer={o.fermer} largeur={268} hauteur={400} className="notak-arbre-reglages-popover-couleur" etiquette={libelle}>
        <Nuancier valeur={valeur} onChoisir={onChoisir} fermer={o.fermer} couleursTheme={couleursTheme ?? []} recentes={recentes ?? []} reinitialiser={valeur ? reinitialiser : undefined} />
      </Popover>
    </>
  )
}

/** Un jeu de six couleurs en anneau : six secteurs de 60°, un trou au centre. */
export function Anneau({ couleurs, taille = 17 }: { couleurs: readonly string[]; taille?: number }) {
  return <span className="notak-arbre-reglages-anneau" aria-hidden style={{ width: taille, height: taille, background: degradeConique(couleurs) }} />
}

/* ------------------------------------------------------------------ vignette */

/**
 * Une carte à vignette (112 × 64 de dessin dans son cadre) : un bouton dont le dessin est cerclé, et plus épais
 * quand la carte est active. Les petites sont celles des variantes de thème.
 */
export function CarteVignette({
  actif,
  onClick,
  taille = 'moyenne',
  titre,
  children,
  coin,
  className,
  ...reste
}: {
  actif?: boolean | undefined
  onClick?: (() => void) | undefined
  taille?: 'petite' | 'moyenne'
  titre?: string | undefined
  /** Ce qu'on pose dans la vignette. */
  children: ReactNode
  /** Un bouton ou une pastille posés en haut à droite (l'étoile des favoris). */
  coin?: ReactNode
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'title' | 'children'>) {
  return (
    <div {...reste} className={`notak-arbre-reglages-vignette${className ? ` ${className}` : ''}`} data-taille={taille} data-actif={actif ? '' : undefined}>
      <button type="button" className="notak-arbre-reglages-vignette-bouton" aria-pressed={actif} aria-label={titre} title={titre} onClick={onClick}>
        <span className="notak-arbre-reglages-vignette-image">{children}</span>
      </button>
      {coin}
    </div>
  )
}

/** Le panneau secondaire d'un onglet : un titre, une croix qui le ferme, puis son contenu. */
export function VueSecondaire({ titre, fermer, children }: { titre: string; fermer(): void; children: ReactNode }) {
  return (
    <div className="notak-arbre-reglages-secondaire">
      <header>
        <strong>{titre}</strong>
        <button type="button" aria-label={t('commun.fermer')} onClick={fermer}>
          <Icone nom="fermer" taille={16} trait={1.75} />
        </button>
      </header>
      {children}
    </div>
  )
}
