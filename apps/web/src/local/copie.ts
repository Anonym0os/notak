import {
  type ContenuNotak,
  type Id,
  type Magasin,
  decoderNotak,
  encoderNotak,
  idsDeFichiers,
  lireTableau,
  nouvelId,
} from '@notak/tableau'
import * as Y from 'yjs'
import type { EspaceLocal } from './espace'
import { garderFichier, lireFichier } from './fichiers'

/** L'origine des changements qu'un fichier `.notak` rouvert apporte. */
export const ORIGINE_COPIE = 'notak:copie'

/** Les tableaux qu'on atteint depuis `depuis` : lui, et ceux que ses renvois citent, de proche en proche. */
async function atteints({ reseau }: EspaceLocal, depuis: Id): Promise<Id[]> {
  const vus = [depuis]
  for (let i = 0; i < vus.length; i++) {
    const cibles = await reseau.avec(vus[i]!, (doc) =>
      lireTableau(doc).elements.flatMap((e) => (e.contenu.type === 'tableau' && typeof e.contenu.cible === 'string' ? [e.contenu.cible] : [])),
    )
    for (const c of cibles) if (!vus.includes(c)) vus.push(c)
  }
  return vus
}

/**
 * Une copie `.notak` de tout l'espace, ou d'un tableau et de ce qu'il cite. Les images et fichiers des tableaux
 * copiés viennent avec.
 */
export async function fabriquerCopie(el: EspaceLocal, depuis?: Id): Promise<Uint8Array> {
  const { index, reseau } = el
  const ids = depuis ? await atteints(el, depuis) : [...new Set([index.racine(), ...index.lister().map((e) => e.id)])]
  const contenu: ContenuNotak = { racine: depuis ?? index.racine(), tableaux: [], fichiers: [] }
  const fichiers = new Set<string>()
  for (const id of ids) {
    const { etat, elements } = await reseau.avec(id, (doc) => ({ etat: Y.encodeStateAsUpdate(doc), elements: lireTableau(doc).elements }))
    const e = index.entree(id)
    contenu.tableaux.push({
      id,
      titre: e?.titre ?? '',
      ...(e?.parent && e.parent !== depuis ? { parent: e.parent } : {}),
      ...(e?.couleur ? { couleur: e.couleur } : {}),
      etat,
    })
    for (const f of idsDeFichiers(elements)) fichiers.add(f)
  }
  for (const id of fichiers) {
    const b = await lireFichier(id)
    if (b) contenu.fichiers.push({ id, type: b.type, octets: new Uint8Array(await b.arrayBuffer()) })
  }
  return encoderNotak(contenu)
}

/** Une carte qui renvoie à `cible`, à droite de ce que le tableau contient déjà (sauf s'il y en a déjà une). */
function poserRenvoi(m: Magasin, cible: Id) {
  const la = m.lire().elements.filter((e) => !e.parent && e.corbeille === undefined && e.contenu.type !== 'ligne')
  if (la.some((e) => e.contenu.type === 'tableau' && e.contenu.cible === cible)) return
  const x = la.length ? Math.max(...la.map((e) => e.x + e.largeur)) + 4 : 5
  const y = la.length ? Math.min(...la.map((e) => e.y)) : 5
  m.faire([{ type: 'creer', element: { id: nouvelId(), x, y, largeur: 10, contenu: { type: 'tableau', cible } } }])
}

export interface CopieRouverte {
  /** Le tableau de tête du fichier. */
  tete: Id
  tableaux: number
  /** C'était une copie de cet espace (ou elle avait déjà été rouverte) : tout s'est fondu dans ce qu'on avait. */
  fusion: boolean
  /** L'espace était vide : la copie est devenue l'accueil (la page doit se recharger pour le montrer). */
  accueil: boolean
}

/** Un espace où l'on n'a encore rien fait : un seul tableau, l'accueil, vide. */
async function vide({ index, reseau }: EspaceLocal): Promise<boolean> {
  if (index.lister().length > 1) return false
  return reseau.avec(index.racine(), (doc) => doc.getMap('elements').size === 0)
}

/**
 * Rouvre une copie `.notak`. Tout fusionne (Yjs) : sa propre copie se fond dans ce qu'on a, sans doublon ; la copie
 * de quelqu'un d'autre s'ajoute, son tableau de tête rangé dans `ici`.
 */
export async function rouvrirCopie(el: EspaceLocal, octets: Uint8Array, ici: Id): Promise<CopieRouverte> {
  const { index, reseau, espace } = el
  const c = decoderNotak(octets)
  for (const f of c.fichiers) await garderFichier(new Blob([f.octets as Uint8Array<ArrayBuffer>], { type: f.type }), f.id)
  const racine = index.racine()
  // Déjà là : sa propre copie, ou une copie déjà rouverte. Tout se fond, rien ne s'ajoute.
  const fusion = c.racine === racine || index.entree(c.racine) !== undefined
  const accueil = !fusion && (await vide(el))
  for (const t of c.tableaux) {
    await reseau.avec(t.id, (doc) => Y.applyUpdate(doc, t.etat, ORIGINE_COPIE))
    const parent = t.parent ?? (t.id === c.racine && !fusion && !accueil ? ici : undefined)
    if (t.id !== racine) index.declarer(t.id, t.titre, parent)
  }
  if (accueil) {
    index.changerRacine(c.racine)
    index.retirer(racine)
  } else if (!fusion && c.racine !== ici && c.tableaux.some((t) => t.id === c.racine)) {
    const liberer = espace.retenir?.(ici)
    poserRenvoi(espace.magasin(ici), c.racine)
    liberer?.()
  }
  return { tete: c.racine, tableaux: c.tableaux.length, fusion, accueil }
}
