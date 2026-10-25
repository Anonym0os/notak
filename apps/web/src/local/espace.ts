import {
  type EspaceDistant,
  type Id,
  type IndexEspace,
  type ReseauLocal,
  type ResultatRecherche,
  chercher,
  creerEspaceDistant,
  creerMagasinYjs,
  creerReseauLocal,
  creerZip,
  exporterTexte,
  fichiersDe,
  langueExport,
  lireTableau,
  nommerLesMedias,
  normaliser,
  ouvrirIndexLocal,
  texteCherchable,
} from '@notak/tableau'
import { cleDeRang, elementsDuModele } from '@notak/tableau/modeles/construire'
import * as Y from 'yjs'
import { ErreurExport, type ExportLocal } from '../Export'
import { langue, t } from '../langue'
import { accueilLocal } from './accueil'
import { lireFichier } from './fichiers'

/**
 * L'espace de l'édition locale : l'index des tableaux, le réseau local (IndexedDB et onglets), et l'espace que la
 * toile parcourt. Une personne par navigateur, sans compte : « vous ».
 */
export interface EspaceLocal {
  index: IndexEspace
  reseau: ReseauLocal
  espace: EspaceDistant
}

export const UTILISATEUR_LOCAL = { id: 'local', nom: '', couleur: '#2f6feb' }

let ouvert: Promise<EspaceLocal> | null = null
/** L'espace local, ouvert une fois : React peut monter l'application deux fois, pas IndexedDB. */
export function espaceLocal(): Promise<EspaceLocal> {
  ouvert ??= ouvrirIndexLocal().then(async ({ index }) => {
    const reseau = creerReseauLocal({ index })
    await poserAccueil({ index, reseau })
    const espace = creerEspaceDistant({ racine: index.racine(), utilisateur: { ...UTILISATEUR_LOCAL, nom: t('local.vous') }, reseau })
    return { index, reseau, espace }
  })
  return ouvert
}

/**
 * Le tableau d'accueil d'un navigateur neuf, qui montre les gestes (celui des comptes neufs, adapté : `accueil.ts`).
 * On note son état d'alors : tant qu'on n'y a pas touché, il compte pour vide (une copie rouverte ou un dossier
 * qu'on rejoint le remplacent).
 */
async function poserAccueil({ index, reseau }: Pick<EspaceLocal, 'index' | 'reseau'>) {
  const racine = index.racine()
  const marques = index.doc.getMap<unknown>('meta')
  if (index.lister().length > 1 || marques.has(`modele:${racine}`)) return
  const sv = await reseau.avec(racine, (doc) => {
    if (doc.getMap('elements').size > 0) return null
    doc.transact(() => {
      doc.getMap('meta').set('titre', t('local.titreAccueil'))
      const elements = doc.getMap('elements')
      elementsDuModele(accueilLocal(langue()), () => crypto.randomUUID()).forEach((e, i) => elements.set(e.id, { ...e, plan: cleDeRang(i) }))
    })
    return Y.encodeStateVector(doc)
  })
  if (sv) marques.set(`modele:${racine}`, Array.from(sv))
}

/** Rien n'a encore été fait ici : l'accueil seul, vide, ou tel que le modèle l'a posé. */
export async function espaceIntact(el: Pick<EspaceLocal, 'index' | 'reseau'>, racine = el.index.racine()): Promise<boolean> {
  return !el.index.lister().some((e) => e.id !== racine) && (await accueilIntact(el, racine))
}

/** Ce tableau d'accueil est vide, ou tel que le modèle l'a posé. */
export async function accueilIntact({ index, reseau }: Pick<EspaceLocal, 'index' | 'reseau'>, racine: Id): Promise<boolean> {
  const modele = index.doc.getMap<unknown>('meta').get(`modele:${racine}`)
  return reseau.avec(racine, (doc) => {
    if (doc.getMap('elements').size === 0) return true
    if (!Array.isArray(modele)) return false
    const maintenant = Y.encodeStateVector(doc)
    // Le modèle tel quel, et rien d'effacé depuis (une suppression ne change pas le vecteur d'état).
    return maintenant.length === modele.length && maintenant.every((o, i) => o === modele[i]) && Y.encodeStateAsUpdate(doc, maintenant).length <= 2
  })
}

const titreDe = (index: IndexEspace) => (id: string) => index.entree(id)?.titre || undefined

/** Un passage autour du premier mot trouvé, pour la liste des résultats. */
function extraitDe(texte: string, requete: string): string {
  const premier = normaliser(requete).split(/\s+/).find(Boolean) ?? ''
  const i = Math.max(0, normaliser(texte).indexOf(premier))
  const debut = Math.max(0, i - 40)
  return (debut > 0 ? '…' : '') + texte.slice(debut, debut + 140).replace(/\s+/g, ' ').trim() + (debut + 140 < texte.length ? '…' : '')
}

/** La recherche dans tous les tableaux, sur ce que le navigateur garde : les titres, puis le contenu. */
export async function rechercherLocalement({ index, reseau }: EspaceLocal, requete: string): Promise<ResultatRecherche[]> {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return []
  const resultats: ResultatRecherche[] = []
  const nom = titreDe(index)
  for (const e of index.lister()) {
    const titre = e.titre || t('commun.sansTitre')
    if (mots.every((m) => normaliser(e.titre).includes(m))) resultats.push({ tableau: e.id, titre, extrait: titre })
    const elements = await reseau.avec(e.id, (doc) => {
      const m = creerMagasinYjs(doc, e.id)
      const lus = m.lire().elements.filter((x) => x.corbeille === undefined)
      m.detruire()
      return lus
    })
    for (const x of chercher(elements, requete, nom)) resultats.push({ tableau: e.id, titre, element: x.id, extrait: extraitDe(texteCherchable(x, nom), requete) })
    if (resultats.length >= 200) break
  }
  return resultats
}

/** L'export du texte et des médias, fabriqués dans le navigateur avec le même code que le serveur (la copie `.notak` : local/copie.ts). */
export function exportLocal({ index, reseau }: EspaceLocal): Omit<ExportLocal, 'notak'> {
  const lire = (tableau: string) => reseau.avec(tableau, (doc) => lireTableau(doc))
  return {
    async texte(tableau, format) {
      const texte = exporterTexte(await lire(tableau), format, titreDe(index), langueExport(langue()))
      return new Blob([texte], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' })
    },
    async medias(tableau) {
      const entrees: { nom: string; octets: Uint8Array; type: string }[] = []
      const presents = new Map<string, Blob>()
      const decrits = fichiersDe((await lire(tableau)).elements)
      for (const f of decrits) {
        const b = await lireFichier(f.id)
        if (b) presents.set(f.id, b)
      }
      for (const m of nommerLesMedias(decrits, (id) => presents.get(id)?.type || undefined)) {
        const b = presents.get(m.id)
        if (b) entrees.push({ nom: m.nom, octets: new Uint8Array(await b.arrayBuffer()), type: b.type })
      }
      if (entrees.length === 0) throw new ErreurExport('aucun_media')
      return new Blob([creerZip(entrees) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
    },
  }
}
