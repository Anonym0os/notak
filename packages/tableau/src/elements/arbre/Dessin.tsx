import { memo, useMemo } from 'react'
import type { Arbre, FormeSujet, Id, Limite, Relation, Sujet as DonneesSujet, Zone } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { type Habit, DISQUE_PLANNING, HAUTEUR_ETIQUETTE, INTERLIGNE, PAS_ICONE, POLICE, POLICE_ETIQUETTE, POLICE_PLANNING, TAILLE_ICONE, type Mesure, type Rang, brancheDe, couleurDe, habitDe, rangDe, souligne } from './apparence'
import type { Boite, Disposition } from './disposition'
import { Autocollant, DessinIllustration } from './catalogue'
import { equation } from './equation'
import { Marqueur, TAILLE_MARQUEUR } from './marqueurs'
import { limitesValides, numeroDe, relationsValides, sujetsDePlage } from './modele/elements'
import { type Planning, marqueurPerso, marqueursUtilises, resumePlanning, zonesValides } from './modele/insertions'
import { type Lecture, enfantsDe } from './modele/sujets'
import { type Theme, themeDe } from './themes'
import { cheminBranche, cheminEffile } from './trace/branches'
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
  /** En présentation : les seuls sujets montrés (les autres, et leurs branches, attendent leur tour). */
  devoiles?: ReadonlySet<Id> | null
}

const DASH = { plein: undefined, tirets: '7 5', points: '1.5 4' } as const

/**
 * La carte en SVG : limites, branches, sujets, puis relations par-dessus. Ce qui se clique porte `data-sujet`,
 * `data-relation`, `data-limite` ou `data-repli` : un clic se résout par le DOM, comme sur la toile. Les mêmes traits
 * servent à l'aperçu sur la toile et à la carte ouverte en grand. Les couleurs viennent du thème de la carte.
 */
export const Dessin = memo(function Dessin({ arbre, lecture: l, disposition: d, mesures, selection, edition, adresse, devoiles }: Props) {
  const vu = (id: Id) => !devoiles || devoiles.has(id)
  const theme = themeDe(arbre.theme)
  const uneCouleur = !!arbre.options?.uneCouleur
  const encre = theme.encre ?? 'var(--notak-arbre-encre)'
  const couleur = (id: Id) => couleurDe(l, id, theme, uneCouleur)
  const cotes = new Map(d.liens.map((x) => [x.vers, x.cote]))
  const habits = new Map([...d.boites.keys()].map((id) => [id, habitDe(l, id, theme)]))
  // Stable d'un rendu à l'autre : sans quoi chaque sujet se redessinerait à chaque changement de sélection.
  const perso = useMemo(
    () => (m: string) => {
      const x = marqueurPerso(arbre, m)
      return x ? adresse?.(x.fichier) : undefined
    },
    [arbre.groupes, adresse],
  )
  return (
    <>
      {zonesValides(arbre).map(([id, z]) => (
        <CadreZone key={id} id={id} zone={z} encre={encre} choisie={selection?.has(id) ?? false} enEdition={edition === id} />
      ))}
      {limitesValides(arbre, l).filter(([, x]) => vu(x.de)).map(([id, x]) => (
        <CadreLimite key={id} id={id} limite={x} lecture={l} disposition={d} couleur={couleur(x.de) ?? encre} choisi={selection?.has(id) ?? false} enEdition={edition === id} />
      ))}
      <g className="notak-arbre-branches" fill="none" strokeLinecap="round">
        {d.liens.map((lien) => {
          const p = d.boites.get(lien.de)
          const e = d.boites.get(lien.vers)
          if (!p || !e || lien.forme === 'aucune' || !vu(lien.vers)) return null
          const style = brancheDe(l, lien.de)
          // La forme d'une branche : la sienne, sinon celle du thème là où la structure laisse le choix (carte, logique).
          const forme = style.forme ?? (lien.forme === 'courbe' ? theme.branche : lien.forme)
          if (forme === 'aucune') return null
          const epaisseur = style.epaisseur ?? (lien.de === l.central ? 2.5 : 1.75)
          const s = { parent: souligne(habits.get(lien.de)!.forme), enfant: souligne(habits.get(lien.vers)!.forme) }
          const trait = couleur(lien.vers) ?? encre
          const effile = style.effilee ? cheminEffile(p, e, lien.cote, forme, s, epaisseur * 2.4, epaisseur * 0.6) : null
          if (effile) return <path key={lien.vers} d={effile} fill={trait} stroke="none" />
          return <path key={lien.vers} d={cheminBranche(p, e, lien.cote, forme, s)} stroke={trait} strokeWidth={epaisseur} strokeDasharray={DASH[style.motif]} />
        })}
        {d.traits.map((trait, i) => (
          vu(trait.de) && <path key={`t${i}`} d={trait.d} stroke={couleur(trait.de) ?? encre} strokeWidth={trait.de === l.central ? 2.5 : 1.75} />
        ))}
      </g>
      {[...d.boites].map(([id, b]) => {
        const m = mesures.get(id)
        const s = l.sujets.get(id)
        if (!m || !s || !vu(id)) return null
        return (
          <Sujet
            key={id}
            id={id}
            sujet={s}
            rang={rangDe(l, id)}
            habit={habits.get(id)!}
            theme={theme}
            boite={b}
            mesure={m}
            numero={numeroDe(l, id)}
            couleur={couleur(id)}
            choisi={selection?.has(id) ?? false}
            enEdition={edition === id}
            replie={s.replie ? enfantsCaches(l, id) : 0}
            versLaGauche={cotes.get(id) === 'gauche'}
            image={s.image ? adresse?.(s.image.fichier) : undefined}
            perso={perso}
          />
        )
      })}
      {relationsValides(arbre, l).filter(([, r]) => vu(r.de) && vu(r.vers)).map(([id, r]) => {
        const [a, b] = [d.boites.get(r.de), d.boites.get(r.vers)]
        return a && b ? <Fleche key={id} id={id} relation={r} courbe={courbeRelation(a, b, r.controles, r.forme)} encre={encre} choisie={selection?.has(id) ?? false} enEdition={edition === id} /> : null
      })}
      {arbre.legende?.visible && <Legende arbre={arbre} lecture={l} disposition={d} perso={perso} />}
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

/** Le contour d'une forme de sujet, dans un cadre de `l` × `h`. */
function contour(forme: FormeSujet, l: number, h: number): string | null {
  const f = (v: number) => Math.round(v * 10) / 10
  switch (forme) {
    case 'rectangle':
      return `M0 0H${f(l)}V${f(h)}H0Z`
    case 'arrondi': {
      const r = Math.min(8, h / 2)
      return `M${r} 0H${f(l - r)}Q${f(l)} 0 ${f(l)} ${r}V${f(h - r)}Q${f(l)} ${f(h)} ${f(l - r)} ${f(h)}H${r}Q0 ${f(h)} 0 ${f(h - r)}V${r}Q0 0 ${r} 0Z`
    }
    case 'capsule': {
      const r = h / 2
      return `M${f(r)} 0H${f(l - r)}A${f(r)} ${f(r)} 0 0 1 ${f(l - r)} ${f(h)}H${f(r)}A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0Z`
    }
    case 'ellipse':
      return `M0 ${f(h / 2)}A${f(l / 2)} ${f(h / 2)} 0 1 0 ${f(l)} ${f(h / 2)}A${f(l / 2)} ${f(h / 2)} 0 1 0 0 ${f(h / 2)}Z`
    case 'losange':
      return `M${f(l / 2)} 0L${f(l)} ${f(h / 2)}L${f(l / 2)} ${f(h)}L0 ${f(h / 2)}Z`
    case 'hexagone': {
      const k = Math.min(14, l / 4)
      return `M${f(k)} 0H${f(l - k)}L${f(l)} ${f(h / 2)}L${f(l - k)} ${f(h)}H${f(k)}L0 ${f(h / 2)}Z`
    }
    case 'parallelogramme': {
      const k = Math.min(10, l / 5)
      return `M${f(k)} 0H${f(l)}L${f(l - k)} ${f(h)}H0Z`
    }
    default:
      return null
  }
}

interface PropsSujet {
  id: Id
  sujet: DonneesSujet
  rang: Rang
  habit: Habit
  theme: Theme
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
  /** L'adresse de l'image d'un marqueur à soi. */
  perso: (marqueur: string) => string | undefined
}

const Sujet = memo(function Sujet({ id, sujet: s, rang, habit: h, theme, boite: b, mesure: m, numero, couleur, choisi, enEdition, replie, versLaGauche, image, perso }: PropsSujet) {
  const encreTheme = theme.encre ?? 'var(--notak-arbre-encre)'
  const fondTheme = theme.fond ?? 'var(--notak-arbre-fond)'
  const teinte = (s.classe === 'important' || s.classe === 'secondaire' ? CLASSES[s.classe] : null) ?? couleur ?? encreTheme
  // Le remplissage : celui du style, sinon celui du rang (le central, un principal plein de sa couleur).
  const fond =
    h.remplissage ??
    (rang === 'central' ? 'var(--notak-arbre-central)' : h.plein ? teinte : rang === 'flottant' ? (theme.fond ? fondTheme : 'var(--notak-arbre-flottant)') : rang === 'principal' ? fondTheme : 'none')
  const plein = h.remplissage !== undefined || rang === 'central' || h.plein
  const encre = h.couleurTexte ?? (plein ? (rang === 'central' && !h.remplissage ? 'var(--notak-arbre-sur-plein)' : sur(fond)) : s.classe === 'secondaire' ? CLASSES.secondaire : (theme.texte ?? 'var(--notak-arbre-texte)'))
  const bordure = h.bordure ?? (rang === 'flottant' || (rang === 'principal' && !h.plein) ? teinte : 'none')
  const pas = h.police * INTERLIGNE
  let x = m.rangee.x
  const yIcone = m.rangee.y + m.rangee.h / 2 - TAILLE_ICONE / 2
  const devant: React.ReactNode[] = []
  if (s.tache) {
    devant.push(<CaseTache key="tache" x={x} y={yIcone} etat={s.tache} id={id} />)
    x += PAS_ICONE
  }
  for (const mq of s.marqueurs ?? []) {
    devant.push(
      <g key={mq} transform={`translate(${x} ${yIcone})`} data-marqueur={`${mq}:${id}`}>
        <Marqueur id={mq} perso={perso} />
      </g>,
    )
    x += PAS_ICONE
  }
  const icones = [s.note ? 'notes' : null, s.lien ? 'lien' : null, s.piece ? 'piece' : null].filter((v): v is 'notes' | 'lien' | 'piece' => !!v)
  const eq = s.equation ? equation(s.equation) : null
  const xIcones = m.texte.x + m.texte.l + 4
  const chemin = contour(h.forme, m.l, m.h)
  return (
    <g className="notak-arbre-sujet" data-sujet={id} data-rang={rang} transform={`translate(${b.x} ${b.y})`}>
      <rect width={m.l} height={m.h} fill="transparent" />
      {chemin && <path d={chemin} fill={fond} stroke={bordure} strokeWidth={h.epaisseurBordure ?? 1.5} />}
      {souligne(h.forme) && <line x1={0} x2={m.l} y1={m.h} y2={m.h} stroke={teinte} strokeWidth={1.75} strokeLinecap="round" />}
      {h.forme === 'double-souligne' && <line x1={0} x2={m.l} y1={m.h - 4} y2={m.h - 4} stroke={teinte} strokeWidth={1.25} strokeLinecap="round" />}
      {choisi && <rect className="notak-arbre-choix" x={-4} y={-4} width={m.l + 8} height={m.h + 8} rx={10} fill="none" />}
      {image && m.image && s.image && <image href={image} x={m.image.x} y={m.image.y} width={s.image.l} height={s.image.h} preserveAspectRatio="xMidYMid slice" data-image={id} />}
      {m.image && s.vignette && (
        <g transform={`translate(${m.image.x} ${m.image.y})`} data-image={id}>
          {s.vignette.genre === 'autocollant' ? <Autocollant emoji={s.vignette.id} l={s.vignette.l} h={s.vignette.h} /> : <DessinIllustration id={s.vignette.id} l={s.vignette.l} h={s.vignette.h} />}
        </g>
      )}
      {m.equation && s.equation && eq && (
        <foreignObject x={m.equation.x} y={m.equation.y} width={eq.l} height={eq.h} data-equation={id} style={{ overflow: 'visible' }}>
          {eq.html ? (
            <div style={{ color: encre, font: '16px Inter, system-ui, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: eq.html }} />
          ) : (
            <div style={{ color: '#e5534b', font: '12px ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap' }}>{s.equation}</div>
          )}
        </foreignObject>
      )}
      {devant}
      {!enEdition && (
        <text fill={encre} fontFamily={h.famille} fontSize={h.police} fontWeight={h.graisse} fontStyle={h.italique ? 'italic' : undefined} textDecoration={s.classe === 'barre' ? 'line-through' : undefined}>
          {m.lignes.map((ligne, i) => (
            <tspan key={i} x={m.texte.x + m.texte.l / 2} y={m.texte.y + pas * i + h.police * 0.98} textAnchor="middle">
              {i === 0 && numero ? `${numero} ` : ''}
              {ligne}
            </tspan>
          ))}
        </text>
      )}
      {icones.map((nom, i) => (
        <g key={nom} transform={`translate(${xIcones + i * PAS_ICONE} ${yIcone})`} style={{ color: plein ? encre : encreTheme }} data-icone={`${nom}:${id}`}>
          <Icone nom={nom === 'piece' ? (s.piece?.audio ? 'micro' : 'trombone') : nom} taille={TAILLE_ICONE} trait={1.75} />
        </g>
      ))}
      {m.etiquettes && <Etiquettes noms={s.etiquettes ?? []} largeurs={m.etiquettes.largeurs} y={m.etiquettes.y} l={m.l} id={id} />}
      {m.planning && s.planning && <Planification planning={s.planning} y={m.planning.y} l={m.planning.l} largeur={m.l} id={id} />}
      {replie > 0 && (
        <g className="notak-arbre-repli" data-repli={id} transform={`translate(${versLaGauche ? -14 : m.l + 14} ${m.h / 2})`}>
          <circle r={9} fill={fondTheme} stroke={teinte} strokeWidth={1.5} />
          <text fontFamily={POLICE} fontSize={10} fontWeight={600} textAnchor="middle" y={3.5} fill={teinte}>
            {replie > 99 ? '99+' : replie}
          </text>
        </g>
      )}
    </g>
  )
})

/** Une encre lisible sur ce fond : blanche sur un fond soutenu, presque noire sur un fond clair. Une variable CSS : blanche. */
function sur(fond: string): string {
  const m = fond.match(/^#([0-9a-f]{6})$/i)
  if (!m) return '#ffffff'
  const v = parseInt(m[1]!, 16)
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return lum > 0.4 ? '#1f2328' : '#ffffff'
}

/** La case d'une tâche, devant le titre ; un clic la coche (`data-tache`). */
function CaseTache({ x, y, etat, id }: { x: number; y: number; etat: 'a-faire' | 'faite' | 'annulee'; id: Id }) {
  const faite = etat === 'faite'
  return (
    <g transform={`translate(${x} ${y})`} data-tache={id} className="notak-arbre-tache">
      <rect x={1} y={1} width={TAILLE_ICONE - 2} height={TAILLE_ICONE - 2} rx={3} fill={faite ? '#3fa66b' : 'var(--notak-arbre-fond)'} stroke={faite ? '#3fa66b' : etat === 'annulee' ? 'var(--notak-arbre-discret, #8c939d)' : 'var(--notak-arbre-encre)'} strokeWidth={1.5} />
      {faite && <path d="M4.5 8.2l2.4 2.4l4.6-4.8" stroke="#fff" strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {etat === 'annulee' && <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="#8c939d" strokeWidth={1.5} fill="none" strokeLinecap="round" />}
    </g>
  )
}

function Etiquettes({ noms, largeurs, y, l, id }: { noms: readonly string[]; largeurs: number[]; y: number; l: number; id: Id }) {
  const total = largeurs.reduce((s, x, i) => s + x + (i > 0 ? 4 : 0), 0)
  let x = l / 2 - total / 2
  return (
    <g className="notak-arbre-etiquettes">
      {noms.map((nom, i) => {
        const lx = largeurs[i] ?? 0
        const g = (
          <g key={i} transform={`translate(${x} ${y})`} data-etiquette={`${i}:${id}`}>
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
function CadreLimite({ id, limite, lecture, disposition: d, couleur, choisi, enEdition }: { id: Id; limite: Limite; lecture: Lecture; disposition: Disposition; couleur: string; choisi: boolean; enEdition: boolean }) {
  const boites = sujetsDePlage(lecture, limite).map((x) => d.boites.get(x)).filter((b): b is Boite => !!b)
  if (boites.length === 0) return null
  const [x0, y0] = [Math.min(...boites.map((b) => b.x)) - 10, Math.min(...boites.map((b) => b.y)) - 10]
  const [x1, y1] = [Math.max(...boites.map((b) => b.x + b.l)) + 10, Math.max(...boites.map((b) => b.y + b.h)) + 10]
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

/** Une relation : une courbe en pointillés, ses pointes, son titre au milieu. */
function Fleche({ id, relation, courbe: c, encre, choisie, enEdition }: { id: Id; relation: Relation; courbe: Courbe; encre: string; choisie: boolean; enEdition: boolean }) {
  const teinte = choisie ? 'var(--notak-arbre-choix)' : encre
  const pointes = { depart: false, arrivee: true, ...relation.pointes }
  return (
    <g className="notak-arbre-relation" data-relation={id}>
      <path d={c.chemin} fill="none" stroke="transparent" strokeWidth={12} />
      <path d={c.chemin} fill="none" stroke={teinte} strokeWidth={choisie ? 2 : 1.5} strokeDasharray="5 4" />
      {pointes.arrivee && <path d={c.pointe} fill={teinte} />}
      {pointes.depart && <path d={c.pointeDepart} fill={teinte} />}
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

/**
 * Une zone : un cadre libre sous la carte, son titre dans un bandeau en haut. Seuls le bandeau et le contour se
 * cliquent : le dedans reste à la carte (on y tire la vue, on y double-clique pour un sujet flottant).
 */
function CadreZone({ id, zone: z, encre, choisie, enEdition }: { id: Id; zone: Zone; encre: string; choisie: boolean; enEdition: boolean }) {
  const teinte = z.couleur ?? encre
  return (
    <g className="notak-arbre-zone" data-zone={id}>
      <rect x={z.x} y={z.y} width={z.l} height={z.h} rx={14} fill={teinte} fillOpacity={0.06} stroke={choisie ? 'var(--notak-arbre-choix)' : teinte} strokeOpacity={choisie ? 1 : 0.5} strokeWidth={choisie ? 2.5 : 1.5} pointerEvents="none" />
      <rect x={z.x} y={z.y} width={z.l} height={30} fill="transparent" pointerEvents="all" />
      <rect x={z.x} y={z.y} width={z.l} height={z.h} rx={14} fill="none" stroke="transparent" strokeWidth={12} pointerEvents="stroke" />
      {z.titre && !enEdition && (
        <text x={z.x + 16} y={z.y + 21} fontFamily={POLICE} fontSize={13} fontWeight={600} fill={teinte} pointerEvents="none">
          {z.titre}
        </text>
      )}
    </g>
  )
}

/** La tâche planifiée d'un sujet : un camembert d'avancement, puis les dates et la durée. */
function Planification({ planning: p, y, l, largeur, id }: { planning: Planning; y: number; l: number; largeur: number; id: Id }) {
  const part = Math.max(0, Math.min(1, (p.progression ?? 0) / 100))
  const r = DISQUE_PLANNING / 2
  return (
    <g transform={`translate(${largeur / 2 - l / 2} ${y})`} data-planning={id}>
      <rect width={l} height={HAUTEUR_ETIQUETTE} rx={HAUTEUR_ETIQUETTE / 2} fill="var(--notak-arbre-etiquette)" />
      <g transform={`translate(7 ${HAUTEUR_ETIQUETTE / 2 - r})`}>
        <circle cx={r} cy={r} r={r - 0.5} fill="none" stroke="#3a86d4" strokeWidth={1.25} />
        {part >= 1 ? <circle cx={r} cy={r} r={r - 0.5} fill="#3fa66b" /> : part > 0 && <path d={secteurPlanning(r, r - 1.5, part)} fill="#3a86d4" />}
      </g>
      <text x={7 + DISQUE_PLANNING + 5} y={HAUTEUR_ETIQUETTE / 2 + POLICE_PLANNING * 0.36} fontFamily={POLICE} fontSize={POLICE_PLANNING} fontWeight={500} fill="var(--notak-arbre-texte)">
        {resumePlanning(p)}
      </text>
    </g>
  )
}

function secteurPlanning(c: number, r: number, f: number): string {
  const angle = f * 2 * Math.PI
  const [x, y] = [c + r * Math.sin(angle), c - r * Math.cos(angle)]
  return `M${c} ${c}V${c - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`
}

/** La légende : les marqueurs que la carte porte, chacun avec ce qu'il veut dire, dans un cadre à droite de la carte. */
function Legende({ arbre, lecture, disposition, perso }: { arbre: Arbre; lecture: Lecture; disposition: Disposition; perso: (m: string) => string | undefined }) {
  const marqueurs = marqueursUtilises(arbre, lecture)
  if (marqueurs.length === 0) return null
  const boites = [...disposition.boites.values()]
  const droite = Math.max(...boites.map((b) => b.x + b.l), 0)
  const haut = Math.min(...boites.map((b) => b.y), 0)
  const textes = arbre.legende?.textes ?? {}
  const pas = TAILLE_MARQUEUR + 10
  const l = Math.min(280, Math.max(120, ...marqueurs.map((m) => 48 + (textes[m]?.length ?? 4) * 7)))
  return (
    <g className="notak-arbre-legende" transform={`translate(${droite + 48} ${haut})`} data-legende="">
      <rect width={l} height={marqueurs.length * pas + 20} rx={10} fill="var(--notak-arbre-fond)" stroke="var(--notak-arbre-encre)" strokeOpacity={0.35} />
      {marqueurs.map((m, i) => (
        <g key={m} transform={`translate(12 ${12 + i * pas})`}>
          <Marqueur id={m} perso={perso} />
          <text x={TAILLE_MARQUEUR + 8} y={TAILLE_MARQUEUR - 3.5} fontFamily={POLICE} fontSize={12} fill={textes[m] ? 'var(--notak-arbre-texte)' : 'var(--notak-arbre-encre)'} fillOpacity={textes[m] ? 1 : 0.5}>
            {textes[m] ?? '…'}
          </text>
        </g>
      ))}
    </g>
  )
}
