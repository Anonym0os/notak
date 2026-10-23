import { LARGEUR_NOTE, POSITION_MAX, type Element, type TypeContenu } from './tableau'

/**
 * Ce qu'on lit d'un document Yjs vient d'ailleurs : un autre appareil, une autre version de Notak, un fichier
 * abîmé, quelqu'un de malveillant. Un seul élément mal formé ne doit pas faire tomber le tableau, ni chez soi ni
 * chez les autres. On lit donc chaque élément à travers cette porte : ce qui est réparable est réparé (en copie,
 * le document n'est pas réécrit), le reste est écarté de l'affichage.
 */

type Attendu = 'chaine' | 'nombre' | 'objet' | 'tableau'

/** Les champs sans lesquels un contenu ne peut pas se dessiner. */
const REQUIS: Record<TypeContenu, Record<string, Attendu>> = {
  note: { texte: 'objet' },
  image: { fichier: 'chaine', largeurOrigine: 'nombre', hauteurOrigine: 'nombre' },
  fichier: { fichier: 'chaine', nom: 'chaine', typeMime: 'chaine', taille: 'nombre' },
  lien: { url: 'chaine', statut: 'chaine' },
  taches: { texte: 'objet' },
  colonne: { titre: 'chaine' },
  ligne: { depart: 'objet', arrivee: 'objet', pointeDepart: 'chaine', pointeArrivee: 'chaine', trait: 'chaine', epaisseur: 'nombre' },
  tableau: { cible: 'chaine' },
  commentaire: { messages: 'tableau' },
  table: { cellules: 'tableau' },
  nuancier: { couleur: 'chaine' },
  lieu: { adresse: 'chaine' },
  croquis: { traits: 'tableau' },
  dessin: { traits: 'tableau', largeurOrigine: 'nombre', hauteurOrigine: 'nombre' },
  document: { titre: 'chaine', texte: 'objet' },
  clone: { cible: 'chaine' },
}

/** Le plus large qu'un élément puisse être, en unités de grille. */
export const LARGEUR_MAX = 2_000

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function conforme(v: unknown, attendu: Attendu): boolean {
  switch (attendu) {
    case 'chaine':
      return typeof v === 'string'
    case 'nombre':
      return estNombre(v)
    case 'objet':
      return estObjet(v)
    case 'tableau':
      return Array.isArray(v)
  }
}

/** Un contenu dessinable, ou `null`. Un type inconnu (une version plus récente de Notak) n'est pas dessinable ici. */
function contenuLisible(c: unknown): boolean {
  if (!estObjet(c) || typeof c.type !== 'string' || !Object.hasOwn(REQUIS, c.type)) return false
  const requis = REQUIS[c.type as TypeContenu]
  for (const [champ, attendu] of Object.entries(requis)) if (!conforme(c[champ], attendu)) return false
  // Un texte riche est un nœud ProseMirror : sans `type`, l'éditeur refuse de le charger.
  if ((c.type === 'note' || c.type === 'taches' || c.type === 'document') && typeof (c.texte as { type?: unknown }).type !== 'string') return false
  return true
}

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Les champs facultatifs d'un élément, et ce qu'ils doivent être : un champ de travers est retiré. */
const FACULTATIFS: Record<string, (v: unknown) => boolean> = {
  parent: (v) => typeof v === 'string',
  ordre: (v) => typeof v === 'string',
  corbeille: estNombre,
  nonTrie: estNombre,
  verrou: (v) => typeof v === 'boolean',
  hauteur: (v) => estObjet(v) && (estNombre(v.min) || estNombre(v.max)),
  etiquettes: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  reactions: (v) => estObjet(v) && Object.values(v).every((l) => Array.isArray(l) && l.every((x) => typeof x === 'string')),
  echeance: (v) => typeof v === 'string',
  assigne: (v) => estObjet(v) && typeof v.id === 'string' && typeof v.nom === 'string',
  affichage: (v) => v === 'icone' || v === 'detail',
  commentaire: (v) => estObjet(v) && Array.isArray(v.messages),
}

/**
 * L'élément rangé sous la clé `cle`, lisible par la toile, ou `null` s'il ne l'est pas.
 * Rend le même objet quand il n'y a rien à corriger (les cartes ne se redessinent pas pour rien).
 */
export function lireElement<E extends Element & { plan?: unknown }>(brut: unknown, cle: string): (E & { plan: string }) | null {
  if (!estObjet(brut) || !contenuLisible(brut.contenu)) return null
  const corrections: Record<string, unknown> = {}
  const retraits: string[] = []

  if (brut.id !== cle) corrections.id = cle
  if (typeof brut.plan !== 'string') corrections.plan = ''
  for (const axe of ['x', 'y'] as const) {
    const v = brut[axe]
    if (!estNombre(v)) corrections[axe] = 0
    else if (Math.abs(v) > POSITION_MAX) corrections[axe] = borner(v, -POSITION_MAX, POSITION_MAX)
  }
  const largeur = brut.largeur
  if (!estNombre(largeur) || largeur <= 0) corrections.largeur = LARGEUR_NOTE
  else if (largeur > LARGEUR_MAX) corrections.largeur = LARGEUR_MAX
  for (const [champ, valide] of Object.entries(FACULTATIFS)) if (brut[champ] !== undefined && !valide(brut[champ])) retraits.push(champ)

  if (retraits.length === 0 && Object.keys(corrections).length === 0) return brut as unknown as E & { plan: string }
  const copie: Record<string, unknown> = { ...brut, ...corrections }
  for (const champ of retraits) delete copie[champ]
  return copie as unknown as E & { plan: string }
}
