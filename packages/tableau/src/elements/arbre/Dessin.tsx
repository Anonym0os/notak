import { memo } from 'react'
import type { Id } from '../../coeur/tableau'
import { HABITS, INTERLIGNE, POLICE, type Mesure, type Rang, couleurDe, rangDe } from './apparence'
import type { Disposition } from './disposition'
import { type Lecture, enfantsDe } from './modele/sujets'
import { cheminBranche } from './trace/branches'

interface Props {
  lecture: Lecture
  disposition: Disposition
  mesures: ReadonlyMap<Id, Mesure>
  selection?: ReadonlySet<Id>
  /** Le sujet dont on écrit le titre : son texte s'efface sous le champ de saisie. */
  edition?: Id | null
}

/**
 * La carte en SVG : les branches d'abord, les sujets par-dessus. Chaque sujet porte `data-sujet` : un clic se résout
 * par le DOM, comme sur la toile. Les mêmes traits servent à l'aperçu sur la toile et à la carte ouverte en grand.
 */
export const Dessin = memo(function Dessin({ lecture: l, disposition: d, mesures, selection, edition }: Props) {
  const cotes = new Map(d.liens.map((x) => [x.vers, x.cote]))
  return (
    <>
      <g className="notak-arbre-branches" fill="none" strokeLinecap="round">
        {d.liens.map((lien) => {
          const p = d.boites.get(lien.de)
          const e = d.boites.get(lien.vers)
          if (!p || !e) return null
          const principal = lien.de === l.central
          return (
            <path
              key={lien.vers}
              d={cheminBranche(p, e, lien.cote, 'courbe', { parent: HABITS[rangDe(l, lien.de)].arrondi === null, enfant: HABITS[rangDe(l, lien.vers)].arrondi === null })}
              stroke={couleurDe(l, lien.vers) ?? 'var(--notak-arbre-encre)'}
              strokeWidth={principal ? 2.5 : 1.75}
            />
          )
        })}
      </g>
      {[...d.boites].map(([id, b]) => {
        const m = mesures.get(id)
        const s = l.sujets.get(id)
        if (!m || !s) return null
        const rang = rangDe(l, id)
        return (
          <Sujet
            key={id}
            id={id}
            rang={rang}
            x={b.x}
            y={b.y}
            mesure={m}
            couleur={couleurDe(l, id)}
            choisi={selection?.has(id) ?? false}
            enEdition={edition === id}
            replie={s.replie ? enfantsCaches(l, id) : 0}
            versLaGauche={cotes.get(id) === 'gauche'}
          />
        )
      })}
    </>
  )
})

/** Combien de sujets un repli cache. */
function enfantsCaches(l: Lecture, id: Id): number {
  let n = 0
  const pile = [...enfantsDe(l, id)]
  while (pile.length) {
    n++
    pile.push(...enfantsDe(l, pile.pop()!))
  }
  return n
}

interface PropsSujet {
  id: Id
  rang: Rang
  x: number
  y: number
  mesure: Mesure
  couleur: string | null
  choisi: boolean
  enEdition: boolean
  replie: number
  /** Sa branche part vers la gauche : la pastille de repli se met de ce côté. */
  versLaGauche: boolean
}

const Sujet = memo(function Sujet({ id, rang, x, y, mesure: m, couleur, choisi, enEdition, replie, versLaGauche }: PropsSujet) {
  const h = HABITS[rang]
  const teinte = couleur ?? 'var(--notak-arbre-encre)'
  const fond = rang === 'central' ? 'var(--notak-arbre-central)' : rang === 'principal' ? teinte : rang === 'flottant' ? 'var(--notak-arbre-flottant)' : 'none'
  const encre = rang === 'central' || rang === 'principal' ? 'var(--notak-arbre-sur-plein)' : 'var(--notak-arbre-texte)'
  const pas = h.police * INTERLIGNE
  return (
    <g className="notak-arbre-sujet" data-sujet={id} data-rang={rang} transform={`translate(${x} ${y})`}>
      {h.arrondi !== null ? (
        <rect width={m.l} height={m.h} rx={h.arrondi} fill={fond} stroke={rang === 'flottant' ? teinte : 'none'} strokeWidth={1.5} />
      ) : (
        <>
          <rect width={m.l} height={m.h} fill="transparent" />
          <line x1={0} x2={m.l} y1={m.h} y2={m.h} stroke={teinte} strokeWidth={1.75} strokeLinecap="round" />
        </>
      )}
      {choisi && <rect className="notak-arbre-choix" x={-4} y={-4} width={m.l + 8} height={m.h + 8} rx={(h.arrondi ?? 4) + 4} fill="none" />}
      {!enEdition && (
        <text fill={encre} fontFamily={POLICE} fontSize={h.police} fontWeight={h.graisse} textAnchor="middle">
          {m.lignes.map((ligne, i) => (
            <tspan key={i} x={m.l / 2} y={h.marge[0] + pas * i + h.police * 0.98}>
              {ligne}
            </tspan>
          ))}
        </text>
      )}
      {replie > 0 && (
        <g className="notak-arbre-repli" data-repli={id} transform={`translate(${versLaGauche ? -14 : m.l + 14} ${m.h / 2})`}>
          <circle r={9} fill="var(--notak-arbre-fond)" stroke={teinte} strokeWidth={1.5} />
          <text fontFamily={POLICE} fontSize={10} fontWeight={600} textAnchor="middle" y={3.5} fill={teinte}>
            {replie > 99 ? '99+' : replie}
          </text>
        </g>
      )}
    </g>
  )
})
