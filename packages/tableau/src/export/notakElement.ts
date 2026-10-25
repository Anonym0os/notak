import * as Y from 'yjs'
import { creerMagasinYjs } from '../coeur/magasinYjs'
import { type Element, nouvelId } from '../coeur/tableau'
import type { DepotFichiers } from '../elements/types'
import { encoderNotak } from '../fichierEspace'
import type { NomIcone } from '../icones'
import { t, tn } from '../langue'
import type { FormatExport, Prepare } from './sujet'

/**
 * Les fichiers qu'un élément cite, où qu'ils soient dans son contenu : l'image d'un sujet de carte, une pièce jointe,
 * une image dans un document, l'image d'un marqueur. Tous s'appellent `fichier`.
 */
export function fichiersCites(valeur: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(valeur)) for (const v of valeur) fichiersCites(v, ids)
  else if (valeur && typeof valeur === 'object')
    for (const [cle, v] of Object.entries(valeur)) {
      if (cle === 'fichier' && typeof v === 'string' && v) ids.add(v)
      else fichiersCites(v, ids)
    }
  return ids
}

/**
 * Un élément seul (une carte mentale, un document), en fichier `.notak` : un tableau qui ne contient que lui, avec,
 * au choix, ses images et ses fichiers. Rouvert dans Notak, il redonne l'élément tel quel, sans rien perdre.
 */
export async function notakDElement(element: Element, titre: string, depot: DepotFichiers | undefined, avecFichiers: boolean): Promise<Prepare> {
  const doc = new Y.Doc()
  const magasin = creerMagasinYjs(doc)
  magasin.remplacer({ ...magasin.lire(), titre })
  magasin.faire([{ type: 'creer', element: { ...element, x: 2, y: 2 } }])
  const fichiers: { id: string; type: string; octets: Uint8Array }[] = []
  if (avecFichiers && depot)
    for (const id of fichiersCites(element.contenu)) {
      // Un fichier injoignable n'empêche pas la copie : l'élément le citera sans l'avoir.
      const adresse = await depot.adresse(id).catch(() => null)
      const r = adresse ? await fetch(adresse).catch(() => null) : null
      if (r?.ok) fichiers.push({ id, type: r.headers.get('content-type') ?? 'application/octet-stream', octets: new Uint8Array(await r.arrayBuffer()) })
    }
  const racine = nouvelId()
  const octets = encoderNotak({ racine, tableaux: [{ id: racine, titre, etat: Y.encodeStateAsUpdate(doc) }], fichiers })
  doc.destroy()
  const genre: { icone: NomIcone; nom: string } =
    element.contenu.type === 'arbre' ? { icone: 'carteMentale', nom: t('type.arbre') } : { icone: 'document', nom: t('type.document') }
  return {
    apercu: {
      type: 'contenu',
      resume: [tn('exporter.tableaux', 1), ...(fichiers.length > 0 ? [tn('exporter.nbFichiers', fichiers.length)] : [])].join(' · '),
      lignes: [
        { icone: 'tableau', texte: titre },
        { icone: genre.icone, texte: titre, detail: genre.nom },
      ],
    },
    fichier: new Blob([octets as Uint8Array<ArrayBuffer>], { type: 'application/x-notak' }),
  }
}

/** Le format Notak d'un élément seul, recommandé comme partout. */
export const formatNotakDElement = (element: () => Element | null, titre: string, depot: DepotFichiers | undefined): FormatExport => ({
  id: 'notak',
  icone: 'tableau',
  libelle: t('exporter.f.notak'),
  aide: t('exporter.f.notak.aide'),
  extension: 'notak',
  type: 'application/x-notak',
  recommande: true,
  options: ['fichiers'],
  async preparer(r) {
    const e = element()
    if (!e) throw new Error(t('pilotage.vide'))
    return notakDElement(e, titre, depot, r.fichiers)
  },
})
