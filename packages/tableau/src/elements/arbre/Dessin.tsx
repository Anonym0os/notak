import { memo } from 'react'
import type { Arbre, Id, Limite, Relation, Sujet as DonneesSujet } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { HABITS, HAUTEUR_ETIQUETTE, INTERLIGNE, PAS_ICONE, POLICE, POLICE_ETIQUETTE, TAILLE_ICONE, type Mesure, type Rang, couleurDe, rangDe } from './apparence'
import type { Boite, Disposition } from './disposition'
import { Marqueur } from './marqueurs'
import { limitesValides, numeroDe, relationsValides, sujetsDePlage } from './modele/elements'
import { type Lecture, enfantsDe } from './modele/sujets'
import { cheminBranche } from './trace/branches'
import { type Courbe, courbeRelation } from './trace/relations'

interface Props {
  arbre: Arbre
  lecture: Lecture
  disposition: Disposition
  mesures: ReadonlyMap<Id, Mesure>
  selection?: ReadonlySet<Id>
  /** Le sujet (ou la relation, la limite) dont on écrit le titre : son texte s'efface sous le champ de saisie. */
  edition?: Id | null
  /** L'adresse affichable d'un fichier d'image, quand elle est connue. */
  adresse?: (fichier: Id) => string | undefined
}

/**
 * La carte en SVG : limites, branches, sujets, puis relations par-dessus. Ce qui se clique porte `data-sujet`,
 * `data-relation`, `data-limite` ou `data-repli` : un clic se résout par le DOM, comme sur la toile. Les mêmes traits
 * servent à l'aperçu sur la toile et à la carte ouverte en grand.
 */
export const Dessin = memo(function Dessin({ arbre, lecture: l, disposition: d, mesures, selection, edition, adresse }: Props) {
  const cotes = new Map(d.liens.map((x) => [x.vers, x.cote]))
  return (
    <>
      {limitesValides(arbre, l).map(([id, x]) => (
        <CadreLimite key={id} id={id} limite={x} lecture={l} disposition={d} choisi={selection?.has(id) ?? false} enEdition={edition === id} />
      ))}
      <g className="notak-arbre-branches" fill="none" strokeLinecap="round">
        {d.liens.map((lien) => {
          const p = d.boites.get(lien.de)
          const e = d.boites.get(lien.vers)
          if (!p || !e) return null
          const principal = lien.de === l.central
          return (
            <path
              key={lien.vers}
              d={cheminBranche(p, e, lien.cote, lien.forme, { parent: HABITS[rangDe(l, lien.de)].arrondi === null, enfant: HABITS[rangDe(l, lien.vers)].arrondi === null })}
              stroke={couleurDe(l, lien.vers) ?? 'var(--notak-arbre-encre)'}
              strokeWidth={principal ? 2.5 : 1.75}
            />
          )
        })}
        {d.traits.map((trait, i) => (
          <path key={`t${i}`} d={trait.d} stroke={couleurDe(l, trait.de) ?? 'var(--notak-arbre-encre)'} strokeWidth={trait.de === l.central ? 2.5 : 1.75} />
        ))}
      </g>
      {[...d.boites].map(([id, b]) => {
        const m = mesures.get(id)
        const s = l.sujets.get(id)
        if (!m || !s) return null
        return (
          <Sujet
            key={id}
            id={id}
            sujet={s}
            rang={rangDe(l, id)}
            boite={b}
            mesure={m}
            numero={numeroDe(l, id)}
            couleur={couleurDe(l, id)}
            choisi={selection?.has(id) ?? false}
            enEdition={edition === id}
            replie={s.replie ? enfantsCaches(l, id) : 0}
            versLaGauche={cotes.get(id) === 'gauche'}
            image={s.image ? adresse?.(s.image.fichier) : undefined}
          />
        )
      })}
      {relationsValides(arbre, l).map(([id, r]) => {
        const [a, b] = [d.boites.get(r.de), d.boites.get(r.vers)]
        return a && b ? <Fleche key={id} id={id} relation={r} courbe={courbeRelation(a, b, r.controles)} choisie={selection?.has(id) ?? false} enEdition={edition === id} /> : null
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

/** Les couleurs d'un rang d'importance (docs/XMIND.md § 3). */
const CLASSES = { important: '#e5534b', secondaire: '#8c939d' } as const

interface PropsSujet {
  id: Id
  sujet: DonneesSujet
  rang: Rang
  boite: Boite
  mesure: Mesure
  numero: string | null
  couleur: string | null
  choisi: boolean
  enEdition: boolean
  replie: number
  /** Sa branche part vers la gauche : la pastille de repli se met de ce côté. */
  versLaGauche: boolean
  image: string | undefined
}

const Sujet = memo(function Sujet({ id, sujet: s, rang, boite: b, mesure: m, numero, couleur, choisi, enEdition, replie, versLaGauche, image }: PropsSujet) {
  const h = HABITS[rang]
  const teinte = (s.classe === 'important' || s.classe === 'secondaire' ? CLASSES[s.classe] : null) ?? couleur ?? 'var(--notak-arbre-encre)'
  const plein = rang === 'central' || rang === 'principal'
  const fond = rang === 'central' ? 'var(--notak-arbre-central)' : rang === 'principal' ? teinte : rang === 'flottant' ? 'var(--notak-arbre-flottant)' : 'none'
  const encre = plein ? 'var(--notak-arbre-sur-plein)' : s.classe === 'secondaire' ? CLASSES.secondaire : 'var(--notak-arbre-texte)'
  const pas = h.police * INTERLIGNE
  let x = m.rangee.x
  const yIcone = m.rangee.y + m.rangee.h / 2 - TAILLE_ICONE / 2
  const devant: React.ReactNode[] = []
  if (s.tache) {
    devant.push(<CaseTache key="tache" x={x} y={yIcone} faite={s.tache === 'faite'} id={id} />)
    x += PAS_ICONE
  }
  for (const mq of s.marqueurs ?? []) {
    devant.push(
      <g key={mq} transform={`translate(${x} ${yIcone})`}>
        <Marqueur id={mq} />
      </g>,
    )
    x += PAS_ICONE
  }
  const icones = [s.note ? 'notes' : null, s.lien ? 'lien' : null].filter((v): v is 'notes' | 'lien' => !!v)
  const xIcones = m.texte.x + m.texte.l + 4
  return (
    <g className="notak-arbre-sujet" data-sujet={id} data-rang={rang} transform={`translate(${b.x} ${b.y})`}>
      {h.arrondi !== null ? (
        <rect width={m.l} height={m.h} rx={h.arrondi} fill={fond} stroke={rang === 'flottant' ? teinte : 'none'} strokeWidth={1.5} />
      ) : (
        <>
          <rect width={m.l} height={m.h} fill="transparent" />
          <line x1={0} x2={m.l} y1={m.h} y2={m.h} stroke={teinte} strokeWidth={1.75} strokeLinecap="round" />
        </>
      )}
      {choisi && <rect className="notak-arbre-choix" x={-4} y={-4} width={m.l + 8} height={m.h + 8} rx={(h.arrondi ?? 4) + 4} fill="none" />}
      {image && m.image && s.image && <image href={image} x={m.image.x} y={m.image.y} width={s.image.l} height={s.image.h} preserveAspectRatio="xMidYMid slice" />}
      {devant}
      {!enEdition && (
        <text fill={encre} fontFamily={POLICE} fontSize={h.police} fontWeight={h.graisse} textDecoration={s.classe === 'barre' ? 'line-through' : undefined}>
          {m.lignes.map((ligne, i) => (
            <tspan key={i} x={m.texte.x + m.texte.l / 2} y={m.texte.y + pas * i + h.police * 0.98} textAnchor="middle">
              {i === 0 && numero ? `${numero} ` : ''}
              {ligne}
            </tspan>
          ))}
        </text>
      )}
      {icones.map((nom, i) => (
        <g key={nom} transform={`translate(${xIcones + i * PAS_ICONE} ${yIcone})`} style={{ color: plein ? 'var(--notak-arbre-sur-plein)' : 'var(--notak-arbre-encre)' }} data-icone={`${nom}:${id}`}>
          <Icone nom={nom} taille={TAILLE_ICONE} trait={1.75} />
        </g>
      ))}
      {m.etiquettes && <Etiquettes noms={s.etiquettes ?? []} largeurs={m.etiquettes.largeurs} y={m.etiquettes.y} l={m.l} />}
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

/** La case d'une tâche, devant le titre ; un clic la coche (`data-tache`). */
function CaseTache({ x, y, faite, id }: { x: number; y: number; faite: boolean; id: Id }) {
  return (
    <g transform={`translate(${x} ${y})`} data-tache={id} className="notak-arbre-tache">
      <rect x={1} y={1} width={TAILLE_ICONE - 2} height={TAILLE_ICONE - 2} rx={3} fill={faite ? '#3fa66b' : 'var(--notak-arbre-fond)'} stroke={faite ? '#3fa66b' : 'var(--notak-arbre-encre)'} strokeWidth={1.5} />
      {faite && <path d="M4.5 8.2l2.4 2.4l4.6-4.8" stroke="#fff" strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  )
}

function Etiquettes({ noms, largeurs, y, l }: { noms: readonly string[]; largeurs: number[]; y: number; l: number }) {
  const total = largeurs.reduce((s, x, i) => s + x + (i > 0 ? 4 : 0), 0)
  let x = l / 2 - total / 2
  return (
    <g className="notak-arbre-etiquettes">
      {noms.map((nom, i) => {
        const lx = largeurs[i] ?? 0
        const g = (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect width={lx} height={HAUTEUR_ETIQUETTE} rx={HAUTEUR_ETIQUETTE / 2} fill="var(--notak-arbre-etiquette)" />
            <text x={lx / 2} y={HAUTEUR_ETIQUETTE / 2 + POLICE_ETIQUETTE * 0.36} textAnchor="middle" fontFamily={POLICE} fontSize={POLICE_ETIQUETTE} fontWeight={500} fill="var(--notak-arbre-texte)">
              {nom}
            </text>
          </g>
        )
        x += lx + 4
        return g
      })}
    </g>
  )
}

/** Une limite : un cadre arrondi autour des branches de sa plage, et son titre en tête. */
function CadreLimite({ id, limite, lecture, disposition: d, choisi, enEdition }: { id: Id; limite: Limite; lecture: Lecture; disposition: Disposition; choisi: boolean; enEdition: boolean }) {
  const boites = sujetsDePlage(lecture, limite).map((x) => d.boites.get(x)).filter((b): b is Boite => !!b)
  if (boites.length === 0) return null
  const [x0, y0] = [Math.min(...boites.map((b) => b.x)) - 10, Math.min(...boites.map((b) => b.y)) - 10]
  const [x1, y1] = [Math.max(...boites.map((b) => b.x + b.l)) + 10, Math.max(...boites.map((b) => b.y + b.h)) + 10]
  const couleur = couleurDe(lecture, limite.de) ?? 'var(--notak-arbre-encre)'
  return (
    <g className="notak-arbre-limite" data-limite={id}>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={12} fill={couleur} fillOpacity={0.07} stroke={couleur} strokeWidth={choisi ? 2.5 : 1.5} strokeDasharray="6 4" />
      {limite.titre && !enEdition && (
        <text x={x0 + 10} y={y0 - 6} fontFamily={POLICE} fontSize={12} fontWeight={600} fill={couleur}>
          {limite.titre}
        </text>
      )}
    </g>
  )
}

/** Une relation : une courbe en pointillés, sa pointe à l'arrivée, son titre au milieu. */
function Fleche({ id, relation, courbe: c, choisie, enEdition }: { id: Id; relation: Relation; courbe: Courbe; choisie: boolean; enEdition: boolean }) {
  return (
    <g className="notak-arbre-relation" data-relation={id}>
      <path d={c.chemin} fill="none" stroke="transparent" strokeWidth={12} />
      <path d={c.chemin} fill="none" stroke={choisie ? 'var(--notak-arbre-choix)' : 'var(--notak-arbre-encre)'} strokeWidth={choisie ? 2 : 1.5} strokeDasharray="5 4" />
      <path d={c.pointe} fill={choisie ? 'var(--notak-arbre-choix)' : 'var(--notak-arbre-encre)'} />
      {relation.titre && !enEdition && (
        <text x={c.milieu.x} y={c.milieu.y - 6} textAnchor="middle" fontFamily={POLICE} fontSize={12} fill="var(--notak-arbre-texte)" paintOrder="stroke" stroke="var(--notak-arbre-fond)" strokeWidth={4}>
          {relation.titre}
        </text>
      )}
      {choisie &&
        c.controles.map((p, i) => (
          <g key={i}>
            <line x1={i === 0 ? c.depart.x : c.arrivee.x} y1={i === 0 ? c.depart.y : c.arrivee.y} x2={p.x} y2={p.y} stroke="var(--notak-arbre-choix)" strokeWidth={1} />
            <circle cx={p.x} cy={p.y} r={5} fill="var(--notak-arbre-fond)" stroke="var(--notak-arbre-choix)" strokeWidth={1.5} data-controle={`${id}:${i}`} />
          </g>
        ))}
    </g>
  )
}
