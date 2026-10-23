// Ce fichier est lu par le serveur sans la toile (Node, sans bundler) : il ne tire rien d'autre que des types.
import type { CouleurNote, Element, NoeudTexte } from '../coeur/tableau'

/** Où se pose un élément du modèle, en UG ; la largeur par défaut est celle de son genre. */
export interface Pose {
  x: number
  y: number
  largeur?: number
}

/** Ce qu'une colonne contient : posé dans la colonne, sans position. */
export type Feuille =
  | { genre: 'note'; texte: string; couleur?: CouleurNote }
  | { genre: 'taches'; titre?: string; taches: (string | { texte: string; faite: true })[]; couleur?: CouleurNote }

/**
 * Un élément d'un modèle. Le texte d'une note se découpe en lignes ; une ligne qui commence par `# ` devient un
 * sous-titre. Les tâches cochées se disent `{ texte, faite: true }`.
 */
export type ElementModele =
  | ({ genre: 'titre'; texte: string } & Pose)
  | ({ genre: 'colonne'; titre: string; couleur?: CouleurNote; contenu: Feuille[] } & Pose)
  | (Feuille & Pose)

/** Un tableau de départ, décrit en données. */
export interface ModeleTableau {
  id: string
  /** Le titre que prend le tableau. */
  titre: string
  /** Une phrase pour le choix. */
  resume: string
  /** La couleur de sa carte dans le tableau parent. */
  couleur: CouleurNote
  elements: ElementModele[]
}

export const LARGEUR_NOTE_MODELE = 34
export const LARGEUR_COLONNE_MODELE = 34
export const LARGEUR_TITRE_MODELE = 60
export const largeurModele = (e: ElementModele): number => largeurDe(e)
/** Un pixel vaut un dixième d’UG. */
const PX_PAR_UG = 10

const largeurDe = (e: ElementModele): number =>
  e.largeur ?? (e.genre === 'titre' ? LARGEUR_TITRE_MODELE : e.genre === 'colonne' ? LARGEUR_COLONNE_MODELE : LARGEUR_NOTE_MODELE)

/** Les clés de rang d'une liste : triées comme des chaînes, sans jamais finir par le plus petit chiffre. */
const CHIFFRES = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const cleDeRang = (i: number): string => {
  const haut = Math.floor(i / CHIFFRES.length)
  return (haut > 0 ? CHIFFRES[haut - 1]! : '') + CHIFFRES[i % CHIFFRES.length]!
}

const paragraphe = (t: string): NoeudTexte => (t ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph' })

/** Le texte d'une note : un paragraphe par ligne, un sous-titre pour `# `. */
export function docDeNote(texte: string): NoeudTexte {
  return {
    type: 'doc',
    content: texte.split('\n').map((l) =>
      l.startsWith('# ') ? { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: l.slice(2) }] } : paragraphe(l),
    ),
  }
}

export function docDeTaches(taches: Extract<Feuille, { genre: 'taches' }>['taches']): NoeudTexte {
  return {
    type: 'doc',
    content: [
      {
        type: 'taskList',
        content: taches.map((t) => {
          const [texte, faite] = typeof t === 'string' ? [t, false] : [t.texte, true]
          return { type: 'taskItem', attrs: { checked: faite }, content: [paragraphe(texte)] }
        }),
      },
    ],
  }
}

/** Les lignes qu'un texte occupe à cette largeur (en UG), à peu près : environ 1,4 caractère par UG. */
const lignesDe = (texte: string, largeur: number): number =>
  texte.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / Math.max(8, largeur * 1.35 - 3))), 0)

function pixelsFeuille(f: Feuille, largeur: number): number {
  if (f.genre === 'note') return 20 + lignesDe(f.texte, largeur) * 18
  return 20 + (f.titre ? 28 : 0) + f.taches.length * 26
}

/** La hauteur estimée d'une feuille dans une colonne de cette largeur, en UG. */
export const hauteurFeuille = (f: Feuille, largeur: number): number => Math.ceil(pixelsFeuille(f, largeur - 2) / PX_PAR_UG)

/** La hauteur que prendra l'élément à l'écran, en UG, estimée : de quoi vérifier que rien ne se chevauche. */
export function hauteurEstimee(e: ElementModele): number {
  const largeur = largeurDe(e)
  if (e.genre === 'titre') return Math.ceil((20 + lignesDe(e.texte, largeur / 1.6) * 28) / PX_PAR_UG)
  if (e.genre === 'colonne') {
    const corps = e.contenu.reduce((s, f) => s + pixelsFeuille(f, largeur - 2) + 8, 0)
    return Math.ceil((44 + corps + 12) / PX_PAR_UG)
  }
  return Math.max(e.genre === 'note' ? 8 : 6, Math.ceil(pixelsFeuille(e, largeur) / PX_PAR_UG))
}

/**
 * La variante d'un modèle sans ses exemples : mêmes titres, mêmes colonnes, mêmes positions. Une note ne garde que
 * son sous-titre (la ligne `# `), une liste de tâches son titre et une seule case vide, et les colonnes se
 * vident de ce qu'elles contenaient.
 */
export function sansExemple(m: ModeleTableau): ModeleTableau {
  const vider = (e: ElementModele): ElementModele => {
    if (e.genre === 'titre') return e
    if (e.genre === 'colonne') return { ...e, contenu: [] }
    if (e.genre === 'note') return { ...e, texte: e.texte.split('\n').filter((l) => l.startsWith('# ')).slice(0, 1).join('') }
    return { ...e, taches: [''] }
  }
  return { ...m, elements: m.elements.map(vider) }
}

const contenuDe = (f: Feuille): Element['contenu'] =>
  f.genre === 'note'
    ? { type: 'note', texte: docDeNote(f.texte), ...(f.couleur ? { couleur: f.couleur } : {}) }
    : { type: 'taches', ...(f.titre ? { titre: f.titre } : {}), ...(f.couleur ? { couleur: f.couleur } : {}), texte: docDeTaches(f.taches) }

/**
 * Les éléments d'un modèle, prêts à poser : des identifiants neufs, les enfants d'une colonne à la suite d'elle,
 * rangés par `ordre`. Ce qui est dessiné en dernier est au-dessus.
 */
export function elementsDuModele(modele: ModeleTableau, nouvelId: () => string): Element[] {
  const sortie: Element[] = []
  for (const e of modele.elements) {
    const id = nouvelId()
    const base = { id, x: e.x, y: e.y, largeur: largeurDe(e) }
    if (e.genre === 'titre') {
      sortie.push({
        ...base,
        contenu: { type: 'note', texte: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [{ type: 'text', text: e.texte }] }] }, couleur: 'transparent', variante: 'titre' },
      })
    } else if (e.genre === 'colonne') {
      sortie.push({ ...base, contenu: { type: 'colonne', titre: e.titre, ...(e.couleur ? { couleur: e.couleur } : {}) } })
      e.contenu.forEach((f, i) => sortie.push({ id: nouvelId(), x: 0, y: 0, largeur: base.largeur, parent: id, ordre: cleDeRang(i), contenu: contenuDe(f) }))
    } else {
      sortie.push({ ...base, contenu: contenuDe(e) })
    }
  }
  return sortie
}
