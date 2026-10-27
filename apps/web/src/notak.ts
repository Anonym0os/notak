import { type ContenuNotak, type DepotFichiers, type Element, type EspaceNavigable, type Id, type Operation, lireTableau, nouvelId, renommer } from '@notak/tableau'
import * as Y from 'yjs'
import { t } from './langue'

/**
 * Pose le contenu d'un fichier `.notak` dans l'espace, comme une copie neuve : le tableau de tête devient un tableau
 * sous `parent`, chaque sous-tableau naît sous le sien. Les tableaux et les fichiers changent d'identifiant ; les
 * renvois, les images et les mentions suivent. (L'édition locale, elle, rouvre le fichier en le fusionnant :
 * local/copie.ts.) Rend l'id du tableau de tête, le nombre de tableaux posés et de fichiers perdus.
 */
export async function poserNotak(c: ContenuNotak, espace: EspaceNavigable, parent: Id, fichiers: DepotFichiers): Promise<{ tete: Id; tableaux: number; perdus: number; poses: Id[] }> {
  const nouveaux = new Map<string, string>()

  // Les fichiers d'abord : un élément posé doit trouver le sien.
  let perdus = 0
  for (const f of c.fichiers) {
    const neuf = await fichiers.enregistrer(new Blob([f.octets as Uint8Array<ArrayBuffer>], { type: f.type })).catch(() => null)
    if (neuf) nouveaux.set(f.id, neuf)
    else perdus++
  }

  // Chaque tableau naît sous son parent, déjà créé ; un parent absent du fichier le range sous la tête.
  const lus = c.tableaux.map((tb) => {
    const doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, tb.etat)
      return { tb, lu: lireTableau(doc) }
    } finally {
      doc.destroy()
    }
  })
  const tete = lus.find((x) => x.tb.id === c.racine) ?? lus[0]
  if (!tete) throw new Error('vide')
  const ordre = [tete, ...lus.filter((x) => x !== tete)]
  const creer = ({ tb, lu }: (typeof ordre)[number], sous: Id) =>
    nouveaux.set(tb.id, espace.creerTableau(tb.titre || lu.titre || (tb === tete.tb ? t('importer.titreNotak') : t('commun.sansTitre')), sous))
  creer(tete, parent)
  for (let avance = true; avance; ) {
    avance = false
    for (const x of ordre) {
      if (nouveaux.has(x.tb.id) || !x.tb.parent || !nouveaux.has(x.tb.parent)) continue
      creer(x, nouveaux.get(x.tb.parent)!)
      avance = true
    }
  }
  for (const x of ordre) if (!nouveaux.has(x.tb.id)) creer(x, nouveaux.get(tete.tb.id)!)

  for (const { tb, lu } of ordre) {
    const m = espace.magasin(nouveaux.get(tb.id)!)
    const couleur = tb.couleur ?? lu.couleur
    if (couleur) m.remplacer({ ...m.lire(), couleur: couleur as never })
    // La corbeille ne voyage pas : on importe ce qu'on voit.
    const ops: Operation[] = lu.elements.filter((e) => e.corbeille === undefined).map((e) => ({ type: 'creer', element: renommer(e, nouveaux) as unknown as Element }))
    if (Array.isArray(lu.etiquettes) && lu.etiquettes.length > 0) ops.push({ type: 'etiquettes', de: [], vers: lu.etiquettes as never })
    if (lu.fond !== undefined) ops.push({ type: 'fond', de: undefined, vers: lu.fond as never })
    if (ops.length > 0) m.faire(ops)
  }

  const neuf = nouveaux.get(tete.tb.id)!
  poserLeRenvoi(espace, parent, neuf)
  return { tete: neuf, tableaux: ordre.length, perdus, poses: [parent, ...ordre.map((x) => nouveaux.get(x.tb.id)!)] }
}

/**
 * Attend que les tableaux posés soient arrivés au serveur, pour ne dire « importé » qu'une fois que c'est vrai : un
 * tableau qu'on ne regarde pas se referme tout seul, et ce qu'on y a posé ne partirait qu'à sa prochaine ouverture.
 * On les retient le temps qu'ils partent. Rend faux si le serveur n'a pas tout reçu à temps (hors ligne, lent) : rien
 * n'est perdu, tout est gardé sur cet appareil et partira au retour du réseau. Sans serveur (l'édition locale), vrai.
 */
export async function attendreEnvoi(espace: EspaceNavigable, ids: readonly Id[], delai = 60_000, pas = 300): Promise<boolean> {
  const { envoi } = espace
  if (!envoi) return true
  const rendre = ids.map((id) => espace.retenir?.(id))
  try {
    const fin = Date.now() + delai
    for (;;) {
      if (ids.every((id) => envoi.call(espace, id) === 'enregistre' && espace.synchronise?.(id) !== false)) return true
      if (Date.now() >= fin) return false
      await new Promise((r) => setTimeout(r, pas))
    }
  } finally {
    for (const r of rendre) r?.()
  }
}

/** Le renvoi vers un tableau importé, dans le tableau d'où l'on importe : à droite de ce qui y est déjà. */
export function poserLeRenvoi(espace: EspaceNavigable, parent: Id, cible: Id) {
  const m = espace.magasin(parent)
  const la = m.lire().elements.filter((e) => !e.parent && e.contenu.type !== 'ligne')
  const x = la.length ? Math.max(...la.map((e) => e.x + e.largeur)) + 4 : 5
  const y = la.length ? Math.min(...la.map((e) => e.y)) : 5
  m.faire([{ type: 'creer', element: { id: nouvelId(), x, y, largeur: 10, contenu: { type: 'tableau', cible } } }])
}
