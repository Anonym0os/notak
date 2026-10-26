import { useState } from 'react'
import type { Arbre, StructureArbre } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t, useLangue } from '../../langue'
import { POLICES, POLICES_CJK, polices, recentePolice } from './carte/polices'
import { CarteSquelette } from './carte/CarteSquelette'
import { ThemeCouleur } from './carte/ThemeCouleur'
import { ThemesPersonnalises } from './carte/ThemesPersonnalises'
import { recentes as ajouterRecente } from './carte/couleurs'
import { modifierPreferences, usePreferences } from './carte/preferences'
import { Anneau, Bloc, LigneBascule, Liste, type OptionListe, PastilleCouleur, Popover, VueSecondaire, useOuvrable } from './controles'
import { Aide, Libelle, LigneReglage, Separateur } from '../../communs'
import type { Geste } from './modele/gestes'
import { type CleOption, LARGEURS_BRANCHE, STRUCTURES_CARTE, estEquilibree } from './modele/reglages'
import { type Lecture, enfantsDe } from './modele/sujets'
import { JEUX_COULEURS, themeBase } from './themes'

/** Les noms des cinq largeurs de ligne, du plus fin au plus gras. */
const NOMS_LARGEURS: Record<number, string> = { 1: 'arbre.carte.l.fin', 2: 'arbre.carte.l.mince', 3: 'arbre.carte.l.moyen', 5: 'arbre.carte.l.gras', 8: 'arbre.carte.l.tresGras' }

/** Les largeurs de ligne qu'on propose : par défaut, les cinq niveaux, puis les mêmes effilés. */
export function optionsLargeur(): OptionListe[] {
  return [
    { valeur: '0', libelle: t('arbre.carte.defaut') },
    ...LARGEURS_BRANCHE.map((pt) => ({ valeur: String(pt), libelle: t(NOMS_LARGEURS[pt]!) })),
    ...LARGEURS_BRANCHE.map((pt, i) => ({ valeur: `${pt}-effile`, libelle: t('arbre.carte.effile', { nom: t(NOMS_LARGEURS[pt]!) }), separateurAvant: i === 0 })),
  ]
}

/** La valeur de la liste des largeurs pour cette carte. */
export const valeurLargeur = (a: Pick<Arbre, 'largeurBranche' | 'effile'>): string => (a.largeurBranche ? `${a.largeurBranche}${a.effile ? '-effile' : ''}` : a.effile ? '0-effile' : '0')

/**
 * L'onglet Carte du panneau de format : les réglages de la carte entière, dans l'ordre de l'onglet « Map » de Xmind
 * (docs/XMIND.md § 9). Aucun ne dépend de la sélection. Chacun passe par un geste (`modele/reglages.ts`), donc par
 * l'historique ; chacun change le rendu ; les clés du `.xmind` sont celles de Xmind (`xmind.ts`).
 *
 * → Notak : pas de bouton « Upgrade », pas de badge PRO : tout est libre.
 */
export function OngletCarte({ arbre, lecture, faire }: { arbre: Arbre; lecture: Lecture; faire(g: Geste): void }) {
  useLangue()
  const prefs = usePreferences()
  const [secondaire, setSecondaire] = useState(false)
  const options = arbre.options ?? {}
  const central = lecture.sujets.get(lecture.central)
  const structure: StructureArbre = central?.structure ?? 'carte'
  const famille = STRUCTURES_CARTE.includes(structure)
  const base = themeBase(arbre)
  const reglage = (cle: CleOption) => (actif: boolean) => faire({ type: 'reglage', cle, actif })
  const principaux = enfantsDe(lecture, lecture.central).length
  const aDroite = Math.min(principaux, central?.aDroite ?? principaux)
  const retenirCouleur = (c: string) => modifierPreferences((p) => ({ ...p, couleursRecentes: ajouterRecente(p.couleursRecentes, c) }))
  const couleurs = (c: string, appliquer: (c: string) => void) => {
    appliquer(c)
    retenirCouleur(c)
  }
  const choisirPolice = (cle: 'policesRecentes' | 'policesCjkRecentes', geste: 'policeGlobale' | 'policeCjk') => (nom: string) => {
    faire({ type: geste, police: nom || null })
    if (nom) modifierPreferences((p) => ({ ...p, [cle]: recentePolice(p[cle], nom) }))
  }
  const nomsLarges = optionsLargeur()
  const largeur = valeurLargeur(arbre)

  if (secondaire)
    return (
      <div className="notak-arbre-reglages" data-secondaire>
        <VueSecondaire titre={t('arbre.carte.themesPerso')} fermer={() => setSecondaire(false)}>
          <ThemesPersonnalises arbre={arbre} structure={structure} faire={faire} />
        </VueSecondaire>
      </div>
    )

  return (
    <div className="notak-arbre-reglages">
      <div className="notak-arbre-reglages-bloc notak-arbre-reglages-bloc-squelette">
        <CarteSquelette arbre={arbre} structure={structure} faire={faire} />
      </div>
      <Separateur />
      <Bloc>
        <Libelle groupe texte={t('arbre.carte.themeCouleur')}>
          <ThemeCouleur arbre={arbre} structure={structure} faire={faire} />
        </Libelle>
      </Bloc>
      <Separateur />
      <Bloc>
        <LigneReglage libelle={t('arbre.carte.fond')}>
          <PastilleCouleur
            valeur={arbre.fond}
            defaut={base.fond ?? 'var(--notak-arbre-fond)'}
            libelle={t('arbre.carte.fond')}
            couleursTheme={[...new Set([...(base.fond ? [base.fond] : []), ...base.palette])]}
            recentes={prefs.couleursRecentes}
            onChoisir={(c) => couleurs(c, (v) => faire({ type: 'fond', couleur: v }))}
            reinitialiser={() => faire({ type: 'fond', couleur: null })}
          />
        </LigneReglage>
      </Bloc>
      <Separateur />
      <Bloc>
        <Libelle groupe texte={t('arbre.carte.policeGlobale')} aide={t('arbre.carte.policeAide')}>
          <Liste
            valeur={arbre.police ?? ''}
            libelle={t('arbre.carte.policeGlobale')}
            aide={t('arbre.carte.policeAide')}
            options={optionsPolices(POLICES, prefs.policesRecentes, arbre.police)}
            onChoisir={choisirPolice('policesRecentes', 'policeGlobale')}
          />
        </Libelle>
        <Libelle groupe texte={t('arbre.carte.largeurBranche')} aide={t('arbre.carte.largeurAide')}>
          <Liste
            valeur={largeur}
            libelle={t('arbre.carte.largeurBranche')}
            aide={t('arbre.carte.largeurAide')}
            options={nomsLarges}
            texte={arbre.largeurBranche ? `${arbre.largeurBranche} pt` : undefined}
            onChoisir={(v) => {
              const [pt, effile] = v.split('-')
              faire({ type: 'largeurBranche', pt: Number(pt) || null, effile: effile === 'effile' })
            }}
          />
        </Libelle>
        <div className="notak-arbre-reglages-branches-colorees">
          <LigneBascule libelle={t('arbre.carte.brancheColoree')} aide={t('arbre.carte.brancheColoreeAide')} actif={!options.uneCouleur} onChange={(v) => faire({ type: 'reglage', cle: 'uneCouleur', actif: !v })} />
          <LigneReglage libelle={t('arbre.carte.couleur')}>
            {options.uneCouleur ? (
              <PastilleCouleur
                valeur={arbre.couleurLigne}
                defaut={base.encre ?? 'var(--notak-arbre-encre)'}
                libelle={t('arbre.carte.couleur')}
                couleursTheme={base.palette}
                recentes={prefs.couleursRecentes}
                onChoisir={(c) => couleurs(c, (v) => faire({ type: 'couleurLigne', couleur: v }))}
                reinitialiser={() => faire({ type: 'couleurLigne', couleur: null })}
              />
            ) : (
              <SelecteurJeu jeu={arbre.jeuCouleurs ?? base.palette} propre={base.palette} faire={faire} />
            )}
          </LigneReglage>
        </div>
      </Bloc>
      <Separateur />
      <Bloc titre={t('arbre.carte.styleCarte')}>
        <LigneBascule
          libelle={t('arbre.carte.equilibree')}
          aide={t('arbre.carte.equilibreeAide')}
          actif={estEquilibree(structure)}
          inactif={!famille}
          onChange={(v) => faire({ type: 'equilibrer', actif: v })}
        />
        {structure === 'carte-libre' && principaux > 1 && (
          <LigneReglage libelle={t('arbre.aDroite')}>
            <span className="notak-arbre-reglages-pas" role="group" aria-label={t('arbre.aDroite')}>
              <button type="button" aria-label="−" disabled={aDroite <= 0} onClick={() => faire({ type: 'aDroite', n: aDroite - 1 })}>
                <Icone nom="retirer" taille={12} trait={2} />
              </button>
              <output>{aDroite}</output>
              <button type="button" aria-label="+" disabled={aDroite >= principaux} onClick={() => faire({ type: 'aDroite', n: aDroite + 1 })}>
                <Icone nom="ajouter" taille={12} trait={2} />
              </button>
            </span>
          </LigneReglage>
        )}
        <LigneBascule libelle={t('arbre.carte.compacte')} aide={t('arbre.carte.compacteAide')} actif={!!options.compacte} onChange={reglage('compacte')} />
      </Bloc>
      <Separateur />
      <Bloc titre={t('arbre.carte.affichage')}>
        <LigneBascule libelle={t('arbre.carte.uniforme')} aide={t('arbre.carte.uniformeAide')} actif={!!options.uniforme} onChange={reglage('uniforme')} />
        <LigneBascule libelle={t('arbre.carte.toutesNotes')} aide={t('arbre.carte.toutesNotesAide')} actif={!!options.toutesNotes} onChange={reglage('toutesNotes')} />
        <LigneBascule libelle={t('arbre.carte.flottantsColores')} aide={t('arbre.carte.flottantsColoresAide')} actif={!!options.flottantsColores} onChange={reglage('flottantsColores')} />
      </Bloc>
      <Separateur />
      <Bloc titre={t('arbre.carte.relation')}>
        <LigneBascule libelle={t('arbre.carte.relationSuit')} aide={t('arbre.carte.relationSuitAide')} actif={!!options.relationsColorees} onChange={reglage('relationsColorees')} />
      </Bloc>
      <Separateur />
      <Bloc titre={t('arbre.carte.avance')}>
        <LigneBascule libelle={t('arbre.carte.libre')} aide={t('arbre.carte.libreAide')} actif={!!options.libre} inactif={!famille} onChange={reglage('libre')} />
        <LigneBascule libelle={t('arbre.carte.souple')} aide={t('arbre.carte.soupleAide')} actif={!!options.flottantSouple} onChange={reglage('flottantSouple')} />
        <LigneBascule libelle={t('arbre.carte.chevauchement')} aide={t('arbre.carte.chevauchementAide')} actif={!!options.chevauchement} onChange={reglage('chevauchement')} />
      </Bloc>
      <Separateur />
      <Bloc>
        <Libelle groupe texte={t('arbre.carte.policeCjk')}>
          <Liste
            valeur={arbre.policeCjk ?? ''}
            libelle={t('arbre.carte.policeCjk')}
            options={optionsPolices(POLICES_CJK, prefs.policesCjkRecentes, arbre.policeCjk)}
            onChoisir={choisirPolice('policesCjkRecentes', 'policeCjk')}
          />
          <Aide>{t('arbre.carte.cjkAide')}</Aide>
        </Libelle>
        <hr className="notak-arbre-reglages-filet-section" />
        <button type="button" className="notak-arbre-reglages-bouton-large" title={t('arbre.carte.themesPersoAide')} onClick={() => setSecondaire(true)}>
          {t('arbre.carte.themesPerso')}
        </button>
      </Bloc>
    </div>
  )
}

/**
 * Les polices d'une liste : si on en a déjà choisi, les récentes (jusqu'à six, hors la courante) puis la courante,
 * un filet, « Par défaut », puis toutes.
 */
export function optionsPolices(liste: typeof POLICES, recentes: readonly string[], courante: string | undefined): OptionListe[] {
  const { recentes: tete } = polices(liste, recentes, courante)
  const ligne = (p: (typeof POLICES)[number]): OptionListe => ({ valeur: p.nom, libelle: p.nom, pile: p.pile })
  return [
    ...tete.map(ligne),
    { valeur: '', libelle: t('arbre.carte.defaut'), separateurAvant: tete.length > 0 },
    ...liste.map(ligne),
  ]
}


/**
 * Le sélecteur du jeu de couleurs des branches : un bouton de 72 × 24 (l'anneau du jeu courant, un chevron), et, dessous,
 * les jeux en anneaux de 40 px, trois par ligne : celui du thème d'abord, puis les nôtres. Il se ferme au choix.
 */
function SelecteurJeu({ jeu, propre, faire }: { jeu: readonly string[]; propre: readonly string[]; faire(g: Geste): void }) {
  const o = useOuvrable()
  const jeux = [{ id: 'theme', couleurs: propre }, ...JEUX_COULEURS]
  const meme = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i]!.toLowerCase())
  return (
    <>
      <button ref={o.poser} type="button" className="notak-arbre-reglages-select notak-arbre-reglages-select-jeu" aria-haspopup="dialog" aria-expanded={o.ouvert} aria-label={t('arbre.carte.jeu')} onClick={o.basculer}>
        <Anneau couleurs={jeu} />
        <Icone nom="chevronBas" taille={12} trait={2} />
      </button>
      <Popover ancre={o.ancre} ouvert={o.ouvert} fermer={o.fermer} largeur={184} hauteur={300} className="notak-arbre-reglages-popover-jeux" etiquette={t('arbre.carte.jeu')}>
        <div className="notak-arbre-reglages-jeux" role="listbox" aria-label={t('arbre.carte.jeu')}>
          {jeux.map((j) => (
            <button
              key={j.id}
              type="button"
              role="option"
              aria-selected={meme(j.couleurs, jeu)}
              title={t(`arbre.carte.jeu.${j.id}`)}
              aria-label={t(`arbre.carte.jeu.${j.id}`)}
              className="notak-arbre-reglages-jeu"
              onClick={() => {
                faire({ type: 'jeuCouleurs', couleurs: j.id === 'theme' ? null : [...j.couleurs] })
                o.fermer()
              }}
            >
              <Anneau couleurs={j.couleurs} taille={40} />
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}
