import type { Arbre, Id, Relation } from '../../coeur/tableau'
import type { CibleMenu } from './menus'
import type { Geste } from './modele/gestes'
import { type Alignement, type Genre, choisirParGenre } from './modele/insertions'
import type { Lecture } from './modele/sujets'
import { type OngletIcone } from './onglets'

/** Ce que la barre d'outils et le menu « + » déclenchent : chacun ouvre un éditeur, un sélecteur de fichier ou un panneau. */
export interface ActionsInsertion {
  zone(): void
  etiquettes(): void
  tache(): void
  aFaire(): void
  note(): void
  lienWeb(): void
  lienSujet(): void
  pieceJointe(): void
  noteAudio(): void
  marqueur(): void
  autocollant(): void
  illustration(): void
  imageLocale(): void
  equation(): void
}

/** Ce que la carte ouverte sait faire pour un menu : tout passe par ces fonctions, que `Grand` (Arbre.tsx) fournit. */
export interface Hote {
  arbre(): Arbre
  lecture(): Lecture
  faire(g: Geste): void
  choisir(ids: Id[]): void
  editer(id: Id): void
  copier(ids: Id[], couper: boolean): void
  /** Colle sous un sujet, ou en flottants au point (px de carte). */
  coller(cible: { parent: Id } | { x: number; y: number }): void
  copierStyle(id: Id): void
  collerStyle(ids: Id[]): void
  copierStyleRelation(id: Id): void
  collerStyleRelation(ids: Id[]): void
  inserer: ActionsInsertion
  ouvrirIcones(onglet: OngletIcone): void
  /** Ouvrir le panneau de la note d'un sujet, ou toutes les notes. */
  ouvrirNote(id: Id | null): void
  allerAuCentral(): void
  brancheSeule(id: Id): void
  relier(id: Id): void
  tailles(ids: Id[]): Record<Id, { l: number; h: number }>
  contenuZone(id: Id): Id[]
  ajusterZone(id: Id): void
  /** Enregistrer un fichier de la carte sous son nom. */
  telecharger(fichier: Id, nom: string): void
  ouvrirFichier(fichier: Id): void
  /** Le sujet flottant qu'on insère au point cliqué. */
  flottant(x: number, y: number): void
  ouvrirLien(id: Id): void
  /** Ouvre le fil de commentaires d'un sujet (il se crée au premier message). */
  commenter(id: Id): void
}

const SELECTIONS: Record<string, Genre> = {
  'sel.sousSujets': 'sousSujets',
  'sel.freres': 'freres',
  'sel.memeNiveau': 'memeNiveau',
  'sel.tout': 'tout',
  'sel.flottants': 'flottants',
  'sel.resumes': 'resumes',
  'sel.relations': 'relations',
  'sel.limites': 'limites',
  'sel.images': 'images',
  'sel.equations': 'equations',
  'sel.zones': 'zones',
}

const ALIGNEMENTS: Record<string, Alignement> = {
  'aligner.gauche': 'gauche',
  'aligner.centre': 'centre',
  'aligner.droite': 'droite',
  'aligner.haut': 'haut',
  'aligner.milieu': 'milieu',
  'aligner.bas': 'bas',
  'aligner.distribuerH': 'distribuerH',
  'aligner.distribuerV': 'distribuerV',
}

const INSERTIONS: Record<string, keyof ActionsInsertion> = {
  'inserer.note': 'note',
  'inserer.etiquette': 'etiquettes',
  'inserer.aFaire': 'aFaire',
  'inserer.tache': 'tache',
  'inserer.pageWeb': 'lienWeb',
  'inserer.lienSujet': 'lienSujet',
  'inserer.piece': 'pieceJointe',
  'inserer.audio': 'noteAudio',
  'inserer.marqueur': 'marqueur',
  'inserer.autocollant': 'autocollant',
  'inserer.illustration': 'illustration',
  'inserer.image': 'imageLocale',
  'inserer.equation': 'equation',
}

/** Ce que l'entrée `action` du menu fait, sur la cible cliquée et la sélection. */
export function executer(action: string, cible: CibleMenu, selection: readonly Id[], h: Hote): void {
  const a = h.arbre()
  const l = h.lecture()
  const sujets = selection.filter((x) => l.sujets.has(x))
  const id = 'id' in cible ? cible.id : null
  // Un menu de sujet agit sur toute la sélection si le sujet cliqué en fait partie, sinon sur lui seul.
  const ids = cible.genre === 'sujet' ? (sujets.includes(cible.id) ? sujets : [cible.id]) : id ? [id] : sujets
  const sujetsCibles = ids.filter((x) => l.sujets.has(x))

  const insertion = INSERTIONS[action]
  if (insertion) {
    // Un sujet qu'on n'avait pas choisi le devient avant d'ouvrir un éditeur.
    if (cible.genre === 'sujet' && !sujets.includes(cible.id)) h.choisir([cible.id])
    else if (id && l.sujets.has(id) && cible.genre !== 'sujet') h.choisir([id])
    h.inserer[insertion]()
    return
  }
  const genre = SELECTIONS[action]
  if (genre) {
    h.choisir(choisirParGenre(a, l, id ?? l.central, genre))
    return
  }
  const alignement = ALIGNEMENTS[action]
  if (alignement) return h.faire({ type: 'aligner', ids: sujetsCibles, mode: alignement, tailles: h.tailles(sujetsCibles) })

  switch (action) {
    case 'commenter':
      return id ? h.commenter(id) : undefined
    case 'couper':
      return h.copier(sujetsCibles, true)
    case 'copier':
      return h.copier(sujetsCibles, false)
    case 'coller':
      return h.coller(cible.genre === 'fond' ? { x: cible.x, y: cible.y } : { parent: id ?? l.central })
    case 'dupliquer':
      return void sujetsCibles.slice(0, 1).forEach((x) => h.faire({ type: 'dupliquer', id: x }))
    case 'supprimer':
      return h.faire({ type: 'supprimer', ids: cible.genre === 'sujet' ? ids : id && !selection.includes(id) ? [id] : [...selection] })
    case 'supprimerSeul':
      return h.faire({ type: 'supprimerSeul', id: id! })
    case 'viderTexte':
      return h.faire({ type: 'lot', gestes: sujetsCibles.map((x) => ({ type: 'renommer', id: x, titre: '' })) })
    case 'oter.marqueur':
      return h.faire({ type: 'oter', ids: sujetsCibles, champs: ['marqueurs'] })
    case 'oter.etiquette':
      return h.faire({ type: 'oter', ids: sujetsCibles, champs: ['etiquettes'] })
    case 'oter.lien':
      return h.faire({ type: 'oter', ids: sujetsCibles, champs: ['lien'] })
    case 'tache.faite':
      return h.faire({ type: 'porter', ids: sujetsCibles, champ: 'tache', valeur: 'faite' })
    case 'tache.nonFaite':
      return h.faire({ type: 'porter', ids: sujetsCibles, champ: 'tache', valeur: 'a-faire' })
    case 'tache.annulee':
      return h.faire({ type: 'porter', ids: sujetsCibles, champ: 'tache', valeur: 'annulee' })
    case 'tache.oter':
      return h.faire({ type: 'oter', ids: sujetsCibles, champs: ['tache'] })
    case 'planning.oter':
      return h.faire({ type: 'oter', ids: sujetsCibles, champs: ['planning'] })
    case 'style.copier':
      return h.copierStyle(id ?? l.central)
    case 'style.coller':
      return h.collerStyle(sujetsCibles)
    case 'style.reinit':
      return h.faire({ type: 'style', ids: sujetsCibles, style: null })
    case 'replier':
    case 'deplier':
      return h.faire({ type: 'replier', id: id! })
    case 'replierTout':
    case 'deplierTout':
      return cible.genre === 'fond' ? h.faire({ type: 'toutReplier' }) : h.faire({ type: 'replierBranches', id: id!, replier: action === 'replierTout' })
    case 'brancheSeule':
    case 'toutAfficher':
      return h.brancheSeule(id!)
    case 'reinitPosition':
      return h.faire({ type: 'realigner', ids: sujetsCibles })
    case 'zone.creer':
      return h.inserer.zone()
    case 'flottant':
      return cible.genre === 'fond' ? h.flottant(cible.x, cible.y) : undefined
    case 'relation.inserer':
      return h.relier(l.central)
    case 'central':
      return h.allerAuCentral()
    case 'relation.modifier':
      return h.editer(id!)
    case 'relation.styleCopier':
      return h.copierStyleRelation(id!)
    case 'relation.styleColler':
      return h.collerStyleRelation([id!])
    case 'relation.styleReinit':
      return h.faire({ type: 'relationReinit', ids: [id!], quoi: 'tout' })
    case 'relation.pointReinit':
      return h.faire({ type: 'relationReinit', ids: [id!], quoi: 'point' })
    case 'zone.flottant': {
      const z = a.zones?.[id!]
      if (z) h.flottant(z.x + z.l / 2, z.y + z.h / 2)
      return
    }
    case 'zone.supprimer':
      return h.faire({ type: 'zoneRetirer', id: id!, membres: h.contenuZone(id!), quoi: 'tout' })
    case 'zone.retirer':
      return h.faire({ type: 'zoneRetirer', id: id!, membres: [], quoi: 'zone' })
    case 'zone.effacer':
      return h.faire({ type: 'zoneRetirer', id: id!, membres: h.contenuZone(id!), quoi: 'contenu' })
    case 'zone.ajuster':
      return h.ajusterZone(id!)
    case 'enregistrerImage': {
      const s = id ? l.sujets.get(id) : undefined
      if (s?.image) h.telecharger(s.image.fichier, `${s.titre.replace(/\s+/g, ' ').trim() || 'image'}.png`)
      return
    }
    case 'piece.ouvrir': {
      const p = id ? l.sujets.get(id)?.piece : undefined
      if (p) h.ouvrirFichier(p.fichier)
      return
    }
    case 'piece.enregistrer': {
      const p = id ? l.sujets.get(id)?.piece : undefined
      if (p) h.telecharger(p.fichier, p.nom)
      return
    }
    case 'modifierNote':
      return h.ouvrirNote(id)
    case 'toutesNotes':
      return h.ouvrirNote(null)
    case 'modifierLien':
      return h.inserer[id && l.sujets.get(id)?.lien?.startsWith('sujet:') ? 'lienSujet' : 'lienWeb']()
    case 'marqueur.panneau':
      return h.ouvrirIcones('marqueurs')
    case 'surligner': {
      if (cible.genre === 'marqueur') h.choisir([...l.sujets].filter(([, s]) => s.marqueurs?.includes(cible.marqueur)).map(([x]) => x))
      else if (cible.genre === 'etiquette') {
        const nom = l.sujets.get(cible.id)?.etiquettes?.[cible.rang]
        if (nom) h.choisir([...l.sujets].filter(([, s]) => s.etiquettes?.includes(nom)).map(([x]) => x))
      }
      return
    }
    case 'supprimer.champ':
      return supprimerChamp(cible, a, h)
  }
}

/** « Supprimer » sur une pastille du sujet : l'image, l'équation, un marqueur, une étiquette, la note, le lien, la pièce, la tâche. */
function supprimerChamp(c: CibleMenu, a: Arbre, h: Hote) {
  if (!('id' in c)) return
  const ids = [c.id]
  switch (c.genre) {
    case 'image':
      return h.faire({ type: 'oter', ids, champs: ['image', 'vignette'] })
    case 'equation':
      return h.faire({ type: 'oter', ids, champs: ['equation'] })
    case 'marqueur':
      return h.faire({ type: 'marqueur', ids, marqueur: c.marqueur })
    case 'etiquette': {
      const nom = a.sujets[c.id]?.etiquettes?.[c.rang]
      return nom ? h.faire({ type: 'etiquettes', ids, retirer: [nom] }) : undefined
    }
    case 'note':
      return h.faire({ type: 'oter', ids, champs: ['note'] })
    case 'lien':
      return h.faire({ type: 'oter', ids, champs: ['lien'] })
    case 'piece':
      return h.faire({ type: 'oter', ids, champs: ['piece'] })
    case 'tache':
      return h.faire({ type: 'oter', ids, champs: ['tache'] })
  }
}

/** Le style d'une relation qu'on copie : sa forme et ses pointes. */
export const styleDeRelation = (r: Relation | undefined) => ({ forme: r?.forme, pointes: r?.pointes })
