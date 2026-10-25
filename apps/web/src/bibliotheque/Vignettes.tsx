import { type BoitePlan, FOND_NOTE, type ResumeContenu } from '@notak/tableau'
import { t } from '../langue'

/** Le dessin d'une entrée : le plan d'une toile, une carte mentale et ses branches, la page d'un document. */
export function Vignette({ resume }: { resume: ResumeContenu }) {
  if (resume.genre === 'document') return <VignetteDocument titre={resume.titre} lignes={resume.lignes} />
  if (resume.genre === 'arbre') return <VignetteCarte central={resume.titre} branches={resume.branches} />
  return (
    <span className="biblio-vignette" data-genre="toile" aria-hidden>
      {resume.boites.length === 0 ? <span className="biblio-vignette-vide">{t('tableau.vide')}</span> : <PlanToile boites={resume.boites} />}
    </span>
  )
}

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
  return (
    <svg viewBox={`${gauche} ${haut} ${l} ${h}`} preserveAspectRatio="xMidYMid meet">
      {boites.map((b, i) => (
        <Boite key={i} boite={b} />
      ))}
    </svg>
  )
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

