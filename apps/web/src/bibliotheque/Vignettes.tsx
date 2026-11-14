import { type BoitePlan, FOND_NOTE, ICONE_DU_GENRE, Icone, type ResumeContenu, extensionDe, genreDe } from '@notak/tableau'
import { type CSSProperties, createContext, useContext, useEffect, useId, useState } from 'react'
import { t, tn } from '../langue'

/**
 * Ce que les vignettes demandent à l'édition : l'adresse d'un fichier (une photo, l'image choisie d'un lien), et si
 * une toile laisse venir le contenu d'autres sites (l'image d'aperçu d'un lien) — une toile reçue d'une copie attend
 * qu'on le permette, comme sur la toile elle-même. Sans fournisseur, aucune image ne se charge : on voit le genre.
 */
export interface SourceVignettes {
  /**
   * `largeur` : en pixels de l'écran, ce que la vignette montre ; une copie réduite suffit, quand la source sait en
   * servir (un serveur, `?l=`). Sans elle, le fichier entier (une photo ouverte seule).
   */
  adresse(fichier: string, largeur?: number): Promise<string | null>
  distant(tableau: string): boolean
}
const ContexteVignettes = createContext<SourceVignettes | null>(null)
export const FournisseurVignettes = ContexteVignettes.Provider

/** Une vignette est large de tant de pixels au plus, colonne la plus large comprise ; la densité de l'écran s'y ajoute. */
const LARGEUR_VIGNETTE = 260
export const largeurDesVignettes = (densite = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) =>
  Math.ceil(LARGEUR_VIGNETTE * Math.min(3, Math.max(1, densite)))

/** L'adresse d'un fichier, une fois connue ; `null` tant qu'elle ne l'est pas, ou s'il est introuvable. */
function useAdresse(fichier: string | undefined, largeur?: number): string | null {
  const source = useContext(ContexteVignettes)
  const [adresse, setAdresse] = useState<string | null>(null)
  useEffect(() => {
    setAdresse(null)
    if (!fichier || !source) return
    let vivant = true
    source.adresse(fichier, largeur).then(
      (a) => vivant && setAdresse(a),
      () => {},
    )
    return () => {
      vivant = false
    }
  }, [fichier, largeur, source])
  return adresse
}

/**
 * Une photo trop haute ou trop large pour la tuile s'y montre entière, sur le fond de la vignette, comme le Finder et
 * Fichiers montrent les leurs : la recadrer en couperait plus du quart (une photo en hauteur n'y garderait qu'une
 * bande, les têtes coupées). Les autres la remplissent, centrées.
 */
export const photoEntiere = (largeur: number, hauteur: number) => {
  if (!(largeur > 0 && hauteur > 0)) return false
  const [r, tuile] = [largeur / hauteur, VL / VH]
  return 1 - Math.min(r / tuile, tuile / r) > 0.25
}

/**
 * Le dessin d'une entrée : le plan d'une toile, une carte mentale et ses branches, la page d'un document, la photo
 * elle-même, l'aperçu d'un lien, l'icône d'un fichier. `tableau` : la toile qui la porte (l'accord pour les images
 * d'autres sites).
 */
export function Vignette({ resume, tableau }: { resume: ResumeContenu; tableau?: string }) {
  if (resume.genre === 'document') return <VignetteDocument titre={resume.titre} lignes={resume.lignes} />
  if (resume.genre === 'arbre') return <VignetteCarte central={resume.titre} branches={resume.branches} />
  if (resume.genre === 'image') return <VignettePhoto photo={resume} />
  if (resume.genre === 'lien') return <VignetteLien resume={resume} tableau={tableau} />
  if (resume.genre === 'fichier') return <VignetteFichier nom={resume.nom} typeMime={resume.typeMime} />
  // Une toile qui se montre en dossier : l'icône d'un dossier, comme dans Fichiers.
  if (resume.dossier)
    return (
      <span className="biblio-vignette" data-genre="dossier" aria-hidden>
        <Icone nom="dossier" taille={56} trait={1.2} />
      </span>
    )
  return (
    <span className="biblio-vignette" data-genre="toile" aria-hidden>
      {resume.boites.length === 0 ? <span className="biblio-vignette-vide">{texteSansPlan(resume)}</span> : <PlanToile boites={resume.boites} />}
    </span>
  )
}

/** Une toile sans rien de posé : vide, ou ce qui attend dans ses non triés (rien ne s'en voit sur la toile non plus). */
export const texteSansPlan = (resume: Extract<ResumeContenu, { genre: 'toile' }>) =>
  resume.nonTries ? tn('biblio.vignette.nonTries', resume.nonTries) : t('tableau.vide')

/** Le format des vignettes, celui des tuiles de Xmind. */
const [VL, VH] = [206, 136]
/** Les largeurs des barres de texte, d'une ligne à l'autre, pour qu'un paragraphe ait l'air d'en être un. */
const BARRES = [0.92, 0.78, 0.86, 0.6, 0.84, 0.7]

const fondNote = (couleur: string) => (couleur in FOND_NOTE ? FOND_NOTE[couleur as keyof typeof FOND_NOTE] : 'var(--notak-carte, #fff)')

/** Au plus tant d'UG de large dans une vignette : au-delà, le texte des cartes ne se devine plus. */
const PLAN_LARGEUR_MAX = 120

/**
 * Le plan d'une toile : ses éléments à leur place, chacun dessiné selon ce qu'il est. Une petite toile s'y montre
 * entière ; d'une grande, on voit le coin où elle commence, à une échelle où l'on reconnaît ses cartes.
 */
export function PlanToile({ boites }: { boites: BoitePlan[] }) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y, l, h] of boites) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + l), Math.max(y1, y + h)]
  // Pas moins qu'une toile de quelques cartes, et au format de la tuile : une seule note ne la remplit pas.
  const marge = 8
  let [l, h] = [Math.max(x1 - x0, 90) + 2 * marge, Math.max(y1 - y0, 50) + 2 * marge]
  if (l / h > VL / VH) h = (l * VH) / VL
  else l = (h * VL) / VH
  const rogne = l > PLAN_LARGEUR_MAX
  if (rogne) [l, h] = [PLAN_LARGEUR_MAX, (PLAN_LARGEUR_MAX * VH) / VL]
  const [gauche, haut] = rogne ? [x0 - marge, y0 - marge] : [(x0 + x1) / 2 - l / 2, (y0 + y1) / 2 - h / 2]
  // Les photos qu'on voit dans la vignette s'y montrent elles-mêmes ; au-delà de quelques-unes, ou hors du cadre, on ne
  // les charge pas : la bibliothèque porte des dizaines de vignettes.
  const vue = (b: BoitePlan) => b[0] < gauche + l && b[0] + b[2] > gauche && b[1] < haut + h && b[1] + b[3] > haut
  let photos = 0
  return (
    <svg viewBox={`${gauche} ${haut} ${l} ${h}`} preserveAspectRatio="xMidYMid meet">
      {boites.map((b, i) => (b[5] === 'image' && b[7] && vue(b) && photos++ < PHOTOS_PAR_PLAN ? <PhotoPlan key={i} boite={b} fichier={b[7]} /> : <Boite key={i} boite={b} />))}
    </svg>
  )
}

/** Au plus tant de photos chargées dans le plan d'une toile ; les autres gardent leur dessin. */
const PHOTOS_PAR_PLAN = 24

/** Une photo du plan : elle-même, au format de sa boîte et comme sur la toile ; en attendant, le dessin d'une photo. */
function PhotoPlan({ boite, fichier }: { boite: BoitePlan; fichier: string }) {
  const adresse = useAdresse(fichier, largeurDesVignettes())
  const coupe = `plan-photo-${useId().replace(/[^\w-]/g, '')}`
  const [x, y, l, h, , , , , photo] = boite
  if (!adresse) return <Boite boite={boite} />
  // La coupe va au groupe, pas à l'image : sur l'image, elle tournerait avec elle.
  return (
    <g clipPath={`url(#${coupe})`}>
      <clipPath id={coupe}>
        <rect x={x} y={y} width={l} height={h} rx={0.8} />
      </clipPath>
      <rect x={x} y={y} width={l} height={h} rx={0.8} fill="#cfd4da" />
      <image href={adresse} {...(photo ? placerDansLaBoite(photo, boite) : { x, y, width: l, height: h })} preserveAspectRatio="xMidYMid slice" />
    </g>
  )
}

/** Ce que la toile fait d'une photo (voir `BoitePlan`, `ResumeContenu`) : la partie gardée, son quart de tour, ses miroirs. */
type PhotoMontree = NonNullable<BoitePlan[8]>
const ENTIERE = { x: 0, y: 0, largeur: 1, hauteur: 1 }
const couchee = (p: PhotoMontree) => p.rotation === 90 || p.rotation === 270

/** Largeur sur hauteur de la photo montrée : la partie gardée, puis son quart de tour (`proportionsAffichees`). */
export function proportionsMontrees(p: PhotoMontree): number {
  const r = p.recadrage ?? ENTIERE
  const q = (p.largeur * r.largeur) / (p.hauteur * r.hauteur)
  return couchee(p) ? 1 / q : q
}

/** Les miroirs de l'écran, puis le quart de tour, autour du centre : l'ordre de la toile (`miseEnPage`). */
const tourner = (p: PhotoMontree, unite = '') =>
  `${p.miroirH || p.miroirV ? ` scale(${p.miroirH ? -1 : 1}, ${p.miroirV ? -1 : 1})` : ''}${p.rotation ? ` rotate(${p.rotation}${unite})` : ''}`

const pct = (v: number) => `${+(v * 100).toFixed(4)}%`

/**
 * Où poser une photo dans son cadre pour qu'elle s'y montre comme sur la toile, à la manière de `miseEnPage`
 * (elements/image/geometrie.ts) : le plan de l'image, avant son quart de tour, recouvre le cadre (en unités du cadre,
 * `cqw` et `cqh`) et tourne autour de son centre ; l'image y est décalée pour que seule la partie gardée apparaisse.
 */
export function misePhoto(p: PhotoMontree): { plan: CSSProperties; image: CSSProperties } {
  const r = p.recadrage ?? ENTIERE
  const q = +proportionsMontrees(p).toFixed(6)
  const montree = { width: `max(100cqw, calc(100cqh * ${q}))`, height: `max(100cqh, calc(100cqw / ${q}))` }
  return {
    plan: { ...(couchee(p) ? { width: montree.height, height: montree.width } : montree), transform: `translate(-50%, -50%)${tourner(p, 'deg')}` },
    image: { width: pct(1 / r.largeur), height: pct(1 / r.hauteur), left: pct(-r.x / r.largeur), top: pct(-r.y / r.hauteur) },
  }
}

/** La même chose dans la boîte d'un plan, en SVG : l'image, placée et tournée autour du centre de la boîte. */
export function placerDansLaBoite(p: PhotoMontree, [x, y, l, h]: BoitePlan) {
  const r = p.recadrage ?? ENTIERE
  const q = proportionsMontrees(p)
  // La photo montrée recouvre la boîte sans être étirée ; son plan est celui d'avant le quart de tour.
  const [lm, hm] = l / h > q ? [l, l / q] : [h * q, h]
  const [lp, hp] = couchee(p) ? [hm, lm] : [lm, hm]
  const [li, hi] = [lp / r.largeur, hp / r.hauteur]
  return { x: -lp / 2 - r.x * li, y: -hp / 2 - r.y * hi, width: li, height: hi, transform: `translate(${x + l / 2} ${y + h / 2})${tourner(p)}` }
}

function Barres({ x, y, l, n, pas = 2.6, couleur = 'rgb(50 59 74 / 0.26)' }: { x: number; y: number; l: number; n: number; pas?: number; couleur?: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x} y={y + i * pas} width={Math.max(2, l * BARRES[i % BARRES.length]!)} height={1.1} rx={0.55} fill={couleur} />
      ))}
    </>
  )
}

function Boite({ boite: [x, y, l, h, couleur, type = 'note', lignes = 1] }: { boite: BoitePlan }) {
  const trait = { stroke: 'rgb(27 37 54 / 0.12)', strokeWidth: 0.35 }
  switch (type) {
    case 'colonne': {
      const cartes = Math.max(0, Math.min(lignes, Math.floor((h - 5) / 9)))
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={1.2} fill={couleur ? fondNote(couleur) : 'rgb(50 59 74 / 0.12)'} />
          <rect x={x + 1.6} y={y + 1.6} width={Math.min(l * 0.45, 12)} height={1.4} rx={0.7} fill="rgb(50 59 74 / 0.55)" />
          {Array.from({ length: cartes }, (_, i) => (
            <g key={i}>
              <rect x={x + 1.5} y={y + 5 + i * 9} width={l - 3} height={7.6} rx={0.7} fill="var(--notak-carte, #fff)" {...trait} />
              <Barres x={x + 3} y={y + 7.4 + i * 9} l={l - 7} n={2} />
            </g>
          ))}
        </g>
      )
    }
    case 'image':
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={0.8} fill="#cfd4da" />
          <path d={`M${x} ${y + h * 0.82} L${x + l * 0.32} ${y + h * 0.5} L${x + l * 0.52} ${y + h * 0.7} L${x + l * 0.7} ${y + h * 0.56} L${x + l} ${y + h * 0.84} V${y + h} H${x} Z`} fill="#b3bac3" />
          <circle cx={x + l * 0.72} cy={y + h * 0.28} r={Math.min(l, h) * 0.08} fill="#e6e9ec" />
        </g>
      )
    case 'dessin':
      // Un dessin à main levée : un trait, sans carte autour (il n'en a pas sur la toile).
      return (
        <path
          d={`M${x + l * 0.1} ${y + h * 0.62} C${x + l * 0.28} ${y + h * 0.08} ${x + l * 0.42} ${y + h * 0.95} ${x + l * 0.6} ${y + h * 0.45} S${x + l * 0.84} ${y + h * 0.22} ${x + l * 0.9} ${y + h * 0.55}`}
          fill="none"
          stroke="rgb(50 59 74 / 0.5)"
          strokeWidth={Math.max(0.5, Math.min(l, h) * 0.07)}
          strokeLinecap="round"
        />
      )
    case 'tableau': {
      const c = Math.min(l, h - 3.5)
      return (
        <g>
          <rect x={x + (l - c) / 2} y={y} width={c} height={c} rx={c * 0.2} fill={couleur in FOND_NOTE ? fondNote(couleur) : '#5b6cf0'} />
          <rect x={x + (l - c) / 2 + c * 0.2} y={y + c * 0.24} width={c * 0.6} height={c * 0.18} rx={0.5} fill="#fff" opacity={0.85} />
          <rect x={x + (l - c) / 2 + c * 0.2} y={y + c * 0.5} width={c * 0.27} height={c * 0.27} rx={0.5} fill="#fff" opacity={0.85} />
          <rect x={x + (l - c) / 2 + c * 0.53} y={y + c * 0.5} width={c * 0.27} height={c * 0.27} rx={0.5} fill="#fff" opacity={0.85} />
          <rect x={x + l * 0.2} y={y + c + 1.6} width={l * 0.6} height={1.2} rx={0.6} fill="rgb(50 59 74 / 0.4)" />
        </g>
      )
    }
    case 'arbre':
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={1} fill="var(--notak-carte, #fff)" {...trait} />
          {[-0.28, 0, 0.28].map((d, i) => (
            <path key={i} d={`M${x + l * 0.5} ${y + h / 2} C${x + l * 0.65} ${y + h / 2} ${x + l * 0.65} ${y + h * (0.5 + d)} ${x + l * 0.78} ${y + h * (0.5 + d)} h${l * 0.12}`} fill="none" stroke={BRANCHES[i]} strokeWidth={0.5} />
          ))}
          <rect x={x + l * 0.3} y={y + h / 2 - 1.8} width={l * 0.26} height={3.6} rx={1} fill="#323b4a" />
        </g>
      )
    case 'document':
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={0.8} fill="var(--notak-carte, #fff)" {...trait} />
          <rect x={x + 2} y={y + 2.2} width={l * 0.5} height={1.6} rx={0.8} fill="rgb(50 59 74 / 0.7)" />
          <Barres x={x + 2} y={y + 5.6} l={l - 4} n={Math.max(1, Math.floor((h - 7) / 2.4))} pas={2.4} />
        </g>
      )
    case 'table':
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={0.6} fill="var(--notak-carte, #fff)" {...trait} />
          <rect x={x} y={y} width={l} height={Math.min(4, h / 4)} fill="rgb(50 59 74 / 0.08)" />
          {[1, 2, 3].map((k) => (
            <path key={k} d={`M${x + (l * k) / 4} ${y} V${y + h} M${x} ${y + (h * k) / 4} H${x + l}`} {...trait} />
          ))}
        </g>
      )
    default: {
      const n = Math.max(1, Math.min(lignes, Math.floor((h - 2.4) / 2.6)))
      return (
        <g>
          <rect x={x} y={y} width={l} height={h} rx={0.8} fill={fondNote(couleur)} {...trait} />
          <Barres x={x + 2} y={y + (h - (n - 1) * 2.6 - 1.1) / 2} l={l - 4} n={n} couleur={couleur in FOND_NOTE ? 'rgb(27 37 54 / 0.3)' : 'rgb(50 59 74 / 0.26)'} />
        </g>
      )
    }
  }
}

/** Les couleurs des branches principales, dans l'ordre, comme le thème par défaut de Xmind. */
const BRANCHES = ['#e5534b', '#ef8a2b', '#d6b11d', '#4aa24f', '#3d7be0', '#8a5bd6', '#d64f9a', '#2fa39a']

/** Le central au milieu, ses branches de part et d'autre, chacune de sa couleur, le titre posé sur son trait. */
export function VignetteCarte({ central, branches }: { central: string; branches: string[] }) {
  const coupe = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  const titre = coupe(central || t('commun.sansTitre'), 18)
  const lc = Math.min(110, titre.length * 5.6 + 22)
  const droite = branches.slice(0, Math.ceil(branches.length / 2))
  const gauche = branches.slice(droite.length)
  const cote = (liste: string[], sens: 1 | -1, decalage: number) =>
    liste.map((b, i) => {
      const y = (VH / (liste.length + 1)) * (i + 1) + 3
      const texte = coupe(b || '·', 12)
      const lb = Math.min(64, texte.length * 4.6 + 6)
      const couleur = BRANCHES[(decalage + i) % BRANCHES.length]!
      const depart = VL / 2 + (sens * lc) / 2
      const bout = sens === 1 ? VL - 12 - lb : 12 + lb
      const milieu = (depart + bout) / 2
      return (
        <g key={`${sens}${i}`}>
          <path d={`M${depart} ${VH / 2} C${milieu} ${VH / 2} ${milieu} ${y} ${bout} ${y} h${sens * lb}`} fill="none" stroke={couleur} strokeWidth={1.5} strokeLinecap="round" />
          <text x={sens === 1 ? bout + 1 : bout - 1} y={y - 3} textAnchor={sens === 1 ? 'start' : 'end'} fontSize={8.2} fill="var(--notak-texte, #323b4a)">
            {texte}
          </text>
        </g>
      )
    })
  return (
    <span className="biblio-vignette" data-genre="arbre" aria-hidden>
      <svg viewBox={`0 0 ${VL} ${VH}`} preserveAspectRatio="xMidYMid meet">
        {cote(droite, 1, 0)}
        {cote(gauche, -1, droite.length)}
        <rect x={(VL - lc) / 2} y={VH / 2 - 11} width={lc} height={22} rx={6} fill="#323b4a" />
        <text x={VL / 2} y={VH / 2 + 3.4} textAnchor="middle" fontSize={9.2} fontWeight={600} fill="#fff">
          {titre}
        </text>
      </svg>
    </span>
  )
}

/** La page d'un document : son titre, puis une barre par ligne, à la longueur de la ligne. */
export function VignetteDocument({ titre, lignes }: { titre: string; lignes: string[] }) {
  const coupe = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  const largeur = 98
  return (
    <span className="biblio-vignette" data-genre="document" aria-hidden>
      <svg viewBox={`0 0 ${VL} ${VH}`} preserveAspectRatio="xMidYMid meet">
        <rect x={40} y={16} width={126} height={140} rx={4} fill="var(--notak-carte, #fff)" stroke="rgb(27 37 54 / 0.1)" />
        <text x={54} y={38} fontSize={11} fontWeight={700} fill="var(--notak-texte, #323b4a)">
          {coupe(titre || t('commun.sansTitre'), 19)}
        </text>
        {lignes.slice(0, 6).map((l, i) => (
          <rect key={i} x={54} y={50 + i * 11} width={Math.max(14, Math.min(largeur, (l.length / 60) * largeur))} height={3} rx={1.5} fill="rgb(50 59 74 / 0.22)" />
        ))}
      </svg>
    </span>
  )
}


/**
 * Une photo, comme sur la toile : recadrée, tournée, retournée, dans son cadre libre (`misePhoto`). Ce cadre remplit la
 * tuile, centré, ou s'y montre entier quand le recadrer couperait trop la photo (`photoEntiere`) ; une copie réduite à
 * la taille de la tuile, pas l'original. En attendant, un fond neutre.
 */
function VignettePhoto({ photo }: { photo: Extract<ResumeContenu, { genre: 'image' }> }) {
  const adresse = useAdresse(photo.petite ?? photo.fichier, largeurDesVignettes())
  const rapport = +(photo.rapportCadre ?? proportionsMontrees(photo)).toFixed(6)
  const entiere = photoEntiere(rapport, 1)
  const borne = entiere ? 'min' : 'max'
  const { plan, image } = misePhoto(photo)
  return (
    <span className="biblio-vignette" data-genre="image" data-cadrage={entiere ? 'entier' : undefined} aria-hidden>
      {adresse ? (
        <span className="biblio-vignette-cadre" style={{ width: `${borne}(100cqw, calc(100cqh * ${rapport}))`, height: `${borne}(100cqh, calc(100cqw / ${rapport}))` }}>
          <span className="biblio-vignette-plan" style={plan}>
            <img src={adresse} alt="" loading="lazy" decoding="async" draggable={false} style={image} />
          </span>
        </span>
      ) : (
        <Icone nom="fichierImage" taille={32} />
      )}
    </span>
  )
}

/** Garde ce qui ressemble à une adresse web d'image : rien d'autre ne se charge depuis la bibliothèque. */
const adresseWeb = (a: string | undefined) => (a && /^https:\/\//i.test(a) ? a : undefined)

/** Un lien : l'image qu'on lui a choisie, sinon celle de la page (si la toile le permet), et son site. */
function VignetteLien({ resume, tableau }: { resume: Extract<ResumeContenu, { genre: 'lien' }>; tableau?: string }) {
  const source = useContext(ContexteVignettes)
  const choisie = useAdresse(resume.fichierImage, largeurDesVignettes())
  const permis = !!source && (!tableau || source.distant(tableau))
  const image = choisie ?? (permis ? adresseWeb(resume.image) : undefined)
  const icone = permis ? adresseWeb(resume.favicon) : undefined
  const [rate, setRate] = useState(false)
  const site = resume.site || domaine(resume.url)
  return (
    <span className="biblio-vignette" data-genre="lien" aria-hidden>
      {image && !rate ? (
        <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setRate(true)} />
      ) : (
        <span className="biblio-vignette-lien">
          {icone ? <img className="biblio-vignette-favicon" src={icone} alt="" referrerPolicy="no-referrer" draggable={false} /> : <Icone nom="fichierWeb" taille={28} />}
          <span>{site}</span>
        </span>
      )}
    </span>
  )
}

const domaine = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Un fichier : l'icône de son genre et son extension, comme sa carte sur la toile. */
function VignetteFichier({ nom, typeMime }: { nom: string; typeMime: string }) {
  const genre = genreDe(nom, typeMime)
  return (
    <span className="biblio-vignette" data-genre="fichier" data-fichier={genre} aria-hidden>
      <span className="biblio-vignette-fichier">
        <Icone nom={ICONE_DU_GENRE[genre]} taille={36} trait={1.5} />
        {extensionDe(nom) && <span>{extensionDe(nom).toUpperCase()}</span>}
      </span>
    </span>
  )
}
