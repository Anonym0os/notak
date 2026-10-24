import * as Y from 'yjs'
import { type AccesTableaux, type Coffre, ouvrirCoffre } from '../coffre'
import { depotMemoire } from '../dossier'
import { type FauxNuage, type Hasard, type VueLocale, generateur } from './fauxNuage'

/**
 * Un appareil simulé : ses tableaux (des documents Yjs gardés comme y-indexeddb les garde, mise à jour par mise à
 * jour), son dépôt local, sa vue du dossier, son coffre. Il peut planter : il perd alors ce qu'il avait en mémoire
 * (dont ce que Yjs tenait en attente) et repart de ce qu'il avait gardé.
 */
export class AppareilSimule {
  readonly depot = depotMemoire()
  /** Ce que l'appareil a gardé de chaque tableau, comme y-indexeddb : les mises à jour, une à une. */
  readonly gardes = new Map<string, Uint8Array[]>()
  private docs = new Map<string, Y.Doc>()
  coffre!: Coffre
  /** Les modifications faites ici : par client Yjs, la plus haute horloge atteinte. */
  readonly faits = new Map<number, number>()
  /** Les identifiants tirés par le coffre, et ceux des clients Yjs : rejouables. */
  private readonly hasard: Hasard
  private clients = 0

  constructor(
    readonly nom: string,
    readonly vue: VueLocale,
    private readonly temps: { maintenant: number },
  ) {
    let g = 0
    for (const c of nom) g = (g * 31 + c.charCodeAt(0)) >>> 0
    this.hasard = generateur(g)
  }

  readonly tableaux: AccesTableaux = {
    lister: async () => [...this.gardes.keys()],
    avec: async (tableau, f) => f(this.doc(tableau)),
  }

  doc(tableau: string): Y.Doc {
    let d = this.docs.get(tableau)
    if (d) return d
    d = new Y.Doc()
    // Un client Yjs rejouable, différent à chaque ouverture comme dans la vraie vie.
    d.clientID = (this.hasard.entier(2 ** 30) + ++this.clients) >>> 0
    for (const u of this.gardes.get(tableau) ?? []) Y.applyUpdate(d, u)
    const garde = this.gardes.get(tableau) ?? []
    this.gardes.set(tableau, garde)
    d.on('update', (u: Uint8Array) => garde.push(u))
    this.docs.set(tableau, d)
    return d
  }

  async demarrer() {
    this.coffre = await ouvrirCoffre({
      dossier: this.vue,
      depot: this.depot,
      tableaux: this.tableaux,
      nom: this.nom,
      maintenant: () => this.temps.maintenant,
      hasard: this.hasard.suivant,
    })
    return this
  }

  /** Perd tout ce qui n'était qu'en mémoire, puis repart. */
  async planter() {
    for (const d of this.docs.values()) d.destroy()
    this.docs = new Map()
    await this.demarrer()
  }

  /** Une modification au hasard dans un tableau. */
  modifier(tableau: string, h: Hasard) {
    const d = this.doc(tableau)
    const choix = h.entier(3)
    if (choix === 0) d.getMap('elements').set(`k${h.entier(8)}`, `${this.nom}:${h.entier(1000)}`)
    else if (choix === 1) {
      const m = d.getMap('elements')
      const cles = [...m.keys()]
      if (cles.length) m.delete(h.choisir(cles))
      else m.set('k0', this.nom)
    } else {
      const t = d.getText('texte')
      t.insert(h.entier(t.length + 1), `${this.nom[0]}${h.entier(10)}`)
    }
    this.faits.set(d.clientID, Y.getState(d.store, d.clientID))
  }

  /** Ce que contient un tableau, pour comparer les appareils. */
  contenu(tableau: string) {
    const d = this.doc(tableau)
    return { elements: d.getMap('elements').toJSON(), texte: d.getText('texte').toString() }
  }

  horloge(tableau: string, client: number) {
    return Y.getState(this.doc(tableau).store, client)
  }

  /** Copie conforme de l'appareil (une restauration de sauvegarde sur une autre machine) : même dépôt, mêmes tableaux. */
  cloner(nom: string, nuage: FauxNuage): AppareilSimule {
    const c = new AppareilSimule(nom, nuage.vue(nom, { copieDe: this.vue }), this.temps)
    for (const [k, v] of this.depot.donnees) c.depot.donnees.set(k, structuredClone(v))
    for (const [t, l] of this.gardes) c.gardes.set(t, [...l])
    return c
  }
}
