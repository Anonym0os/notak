import type { Editor } from '@tiptap/react'
import { t } from '../langue'
import { ACTIONS_BLOC, CATALOGUE, type Couleur, ENTREES_COULEURS, type Entree, SECTIONS_SLASH, type Section, TRANSFORMATIONS, type Vers, chercher, couleurDeAttribut, couleurEnAttribut, titreSection } from './catalogue'
import { colorerBlocs, dupliquer, supprimer } from './gestes'
import { type TypeBloc, blocsDe } from './modele'
import { blocsChoisis, choisir as choisirBlocs, idA } from './selection'

/**
 * Le contenu des menus et ce que font les actions du bloc (docs/NOTION.md § 3) : des listes rangées en groupes, pour le
 * menu « / » (docs/NOTION.md § 2), le menu du bloc, « Transformer en » et le sous-menu de couleur. Les listes sont des
 * fonctions pures du texte cherché ; les gestes prennent l'éditeur.
 */

/** Un groupe de lignes sous un titre (vide pour une section sans titre) ; `suffixe` : chaque ligne dit sa section. */
export interface Groupe {
  cle: string
  titre: string
  lignes: Entree[]
  suffixe?: boolean
}

export const lignesDe = (groupes: readonly Groupe[]): Entree[] => groupes.flatMap((g) => g.lignes)

/** La même entrée avec d'autres champs, sans perdre son libellé qui suit la langue. */
const avec = (e: Entree, patch: Partial<Pick<Entree, 'id' | 'raccourci' | 'section'>>): Entree =>
  Object.create(e, Object.fromEntries(Object.entries(patch).map(([k, value]) => [k, { value, enumerable: true }]))) as Entree

/** Les sections dont la ligne ne répète pas son nom de section dans une liste filtrée (NOTION.md § 2.3). */
const SANS_SUFFIXE = new Set<Section>(['base', 'media'])
export const suffixeDe = (e: Entree): string => (SANS_SUFFIXE.has(e.section) || e.section.startsWith('bloc') ? '' : titreSection(e.section))

/** Les entrées groupées par section, dans l'ordre où leurs sections se présentent. */
function grouper(entrees: readonly Entree[], titres: (s: Section) => string): Groupe[] {
  const par = new Map<Section, Entree[]>()
  for (const e of entrees) par.set(e.section, [...(par.get(e.section) ?? []), e])
  return [...par].map(([s, lignes]) => ({ cle: s, titre: titres(s), lignes }))
}

/** Le menu « / » : sans texte, ses sections ; avec du texte, une seule liste filtrée. */
export function listeSlash(requete: string, { image, lien }: { image: boolean; lien: boolean }): Groupe[] {
  const dispo = CATALOGUE.filter((e) => (image || e.id !== 'image') && (lien || e.id !== 'slash-lien'))
  const filtre = requete.trim().replace(/^\//, '').trim()
  if (!filtre) return SECTIONS_SLASH.map((s) => ({ cle: s, titre: titreSection(s), lignes: dispo.filter((e) => e.section === s) })).filter((g) => g.lignes.length > 0)
  const lignes = chercher(dispo, requete)
  return lignes.length ? [{ cle: 'resultats', titre: t('menus.resultats'), lignes, suffixe: true }] : []
}

/** Le menu du bloc : le type du bloc et ses sous-menus, la gestion, commenter ; avec du texte, tout, regroupé par section. */
export function listeBloc(requete: string, { lien, commenter, titre }: { lien: boolean; commenter: boolean; titre: string }): Groupe[] {
  const dispo = ACTIONS_BLOC.filter((e) => (lien || e.effet.genre !== 'action' || e.effet.action !== 'lien') && (commenter || e.effet.genre !== 'action' || e.effet.action !== 'commenter'))
  const titres = (s: Section) => (s === 'blocPrincipal' ? titre : titreSection(s))
  if (!requete.trim()) return grouper(dispo, titres)
  return grouper(chercher([...dispo, ...TRANSFORMATIONS, ...ENTREES_COULEURS], requete), titres)
}

/** « Transformer en » : une seule section de types. */
export function listeTransformer(requete: string): Groupe[] {
  const lignes = chercher(TRANSFORMATIONS, requete)
  return lignes.length ? [{ cle: 'transformer', titre: '', lignes }] : []
}

/** Le sous-menu de couleur : la dernière utilisée (⌘⇧H), le texte, le fond. */
export function listeCouleur(requete: string, derniere: Couleur | null): Groupe[] {
  if (requete.trim()) return grouper(chercher(ENTREES_COULEURS, requete), titreSection)
  const d = derniere && ENTREES_COULEURS.find((e) => e.effet.genre === 'couleur' && e.effet.couleur.nom === derniere.nom && e.effet.couleur.fond === derniere.fond)
  return [
    ...(d ? [{ cle: 'derniere', titre: t('menus.section.derniere'), lignes: [avec(d, { id: 'derniere', raccourci: '⌘⇧H' })] }] : []),
    ...grouper(ENTREES_COULEURS, titreSection),
  ]
}

/* --- Ce que les actions font aux blocs --- */

/** Les blocs que le menu vise : les blocs choisis, sinon le bloc du curseur. */
export function idsCibles(editor: Editor): string[] {
  const choisis = blocsChoisis(editor.state)
  if (choisis.length) return choisis
  const id = idA(editor.state.doc, editor.state.selection.from)
  return id ? [id] : []
}

const VERS: ReadonlySet<TypeBloc> = new Set<TypeBloc>(['texte', 'titre1', 'titre2', 'titre3', 'puce', 'numero', 'tache', 'deroulant', 'titreDeroulant1', 'titreDeroulant2', 'titreDeroulant3', 'citation', 'encadre', 'code'])

/**
 * Le type commun des blocs visés : `vers` quand ils sont tous du même type transformable (la coche de « Transformer
 * en »), et le titre de la première section du menu : le nom du type, ou « N blocs » quand ils diffèrent.
 */
export function typeDeLaCible(editor: Editor, ids: readonly string[]): { vers: Vers | null; titre: string } {
  const types = [...new Set(blocsDe(editor.state.doc).filter((b) => b.id && ids.includes(b.id)).map((b) => b.type))]
  if (types.length === 1) {
    const type = types[0]!
    return { vers: VERS.has(type) ? (type as Vers) : null, titre: ['colonnes', 'colonne', 'apercuLien'].includes(type) ? '' : t(`blocs.${type}`) }
  }
  return { vers: null, titre: ids.length > 1 ? t('menus.nBlocs', { n: ids.length }) : '' }
}

export interface Services {
  copierLien?: (id: string) => void
  commenterBloc?: (id: string) => void
  surCouleur?: (c: Couleur) => void
}

/** Colorie, duplique, supprime, copie le lien ou commente les blocs visés (la couleur : tout le bloc, jamais un passage). */
export function agirSurBlocs(editor: Editor, effet: Entree['effet'], services: Services = {}): boolean {
  const ids = idsCibles(editor)
  if (ids.length === 0) return false
  const envoyer = (tr: ReturnType<typeof supprimer>) => !!tr && (editor.view.dispatch(tr), true)
  if (effet.genre === 'couleur') {
    services.surCouleur?.(effet.couleur)
    return envoyer(colorerBlocs(editor.state, ids, couleurEnAttribut(effet.couleur)))
  }
  if (effet.genre !== 'action') return false
  switch (effet.action) {
    case 'supprimer':
      return envoyer(supprimer(editor.state, ids))
    case 'dupliquer': {
      const d = dupliquer(editor.state, ids)
      if (!d) return false
      editor.view.dispatch(choisirBlocs(editor.state, { ancre: d.copies[0]!, tete: d.copies[d.copies.length - 1]! }, d.tr))
      return true
    }
    case 'lien':
      if (ids.length !== 1) return false
      services.copierLien?.(ids[0]!)
      return !!services.copierLien
    case 'commenter':
      services.commenterBloc?.(ids[0]!)
      return !!services.commenterBloc
    default:
      return false
  }
}

/** La couleur du premier bloc visé (la coche du sous-menu de couleur) : celle qu'il porte, sinon la couleur par défaut. */
export function couleurDuPremier(editor: Editor, ids: readonly string[]): Couleur {
  const bloc = blocsDe(editor.state.doc).find((b) => b.id && b.id === ids[0])
  return couleurDeAttribut(bloc ? editor.state.doc.nodeAt(bloc.pos)?.attrs.couleur : null) ?? { nom: 'defaut', fond: false }
}
