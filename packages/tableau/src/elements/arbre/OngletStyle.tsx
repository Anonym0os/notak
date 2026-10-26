import { useMemo, useRef, useState } from 'react'
import type { Arbre, CasseTexte, FormeBranche, FormeLimite, FormeRelation, FormeResume, FormeSujet, Id, Limite, MotifRemplissage, MotifTrait, PointeTrait, Relation, StyleSujet } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { Interrupteur, Segments } from '../../communs'
import type { ContexteToile } from '../types'
import { POLICE, type TexteEffectif, limiteEffective, relationEffective, resumeEffectif } from './apparence'
import {
  Bouton,
  BoutonMenu,
  BoutonVignette,
  Case,
  ChampMesure,
  Combo,
  EtatVide,
  GrilleTuiles,
  Legende,
  Ligne,
  ListeTexte,
  Popover,
  Rangee,
  Section,
  Separateur,
  type OptionListe,
  type Tuile,
} from './controles-style'
import { FORMES, FORMES_LIMITE, FORMES_RESUME, GROUPES_FORMES, type GroupeForme } from './formes'
import type { Geste } from './modele/gestes'
import {
  CASSES,
  EPAISSEURS,
  EPAISSEURS_CLES,
  FORMES_BRANCHE,
  GRAISSES,
  MOTIFS_BORDURE_SUJET,
  MOTIFS_BRANCHE,
  MOTIFS_REMPLISSAGE,
  MOTIFS_TRAIT,
  MULTIPLE,
  type Mixte,
  POLICES,
  TAILLES_POLICE,
  TAILLE_MAX,
  TAILLE_MIN,
  type ValeursSujet,
  cibleDeMiseAJour,
  cibler,
  commun,
  epaisseurProche,
  familleDe,
  famillesPour,
  nomGraisse,
  nomPolice,
  patchCouleurBordure,
  patchCouleurRemplissage,
  patchEpaisseurBranche,
  patchGras,
  patchMotifBordure,
  patchMotifBranche,
  patchMotifRemplissage,
  peutEffiler,
  valeursDe,
} from './modele/style'
import type { Lecture } from './modele/sujets'
import { Panneau, type Section as SectionContenu } from './Panneau'
import { BoutonCouleur } from './SelecteurCouleur'
import { THEMES, themeDe } from './themes'
import { POINTES } from './trace/pointes'
import { Anneau, VignetteBordure, VignetteBranche, VignetteForme, VignetteLimite, VignettePointe, VignetteRelation, VignetteRemplissage, VignetteResume, VignetteStructure, VignetteTrait } from './vignettes-style'

/**
 * L'onglet Style du panneau de côté, d'après celui de Xmind 26.05 (docs/XMIND.md § 5 bis) : ce que la sélection est
 * (un sujet, plusieurs, une relation, une limite, un résumé, ou rien) dit les sections qu'on y règle. Chaque contrôle
 * passe par un geste de la carte (donc l'historique), et montre la valeur que le rendu montre.
 */

const T = (cle: string, valeurs?: Record<string, string | number>) => t(`arbre.style.${cle}`, valeurs)

interface Commun {
  arbre: Arbre
  lecture: Lecture
  faire(g: Geste): void
}

export function OngletStyle({ arbre, lecture, choisis, faire, contexte, section }: { arbre: Arbre; lecture: Lecture; choisis: Id[]; courant?: Id; faire(g: Geste): void; contexte: ContexteToile; section?: SectionContenu | undefined }) {
  const cible = useMemo(() => cibler(arbre, lecture, choisis), [arbre, lecture, choisis])
  const commune: Commun = { arbre, lecture, faire }
  return (
    <div className="notak-arbre-style" data-cible={cible.genre}>
      {cible.genre === 'vide' && <EtatVide texte={T('vide')} />}
      {cible.genre === 'sujets' && <VueSujets {...commune} ids={cible.ids} genres={cible.genres} contexte={contexte} section={section} />}
      {cible.genre === 'resume' && <VueResume {...commune} ids={cible.ids} resumes={cible.resumes} />}
      {cible.genre === 'relations' && <VueRelations {...commune} ids={cible.ids} />}
      {cible.genre === 'limites' && <VueLimites {...commune} ids={cible.ids} />}
    </div>
  )
}

// — Le sujet —

function VueSujets({ arbre, lecture, faire, ids, genres, contexte, section }: Commun & { ids: Id[]; genres: readonly string[]; contexte: ContexteToile; section?: SectionContenu | undefined }) {
  const vals = ids.map((id) => valeursDe(arbre, lecture, id))
  const v = lecteur(vals)
  const style = (patch: Partial<StyleSujet>) => faire({ type: 'style', ids, style: patch })
  const meme = genres.every((g) => g === genres[0])
  const rapide = meme && genres[0] !== 'central'
  const seul = ids.length === 1 ? ids[0]! : null
  const sujet = seul ? lecture.sujets.get(seul) : undefined
  const surcharge = ids.some((id) => !!lecture.sujets.get(id)?.style || !!lecture.sujets.get(id)?.largeur)
  const niveau = seul ? cibleDeMiseAJour(lecture, seul, 'niveau').length > 0 : false
  const descendants = seul ? cibleDeMiseAJour(lecture, seul, 'sous-sujets').length > 0 : false
  const peutMettreAJour = !!seul && genres[0] !== 'central' && !!lecture.sujets.get(seul)?.style && (niveau || descendants)
  return (
    <>
      {rapide && (
        <>
          <StyleRapide ids={ids} lecture={lecture} vals={vals} faire={faire} />
          <Separateur />
        </>
      )}
      <SectionForme titre={T('forme')} ids={ids} vals={vals} faire={faire} lecture={lecture} />
      <Separateur />
      <SectionTexte
        titre={T('texte')}
        etat={{ famille: v('famille'), taille: v('taille'), graisse: v('graisse'), italique: v('italique'), barre: v('barre'), souligne: v('souligne'), casse: v('casse'), alignement: v('alignement'), couleur: v('couleurTexte') }}
        poser={style}
      />
      <Separateur />
      <SectionStructure ids={ids} vals={vals} central={genres.length === 1 && genres[0] === 'central'} faire={faire} />
      <Separateur />
      <SectionBranche titre={T('branche')} ids={ids} vals={vals} arbre={arbre} lecture={lecture} faire={faire} centralSeul={ids.length === 1 && genres[0] === 'central'} />
      {meme && (genres[0] === 'principal' || genres[0] === 'sous') && (
        <>
          <Separateur />
          <SectionNumerotation ids={ids} lecture={lecture} faire={faire} />
        </>
      )}
      {(peutMettreAJour || surcharge) && (
        <>
          <Separateur />
          <div className="notak-arbre-style-bas">
            {peutMettreAJour &&
              (niveau ? (
                <BoutonMenu
                  libelle={T('mettreAJour')}
                  titre={T('mettreAJourAide')}
                  entrees={[
                    { id: 'niveau', libelle: T('mettreNiveau', { n: vals[0]!.niveau }), faire: () => faire({ type: 'mettreAJourStyle', id: seul!, portee: 'niveau' }) },
                    ...(descendants ? [{ id: 'sous', libelle: T('mettreSousSujets'), faire: () => faire({ type: 'mettreAJourStyle', id: seul!, portee: 'sous-sujets' as const }) }] : []),
                  ]}
                />
              ) : (
                <Bouton pleine secondaire titre={T('mettreAJourAide')} onClick={() => faire({ type: 'mettreAJourStyle', id: seul!, portee: 'sous-sujets' })}>
                  {T('mettreAJour')}
                </Bouton>
              ))}
            {surcharge && (
              <Bouton pleine onClick={() => (faire({ type: 'style', ids, style: null }), faire({ type: 'largeur', ids, largeur: undefined }))}>
                {T('reinitialiser')}
              </Bouton>
            )}
          </div>
        </>
      )}
      {seul && sujet && (
        <>
          <Separateur />
          <Section titre={T('contenu')} ouverte={!!section}>
            <div className="notak-arbre-style-contenu">
              <Panneau lecture={lecture} ids={[seul]} section={section} faire={faire} contexte={contexte} fermer={() => {}} integre />
            </div>
          </Section>
        </>
      )}
    </>
  )
}

/** Une lecture commune : pour chaque champ, la valeur que tous les objets partagent, ou `MULTIPLE`. */
function lecteur<T extends object>(valeurs: readonly T[]) {
  return <K extends keyof T>(k: K): Mixte<T[K]> => commun(valeurs.map((x) => x[k]))
}

// — Le style rapide —

export const CLASSES_RAPIDES = [
  { cle: 'tresImportant', classe: 'important' as const },
  { cle: 'important', classe: 'secondaire' as const },
  { cle: 'barre', classe: 'barre' as const },
  { cle: 'defaut', classe: undefined },
]

/** Une pastille d'exemple : un sujet de ce rang. */
export function ExempleSujet({ classe, vals }: { classe: 'important' | 'secondaire' | 'barre' | undefined; vals?: ValeursSujet | undefined }) {
  const couleurs = { important: '#e5534b', secondaire: '#8c939d' }
  const base = classe === 'important' || classe === 'secondaire' ? couleurs[classe] : undefined
  return (
    <span
      className="notak-arbre-style-exemple"
      data-classe={classe}
      style={{
        borderColor: base ?? vals?.bordure ?? 'var(--notak-arbre-filet-c)',
        background: classe === 'important' ? `color-mix(in srgb, ${base} 14%, transparent)` : vals?.remplissage && !classe ? vals.remplissage : undefined,
        color: classe === 'secondaire' ? couleurs.secondaire : undefined,
        fontWeight: classe === 'important' ? 700 : (vals?.graisse ?? 500),
        textDecoration: classe === 'barre' ? 'line-through' : undefined,
      }}
    >
      {T('exempleSujet')}
    </span>
  )
}

function StyleRapide({ ids, lecture, vals, faire }: { ids: Id[]; lecture: Lecture; vals: ValeursSujet[]; faire(g: Geste): void }) {
  const classes = ids.map((id) => lecture.sujets.get(id)?.classe)
  const classe = commun(classes)
  return (
    <div className="notak-arbre-style-rapide">
      <BoutonVignette titre={T('rapideAide')} largeur={236} className="notak-arbre-style-rapide-bouton" vignette={<ExempleSujet classe={classe === MULTIPLE ? undefined : classe} vals={vals[0]} />}>
        {(fermer) => (
          <div className="notak-arbre-style-rapide-liste">
            {CLASSES_RAPIDES.map((c) => (
              <button
                key={c.cle}
                type="button"
                className="notak-arbre-style-rapide-ligne"
                title={T(`rapide.${c.cle}`)}
                aria-label={T(`rapide.${c.cle}`)}
                aria-pressed={classe === c.classe}
                onClick={() => {
                  faire({ type: 'porter', ids, champ: 'classe', valeur: c.classe })
                  fermer()
                }}
              >
                <ExempleSujet classe={c.classe} />
              </button>
            ))}
          </div>
        )}
      </BoutonVignette>
    </div>
  )
}

// — Forme, remplissage, bordure, longueur —

const MOTIFS_REMPLISSAGE_TUILES: readonly Tuile<MotifRemplissage>[] = MOTIFS_REMPLISSAGE.map((m) => ({ valeur: m, vignette: <VignetteRemplissage motif={m} />, titre: T(`mr.${m}`) }))

/** Le contenu de la carte des formes : le premier groupe, puis tous (« Plus de formes »). */
function ContenuFormes({ valeur, choisir }: { valeur: Mixte<FormeSujet>; choisir(f: FormeSujet): void }) {
  const [tout, setTout] = useState(false)
  const groupes = tout ? GROUPES_FORMES : GROUPES_FORMES.slice(0, 1)
  const total = FORMES.length
  return (
    <div className="notak-arbre-style-formes" data-tout={tout ? '' : undefined}>
      {groupes.map((g: GroupeForme) => (
        <GrilleTuiles
          key={g}
          titre={T(`groupe.${g}`)}
          valeur={valeur === MULTIPLE ? undefined : valeur}
          choisir={choisir}
          tuiles={[...FORMES.filter((f) => f.groupe === g).map((f) => ({ valeur: f.id, vignette: <VignetteForme forme={f.id} />, titre: nomForme(f.id) })), ...(g === 'basique' ? [{ valeur: 'aucune' as FormeSujet, vignette: <VignetteForme forme="aucune" />, titre: nomForme('aucune') }] : [])]}
        />
      ))}
      {!tout && total > 12 && (
        <Bouton pleine className="notak-arbre-style-bouton-pied" onClick={() => setTout(true)}>
          {T('plusDeFormes')}
        </Bouton>
      )}
    </div>
  )
}

const nomForme = (f: FormeSujet) => {
  const ancien = t(`arbre.f.${f}`)
  return ancien === `arbre.f.${f}` ? T(`f.${f}`) : ancien
}

/** Les motifs de remplissage : une grille de six, et « Aucun remplissage » en pied. */
function ChoixMotifRemplissage({ valeur, choisir, titre }: { valeur: Mixte<MotifRemplissage>; choisir(m: MotifRemplissage): void; titre: string }) {
  return (
    <BoutonVignette
      titre={titre}
      multiple={valeur === MULTIPLE}
      vignette={valeur === 'aucun' ? <span className="notak-arbre-style-vignette-mot">{T('aucun')}</span> : <VignetteRemplissage motif={valeur === MULTIPLE ? 'plein' : valeur} />}
    >
      {(fermer) => (
        <GrilleTuiles
          tuiles={MOTIFS_REMPLISSAGE_TUILES}
          valeur={valeur === MULTIPLE || valeur === 'aucun' ? undefined : valeur}
          choisir={(m) => (choisir(m), fermer())}
          pied={{ libelle: T('aucunRemplissage'), faire: () => (choisir('aucun'), fermer()) }}
        />
      )}
    </BoutonVignette>
  )
}

function ChoixMotifBordure({ valeur, choisir, titre, motifs = MOTIFS_BORDURE_SUJET }: { valeur: Mixte<MotifTrait>; choisir(m: MotifTrait): void; titre: string; motifs?: readonly MotifTrait[] }) {
  return (
    <BoutonVignette titre={titre} multiple={valeur === MULTIPLE} vignette={valeur === 'aucun' ? <span className="notak-arbre-style-vignette-mot">{T('aucun')}</span> : <VignetteBordure motif={valeur === MULTIPLE ? 'plein' : valeur} />}>
      {(fermer) => (
        <GrilleTuiles
          tuiles={motifs.map((m) => ({ valeur: m, vignette: <VignetteBordure motif={m} />, titre: T(`motif.${m}`) }))}
          valeur={valeur === MULTIPLE || valeur === 'aucun' ? undefined : valeur}
          choisir={(m) => (choisir(m), fermer())}
          pied={{ libelle: T('aucuneBordure'), faire: () => (choisir('aucun'), fermer()) }}
        />
      )}
    </BoutonVignette>
  )
}

/** La liste des cinq épaisseurs (et « Aucune » quand la valeur est 0). */
function ListeEpaisseur({ valeur, choisir, titre, inactif }: { valeur: Mixte<number>; choisir(n: number): void; titre: string; inactif?: boolean }) {
  const options: OptionListe<number>[] = [...(valeur === 0 ? [{ valeur: 0, libelle: T('aucun') }] : []), ...EPAISSEURS.map((e, i) => ({ valeur: e as number, libelle: T(`ep.${EPAISSEURS_CLES[i]}`) }))]
  return <ListeTexte valeur={valeur === MULTIPLE ? undefined : valeur === 0 ? 0 : epaisseurProche(valeur)} options={options} choisir={choisir} multiple={valeur === MULTIPLE} titre={titre} inactif={inactif} className="notak-arbre-style-pleine" />
}

function SectionForme({ titre, ids, vals, faire, lecture }: { titre: string; ids: Id[]; vals: ValeursSujet[]; faire(g: Geste): void; lecture: Lecture }) {
  const v = lecteur(vals)
  const style = (patch: Partial<StyleSujet>) => faire({ type: 'style', ids, style: patch })
  const motifR = v('motifRemplissage')
  const motifB = v('motifBordure')
  const sansBordure = motifB === 'aucun'
  const largeur = commun(ids.map((id) => lecture.sujets.get(id)?.largeur))
  return (
    <Section titre={titre} entete={<ChoixForme valeur={v('forme')} choisir={(f) => style({ forme: f })} />}>
      <Rangee>
        <Ligne libelle={T('remplir')}>
          <ChoixMotifRemplissage valeur={motifR} choisir={(m) => style(patchMotifRemplissage(m))} titre={T('motifRemplissage')} />
          <BoutonCouleur
            valeur={motifR === 'aucun' ? null : v('remplissage')}
            inactif={motifR === 'aucun'}
            titre={T('couleurRemplissage')}
            choisir={(c) => style(patchCouleurRemplissage(motifR === MULTIPLE ? 'plein' : motifR, c))}
            theme={THEMES[0]!.palette}
          />
        </Ligne>
      </Rangee>
      <Rangee>
        <Ligne libelle={T('bordure')}>
          <ChoixMotifBordure valeur={motifB} choisir={(m) => style(patchMotifBordure(m, v('epaisseurBordure') === MULTIPLE ? 1 : (v('epaisseurBordure') as number)))} titre={T('motifBordure')} />
          <BoutonCouleur
            valeur={sansBordure ? null : v('bordure')}
            inactif={sansBordure}
            titre={T('couleurBordure')}
            choisir={(c) => style(patchCouleurBordure(motifB === MULTIPLE ? 'plein' : motifB, v('epaisseurBordure') === MULTIPLE ? 1 : (v('epaisseurBordure') as number), c))}
          />
        </Ligne>
      </Rangee>
      <Rangee>
        <ListeEpaisseur valeur={v('epaisseurBordure')} titre={T('largeurBordure')} inactif={sansBordure} choisir={(n) => style({ epaisseurBordure: n })} />
      </Rangee>
      <hr className="notak-arbre-style-separateur notak-arbre-style-large" />
      <Ligne libelle={T('longueur')}>
        <ChampMesure
          titre={T('largeurAide')}
          valeur={largeur === MULTIPLE ? undefined : largeur}
          indicatif={v('largeurMesuree') === MULTIPLE ? undefined : (v('largeurMesuree') as number)}
          valider={(n) => faire({ type: 'largeur', ids, largeur: n })}
        />
        <Bouton titre={T('adapterAide')} inactif={largeur === undefined} onClick={() => faire({ type: 'largeur', ids, largeur: undefined })} className="notak-arbre-style-adapter">
          {T('adapter')}
        </Bouton>
      </Ligne>
    </Section>
  )
}

function ChoixForme({ valeur, choisir }: { valeur: Mixte<FormeSujet>; choisir(f: FormeSujet): void }) {
  return (
    <BoutonVignette titre={T('formeSujet')} largeur={240} multiple={valeur === MULTIPLE} vignette={valeur === MULTIPLE ? null : <VignetteForme forme={valeur} />}>
      {(fermer) => <ContenuFormes valeur={valeur} choisir={(f) => (choisir(f), fermer())} />}
    </BoutonVignette>
  )
}

// — Le texte —

/** Ce que la section Texte montre : les valeurs communes (ou « multiples ») de ce qu'elle règle. */
export interface EtatTexte {
  famille: Mixte<string>
  taille: Mixte<number>
  graisse: Mixte<number>
  italique: Mixte<boolean>
  barre: Mixte<boolean>
  souligne: Mixte<boolean>
  casse: Mixte<CasseTexte | undefined>
  alignement: Mixte<'gauche' | 'centre' | 'droite'>
  couleur: Mixte<string | null | undefined>
}

const CLE_POLICES = 'notak.arbre.polices'

function lirePolicesRecentes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_POLICES) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function memoriserPolice(pile: string) {
  try {
    localStorage.setItem(CLE_POLICES, JSON.stringify([pile, ...lirePolicesRecentes().filter((x) => x !== pile)].slice(0, 10)))
  } catch {
    // Pas de stockage : les récentes ne durent pas.
  }
}

/** Police, taille, style de police, couleur, gras, italique, barré, souligné, casse, alignement : pour tout texte de la carte. */
export function SectionTexte({ titre, etat, poser }: { titre: string; etat: EtatTexte; poser(patch: Record<string, unknown>): void }) {
  const [recentes, setRecentes] = useState(lirePolicesRecentes)
  const pile = etat.famille === MULTIPLE ? undefined : etat.famille
  const connues = new Set(POLICES.map((p) => p.valeur))
  const uniques = recentes.filter((r, i) => r && recentes.indexOf(r) === i)
  const options: OptionListe<string>[] = [
    { valeur: '', libelle: T('parDefaut') },
    ...uniques.map((r) => ({ valeur: r, libelle: nomPolice(r), style: { fontFamily: r } })),
    ...POLICES.map((p, i) => ({ valeur: p.valeur, libelle: p.nom, style: { fontFamily: p.valeur }, separe: i === 0 })),
  ]
  const graisseOptions: OptionListe<string>[] = GRAISSES.flatMap(([g, nom]) => [
    { valeur: `${g}|0`, libelle: nom, style: { fontWeight: g } },
    { valeur: `${g}|1`, libelle: `${nom} Italic`, style: { fontWeight: g, fontStyle: 'italic' as const } },
  ])
  const gras = etat.graisse !== MULTIPLE && etat.graisse >= 600
  const valeurGraisse = etat.graisse === MULTIPLE || etat.italique === MULTIPLE ? undefined : `${etat.graisse}|${etat.italique ? 1 : 0}`
  const affichageGraisse = etat.graisse === MULTIPLE || etat.italique === MULTIPLE ? undefined : `${nomGraisse(etat.graisse)}${etat.italique ? ' Italic' : ''}`
  const alignements = [
    { id: 'gauche', icone: 'texteGauche' as const, titre: T('aGauche') },
    { id: 'centre', icone: 'texteCentre' as const, titre: T('auCentre') },
    { id: 'droite', icone: 'texteDroite' as const, titre: T('aDroite') },
  ]
  return (
    <Section titre={titre}>
      <Rangee>
        <ListeTexte
          valeur={pile && (connues.has(pile) || recentes.includes(pile)) ? pile : undefined}
          affichage={pile ? nomPolice(pile) : undefined}
          multiple={etat.famille === MULTIPLE}
          options={options}
          titre={T('famille')}
          hauteurMax={276}
          largeurMenu={228}
          className="notak-arbre-style-flex"
          choisir={(p) => {
            if (p) memoriserPolice(p)
            setRecentes(lirePolicesRecentes())
            poser({ police: p || undefined })
          }}
        />
        <Combo valeur={etat.taille === MULTIPLE ? undefined : etat.taille} multiple={etat.taille === MULTIPLE} valeurs={TAILLES_POLICE} min={TAILLE_MIN} max={TAILLE_MAX} titre={T('taille')} valider={(n) => poser({ taille: n })} />
      </Rangee>
      <Rangee>
        <ListeTexte
          valeur={valeurGraisse}
          affichage={affichageGraisse}
          multiple={valeurGraisse === undefined}
          options={graisseOptions}
          titre={T('styleDePolice')}
          hauteurMax={276}
          largeurMenu={228}
          className="notak-arbre-style-flex"
          choisir={(valeur) => {
            const [g, it] = valeur.split('|')
            poser({ graisse: Number(g), gras: undefined, italique: it === '1' ? true : undefined })
          }}
        />
        <BoutonCouleur valeur={etat.couleur} titre={T('couleurTexte')} choisir={(c) => poser({ couleurTexte: c })} />
      </Rangee>
      <Rangee>
        <Segments
          mode="bascules"
          large
          options={[
            { valeur: 'gras', libelle: <Icone nom="gras" taille={15} trait={2.2} />, titre: T('gras'), actif: gras },
            { valeur: 'italique', libelle: <Icone nom="italique" taille={15} trait={2} />, titre: T('italique'), actif: etat.italique === true },
            { valeur: 'barre', libelle: <Icone nom="barre" taille={15} trait={2} />, titre: T('barre'), actif: etat.barre === true },
            { valeur: 'souligne', libelle: <Icone nom="souligne" taille={15} trait={2} />, titre: T('souligne'), actif: etat.souligne === true },
          ]}
          onChange={(v) =>
            poser(
              v === 'gras'
                ? patchGras(etat.graisse === MULTIPLE ? 400 : etat.graisse)
                : v === 'italique'
                  ? { italique: etat.italique === true ? undefined : true }
                  : v === 'barre'
                    ? { barre: etat.barre === true ? undefined : true }
                    : { souligne: etat.souligne === true ? undefined : true },
            )
          }
          suite={<BoutonCasse valeur={etat.casse} choisir={(c) => poser({ casse: c })} />}
        />
      </Rangee>
      <Segments
        large
        options={alignements.map((a) => ({ valeur: a.id, libelle: <Icone nom={a.icone} taille={15} trait={2} />, titre: a.titre }))}
        valeur={etat.alignement}
        onChange={(a) => poser({ alignement: a })}
      />
    </Section>
  )
}

/** Le cinquième bouton : la casse. Un menu de quatre entrées. */
function BoutonCasse({ valeur, choisir }: { valeur: Mixte<CasseTexte | undefined>; choisir(c: CasseTexte | undefined): void }) {
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const actif = valeur !== MULTIPLE && valeur !== undefined
  return (
    <>
      <button ref={ancre} type="button" className="notak-arbre-style-casse" title={T('casse')} aria-label={T('casse')} aria-haspopup="menu" aria-expanded={ouvert} aria-pressed={actif} onClick={() => setOuvert((o) => !o)}>
        <span className="notak-arbre-style-tt">Tt</span>
        <Icone nom="chevronBas" taille={10} trait={2.4} />
      </button>
      {ouvert && (
        <Popover ancre={ancre} fermer={() => setOuvert(false)} largeur={188} className="notak-arbre-style-menu">
          <ul className="notak-arbre-style-liste" role="menu">
            {CASSES.map((c) => (
              <li key={c ?? 'aucune'} role="presentation">
                {c === 'majuscules' && <hr className="notak-arbre-style-liste-sep" />}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={valeur === c}
                  className="notak-arbre-style-ligne-menu"
                  onClick={() => {
                    choisir(c)
                    setOuvert(false)
                  }}
                >
                  <span className="notak-arbre-style-coche">{valeur === c && <Icone nom="coche" taille={12} trait={2.4} />}</span>
                  <span className="notak-arbre-style-ligne-texte">{T(`casse.${c ?? 'aucune'}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  )
}

// — La structure —

function SectionStructure({ ids, vals, central, faire }: { ids: Id[]; vals: ValeursSujet[]; central: boolean; faire(g: Geste): void }) {
  const v = lecteur(vals)
  const effective = v('structureEffective')
  const propre = v('structure')
  const famille = effective === MULTIPLE ? null : familleDe(effective)
  const choisir = (s: Parameters<typeof familleDe>[0] | null) => faire({ type: 'structure', ids, structure: s })
  const options: OptionListe<string>[] = (famille?.variantes ?? []).map((s) => ({ valeur: s, libelle: T(`v.${s}`) }))
  return (
    <Section
      titre={T('structure')}
      entete={
        <BoutonVignette titre={T('choisirStructure')} largeur={248} multiple={!famille} vignette={famille ? <VignetteStructure famille={famille.id} /> : null}>
          {(fermer) => (
            <div className="notak-arbre-style-structures">
              {famillesPour(central).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="notak-arbre-style-structure"
                  aria-pressed={famille?.id === f.id}
                  onClick={() => {
                    choisir(f.variantes[0]!)
                    fermer()
                  }}
                >
                  <VignetteStructure famille={f.id} />
                  <span>{T(`s.${f.id}`)}</span>
                </button>
              ))}
              {!central && (
                <Bouton
                  pleine
                  className="notak-arbre-style-bouton-pied"
                  inactif={propre === undefined}
                  onClick={() => {
                    choisir(null)
                    fermer()
                  }}
                >
                  {T('suivreParent')}
                </Bouton>
              )}
            </div>
          )}
        </BoutonVignette>
      }
    >
      <ListeTexte
        valeur={propre === MULTIPLE ? undefined : (propre ?? (famille && effective !== MULTIPLE ? effective : undefined))}
        options={options}
        multiple={!famille || propre === MULTIPLE}
        inactif={!famille || propre === undefined}
        titre={T('dispositionStructure')}
        className="notak-arbre-style-pleine"
        choisir={(s) => choisir(s as never)}
      />
    </Section>
  )
}

// — La branche —

const SERIES: readonly (readonly string[])[] = [
  ['#e5534b', '#e69138', '#c9a227', '#3fa66b', '#3a86d4', '#8b5cd6'],
  ['#f2a7a0', '#f6c48f', '#e9d68a', '#9fd3b0', '#9cc3ec', '#c4b0ec'],
  ['#ff6b8b', '#ffb454', '#f5e05a', '#52e0a0', '#4cc2ff', '#b78cff'],
  ['#d14d72', '#e8825a', '#d9b44a', '#6fb26a', '#4a8fb8', '#7b6cc4'],
  ['#2f6f73', '#3c8f7a', '#6db08a', '#a3c9a1', '#d4d9a0', '#f1e5b5'],
  ['#1f3a5f', '#2d5a8e', '#4a82b8', '#7eaed1', '#b4d0e6', '#e0ecf5'],
  ['#5b2a86', '#7a3fa8', '#9b5fc7', '#b886de', '#d3b0ee', '#ead7f7'],
  ['#8c2f1b', '#b5502a', '#d9773a', '#eba35b', '#f4c98a', '#f9e2bc'],
  ['#0f766e', '#d97706', '#be123c', '#4338ca', '#65a30d', '#0e7490'],
  ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'],
  ['#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316', '#fdba74'],
  ['#581c87', '#7e22ce', '#a855f7', '#c084fc', '#d8b4fe', '#f3e8ff'],
]

function SectionBranche({ titre, ids, vals, arbre, lecture, faire, centralSeul }: { titre: string; ids: Id[]; vals: ValeursSujet[]; arbre: Arbre; lecture: Lecture; faire(g: Geste): void; centralSeul: boolean }) {
  const v = lecteur(vals)
  const style = (patch: Partial<StyleSujet>) => faire({ type: 'style', ids, style: patch })
  const motif = v('brancheMotif')
  const epaisseur = v('brancheEpaisseur')
  const effilee = v('brancheEffilee')
  const forme = v('brancheForme')
  const sans = motif === 'aucun'
  const numEp = epaisseur === MULTIPLE ? 1 : epaisseur
  const theme = themeDe(arbre.theme)
  const motifs: OptionListe<MotifTrait>[] = [
    { valeur: 'aucun', libelle: T('aucun') },
    ...MOTIFS_BRANCHE.map((m, i) => ({ valeur: m, libelle: <VignetteTrait motif={m} />, separe: i === 0 })),
  ]
  const tapere = forme !== MULTIPLE && peutEffiler(forme)
  const largeurs: OptionListe<string>[] = [
    ...(epaisseur === 0 ? [{ valeur: '0', libelle: T('aucun') }] : []),
    ...EPAISSEURS.map((e, i) => ({ valeur: String(e), libelle: T(`ep.${EPAISSEURS_CLES[i]}`) })),
    ...(tapere ? EPAISSEURS.map((e, i) => ({ valeur: `${e}t`, libelle: `${T(`ep.${EPAISSEURS_CLES[i]}`)} – ${T('effile')}`, separe: i === 0 })) : []),
  ]
  const valeurLargeur = epaisseur === MULTIPLE || effilee === MULTIPLE ? undefined : epaisseur === 0 ? '0' : `${epaisseurProche(epaisseur)}${effilee && tapere ? 't' : ''}`
  const couleur = v('brancheCouleur')
  const [coloree, serie] = [!arbre.options?.uneCouleur, lecture.sujets.get(lecture.central)?.style?.serieCouleurs ?? theme.palette]
  return (
    <Section
      titre={titre}
      entete={
        <BoutonVignette titre={T('formeBranche')} multiple={forme === MULTIPLE} vignette={forme === MULTIPLE ? null : <VignetteBranche forme={forme} />}>
          {(fermer) => (
            <GrilleTuiles
              tuiles={FORMES_BRANCHE.map((f: FormeBranche) => ({ valeur: f, vignette: <VignetteBranche forme={f} />, titre: T(`br.${f}`) }))}
              valeur={forme === MULTIPLE ? undefined : forme}
              choisir={(f) => (style({ branche: f, ...(peutEffiler(f) ? {} : { effilee: undefined }) }), fermer())}
            />
          )}
        </BoutonVignette>
      }
    >
      <Rangee>
        <div className="notak-arbre-style-champ-legende notak-arbre-style-flex">
          <Legende>{T('ligne')}</Legende>
          <ListeTexte
            valeur={motif === MULTIPLE ? undefined : motif}
            multiple={motif === MULTIPLE}
            options={motifs}
            titre={T('motifLigne')}
            largeurMenu={148}
            className="notak-arbre-style-pleine"
            choisir={(m) => style(patchMotifBranche(m, numEp))}
          />
        </div>
        <div className="notak-arbre-style-champ-legende">
          <Legende>{T('fin')}</Legende>
          <ChoixPointe valeur={v('branchePointe')} choisir={(p) => style({ pointeBranche: p === 'aucune' ? undefined : p })} titre={T('pointeAide')} inactif={sans} />
        </div>
      </Rangee>
      <Rangee bas={centralSeul}>
        <ListeTexte
          valeur={valeurLargeur}
          multiple={valeurLargeur === undefined}
          options={largeurs}
          titre={T('largeurLigne')}
          inactif={sans}
          className="notak-arbre-style-flex"
          choisir={(valeur) => {
            const taper = valeur.endsWith('t')
            style(patchEpaisseurBranche(Number.parseFloat(valeur), taper))
          }}
        />
        {!centralSeul && <BoutonCouleur valeur={sans ? null : couleur} inactif={sans} titre={T('couleurLigne')} choisir={(c) => style({ couleurBranche: c })} />}
      </Rangee>
      {centralSeul && (
        <div className="notak-arbre-style-coloree">
          <Ligne libelle={T('brancheColoree')}>
            <Interrupteur actif={coloree} titre={T('brancheColoreeAide')} inactif={sans} onChange={(a) => faire({ type: 'options', options: { ...arbre.options, uneCouleur: !a } })} />
          </Ligne>
          <Ligne libelle={T('couleur')}>
            {coloree ? (
              <BoutonVignette titre={T('couleurSerie')} largeur={184} className="notak-arbre-style-serie-bouton" vignette={<Anneau couleurs={serie} taille={17} />} inactif={sans}>
                {(fermer) => (
                  <div className="notak-arbre-style-series">
                    {[theme.palette, ...SERIES.filter((s) => s.join() !== theme.palette.join())].map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="notak-arbre-style-serie"
                        aria-pressed={s.join() === serie.join()}
                        title={s.join(' ')}
                        aria-label={s.join(' ')}
                        onClick={() => {
                          style({ serieCouleurs: i === 0 ? undefined : [...s] })
                          fermer()
                        }}
                      >
                        <Anneau couleurs={s} />
                      </button>
                    ))}
                  </div>
                )}
              </BoutonVignette>
            ) : (
              <BoutonCouleur valeur={sans ? null : couleur} inactif={sans} titre={T('couleurLigne')} choisir={(c) => style({ couleurBranche: c })} />
            )}
          </Ligne>
        </div>
      )}
    </Section>
  )
}

/** Le bout d'un trait : onze pointes. */
function ChoixPointe({ valeur, choisir, titre, inactif, debut = false }: { valeur: Mixte<PointeTrait>; choisir(p: PointeTrait): void; titre: string; inactif?: boolean; debut?: boolean }) {
  return (
    <BoutonVignette titre={titre} inactif={inactif} multiple={valeur === MULTIPLE} vignette={valeur === MULTIPLE ? null : <VignettePointe pointe={valeur} debut={debut} />}>
      {(fermer) => (
        <GrilleTuiles
          tuiles={POINTES.map((p) => ({ valeur: p.id, vignette: <VignettePointe pointe={p.id} debut={debut} />, titre: T(`pointe.${p.id}`) }))}
          valeur={valeur === MULTIPLE ? undefined : valeur}
          choisir={(p) => (choisir(p), fermer())}
        />
      )}
    </BoutonVignette>
  )
}

// — La numérotation —

const MOTIFS_NUMEROTATION = [
  { id: 'arabe', libelle: '1.2.3.' },
  { id: 'majuscule', libelle: 'A.B.C.' },
  { id: 'minuscule', libelle: 'a.b.c.' },
  { id: 'romain', libelle: 'I.II.III.' },
] as const

function SectionNumerotation({ ids, lecture, faire }: { ids: Id[]; lecture: Lecture; faire(g: Geste): void }) {
  const motifs = ids.map((id) => lecture.sujets.get(id)?.numerotation?.motif)
  const motif = commun(motifs)
  const num = ids.map((id) => lecture.sujets.get(id)?.numerotation)
  const porter = (valeur: unknown) => faire({ type: 'porter', ids, champ: 'numerotation', valeur })
  const options: OptionListe<string>[] = [{ valeur: '', libelle: T('aucun') }, ...MOTIFS_NUMEROTATION.map((m, i) => ({ valeur: m.id, libelle: m.libelle, separe: i === 0 }))]
  const seul = ids.length === 1 ? ids[0]! : null
  return (
    <Section titre={T('numerotation')}>
      <Rangee>
        <ListeTexte
          valeur={motif === MULTIPLE ? undefined : (motif ?? '')}
          multiple={motif === MULTIPLE}
          options={options}
          titre={T('styleNumerotation')}
          className="notak-arbre-style-pleine"
          choisir={(m) => (m === '' ? porter(undefined) : faire({ type: 'lot', gestes: ids.map((id): Geste => ({ type: 'porter', ids: [id], champ: 'numerotation', valeur: { ...lecture.sujets.get(id)?.numerotation, motif: m } })) }))}
        />
      </Rangee>
      <Rangee>
        <Bouton pleine titre={T('freresAide')} inactif={!seul || motif === undefined || motif === MULTIPLE} onClick={() => seul && faire({ type: 'numeroterFreres', id: seul })}>
          {T('freres')}
        </Bouton>
      </Rangee>
      {motif !== undefined && motif !== MULTIPLE && (
        <>
          <Rangee>
            <Case
              libelle={T('paliers')}
              titre={T('paliersAide')}
              cochee={num.every((n) => !!n?.paliers)}
              changer={(c) => faire({ type: 'lot', gestes: ids.map((id): Geste => ({ type: 'porter', ids: [id], champ: 'numerotation', valeur: sansVide({ ...lecture.sujets.get(id)!.numerotation!, paliers: c || undefined }) })) })}
            />
          </Rangee>
          <Case
            libelle={T('depuis')}
            titre={T('depuisAide')}
            cochee={num.every((n) => !!n?.debut)}
            changer={(c) => faire({ type: 'lot', gestes: ids.map((id): Geste => ({ type: 'porter', ids: [id], champ: 'numerotation', valeur: sansVide({ ...lecture.sujets.get(id)!.numerotation!, debut: c || undefined }) })) })}
          />
        </>
      )}
    </Section>
  )
}

/** Un objet sans ses clés `undefined`. */
const sansVide = <O extends object>(o: O): O => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as O

// — Le résumé —

function VueResume({ arbre, lecture, faire, ids, resumes }: Commun & { ids: Id[]; resumes: Id[] }) {
  const vals = ids.map((id) => valeursDe(arbre, lecture, id))
  const v = lecteur(vals)
  const lignes = resumes.map((id) => resumeEffectif(arbre.resumes?.[id]))
  const l = lecteur(lignes)
  const poserLigne = (patch: Record<string, unknown>) => faire({ type: 'styleObjet', ids: resumes, style: patch })
  const style = (patch: Partial<StyleSujet>) => faire({ type: 'style', ids, style: patch })
  const motif = l('motif')
  const sans = motif === 'aucun'
  const forme = l('forme')
  const surcharge = ids.some((id) => !!lecture.sujets.get(id)?.style) || resumes.some((id) => !!arbre.resumes?.[id]?.style)
  return (
    <>
      <Section
        titre={T('ligneResume')}
        entete={
          <BoutonVignette titre={T('formeResume')} multiple={forme === MULTIPLE} vignette={forme === MULTIPLE ? null : <VignetteResume forme={forme} />}>
            {(fermer) => (
              <GrilleTuiles
                tuiles={FORMES_RESUME.map((f) => ({ valeur: f.id as FormeResume, vignette: <VignetteResume forme={f.id} />, titre: T(`res.${f.id}`) }))}
                valeur={forme === MULTIPLE ? undefined : forme}
                choisir={(f) => (poserLigne({ forme: f }), fermer())}
              />
            )}
          </BoutonVignette>
        }
      >
        <Rangee>
          <ListeMotifTrait valeur={motif} choisir={(m) => poserLigne(m === 'aucun' ? { motif: m, epaisseur: 0 } : { motif: m, ...(l('epaisseur') === 0 ? { epaisseur: 2 } : {}) })} motifs={['plein', 'tirets', 'main', 'tirets-main']} className="notak-arbre-style-flex" />
          <BoutonCouleur valeur={sans ? null : (l('couleur') === undefined ? 'var(--notak-arbre-encre)' : l('couleur'))} inactif={sans} titre={T('couleurLigne')} choisir={(c) => poserLigne({ couleur: c })} />
        </Rangee>
        <ListeEpaisseur valeur={l('epaisseur')} titre={T('largeurLigne')} inactif={sans} choisir={(n) => poserLigne({ epaisseur: n })} />
      </Section>
      <Separateur />
      <SectionForme titre={T('sujetResume')} ids={ids} vals={vals} faire={faire} lecture={lecture} />
      <Separateur />
      <SectionTexte
        titre={T('texte')}
        etat={{ famille: v('famille'), taille: v('taille'), graisse: v('graisse'), italique: v('italique'), barre: v('barre'), souligne: v('souligne'), casse: v('casse'), alignement: v('alignement'), couleur: v('couleurTexte') }}
        poser={style}
      />
      <Separateur />
      <SectionBranche titre={T('branche')} ids={ids} vals={vals} arbre={arbre} lecture={lecture} faire={faire} centralSeul={false} />
      {surcharge && (
        <>
          <Separateur />
          <div className="notak-arbre-style-bas">
            <Bouton pleine onClick={() => (faire({ type: 'style', ids, style: null }), faire({ type: 'largeur', ids, largeur: undefined }), faire({ type: 'styleObjet', ids: resumes, style: null }))}>
              {T('reinitialiser')}
            </Bouton>
          </div>
        </>
      )}
    </>
  )
}

/** Un motif de trait dans une liste : « Aucun », puis les motifs en petits traits. */
function ListeMotifTrait({ valeur, choisir, motifs, className }: { valeur: Mixte<MotifTrait>; choisir(m: MotifTrait): void; motifs: readonly MotifTrait[]; className?: string }) {
  return (
    <ListeTexte
      valeur={valeur === MULTIPLE ? undefined : valeur}
      multiple={valeur === MULTIPLE}
      options={[{ valeur: 'aucun', libelle: T('aucun') }, ...motifs.map((m, i) => ({ valeur: m, libelle: <VignetteTrait motif={m} />, separe: i === 0 }))]}
      titre={T('motifLigne')}
      largeurMenu={148}
      className={className ?? 'notak-arbre-style-pleine'}
      choisir={choisir}
    />
  )
}

// — La relation —

function VueRelations({ arbre, faire, ids }: Commun & { ids: Id[] }) {
  const vals = ids.map((id) => relationEffective(arbre.relations![id] as Relation))
  const v = lecteur(vals)
  const poser = (patch: Record<string, unknown>) => faire({ type: 'styleObjet', ids, style: patch })
  const motif = v('motif')
  const forme = v('forme')
  const sans = motif === 'aucun'
  const surcharge = ids.some((id) => !!arbre.relations?.[id]?.style || !!arbre.relations?.[id]?.forme || !!arbre.relations?.[id]?.pointes)
  return (
    <>
      <Section
        titre={T('forme')}
        entete={
          <BoutonVignette titre={T('formeRelation')} multiple={forme === MULTIPLE} vignette={forme === MULTIPLE ? null : <VignetteRelation forme={forme} />}>
            {(fermer) => (
              <GrilleTuiles
                tuiles={FORMES_RELATION.map((f) => ({ valeur: f, vignette: <VignetteRelation forme={f} />, titre: T(`rel.${f}`) }))}
                valeur={forme === MULTIPLE ? undefined : forme}
                choisir={(f) => (poser({ forme: f }), fermer())}
              />
            )}
          </BoutonVignette>
        }
      >
        <Rangee>
          <div className="notak-arbre-style-champ-legende">
            <Legende>{T('debut')}</Legende>
            <ChoixPointe valeur={v('pointeDepart')} debut choisir={(p) => poser({ pointeDepart: p })} titre={T('pointeAide')} />
          </div>
          <div className="notak-arbre-style-champ-legende">
            <Legende>{T('ligne')}</Legende>
            <ListeTexte
              valeur={motif === MULTIPLE ? undefined : motif}
              multiple={motif === MULTIPLE}
              options={MOTIFS_TRAIT.map((m) => ({ valeur: m, libelle: <VignetteTrait motif={m} long={44} /> }))}
              titre={T('motifLigne')}
              largeurMenu={120}
              choisir={(m) => poser(m === 'aucun' ? { motif: m } : { motif: m })}
            />
          </div>
          <div className="notak-arbre-style-champ-legende">
            <Legende>{T('fin')}</Legende>
            <ChoixPointe valeur={v('pointeArrivee')} choisir={(p) => poser({ pointeArrivee: p })} titre={T('pointeAide')} />
          </div>
        </Rangee>
        <Rangee bas={false}>
          <ListeEpaisseur valeur={v('epaisseur')} titre={T('largeurLigne')} choisir={(n) => poser({ epaisseur: n })} />
          <BoutonCouleur valeur={sans ? null : v('couleur') === undefined ? 'var(--notak-arbre-encre)' : v('couleur')} inactif={sans} titre={T('couleurLigne')} choisir={(c) => poser({ couleur: c })} />
        </Rangee>
      </Section>
      <Separateur />
      <SectionTexte titre={T('texte')} etat={etatTexteObjet(vals.map((x) => x.texte))} poser={poser} />
      {surcharge && (
        <>
          <Separateur />
          <div className="notak-arbre-style-bas">
            <Bouton pleine onClick={() => faire({ type: 'styleObjet', ids, style: null })}>
              {T('reinitialiser')}
            </Bouton>
          </div>
        </>
      )}
    </>
  )
}

const FORMES_RELATION: readonly FormeRelation[] = ['courbe', 'droite', 'coudee', 'zigzag', 'courbe-souple', 'coudee-souple', 'zigzag-souple']

/** Le texte d'une relation ou d'une limite, tel que la section Texte le montre. */
function etatTexteObjet(textes: readonly TexteEffectif[]): EtatTexte {
  const c = lecteur(textes)
  const police = c('police')
  const couleur = c('couleurTexte')
  return {
    famille: police === MULTIPLE ? MULTIPLE : (police ?? POLICE),
    taille: c('taille'),
    graisse: c('graisse'),
    italique: c('italique'),
    barre: c('barre'),
    souligne: c('souligne'),
    casse: c('casse'),
    alignement: c('alignement'),
    couleur: couleur === undefined ? 'var(--notak-arbre-texte)' : couleur,
  }
}

// — La limite —

function VueLimites({ arbre, faire, ids }: Commun & { ids: Id[] }) {
  const vals = ids.map((id) => limiteEffective(arbre.limites![id] as Limite))
  const v = lecteur(vals)
  const poser = (patch: Record<string, unknown>) => faire({ type: 'styleObjet', ids, style: patch })
  const forme = v('forme')
  const motifR = v('motifRemplissage')
  const motifB = v('motif')
  const sans = motifB === 'aucun'
  const surcharge = ids.some((id) => !!arbre.limites?.[id]?.style)
  const ep = v('epaisseur')
  return (
    <>
      <Section
        titre={T('forme')}
        entete={
          <BoutonVignette titre={T('formeLimite')} multiple={forme === MULTIPLE} vignette={forme === MULTIPLE ? null : <VignetteLimite forme={forme} />}>
            {(fermer) => (
              <GrilleTuiles
                tuiles={FORMES_LIMITE.map((f) => ({ valeur: f.id as FormeLimite, vignette: <VignetteLimite forme={f.id} />, titre: T(`lim.${f.id}`) }))}
                valeur={forme === MULTIPLE ? undefined : forme}
                choisir={(f) => (poser({ forme: f }), fermer())}
              />
            )}
          </BoutonVignette>
        }
      >
        <Rangee>
          <Ligne libelle={T('remplir')}>
            <ChoixMotifRemplissage valeur={motifR} choisir={(m) => poser(patchMotifRemplissage(m))} titre={T('motifRemplissage')} />
            <BoutonCouleur
              valeur={motifR === 'aucun' ? null : v('remplissage') === undefined ? 'var(--notak-arbre-encre)' : v('remplissage')}
              inactif={motifR === 'aucun'}
              titre={T('couleurRemplissage')}
              opaciteMax={20}
              choisir={(c) => poser(patchCouleurRemplissage(motifR === MULTIPLE ? 'plein' : motifR, c))}
            />
          </Ligne>
        </Rangee>
        <Rangee>
          <Ligne libelle={T('bordure')}>
            <ChoixMotifBordure valeur={motifB} motifs={MOTIFS_TRAIT} titre={T('motifBordure')} choisir={(m) => poser(m === 'aucun' ? { motif: 'aucun', epaisseur: 0 } : { motif: m, ...(ep === 0 ? { epaisseur: 2 } : {}) })} />
            <BoutonCouleur valeur={sans ? null : v('couleur') === undefined ? 'var(--notak-arbre-encre)' : v('couleur')} inactif={sans} titre={T('couleurBordure')} choisir={(c) => poser({ couleur: c })} />
          </Ligne>
        </Rangee>
        <ListeEpaisseur valeur={ep} titre={T('largeurBordure')} inactif={sans} choisir={(n) => poser({ epaisseur: n })} />
      </Section>
      <Separateur />
      <SectionTexte titre={T('texte')} etat={etatTexteObjet(vals.map((x) => x.texte))} poser={poser} />
      {surcharge && (
        <>
          <Separateur />
          <div className="notak-arbre-style-bas">
            <Bouton pleine onClick={() => faire({ type: 'styleObjet', ids, style: null })}>
              {T('reinitialiser')}
            </Bouton>
          </div>
        </>
      )}
    </>
  )
}

