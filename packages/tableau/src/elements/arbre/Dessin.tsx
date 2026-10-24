import { memo, useMemo } from 'react'
import type { Arbre, Id, Limite, Relation, Sujet as DonneesSujet, Zone } from '../../coeur/tableau'
import { Icone } from '../../icones'
import {
  type Habit,
  DISQUE_PLANNING,
  HAUTEUR_ETIQUETTE,
  INTERLIGNE,
  PAS_ICONE,
  POLICE,
  POLICE_ETIQUETTE,
  POLICE_NOTE,
  POLICE_PLANNING,
  TAILLE_ICONE,
  type Mesure,
  type Rang,
  appliquerCasse,
  brancheDe,
  couleurDe,
  couleursDe,
  epaisseurSouligne,
  habitDe,
  limiteEffective,
  mainLevee,
  rangDe,
  relationEffective,
  resumeEffectif,
  separerAlpha,
  souligne,
  tiretsDe,
} from './apparence'
import type { Boite, Disposition } from './disposition'
import { contourForme, contourLimite } from './formes'
import { Autocollant, DessinIllustration } from './catalogue'
import { equation } from './equation'
import { Marqueur, TAILLE_MARQUEUR } from './marqueurs'
import { limitesValides, numeroDe, relationsValides, sujetsDePlage } from './modele/elements'
import { type Planning, marqueurPerso, marqueursUtilises, resumePlanning, zonesValides } from './modele/insertions'
import { type Lecture, enfantsDe } from './modele/sujets'
import { type Theme, themeDeArbre } from './themes'
import { cheminBranche, cheminEffile, extremites } from './trace/branches'
import { cheminPointe } from './trace/pointes'
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
  /** Les sujets mis en évidence (les repères cochés du panneau de gauche) : les autres s'estompent. */
  surlignes?: ReadonlySet<Id> | null
}

/** Le filtre qui fait trembler un trait : la main levée. Une seule définition pour toute la carte. */
const MAIN = 'notak-arbre-main'

/** Les hachures d'un remplissage : l'angle des traits, et leur écart. */
const HACHURES = { diagonales: { angle: 45, pas: 6 }, 'diagonales-fines': { angle: 45, pas: 3.5 }, horizontales: { angle: 90, pas: 6 }, 'horizontales-fines': { angle: 90, pas: 3.5 } } as const

/** Ce qu'on dessine à main levée tremble ; la boîte (invisible) donne au filtre une surface, même sous un trait droit. */
function Tremble({ actif, boite, children }: { actif: boolean; boite: readonly [number, number, number, number]; children: React.ReactNode }) {
  if (!actif) return <>{children}</>
  const [x0, y0, x1, y1] = boite
  return (
    <g filter={`url(#${MAIN})`}>
      <rect x={x0 - 8} y={y0 - 8} width={x1 - x0 + 16} height={y1 - y0 + 16} fill="none" stroke="none" />
      {children}
    </g>
  )
}

/**
 * La carte en SVG : limites, branches, sujets, puis relations par-dessus. Ce qui se clique porte `data-sujet`,
 * `data-relation`, `data-limite` ou `data-repli` : un clic se résout par le DOM, comme sur la toile. Les mêmes traits
 * servent à l'aperçu sur la toile et à la carte ouverte en grand. Les couleurs viennent du thème de la carte.
 */
export const Dessin = memo(function Dessin({ arbre, lecture: l, disposition: d, mesures, selection, edition, adresse, devoiles, surlignes }: Props) {
  const vu = (id: Id) => !devoiles || devoiles.has(id)
  const theme = useMemo(() => themeDeArbre(arbre), [arbre.theme, arbre.themePerso, arbre.police, arbre.policeCjk, arbre.jeuCouleurs, arbre.options?.flottantsColores])
  const uneCouleur = !!arbre.options?.uneCouleur
  const compacte = !!arbre.options?.compacte
  const encre = theme.encre ?? 'var(--notak-arbre-encre)'
  const globales = { largeur: arbre.largeurBranche, effilee: arbre.effile }
  const couleur = (id: Id) => couleurDe(l, id, theme, uneCouleur, { ligne: arbre.couleurLigne, flottants: !!arbre.options?.flottantsColores })
  const cotes = new Map(d.liens.map((x) => [x.vers, x.cote]))
  const habits = new Map([...d.boites.keys()].map((id) => [id, habitDe(l, id, theme, compacte)]))
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
      <defs>
        <filter id={MAIN} filterUnits="objectBoundingBox" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="bruit" />
          <feDisplacementMap in="SourceGraphic" in2="bruit" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
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
          const style = brancheDe(l, lien.de, globales, theme)
          // La forme d'une branche : la sienne, sinon celle du thème là où la structure laisse le choix (carte, logique).
          const forme = style.forme ?? (lien.forme === 'courbe' ? theme.branche : lien.forme)
          const epaisseur = style.epaisseur ?? (lien.de === l.central ? 2.5 : 1.75)
          // « Aucun » : un motif nul, ou une épaisseur nulle, ne laisse pas de trait.
          if (forme === 'aucune' || style.motif === 'aucun' || epaisseur <= 0) return null
          // Un sujet souligné : l'épaisseur de son trait (la branche suit son axe) ; le central : ses coudes sortent de dessous.
          const soulignement = (id: Id) => (souligne(habits.get(id)!.forme) ? epaisseurSouligne(habits.get(id)!) : 0)
          const s = { parent: soulignement(lien.de), enfant: soulignement(lien.vers), centre: lien.de === l.central }
          const trait = couleur(lien.vers) ?? encre
          const effile = style.effilee ? cheminEffile(p, e, lien.cote, forme, s, epaisseur * 2.4, epaisseur * 0.6) : null
          const [[ax, ay], [bx, by]] = extremites(p, e, lien.cote, s)
          const pointe = cheminPointe(style.pointe, bx, by, { droite: 0, gauche: Math.PI, bas: Math.PI / 2, haut: -Math.PI / 2 }[lien.cote], Math.max(8, epaisseur * 4.5))
          return (
            <Tremble key={lien.vers} actif={mainLevee(style.motif)} boite={[Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]}>
              {effile ? <path d={effile} fill={trait} stroke="none" /> : <path d={cheminBranche(p, e, lien.cote, forme, s)} stroke={trait} strokeWidth={epaisseur} strokeDasharray={tiretsDe(style.motif)} />}
              {pointe && <path d={pointe.d} fill={pointe.plein ? trait : 'none'} stroke={trait} strokeWidth={pointe.plein ? 1 : Math.max(1.5, epaisseur)} strokeLinejoin="round" />}
            </Tremble>
          )
        })}
        {d.traits.map((trait, i) => {
          if (!vu(trait.de)) return null
          if (trait.resume) {
            const r = resumeEffectif(arbre.resumes?.[trait.resume])
            return r.motif === 'aucun' || r.epaisseur <= 0 ? null : (
              <Tremble key={`t${i}`} actif={mainLevee(r.motif)} boite={boiteDe(trait.d)}>
                <path d={trait.d} stroke={r.couleur ?? couleur(trait.de) ?? encre} strokeWidth={r.epaisseur} strokeDasharray={tiretsDe(r.motif)} />
              </Tremble>
            )
          }
          return <path key={`t${i}`} d={trait.d} stroke={couleur(trait.de) ?? encre} strokeWidth={trait.de === l.central ? 2.5 : 1.75} />
        })}
      </g>
      {[...d.boites].map(([id, b]) => {
        const m = mesures.get(id)
        const s = l.sujets.get(id)
        if (!m || !s || !vu(id)) return null
        return (
          <g key={id} opacity={surlignes && !surlignes.has(id) ? 0.2 : undefined}>
          <Sujet
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
          </g>
        )
      })}
      {relationsValides(arbre, l).filter(([, r]) => vu(r.de) && vu(r.vers)).map(([id, r]) => {
        const [a, b] = [d.boites.get(r.de), d.boites.get(r.vers)]
        return a && b ? <Fleche key={id} id={id} relation={r} courbe={courbeRelation(a, b, r.controles, relationEffective(r).forme)} encre={arbre.options?.relationsColorees ? (couleur(r.vers) ?? encre) : encre} choisie={selection?.has(id) ?? false} enEdition={edition === id} /> : null
      })}
      {arbre.legende?.visible && <Legende arbre={arbre} lecture={l} disposition={d} perso={perso} />}
    </>
  )
})

/** Le rectangle qui contient un chemin en commandes absolues (M L H V Q C A) : de quoi donner une surface au filtre de la main levée. */
function boiteDe(d: string): [number, number, number, number] {
  const pts: [number, number][] = []
  let [x, y] = [0, 0]
  for (const [, cmd, args] of d.matchAll(/([MLHVQCAZ])([^MLHVQCAZ]*)/g)) {
    const v = (args!.match(/-?\d+\.?\d*/g) ?? []).map(Number)
    if (cmd === 'H') x = v.at(-1) ?? x
    else if (cmd === 'V') y = v.at(-1) ?? y
    else if (v.length >= 2) {
      for (let i = 0; i + 1 < v.length; i += 2) if (cmd !== 'A' || i + 2 >= v.length - 1) pts.push([v[i]!, v[i + 1]!])
      ;[x, y] = [v.at(-2)!, v.at(-1)!]
    }
    pts.push([x, y])
  }
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

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
  const { teinte, fond, plein, encre, bordure } = couleursDe(h, rang, theme, s.classe, couleur)
  const motifR = h.motifRemplissage ?? 'plein'
  const hachure = fond !== 'none' && motifR in HACHURES ? HACHURES[motifR as keyof typeof HACHURES] : null
  const { couleur: fondC, opacite: fondO } = separerAlpha(fond)
  const epaisseur = h.epaisseurBordure ?? 1.5
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
  const icones = [s.note && !m.note ? 'notes' : null, s.lien ? 'lien' : null, s.piece ? 'piece' : null].filter((v): v is 'notes' | 'lien' | 'piece' => !!v)
  const eq = s.equation ? equation(s.equation) : null
  const xIcones = m.texte.x + m.texte.l + 4
  const { d: chemin, trait } = contourForme(h.forme, m.l, m.h)
  const trembler = mainLevee(h.motifBordure) || motifR === 'plein-main'
  const ancre = h.alignement === 'gauche' ? 'start' : h.alignement === 'droite' ? 'end' : 'middle'
  const xTexte = h.alignement === 'gauche' ? m.texte.x : h.alignement === 'droite' ? m.texte.x + m.texte.l : m.texte.x + m.texte.l / 2
  const decoration = [s.classe === 'barre' || h.barre ? 'line-through' : '', h.souligne ? 'underline' : ''].filter(Boolean).join(' ')
  const traitSouligne = bordure !== 'none' ? bordure : teinte
  return (
    <g className="notak-arbre-sujet" data-sujet={id} data-rang={rang} transform={`translate(${b.x} ${b.y})`}>
      <rect width={m.l} height={m.h} fill="transparent" />
      <Tremble actif={trembler} boite={[0, 0, m.l, m.h]}>
        {hachure && fond !== 'none' && (
          <defs>
            <pattern id={`notak-hachure-${id}`} patternUnits="userSpaceOnUse" width={hachure.pas} height={hachure.pas} patternTransform={`rotate(${hachure.angle})`}>
              <line x1={0} y1={0} x2={0} y2={hachure.pas} stroke={fondC} strokeOpacity={fondO} strokeWidth={1.3} />
            </pattern>
          </defs>
        )}
        {chemin && <path d={chemin} fill={hachure ? `url(#notak-hachure-${id})` : fondC} fillOpacity={hachure ? undefined : fondO} stroke={trait ? 'none' : bordure} strokeWidth={epaisseur} strokeDasharray={tiretsDe(h.motifBordure)} fillRule="evenodd" />}
        {trait && <path d={trait} fill="none" stroke={traitSouligne} strokeWidth={Math.max(1.25, epaisseur)} strokeLinecap="round" strokeLinejoin="round" />}
        {souligne(h.forme) && <line x1={0} x2={m.l} y1={m.h - epaisseurSouligne(h) / 2} y2={m.h - epaisseurSouligne(h) / 2} stroke={traitSouligne} strokeWidth={epaisseurSouligne(h)} strokeLinecap="butt" strokeDasharray={tiretsDe(h.motifBordure)} />}
        {h.forme === 'double-souligne' && <line x1={0} x2={m.l} y1={m.h - epaisseurSouligne(h) - 4} y2={m.h - epaisseurSouligne(h) - 4} stroke={traitSouligne} strokeWidth={1.25} strokeLinecap="butt" strokeDasharray={tiretsDe(h.motifBordure)} />}
      </Tremble>
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
        <text fill={encre} fontFamily={h.famille} fontSize={h.police} fontWeight={h.graisse} fontStyle={h.italique ? 'italic' : undefined} textDecoration={decoration || undefined}>
          {m.lignes.map((ligne, i) => (
            <tspan key={i} x={xTexte} y={m.texte.y + pas * i + h.police * 0.98} textAnchor={ancre}>
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
      {m.note && (
        <g data-icone={`notes:${id}`} className="notak-arbre-note-bloc" style={{ color: plein ? encre : encreTheme }}>
          {m.note.lignes.map((ligne, i) => (
            <text key={i} x={m.l / 2} y={m.note!.y + POLICE_NOTE * INTERLIGNE * (i + 0.8)} textAnchor="middle" fontFamily={h.famille} fontSize={POLICE_NOTE} fill="currentColor" fillOpacity={0.7}>
              {ligne}
            </text>
          ))}
        </g>
      )}
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

/** Le texte d'une relation ou d'une limite : sa police, sa taille, sa graisse, ses décorations. */
function propsTexte(t: ReturnType<typeof relationEffective>['texte']) {
  const decoration = [t.barre ? 'line-through' : '', t.souligne ? 'underline' : ''].filter(Boolean).join(' ')
  return {
    fontFamily: t.police ?? POLICE,
    fontSize: t.taille,
    fontWeight: t.graisse,
    fontStyle: t.italique ? ('italic' as const) : undefined,
    textDecoration: decoration || undefined,
  }
}

/** Une limite : un cadre autour des branches de sa plage (sa forme, son remplissage, son contour), et son titre en tête. */
function CadreLimite({ id, limite, lecture, disposition: d, couleur, choisi, enEdition }: { id: Id; limite: Limite; lecture: Lecture; disposition: Disposition; couleur: string; choisi: boolean; enEdition: boolean }) {
  const boites = sujetsDePlage(lecture, limite).map((x) => d.boites.get(x)).filter((b): b is Boite => !!b)
  if (boites.length === 0) return null
  const [x0, y0] = [Math.min(...boites.map((b) => b.x)) - 10, Math.min(...boites.map((b) => b.y)) - 10]
  const [x1, y1] = [Math.max(...boites.map((b) => b.x + b.l)) + 10, Math.max(...boites.map((b) => b.y + b.h)) + 10]
  const v = limiteEffective(limite)
  const trait = v.couleur ?? couleur
  const { d: contour, equerres } = contourLimite(v.forme, x0, y0, x1 - x0, y1 - y0)
  // Le remplissage : celui du style, sinon la couleur de la branche, très pâle.
  const fondBrut = v.remplissage ?? couleur
  const { couleur: fondC, opacite } = separerAlpha(fondBrut)
  const fondO = v.remplissage ? opacite : 0.07
  const hachure = v.motifRemplissage in HACHURES ? HACHURES[v.motifRemplissage as keyof typeof HACHURES] : null
  const sansFond = v.motifRemplissage === 'aucun'
  const sansTrait = v.motif === 'aucun' || v.epaisseur <= 0
  const t = v.texte
  const x = t.alignement === 'centre' ? (x0 + x1) / 2 : t.alignement === 'droite' ? x1 - 10 : x0 + 10
  return (
    <g className="notak-arbre-limite" data-limite={id}>
      <Tremble actif={mainLevee(v.motif) || v.motifRemplissage === 'plein-main'} boite={[x0, y0, x1, y1]}>
        {hachure && (
          <defs>
            <pattern id={`notak-hachure-${id}`} patternUnits="userSpaceOnUse" width={hachure.pas} height={hachure.pas} patternTransform={`rotate(${hachure.angle})`}>
              <line x1={0} y1={0} x2={0} y2={hachure.pas} stroke={fondC} strokeOpacity={Math.max(fondO, 0.35)} strokeWidth={1.3} />
            </pattern>
          </defs>
        )}
        <path
          d={contour}
          fill={sansFond ? 'none' : hachure ? `url(#notak-hachure-${id})` : fondC}
          fillOpacity={sansFond || hachure ? undefined : fondO}
          stroke={sansTrait ? 'none' : trait}
          strokeWidth={choisi ? v.epaisseur + 1 : v.epaisseur}
          strokeDasharray={tiretsDe(v.motif)}
          strokeLinejoin="round"
        />
        {equerres && !sansTrait && <path d={equerres} fill="none" stroke={trait} strokeWidth={v.epaisseur + 1.5} strokeLinecap="round" />}
      </Tremble>
      {limite.titre && !enEdition && (
        <text x={x} y={y0 - 6} textAnchor={t.alignement === 'centre' ? 'middle' : t.alignement === 'droite' ? 'end' : 'start'} {...propsTexte(t)} fill={t.couleurTexte ?? trait}>
          {appliquerCasse(limite.titre, t.casse)}
        </text>
      )}
    </g>
  )
}

/** Une relation : son trait (forme, motif, épaisseur, couleur), ses pointes, son titre au milieu. */
function Fleche({ id, relation, courbe: c, encre, choisie, enEdition }: { id: Id; relation: Relation; courbe: Courbe; encre: string; choisie: boolean; enEdition: boolean }) {
  const v = relationEffective(relation)
  const teinte = choisie ? 'var(--notak-arbre-choix)' : (v.couleur ?? encre)
  const taille = Math.max(9, v.epaisseur * 4.5)
  const [fin, debut] = [cheminPointe(v.pointeArrivee, c.arrivee.x, c.arrivee.y, c.angles.arrivee, taille), cheminPointe(v.pointeDepart, c.depart.x, c.depart.y, c.angles.depart, taille)]
  const pts = [c.depart, c.arrivee, ...c.controles]
  const epaisseur = choisie ? v.epaisseur + 0.5 : v.epaisseur
  const t = v.texte
  const aucun = v.motif === 'aucun' || v.epaisseur <= 0
  return (
    <g className="notak-arbre-relation" data-relation={id}>
      <path d={c.chemin} fill="none" stroke="transparent" strokeWidth={12} />
      <Tremble actif={mainLevee(v.motif)} boite={[Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))]}>
        {!aucun && <path d={c.chemin} fill="none" stroke={teinte} strokeWidth={epaisseur} strokeDasharray={tiretsDe(v.motif) ?? (v.motif === 'plein' || v.motif === 'main' ? undefined : '5 4')} strokeLinecap="round" />}
        {[fin, debut].map((p, i) => p && <path key={i} d={p.d} fill={p.plein ? teinte : 'none'} stroke={teinte} strokeWidth={p.plein ? 1 : Math.max(1.5, epaisseur)} strokeLinejoin="round" strokeLinecap="round" />)}
      </Tremble>
      {relation.titre && !enEdition && (
        <text
          x={c.milieu.x}
          y={c.milieu.y - 6}
          textAnchor="middle"
          {...propsTexte(t)}
          fill={t.couleurTexte ?? 'var(--notak-arbre-texte)'}
          paintOrder="stroke"
          stroke="var(--notak-arbre-fond)"
          strokeWidth={4}
        >
          {appliquerCasse(relation.titre, t.casse)}
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
