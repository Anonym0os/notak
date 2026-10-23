import type { ReactNode } from 'react'

/**
 * Les vignettes de la barre de gauche : chaque type d'élément dessiné en petit, tel qu'il paraîtra sur la toile
 * (une carte blanche et ses lignes, une colonne et son en-tête…). Dessins à nous, sur une grille de 56 × 42.
 */

const CARTE = 'var(--notak-carte)'
const TRAIT = 'var(--notak-vignette-trait)'
const ACCENT = 'var(--notak-vignette-accent)'

const Carte = ({ children, x = 4, y = 5, l = 48, h = 32 }: { children?: ReactNode; x?: number; y?: number; l?: number; h?: number }) => (
  <>
    <rect x={x} y={y + 1} width={l} height={h} rx="3" fill="rgb(0 0 0 / 0.08)" />
    <rect x={x} y={y} width={l} height={h} rx="3" fill={CARTE} />
    {children}
  </>
)
const Ligne = ({ x, y, l, c = TRAIT, e = 2.5 }: { x: number; y: number; l: number; c?: string; e?: number }) => (
  <rect x={x} y={y} width={l} height={e} rx={e / 2} fill={c} />
)

const DESSINS: Record<string, ReactNode> = {
  note: (
    <Carte>
      <Ligne x={12} y={13} l={32} />
      <Ligne x={12} y={19} l={32} />
      <Ligne x={12} y={25} l={20} />
    </Carte>
  ),
  titre: (
    <>
      <rect x="10" y="8" width="36" height="26" rx="2" fill="none" stroke={TRAIT} strokeDasharray="3 2" />
      <text x="28" y="28" textAnchor="middle" fontSize="18" fontWeight="700" fontFamily="Georgia, serif" fill="var(--notak-texte)">
        T
      </text>
    </>
  ),
  lien: (
    <Carte>
      <g fill="none" stroke="var(--notak-texte)" strokeWidth="2" strokeLinecap="round">
        <path d="M25 24 l6 -6" />
        <path d="M23 20 l-2.5 2.5 a4 4 0 0 0 5.7 5.7 L28.7 25.7" />
        <path d="M33 22 l2.5 -2.5 a4 4 0 0 0 -5.7 -5.7 L27.3 16.3" />
      </g>
    </Carte>
  ),
  taches: (
    <Carte>
      {[12, 22].map((y) => (
        <g key={y}>
          <rect x="11" y={y} width="6" height="6" rx="1.5" fill="none" stroke="var(--notak-texte)" strokeWidth="1.4" />
          <path d={`M12.5 ${y + 3} l1.5 1.5 l2.5 -3`} fill="none" stroke="var(--notak-texte)" strokeWidth="1.4" strokeLinecap="round" />
          <Ligne x={21} y={y + 2} l={24} />
        </g>
      ))}
    </Carte>
  ),
  ligne: (
    <g fill="none" stroke="var(--notak-texte)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 34 L42 9" />
      <path d="M33 9 h9 v9" />
    </g>
  ),
  tableau: (
    <>
      <rect x="13" y="4" width="30" height="30" rx="7" fill={ACCENT} />
      <rect x="19" y="11" width="18" height="4" rx="2" fill="rgb(255 255 255 / 0.95)" />
      <rect x="19" y="18" width="8" height="9" rx="2" fill="rgb(255 255 255 / 0.75)" />
      <rect x="29" y="18" width="8" height="9" rx="2" fill="rgb(255 255 255 / 0.55)" />
    </>
  ),
  modele: (
    <>
      <rect x="17" y="3" width="26" height="26" rx="6" fill={ACCENT} opacity="0.35" />
      <rect x="13" y="8" width="26" height="26" rx="6" fill={ACCENT} />
      <rect x="18" y="14" width="16" height="3.5" rx="1.75" fill="rgb(255 255 255 / 0.95)" />
      <rect x="18" y="21" width="10" height="3.5" rx="1.75" fill="rgb(255 255 255 / 0.7)" />
    </>
  ),
  colonne: (
    <Carte x={12} y={3} l={32} h={36}>
      <Ligne x={17} y={8} l={22} c="var(--notak-texte)" e={2} />
      <rect x={15} y={14} width={26} height={9} rx="1.5" fill={TRAIT} opacity="0.6" />
      <rect x={15} y={25} width={26} height={9} rx="1.5" fill={TRAIT} opacity="0.6" />
    </Carte>
  ),
  commentaire: (
    <>
      <path d="M8 6 h40 a3 3 0 0 1 3 3 v20 a3 3 0 0 1 -3 3 h-16 l-4 5 l-4 -5 h-16 a3 3 0 0 1 -3 -3 v-20 a3 3 0 0 1 3 -3 z" fill={CARTE} />
      <Ligne x={13} y={13} l={30} c={ACCENT} e={2} />
      <Ligne x={13} y={19} l={30} c={ACCENT} e={2} />
      <Ligne x={13} y={25} l={18} c={ACCENT} e={2} />
    </>
  ),
  table: (
    <Carte>
      <rect x="4" y="5" width="48" height="8" rx="3" fill={TRAIT} opacity="0.5" />
      <g stroke={TRAIT} strokeWidth="1">
        <path d="M4 21 h48 M4 29 h48 M20 5 v32 M36 5 v32" />
      </g>
    </Carte>
  ),
  croquis: (
    <Carte>
      <path d="M14 26 c4 -10 8 -10 9 -4 s5 6 8 -2 s5 -6 7 2" fill="none" stroke="var(--notak-texte)" strokeWidth="2" strokeLinecap="round" />
    </Carte>
  ),
  nuancier: (
    <>
      <rect x="9" y="4" width="22" height="26" rx="2" fill="#3f7d8c" />
      <rect x="9" y="24" width="22" height="6" fill={CARTE} />
      <rect x="24" y="11" width="22" height="26" rx="2" fill="#d2566e" transform="rotate(6 35 24)" />
      <rect x="24" y="31" width="22" height="6" fill={CARTE} transform="rotate(6 35 24)" />
    </>
  ),
  document: (
    <>
      <path d="M17 3 h16 l8 8 v28 h-24 z" fill={CARTE} />
      <path d="M33 3 v8 h8" fill="rgb(0 0 0 / 0.07)" />
      <text x="22" y="25" fontSize="8" fontWeight="700" fontFamily="Georgia, serif" fill="var(--notak-texte)">
        T
      </text>
      <Ligne x={28} y={20} l={9} e={2} />
      <Ligne x={28} y={25} l={9} e={2} />
      <Ligne x={22} y={30} l={15} e={2} />
    </>
  ),
  lieu: (
    <>
      <rect x="6" y="5" width="44" height="32" rx="3" fill="#dfe5d8" />
      <path d="M6 30 C20 24 24 14 50 12 V18 C30 19 26 30 14 37 H6 Z" fill="#a9c98f" />
      <path d="M30 5 L42 37" stroke="#e8c547" strokeWidth="4" />
      <path d="M18 22 a5 5 0 1 1 10 0 c0 4 -5 8 -5 8 s-5 -4 -5 -8 z" fill="#d6453d" />
      <circle cx="23" cy="22" r="1.8" fill="#fff" />
    </>
  ),
  video: (
    <>
      <rect x="6" y="5" width="44" height="32" rx="3" fill="#7a5bd6" />
      <circle cx="18" cy="14" r="9" fill="#9b82e6" />
      <circle cx="40" cy="30" r="12" fill="#5b3fc0" />
      <circle cx="28" cy="21" r="7" fill="rgb(0 0 0 / 0.45)" />
      <path d="M26 17.5 v7 l6 -3.5 z" fill="#fff" />
    </>
  ),
  audio: (
    <>
      <rect x="6" y="5" width="44" height="32" rx="3" fill="#4fa565" />
      <g stroke="#fff" strokeWidth="2" strokeLinecap="round">
        {[14, 18, 22, 26, 30, 34, 38, 42].map((x, i) => (
          <path key={x} d={`M${x} ${21 - [3, 6, 9, 5, 8, 4, 7, 3][i]!} v${2 * [3, 6, 9, 5, 8, 4, 7, 3][i]!}`} />
        ))}
      </g>
    </>
  ),
  carte: (
    <>
      <rect x="6" y="5" width="44" height="32" rx="3" fill="#e4e8ec" />
      <path d="M6 14 L50 26 M20 5 L28 37" stroke="#fff" strokeWidth="3" />
      <path d="M36 5 L44 37" stroke="#e8c547" strokeWidth="3" />
      <rect x="9" y="25" width="10" height="9" rx="1" fill="#a9c98f" />
    </>
  ),
  clone: (
    <>
      <Carte x={14} y={3} l={34} h={24} />
      <Carte x={8} y={12} l={34} h={24}>
        <Ligne x={13} y={19} l={22} />
        <Ligne x={13} y={25} l={14} />
      </Carte>
    </>
  ),
}

/** La vignette d'un outil, ou `null` s'il n'en a pas (il garde alors son icône). */
export function Vignette({ nom }: { nom: string | undefined }) {
  const dessin = nom ? DESSINS[nom] : undefined
  if (!dessin) return null
  return (
    <svg className="notak-vignette" viewBox="0 0 56 42" width="56" height="42" aria-hidden="true">
      {dessin}
    </svg>
  )
}
