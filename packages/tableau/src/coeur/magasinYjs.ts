import * as Y from 'yjs'
import type { Magasin } from './magasin'
import { cleEntre, comparerOrdre } from './ordre'
import { lireElement } from './valider'
import { type CouleurNote, type Element, type Etiquette, type Id, type Operation, type Tableau, appliquer, inverse } from './tableau'

/** Un élément tel qu'il vit dans le document : l'`Element` entier, plus sa place dans l'empilement. */
export type ElementStocke = Element & { plan: string }

/** Les gestes d'une personne : seuls ceux-là entrent dans son historique. */
export const ORIGINE_GESTE = 'notak:geste'
/** Ce qui s'applique sans historique : un glisser en cours, un retour au point de départ, l'ordre d'empilement. */
export const ORIGINE_LIBRE = 'notak:libre'
/** Ce que l'historique ne voit pas du tout : une correction qui n'a pas trouvé son pas (`corriger`). */
const ORIGINE_HORS = 'notak:hors-historique'

export type MagasinYjs = Magasin & { detruire(): void; texte(id: Id): Y.XmlFragment; ligne(id: Id): Y.Text }

const sansPlan = (s: ElementStocke): Element => {
  const { plan: _plan, ...element } = s
  return element
}

/**
 * Les nouveaux plans que demande un ordre voulu. `actuel` est l'empilement d'aujourd'hui, du bas vers le haut ;
 * `voulu` celui qu'on veut. Les éléments qui gardent leur ordre relatif (la plus longue suite) ne bougent pas :
 * les autres reçoivent une clé entre leurs voisins. Un id inconnu de `actuel` reçoit aussi un plan.
 */
export function plansPour(actuel: readonly { id: Id; plan: string }[], voulu: readonly Id[]): Map<Id, string> {
  const rang = new Map(actuel.map((e, i) => [e.id, i]))
  const plans = new Map(actuel.map((e) => [e.id, e.plan]))
  // La plus longue suite croissante des rangs actuels, lue dans l'ordre voulu.
  const connus = voulu.flatMap((id, i) => (rang.has(id) ? [{ id, i, r: rang.get(id)! }] : []))
  const queues: number[] = []
  const precedent: number[] = []
  connus.forEach((c, k) => {
    let [bas, haut] = [0, queues.length]
    while (bas < haut) {
      const m = (bas + haut) >> 1
      if (connus[queues[m]!]!.r < c.r) bas = m + 1
      else haut = m
    }
    precedent[k] = bas > 0 ? queues[bas - 1]! : -1
    queues[bas] = k
  })
  const fixes = new Set<Id>()
  for (let k = queues.length ? queues[queues.length - 1]! : -1; k >= 0; k = precedent[k]!) fixes.add(connus[k]!.id)

  const nouveaux = new Map<Id, string>()
  let avant: string | undefined
  voulu.forEach((id, i) => {
    if (fixes.has(id)) {
      avant = plans.get(id)
      return
    }
    const apres = voulu.slice(i + 1).find((x) => fixes.has(x))
    const borne = apres === undefined ? undefined : plans.get(apres)
    if (avant !== undefined && borne !== undefined && avant >= borne) return
    avant = cleEntre(avant, borne)
    nouveaux.set(id, avant)
  })
  return nouveaux
}

/**
 * Le magasin d'un tableau, posé sur un document Yjs :
 * `elements` (id → élément + `plan`) et `meta` (`titre`, `couleur`, `etiquettes`).
 * Le document peut être relié à un serveur : le magasin n'en sait rien.
 */
export function creerMagasinYjs(doc: Y.Doc, id?: Id): MagasinYjs {
  const elements = doc.getMap<ElementStocke>('elements')
  const meta = doc.getMap<unknown>('meta')
  // Le texte des notes, à part des éléments : l'historique du tableau ne le voit pas, chacun a le sien dans l'éditeur.
  const textes = doc.getMap<Y.XmlFragment>('textes')
  // De même pour une ligne simple, comme le titre d'une liste de tâches.
  const lignes = doc.getMap<Y.Text>('lignes')
  // Un glisser écrit sans cesse, puis revient au départ et inscrit son geste : tout cela doit tenir dans un seul
  // pas, sinon annuler la création d'un élément déplacé ne l'atteindrait plus. Le temps ne découpe donc rien
  // (captureTimeout infini) ; les pas sont découpés à la main par `stopCapturing`, avant et après chaque geste.
  const historique = new Y.UndoManager(elements, {
    trackedOrigins: new Set([ORIGINE_GESTE, ORIGINE_LIBRE]),
    captureTimeout: Number.MAX_SAFE_INTEGER,
  })

  const ecouteurs = new Set<() => void>()
  let cache: Tableau | null = null
  // Un élément inchangé garde le même objet d'une lecture à l'autre : les cartes ne se redessinent pas.
  const reperes = new Map<Id, { brut: ElementStocke; element: Element }>()
  /** Un élément tel que la toile peut le lire, ou `undefined` : ce que d'autres ont écrit passe par `lireElement`. */
  const lisible = (cle: Id): ElementStocke | undefined => {
    const brut = elements.get(cle)
    return brut === undefined ? undefined : (lireElement<ElementStocke>(brut, cle) ?? undefined)
  }

  /** Les étiquettes du tableau, lues dans `meta` (un autre client a pu y écrire n'importe quoi). */
  let etiquettesLues: { brut: unknown; liste: Etiquette[] } = { brut: undefined, liste: [] }
  const etiquettesStockees = (): Etiquette[] => {
    const brut = meta.get('etiquettes')
    if (brut === etiquettesLues.brut) return etiquettesLues.liste
    const liste = Array.isArray(brut)
      ? brut.filter((x): x is Etiquette => !!x && typeof x.id === 'string' && typeof x.nom === 'string' && typeof x.couleur === 'string')
      : []
    etiquettesLues = { brut, liste }
    return liste
  }

  const construire = (): Tableau => {
    const liste: { id: Id; plan: string; element: Element }[] = []
    const vus = new Set<Id>()
    elements.forEach((brut, cle) => {
      let r = reperes.get(cle)
      if (!r || r.brut !== brut) {
        // Un élément illisible (abîmé, d'un type inconnu de cette version) reste dans le document, hors de la toile.
        const propre = lireElement<ElementStocke>(brut, cle)
        if (!propre) return
        r = { brut, element: sansPlan(propre) }
        reperes.set(cle, r)
      }
      vus.add(cle)
      liste.push({ id: cle, plan: typeof brut.plan === 'string' ? brut.plan : '', element: r.element })
    })
    for (const cle of reperes.keys()) if (!vus.has(cle)) reperes.delete(cle)
    liste.sort((a, b) => comparerOrdre(a.plan, b.plan) || comparerOrdre(a.id, b.id))
    const titre = meta.get('titre')
    const couleur = meta.get('couleur')
    const etiquettes = etiquettesStockees()
    return {
      ...(id !== undefined ? { id } : {}),
      titre: typeof titre === 'string' ? titre : '',
      ...(typeof couleur === 'string' ? { couleur: couleur as CouleurNote } : {}),
      ...(etiquettes.length > 0 ? { etiquettes } : {}),
      elements: liste.map((l) => l.element),
    }
  }

  const changer = () => {
    cache = null
    for (const f of ecouteurs) f()
  }
  elements.observeDeep(changer)
  meta.observe(changer)

  const lire = () => (cache ??= construire())

  const plusHaut = () => {
    let max: string | undefined
    elements.forEach((s) => {
      const plan = (s as { plan?: unknown } | null)?.plan
      if (typeof plan === 'string' && (max === undefined || comparerOrdre(plan, max) > 0)) max = plan
    })
    return max
  }

  /** Écrit des opérations dans le document ; à appeler dans une transaction. */
  const ecrire = (pas: readonly Operation[]) => {
    let haut: string | undefined
    let calcule = false
    const auDessus = () => {
      if (!calcule) {
        haut = plusHaut()
        calcule = true
      }
      haut = cleEntre(haut, undefined)
      return haut
    }
    for (const op of pas) {
      if (op.type === 'creer') {
        if (!elements.has(op.element.id)) elements.set(op.element.id, { ...op.element, plan: auDessus() })
      } else if (op.type === 'supprimer') {
        elements.delete(op.element.id)
      } else if (op.type === 'etiquettes') {
        // Les étiquettes vivent dans `meta`, hors de l'historique de Yjs : annuler un geste ne les rend pas.
        if (op.vers.length > 0) meta.set('etiquettes', op.vers)
        else meta.delete('etiquettes')
      } else {
        const actuel = lisible(op.id)
        if (!actuel) continue
        const apres = appliquer({ titre: '', elements: [sansPlan(actuel)] }, op).elements[0]!
        // Un déplacement qui n'en est pas un ne réveille personne.
        if (op.type !== 'contenu' && JSON.stringify(apres) === JSON.stringify(sansPlan(actuel))) continue
        elements.set(op.id, { ...apres, plan: actuel.plan })
      }
    }
  }

  const transaction = (f: () => void, origine: string) => doc.transact(f, origine)

  return {
    lire,
    ecouter(f) {
      ecouteurs.add(f)
      return () => ecouteurs.delete(f)
    },
    faire(pas) {
      if (pas.length === 0) return
      historique.stopCapturing()
      transaction(() => ecrire(pas), ORIGINE_GESTE)
      historique.stopCapturing()
    },
    appliquerSeulement(pas) {
      if (pas.length > 0) transaction(() => ecrire(pas), ORIGINE_LIBRE)
    },
    inscrire(pas) {
      if (pas.length > 0) {
        // Revenir au début du geste, puis le refaire : le pas contient tout le glisser, et annuler ramène au début.
        transaction(() => ecrire(pas.toReversed().map(inverse)), ORIGINE_LIBRE)
        transaction(() => ecrire(pas), ORIGINE_GESTE)
      }
      historique.stopCapturing()
    },
    texte(id) {
      const deja = textes.get(id)
      if (deja) return deja
      transaction(() => textes.set(id, new Y.XmlFragment()), ORIGINE_HORS)
      return textes.get(id)!
    },
    ligne(id) {
      const deja = lignes.get(id)
      if (deja) return deja
      transaction(() => lignes.set(id, new Y.Text()), ORIGINE_HORS)
      return lignes.get(id)!
    },
    corriger(pas) {
      if (pas.length === 0) return
      // Un geste est en train de s'écrire (un glisser) : la correction ne doit pas s'y mêler ni le couper.
      if (historique.lastChange > 0) return transaction(() => ecrire(pas), ORIGINE_HORS)
      // Les entrées que la correction va remplacer : le pas qui les a écrites la reçoit, comme si elle en était.
      const stockees = (elements as unknown as { _map: Map<string, { id: Y.ID }> })._map
      const touchees = pas.flatMap((op) =>
        op.type === 'etiquettes' ? [] : [stockees.get(op.type === 'creer' || op.type === 'supprimer' ? op.element.id : op.id)?.id],
      )
      const avant = historique.undoStack.length
      transaction(() => ecrire(pas), ORIGINE_LIBRE)
      historique.stopCapturing()
      if (historique.undoStack.length === avant) return
      const correction = historique.undoStack.pop()!
      const pasDOrigine = historique.undoStack.findLast((p) => touchees.some((id) => id && Y.isDeleted(p.insertions, id)))
      if (!pasDOrigine) return
      pasDOrigine.insertions = Y.mergeDeleteSets([pasDOrigine.insertions, correction.insertions])
      pasDOrigine.deletions = Y.mergeDeleteSets([pasDOrigine.deletions, correction.deletions])
    },
    remplacer(t) {
      transaction(() => {
        if (t.titre !== (meta.get('titre') ?? '')) meta.set('titre', t.titre)
        if (t.couleur !== meta.get('couleur')) {
          if (t.couleur === undefined) meta.delete('couleur')
          else meta.set('couleur', t.couleur)
        }
        const etiquettes = t.etiquettes ?? []
        if (JSON.stringify(etiquettes) !== JSON.stringify(etiquettesStockees())) {
          if (etiquettes.length > 0) meta.set('etiquettes', etiquettes)
          else meta.delete('etiquettes')
        }
        const voulus = new Set(t.elements.map((e) => e.id))
        // Ce que la toile ne sait pas lire n'est pas dans `t` : ce n'est pas une raison de l'effacer.
        for (const cle of [...elements.keys()]) if (!voulus.has(cle) && lisible(cle)) elements.delete(cle)

        const actuel = [...elements.keys()]
          .flatMap((cle) => {
            const s = lisible(cle)
            return s ? [{ id: cle, plan: s.plan }] : []
          })
          .sort((a, b) => comparerOrdre(a.plan, b.plan) || comparerOrdre(a.id, b.id))
        const plans = plansPour(actuel, t.elements.map((e) => e.id))
        for (const e of t.elements) {
          const brut = lisible(e.id)
          const plan = plans.get(e.id) ?? brut?.plan
          if (plan === undefined) continue
          const change = !brut || reperes.get(e.id)?.element !== e && JSON.stringify(sansPlan(brut)) !== JSON.stringify(e)
          if (change || plan !== brut?.plan) elements.set(e.id, { ...e, plan })
        }
      }, ORIGINE_LIBRE)
    },
    annuler: () => historique.undo() !== null,
    retablir: () => historique.redo() !== null,
    detruire() {
      elements.unobserveDeep(changer)
      meta.unobserve(changer)
      historique.destroy()
      ecouteurs.clear()
    },
  }
}
