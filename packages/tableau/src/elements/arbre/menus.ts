import type { Arbre, Id } from '../../coeur/tableau'
import type { NomIcone } from '../../icones'
import { t } from '../../langue'
import { type Lecture, enfantsDe } from './modele/sujets'
import type { BoutonBarre } from './repliBarre'

/**
 * Les menus contextuels de la carte (docs/XMIND.md § 14) : ce que contient chaque menu selon ce qu'on clique et ce qui est
 * choisi. Une fonction pure : `construireMenu` rend des entrées, `actionsMenu.ts` sait ce que chacune fait.
 */

export type CibleMenu =
  | { genre: 'sujet'; id: Id }
  | { genre: 'fond'; x: number; y: number }
  | { genre: 'relation'; id: Id }
  | { genre: 'limite'; id: Id }
  | { genre: 'zone'; id: Id }
  | { genre: 'image'; id: Id }
  | { genre: 'equation'; id: Id }
  | { genre: 'marqueur'; id: Id; marqueur: string }
  | { genre: 'etiquette'; id: Id; rang: number }
  | { genre: 'note'; id: Id }
  | { genre: 'lien'; id: Id }
  | { genre: 'piece'; id: Id }
  | { genre: 'planning'; id: Id }
  | { genre: 'tache'; id: Id }

export interface Entree {
  /** L'action que `actionsMenu.ts` exécute ; le libellé vient de la langue. */
  id: string
  libelle: string
  /** L'icône de l'entrée (Tabler, par le registre de `icones.tsx`) : chaque entrée de chaque menu en porte une. */
  icone: NomIcone
  touche?: string
  inactif?: boolean
  /** Une action qui détruit : dite en rouge. */
  danger?: boolean
  sous?: Item[]
}
export type Item = Entree | 'sep'

export interface ContexteMenu {
  arbre: Arbre
  lecture: Lecture
  /** Tout ce qui est choisi : sujets, relations, limites, zones. */
  selection: readonly Id[]
  cible: CibleMenu
  /** Des branches sont de côté (copiées ou coupées) : on peut coller. */
  presse: boolean
  /** Un style est copié : on peut le coller. */
  styleCopie: boolean
  /** « Afficher la branche seule » est en cours sur ce sujet. */
  brancheSeule: Id | null
}

/**
 * L'icône de chaque entrée, d'après le relevé de Xmind (docs/XMIND.md § 14) : Xmind n'en met aucune dans ses menus, Notak
 * en met partout, la même pour la même action quelle que soit la cible. Un identifiant sans icône ne compile pas.
 */
const ICONES_MENU = {
  inserer: 'ajouter',
  commenter: 'commentaire',
  'inserer.note': 'note',
  'inserer.etiquette': 'etiquette',
  'inserer.aFaire': 'menuListeCochee',
  'inserer.tache': 'menuTache',
  'inserer.lien': 'lien',
  'inserer.pageWeb': 'monde',
  'inserer.lienSujet': 'menuSousSujets',
  'inserer.piece': 'trombone',
  'inserer.audio': 'micro',
  'inserer.marqueur': 'humeurSourire',
  'inserer.autocollant': 'menuAutocollant',
  'inserer.illustration': 'palette',
  'inserer.image': 'image',
  'inserer.equation': 'formule',
  couper: 'menuCouper',
  copier: 'menuCopier',
  coller: 'menuColler',
  dupliquer: 'menuDupliquer',
  supprimer: 'corbeille',
  supprimerSeul: 'menuSupprimerSeul',
  viderTexte: 'gomme',
  oter: 'gomme',
  'oter.marqueur': 'menuMarqueurOter',
  'oter.etiquette': 'menuEtiquetteOter',
  'oter.lien': 'detacher',
  'tache.faite': 'menuTacheFaite',
  'tache.nonFaite': 'menuTacheNonFaite',
  'tache.annulee': 'menuTacheAnnulee',
  'tache.oter': 'menuTacheOter',
  'planning.oter': 'menuPlanningOter',
  'style.copier': 'menuStyleCopier',
  'style.coller': 'menuStyleColler',
  'style.reinit': 'menuStyleReinit',
  selectionner: 'menuSelectionner',
  'sel.sousSujets': 'menuSousSujets',
  'sel.freres': 'menuFreres',
  'sel.memeNiveau': 'menuMemeNiveau',
  'sel.tout': 'menuSelectionner',
  'sel.flottants': 'menuSelectionner',
  'sel.resumes': 'menuSelectionner',
  'sel.relations': 'menuSelectionner',
  'sel.limites': 'menuSelectionner',
  'sel.images': 'menuSelectionner',
  'sel.equations': 'menuSelectionner',
  'sel.zones': 'menuSelectionner',
  replier: 'colonneReplier',
  deplier: 'colonneDeplier',
  replierTout: 'menuReplierTout',
  deplierTout: 'menuReplierTout',
  brancheSeule: 'menuBrancheSeule',
  toutAfficher: 'oeil',
  aligner: 'menuAligner',
  'aligner.gauche': 'alignerGauche',
  'aligner.centre': 'alignerCentreH',
  'aligner.droite': 'alignerDroite',
  'aligner.haut': 'alignerHaut',
  'aligner.milieu': 'alignerCentreV',
  'aligner.bas': 'alignerBas',
  'aligner.distribuerH': 'repartirH',
  'aligner.distribuerV': 'repartirV',
  reinitPosition: 'annuler',
  'zone.creer': 'arbreEncadre',
  flottant: 'menuFlottant',
  'relation.inserer': 'arbreRelation',
  central: 'menuCentrer',
  'relation.modifier': 'menuCrayon',
  'relation.styleCopier': 'menuStyleCopier',
  'relation.styleColler': 'menuStyleColler',
  'relation.styleReinit': 'menuStyleReinit',
  'relation.pointReinit': 'menuPointReinit',
  'zone.flottant': 'menuFlottant',
  'zone.supprimer': 'corbeille',
  'zone.retirer': 'menuSupprimerZone',
  'zone.effacer': 'gomme',
  'zone.ajuster': 'menuAjuster',
  enregistrerImage: 'menuEnregistrer',
  'supprimer.champ': 'corbeille',
  'marqueur.panneau': 'menuCrayon',
  surligner: 'menuSurligner',
  modifierNote: 'menuCrayon',
  toutesNotes: 'notes',
  modifierLien: 'menuCrayon',
  'piece.ouvrir': 'ouvrir',
  'piece.enregistrer': 'menuEnregistrer',
  // Les boutons de la barre d'outils, quand ils passent dans le menu « + » : l'icône de leur bouton.
  'replie.relation': 'arbreRelation',
  'replie.resume': 'arbreResume',
  'replie.limite': 'arbreLimite',
  'replie.zone': 'arbreEncadre',
  'replie.etiquette': 'etiquette',
  'replie.tache': 'arbreTache',
} as const satisfies Record<string, NomIcone>
type IdEntree = keyof typeof ICONES_MENU

/** Les entrées qui détruisent : le menu les dit en rouge. */
const DESTRUCTIVES: ReadonlySet<IdEntree> = new Set(['supprimer', 'supprimerSeul', 'zone.supprimer', 'supprimer.champ'])

/** Une entrée. Le libellé de `arbre.menu.<id>` et l'icône de `ICONES_MENU` sauf si l'appelant les donne (une entrée qui en réemploie une autre). */
const e = (id: IdEntree, touche?: string, inactif?: boolean, libelle?: string, icone?: NomIcone): Entree => ({
  id,
  libelle: libelle ?? t(`arbre.menu.${id}`),
  icone: icone ?? ICONES_MENU[id],
  ...(touche ? { touche } : {}),
  ...(inactif ? { inactif: true } : {}),
  ...(DESTRUCTIVES.has(id) ? { danger: true } : {}),
})
const sous = (id: IdEntree, items: Item[], libelle?: string): Entree => ({ id, libelle: libelle ?? t(`arbre.menu.${id}`), icone: ICONES_MENU[id], sous: items })

/** Un séparateur qui se retrouve en tête, en queue ou doublé est retiré ; un sous-menu vide aussi. */
export function nettoyer(items: Item[]): Item[] {
  const net: Item[] = []
  for (const it of items) {
    const x: Item = it !== 'sep' && it.sous ? { ...it, sous: nettoyer(it.sous) } : it
    if (x !== 'sep' && x.sous && x.sous.length === 0) continue
    if (x === 'sep' && (net.length === 0 || net.at(-1) === 'sep')) continue
    net.push(x)
  }
  while (net.at(-1) === 'sep') net.pop()
  return net
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** Les raccourcis s'écrivent avec les glyphes du Mac ; ailleurs, avec Ctrl. */
const K = (s: string) => (MAC ? s : s.replace('⌘', 'Ctrl+').replace('⌥', 'Alt+').replace('⇧', 'Maj+').replace('⌫', 'Retour'))

/** Le sous-menu « Insérer ». */
export function menuInserer(unSeul: boolean, auMoinsUn: boolean): Item[] {
  return [
    e('inserer.note', K('⇧⌘N'), !unSeul),
    e('inserer.etiquette', K('⇧⌘L'), !auMoinsUn),
    e('inserer.aFaire', K('⌥⌘T'), !auMoinsUn),
    e('inserer.tache', undefined, !unSeul),
    sous('inserer.lien', [e('inserer.pageWeb', K('⌘K'), !auMoinsUn), e('inserer.lienSujet', undefined, !unSeul)]),
    'sep',
    e('inserer.piece', undefined, !unSeul),
    e('inserer.audio', undefined, !unSeul),
    'sep',
    e('inserer.marqueur'),
    e('inserer.autocollant', undefined, !auMoinsUn),
    e('inserer.illustration', undefined, !auMoinsUn),
    e('inserer.image', K('⇧⌘I'), !unSeul),
    e('inserer.equation', undefined, !unSeul),
  ]
}

/** Ce que le menu « + » peut insérer selon la sélection : `true` quand l'entrée est active (`etatBarre`, Outils.tsx). */
export interface EtatInsertion {
  note: boolean
  aFaire: boolean
  lienWeb: boolean
  lienSujet: boolean
  piece: boolean
  audio: boolean
  vignette: boolean
  image: boolean
  equation: boolean
}

/** Les raccourcis des boutons de la barre, repris par leur entrée quand elle passe dans le menu « + ». */
const TOUCHES_BARRE: Record<BoutonBarre, string | undefined> = { relation: '⇧⌘R', resume: undefined, limite: '⇧⌘B', zone: '⌥⌘Z', etiquette: '⇧⌘L', tache: undefined }
/** Leur libellé court : celui des entrées de menu de Xmind (Relation, Résumé, Limite, Zone, Étiquette, Tâche). */
const LIBELLES_BARRE: Record<BoutonBarre, string> = {
  relation: 'arbre.relation',
  resume: 'arbre.resume',
  limite: 'arbre.limite',
  zone: 'arbre.inserer.zone',
  etiquette: 'arbre.menu.inserer.etiquette',
  tache: 'arbre.menu.inserer.tache',
}

/**
 * Le menu du bouton « + » de la barre (capture 19) : Note, Tâches à faire, Lien ▸, puis les pièces jointes, puis les
 * images. Les boutons que la barre a replié faute de place passent en tête, dans l'ordre de la barre, suivis d'un
 * séparateur (docs/XMIND.md § 8).
 */
export function menuPlus(etat: EtatInsertion, replies: readonly { id: BoutonBarre; inactif: boolean }[] = []): Item[] {
  return nettoyer([
    ...replies.map((r) => e(`replie.${r.id}`, TOUCHES_BARRE[r.id] && K(TOUCHES_BARRE[r.id]!), r.inactif, t(LIBELLES_BARRE[r.id]))),
    'sep',
    e('inserer.note', K('⇧⌘N'), !etat.note),
    e('inserer.aFaire', K('⌥⌘T'), !etat.aFaire),
    sous('inserer.lien', [e('inserer.pageWeb', K('⌘K'), !etat.lienWeb), e('inserer.lienSujet', undefined, !etat.lienSujet)]),
    'sep',
    e('inserer.piece', undefined, !etat.piece),
    e('inserer.audio', undefined, !etat.audio),
    'sep',
    e('inserer.autocollant', undefined, !etat.vignette),
    e('inserer.illustration', undefined, !etat.vignette),
    e('inserer.image', K('⇧⌘I'), !etat.image),
    e('inserer.equation', undefined, !etat.equation),
  ])
}

/** Ce que ses sous-branches offrent : y en a-t-il qui se replient, et en reste-t-il d'ouvertes (« replier » ou « déplier ») ? */
function sousBranches(l: Lecture, id: Id): { existent: boolean; ouvertes: boolean } {
  let existent = false
  let ouvertes = false
  const pile = [...enfantsDe(l, id)]
  while (pile.length) {
    const x = pile.pop()!
    const enfants = enfantsDe(l, x)
    if (enfants.length > 0) {
      existent = true
      if (!l.sujets.get(x)?.replie) ouvertes = true
    }
    pile.push(...enfants)
  }
  return { existent, ouvertes }
}

/** Le menu d'un sujet : le complet, ou l'ordinaire d'un sujet de résumé. */
function menuSujet(c: ContexteMenu, id: Id): Item[] {
  const { lecture: l, arbre: a } = c
  const sujets = c.selection.filter((x) => l.sujets.has(x))
  const choisis = sujets.includes(id) ? sujets : [id]
  const s = l.sujets.get(id)!
  const central = id === l.central
  const resume = s.genre === 'resume'
  const flottant = s.genre === 'detache'
  const tous = choisis.map((x) => l.sujets.get(x)!)
  const unSeul = choisis.length === 1
  const aDesEnfants = enfantsDe(l, id).length > 0
  const branches = sousBranches(l, id)
  const marqueurs = tous.some((x) => x.marqueurs?.length)
  const etiquettes = tous.some((x) => x.etiquettes?.length)
  const liens = tous.some((x) => x.lien)
  const retirables = [marqueurs && 'marqueur', etiquettes && 'etiquette', liens && 'lien'].filter(Boolean) as string[]
  const enleverUn = (genre: string) => (genre === 'marqueur' ? e('oter.marqueur') : genre === 'etiquette' ? e('oter.etiquette') : e('oter.lien'))
  const etatTache = unSeul ? s.tache : undefined
  const items: Item[] = []
  items.push(sous('inserer', menuInserer(unSeul, true)), e('commenter', K('⌥⌘M'), !unSeul), 'sep')
  if (!resume) {
    items.push(e('couper', K('⌘X'), central), e('copier', K('⌘C')), e('coller', K('⌘V'), !c.presse), e('dupliquer', K('⌘D'), central), 'sep')
  } else items.push(e('copier', K('⌘C'), true), 'sep')
  items.push(e('supprimer', K('⌫'), central))
  if (!resume) items.push(e('supprimerSeul', K('⌘⌫'), central))
  if (tous.some((x) => x.titre.trim())) items.push(e('viderTexte'))
  if (retirables.length === 1) items.push(enleverUn(retirables[0]!))
  else if (retirables.length > 1) items.push(sous('oter', retirables.map(enleverUn)))
  items.push('sep')
  const tacheMarques: Item[] = []
  if (unSeul && etatTache) {
    if (etatTache !== 'faite') tacheMarques.push(e('tache.faite'))
    if (etatTache !== 'a-faire') tacheMarques.push(e('tache.nonFaite'))
    if (etatTache !== 'annulee') tacheMarques.push(e('tache.annulee'))
    tacheMarques.push(e('tache.oter'))
  }
  if (unSeul && s.planning) tacheMarques.push(e('planning.oter'))
  items.push(...tacheMarques)
  if (tacheMarques.length) items.push('sep')
  items.push(e('style.copier', K('⌥⌘C')), e('style.coller', K('⌥⌘V'), !c.styleCopie), e('style.reinit', K('⌥⌘0')), 'sep')
  items.push(sous('selectionner', menuSelection(c, id, central, resume, flottant)), 'sep')
  if (!central) items.push(e(s.replie ? 'deplier' : 'replier', K('⌘/'), !aDesEnfants))
  items.push(e(branches.ouvertes ? 'replierTout' : 'deplierTout', K('⌥⌘/'), !branches.existent))
  if (!central && !resume) {
    items.push('sep', e(c.brancheSeule === id ? 'toutAfficher' : 'brancheSeule', K('⌘;')))
  }
  if (flottant) {
    const flottants = choisis.filter((x) => l.sujets.get(x)?.genre === 'detache')
    const peu = flottants.length < 2
    items.push(
      'sep',
      sous('aligner', [
        e('aligner.gauche', undefined, peu),
        e('aligner.centre', undefined, peu),
        e('aligner.droite', undefined, peu),
        'sep',
        e('aligner.haut', undefined, peu),
        e('aligner.milieu', undefined, peu),
        e('aligner.bas', undefined, peu),
        'sep',
        e('aligner.distribuerH', undefined, flottants.length < 3),
        e('aligner.distribuerV', undefined, flottants.length < 3),
      ]),
    )
  }
  if (!central && !flottant && !resume && s.parent === l.central && a.options?.libre) items.push('sep', e('reinitPosition'))
  return nettoyer(items)
}

function menuSelection(c: ContexteMenu, id: Id, central: boolean, resume: boolean, flottant: boolean): Item[] {
  const sousSujets = e('sel.sousSujets', undefined, enfantsDe(c.lecture, id).length === 0)
  if (resume) return [e('sel.resumes'), sousSujets, 'sep', e('sel.tout', K('⌘A'))]
  if (flottant) return [e('sel.flottants'), sousSujets, 'sep', e('sel.tout', K('⌘A'))]
  if (central) return [sousSujets, 'sep', e('sel.tout', K('⌘A'))]
  return [sousSujets, e('sel.freres'), e('sel.memeNiveau'), 'sep', e('sel.tout', K('⌘A'))]
}

/** Le menu du fond de la carte. */
function menuFond(c: ContexteMenu): Item[] {
  const l = c.lecture
  const toutOuvert = [...l.sujets.keys()].some((x) => enfantsDe(l, x).length > 0 && !l.sujets.get(x)?.replie && x !== l.central)
  return nettoyer([
    e('coller', K('⌘V'), !c.presse),
    'sep',
    e('zone.creer', K('⌥⌘Z')),
    e('flottant'),
    e('relation.inserer', K('⇧⌘R')),
    'sep',
    e(toutOuvert ? 'replierTout' : 'deplierTout', K('⌥⌘/')),
    'sep',
    e('central', K('⌘R')),
    sous('selectionner', [
      e('sel.flottants', undefined, l.flottants.length === 0),
      e('sel.relations', undefined, !c.arbre.relations || Object.keys(c.arbre.relations).length === 0),
      e('sel.resumes', undefined, l.resumes.length === 0),
      e('sel.limites', undefined, !c.arbre.limites || Object.keys(c.arbre.limites).length === 0),
      e('sel.images', undefined, ![...l.sujets.values()].some((s) => s.image || s.vignette)),
      e('sel.equations', undefined, ![...l.sujets.values()].some((s) => s.equation)),
      e('sel.zones', undefined, !c.arbre.zones || Object.keys(c.arbre.zones).length === 0),
      'sep',
      e('sel.tout', K('⌘A')),
    ]),
  ])
}

function menuRelation(c: ContexteMenu, id: Id): Item[] {
  return nettoyer([
    e('relation.modifier', t('arbre.menu.espace')),
    e('supprimer', K('⌫')),
    'sep',
    e('relation.styleCopier', K('⌥⌘C')),
    e('relation.styleColler', K('⌥⌘V'), !c.styleCopie),
    e('relation.styleReinit', K('⌥⌘0')),
    'sep',
    e('relation.pointReinit', undefined, !c.arbre.relations?.[id]?.controles),
    'sep',
    e('sel.relations'),
  ])
}

function menuLimite(): Item[] {
  return nettoyer([e('relation.modifier', t('arbre.menu.espace')), e('supprimer', K('⌫')), 'sep', e('sel.limites')])
}

function menuZone(): Item[] {
  return nettoyer([
    e('zone.flottant'),
    'sep',
    e('zone.supprimer'),
    e('zone.retirer'),
    e('zone.effacer'),
    'sep',
    e('zone.ajuster'),
    'sep',
    e('sel.zones'),
  ])
}

/** Le menu de ce qu'on clique, selon la cible : un sujet, le fond, une relation, une zone, une image… */
export function construireMenu(c: ContexteMenu): Item[] {
  const cible = c.cible
  switch (cible.genre) {
    case 'sujet':
      return c.lecture.sujets.has(cible.id) ? menuSujet(c, cible.id) : []
    case 'fond':
      return menuFond(c)
    case 'relation':
      return menuRelation(c, cible.id)
    case 'limite':
      return menuLimite()
    case 'zone':
      return menuZone()
    case 'image':
      return nettoyer([c.lecture.sujets.get(cible.id)?.image ? e('enregistrerImage') : 'sep', 'sep', e('supprimer.champ'), 'sep', e('sel.images')])
    case 'equation':
      return nettoyer([e('inserer.equation', undefined, false, t('arbre.menu.modifier'), 'menuCrayon'), 'sep', e('supprimer.champ'), 'sep', e('sel.equations')])
    case 'marqueur':
      return nettoyer([e('marqueur.panneau', undefined, false, t('arbre.menu.modifier')), 'sep', e('supprimer.champ'), 'sep', e('surligner')])
    case 'etiquette':
      return nettoyer([e('supprimer.champ'), 'sep', e('surligner')])
    case 'note':
      return nettoyer([e('modifierNote'), 'sep', e('supprimer.champ'), 'sep', e('toutesNotes')])
    case 'lien':
      return nettoyer([e('modifierLien'), 'sep', e('supprimer.champ')])
    case 'piece':
      return nettoyer([e('piece.ouvrir'), 'sep', e('supprimer.champ'), 'sep', e('piece.enregistrer')])
    case 'planning':
      return nettoyer([e('inserer.tache', undefined, false, t('arbre.menu.modifier'), 'menuCrayon'), 'sep', e('planning.oter')])
    case 'tache':
      return nettoyer([e('supprimer.champ'), e('tache.annulee'), 'sep', e('tache.faite')])
  }
}

/** Les entrées d'un menu, à plat (pour les tests et la navigation au clavier) : sans séparateurs ni sous-menus. */
export function entrees(items: Item[]): Entree[] {
  return items.flatMap((x) => (x === 'sep' ? [] : x.sous ? [x, ...entrees(x.sous)] : [x]))
}
