/**
 * Les règles d'une liste de tâches, en fonctions pures sur le JSON Tiptap :
 * `doc > taskList > taskItem(checked) > paragraph (+ taskList imbriquée)`.
 * Une tâche se désigne par son chemin : l'indice dans la liste, puis l'indice dans la sous-liste, etc.
 */
import { type Element, type NoeudTexte, type Taches, borner, nouvelId } from '../../coeur/tableau'

/** Une tâche et ses sous-tâches : six niveaux au plus. */
export const PROFONDEUR_MAX = 6
export const LARGEUR_TACHES = 34
export const HAUTEUR_TACHES_MIN = 6

export type Chemin = number[]

export const estFaite = (tache: NoeudTexte) => tache.attrs?.checked === true

export function docVide(): NoeudTexte {
  return {
    type: 'doc',
    content: [
      {
        type: 'taskList',
        content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }],
      },
    ],
  }
}

/** Un document qui n'est pas une liste de tâches (collé, ancien) est remplacé par une liste vide. */
export function docTaches(texte: NoeudTexte): NoeudTexte {
  return texte.content?.[0]?.type === 'taskList' ? texte : docVide()
}

export function nouvelleListeTaches(x: number, y: number): Element<Taches> {
  return {
    id: nouvelId(),
    x: borner(x),
    y: borner(y),
    largeur: LARGEUR_TACHES,
    contenu: { type: 'taches', texte: docVide() },
  }
}

/** Les tâches directement sous un nœud (le document, ou une tâche), toutes ses listes confondues. */
export const sousTaches = (noeud: NoeudTexte): NoeudTexte[] =>
  (noeud.content ?? []).flatMap((n) => (n.type === 'taskList' ? (n.content ?? []) : []))

/** Cochées et total, à toutes les profondeurs. */
export function compter(noeud: NoeudTexte): { faites: number; total: number } {
  let faites = 0
  let total = 0
  for (const t of sousTaches(noeud)) {
    const sous = compter(t)
    total += 1 + sous.total
    faites += (estFaite(t) ? 1 : 0) + sous.faites
  }
  return { faites, total }
}

/** Le nombre de niveaux d'une tâche : 1 pour une tâche sans sous-tâche. */
export function hauteur(tache: NoeudTexte): number {
  return 1 + Math.max(0, ...sousTaches(tache).map(hauteur))
}

/** Peut-on descendre d'un niveau une tâche de ce niveau (1 = en haut) et de cette hauteur ? */
export const peutDescendre = (niveau: number, hauteurTache: number) => niveau + hauteurTache <= PROFONDEUR_MAX

function cocher(tache: NoeudTexte, fait: boolean, enCascade: boolean): NoeudTexte {
  return {
    ...tache,
    attrs: { ...tache.attrs, checked: fait },
    content: enCascade
      ? tache.content?.map((n) =>
          n.type === 'taskList' ? { ...n, content: n.content?.map((t) => cocher(t, fait, true)) } : n,
        )
      : tache.content,
  }
}

function modifierEnfant(parent: NoeudTexte, indice: number, f: (t: NoeudTexte) => NoeudTexte): NoeudTexte | null {
  let reste = indice
  let trouve = false
  const content = (parent.content ?? []).map((n) => {
    if (n.type !== 'taskList' || trouve) return n
    const nb = n.content?.length ?? 0
    if (reste >= nb) {
      reste -= nb
      return n
    }
    trouve = true
    return { ...n, content: n.content!.map((t, k) => (k === reste ? f(t) : t)) }
  })
  return trouve ? { ...parent, content } : null
}

function modifier(parent: NoeudTexte, chemin: Chemin, f: (t: NoeudTexte) => NoeudTexte): NoeudTexte | null {
  const [indice, ...suite] = chemin
  if (indice === undefined) return null
  return modifierEnfant(parent, indice, (t) => (suite.length === 0 ? f(t) : (modifier(t, suite, f) ?? t)))
}

/**
 * Le document où cette tâche a basculé (cochée si elle était à faire, et inversement).
 * `enCascade` (Maj+clic) pose le même état à toutes ses sous-tâches. Un chemin inconnu ne change rien.
 */
export function basculer(doc: NoeudTexte, chemin: Chemin, enCascade = false): NoeudTexte {
  return modifier(doc, chemin, (t) => cocher(t, !estFaite(t), enCascade)) ?? doc
}

function sansFaites(parent: NoeudTexte): NoeudTexte {
  return {
    ...parent,
    content: (parent.content ?? []).flatMap((n): NoeudTexte[] => {
      if (n.type !== 'taskList') return [n]
      const restantes = (n.content ?? []).filter((t) => !estFaite(t)).map(sansFaites)
      return restantes.length > 0 ? [{ ...n, content: restantes }] : []
    }),
  }
}

/** Le document sans les tâches cochées, sous-tâches comprises. Il reste toujours une tâche. */
export function effacerFaites(doc: NoeudTexte): NoeudTexte {
  const reste = sansFaites(doc)
  return sousTaches(reste).length > 0 ? reste : docVide()
}

/** Le document sans cette tâche (ni ses sous-tâches). Il reste toujours une tâche. */
export function retirer(doc: NoeudTexte, chemin: Chemin): NoeudTexte {
  const enlever = (parent: NoeudTexte, [indice, ...suite]: Chemin): NoeudTexte => {
    let reste = indice!
    return {
      ...parent,
      content: (parent.content ?? []).flatMap((n): NoeudTexte[] => {
        if (n.type !== 'taskList' || reste < 0) return [n]
        const nb = n.content?.length ?? 0
        if (reste >= nb) {
          reste -= nb
          return [n]
        }
        const ici = reste
        reste = -1
        const taches =
          suite.length === 0 ? n.content!.filter((_, k) => k !== ici) : n.content!.map((t, k) => (k === ici ? enlever(t, suite) : t))
        return taches.length > 0 ? [{ ...n, content: taches }] : []
      }),
    }
  }
  if (chemin.length === 0) return doc
  const apres = enlever(doc, chemin)
  return sousTaches(apres).length > 0 ? apres : docVide()
}

const PUCE = /^(?:[-*•+]|\d+[.)])\s+/
const CASE = /^\[([ xX]?)\]\s*/

/**
 * Des lignes collées, en tâches : une tâche par ligne non vide, les puces et les cases (`[x]`) retirées,
 * l'imbrication tirée du retrait (une tabulation ou deux espaces par niveau). `null` pour une seule ligne
 * sans puce ni case : elle se colle comme du texte.
 */
export function lignesEnTaches(texte: string): NoeudTexte[] | null {
  const lignes = texte.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '')
  const marquees = lignes.some((l) => PUCE.test(l.trim()) || CASE.test(l.trim()))
  if (lignes.length === 0 || (lignes.length === 1 && !marquees)) return null
  const racine: NoeudTexte[] = []
  // La pile des listes ouvertes, du premier niveau au plus profond.
  const pile: NoeudTexte[][] = [racine]
  for (const brute of lignes) {
    const retrait = /^[\t ]*/.exec(brute)![0]
    const niveauVoulu = [...retrait].reduce((n, c) => n + (c === '\t' ? 2 : 1), 0) >> 1
    let t = brute.trim().replace(PUCE, '')
    const coche = CASE.exec(t)
    if (coche) t = t.slice(coche[0].length)
    const tache: NoeudTexte = {
      type: 'taskItem',
      attrs: { checked: !!coche && coche[1]!.toLowerCase() === 'x' },
      content: [t ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph' }],
    }
    const niveau = Math.min(niveauVoulu, pile.length - 1, PROFONDEUR_MAX - 1)
    pile.length = niveau + 1
    pile[niveau]!.push(tache)
    const sous: NoeudTexte = { type: 'taskList', content: [] }
    tache.content!.push(sous)
    pile.push(sous.content!)
  }
  // Les sous-listes restées vides s'en vont.
  const nettoyer = (taches: NoeudTexte[]): NoeudTexte[] =>
    taches.map((t) => {
      const [p, sous] = t.content!
      return sous!.content!.length > 0 ? { ...t, content: [p!, { ...sous!, content: nettoyer(sous!.content!) }] } : { ...t, content: [p!] }
    })
  return nettoyer(racine)
}

/**
 * Le document où cette tâche a de nouveaux attributs (`echeance`, `assigne`…). Une valeur `null` ou vide
 * retire l'attribut. Un chemin inconnu ne change rien.
 */
export function regler(doc: NoeudTexte, chemin: Chemin, attrs: Record<string, unknown>): NoeudTexte {
  return (
    modifier(doc, chemin, (t) => {
      const apres = { ...t.attrs, ...attrs }
      for (const [k, v] of Object.entries(apres)) if (v === null || v === undefined || v === '') delete apres[k]
      return { ...t, attrs: apres }
    }) ?? doc
  )
}

// ———— Réordonner ————

/**
 * Où une tâche se pose par rapport à la tâche visée : `avant` elle, `apres` elle (et ses sous-tâches), ou `dans` elle,
 * en dernière sous-tâche. Un booléen dit `avant` (vrai) ou `apres` (faux), pour les gestes qui n'ont que ces deux-là.
 */
export type Place = 'avant' | 'apres' | 'dans'

export const placeDe = (p: Place | boolean): Place => (p === true ? 'avant' : p === false ? 'apres' : p)

/** Les chemins de toutes les tâches, dans l'ordre où elles se lisent (une tâche, puis ses sous-tâches). */
export function cheminsEnOrdre(doc: NoeudTexte): Chemin[] {
  const suite = (parent: NoeudTexte, prefixe: Chemin): Chemin[] =>
    sousTaches(parent).flatMap((t, i) => [[...prefixe, i], ...suite(t, [...prefixe, i])])
  return suite(doc, [])
}

function tacheA(doc: NoeudTexte, chemin: Chemin): NoeudTexte | undefined {
  let n: NoeudTexte | undefined = doc
  for (const i of chemin) n = n && sousTaches(n)[i]
  return n === doc ? undefined : n
}

/** Pose `tache` à l'indice `indice` des sous-tâches de `parent` (le document si son chemin est vide) ; après la dernière si l'indice dépasse. */
function inserer(doc: NoeudTexte, parent: Chemin, indice: number, tache: NoeudTexte): NoeudTexte {
  const dans = (n: NoeudTexte): NoeudTexte => {
    const i = (n.content ?? []).findIndex((x) => x.type === 'taskList')
    if (i < 0) return { ...n, content: [...(n.content ?? []), { type: 'taskList', content: [tache] }] }
    return {
      ...n,
      content: n.content!.map((x, k) => (k === i ? { ...x, content: [...x.content!.slice(0, indice), tache, ...x.content!.slice(indice)] } : x)),
    }
  }
  return parent.length === 0 ? dans(doc) : (modifier(doc, parent, dans) ?? doc)
}

/** Une tâche de cette hauteur peut-elle prendre place à ce niveau (1 = en haut) sans passer le sixième ? */
export const peutPoserAuNiveau = (niveau: number, hauteurTache: number) => niveau + hauteurTache - 1 <= PROFONDEUR_MAX

const jusqueFin = Number.MAX_SAFE_INTEGER

/** Le chemin du dessus et l'indice où la tâche se pose, selon la tâche visée et la place. */
function destination(cible: Chemin, place: Place): { parent: Chemin; indice: number } {
  if (place === 'dans') return { parent: cible, indice: jusqueFin }
  return { parent: cible.slice(0, -1), indice: cible.at(-1)! + (place === 'avant' ? 0 : 1) }
}

/** Le niveau (1 = en haut) où la tâche se pose, selon la tâche visée et la place. */
export const niveauDeDepot = (cible: Chemin, place: Place): number => cible.length + (place === 'dans' ? 1 : 0)

const estPrefixe = (a: Chemin, b: Chemin) => a.length <= b.length && a.every((x, k) => b[k] === x)

/**
 * Le document où la tâche `de` (son rang dans l'ordre de lecture) est passée avant, après ou dans la tâche `vers` ;
 * ses sous-tâches la suivent. Rien ne change si la cible est la tâche elle-même ou l'une de ses sous-tâches, ou si elle
 * passerait le sixième niveau. Avec `copie`, la tâche reste où elle est et une copie prend la place : la cible peut alors
 * être la tâche elle-même (on la double), mais jamais l'une de ses sous-tâches.
 */
export function deplacer(doc: NoeudTexte, de: number, vers: number, place: Place | boolean, copie = false): NoeudTexte {
  const lieu = placeDe(place)
  const chemins = cheminsEnOrdre(doc)
  const source = chemins[de]
  const cible = chemins[vers]
  if (!source || !cible) return doc
  // La cible est la tâche elle-même ou l'une de ses sous-tâches : impossible, sauf pour doubler la tâche à côté d'elle.
  const dansSource = estPrefixe(source, cible)
  const surSoi = dansSource && source.length === cible.length
  if (dansSource && !(copie && surSoi && lieu !== 'dans')) return doc
  const tache = tacheA(doc, source)
  if (!tache || !peutPoserAuNiveau(niveauDeDepot(cible, lieu), hauteur(tache))) return doc
  if (copie) {
    const d = destination(cible, lieu)
    return inserer(doc, d.parent, d.indice, tache)
  }
  // Une fois la tâche retirée, les frères d'après elle ont un rang de moins.
  const parentSource = source.length - 1
  const ajuste = [...cible]
  if (cible.length > parentSource && source.slice(0, parentSource).every((x, k) => cible[k] === x) && cible[parentSource]! > source[parentSource]!) {
    ajuste[parentSource] = cible[parentSource]! - 1
  }
  const d = destination(ajuste, lieu)
  return inserer(retirer(doc, source), d.parent, d.indice, tache)
}

// ———— Passer d'une liste à une autre ————

/** Vrai pour une liste qui n'a encore rien dit : une seule tâche, vide et à faire. */
export function estListeVierge(doc: NoeudTexte): boolean {
  const taches = sousTaches(doc)
  const seule = taches[0]
  return taches.length === 1 && !!seule && !estFaite(seule) && sousTaches(seule).length === 0 && !texteDeTache(seule)
}

const texteDeTache = (tache: NoeudTexte): string =>
  (tache.content ?? [])
    .filter((n) => n.type === 'paragraph')
    .map((p) => (p.content ?? []).map((x) => x.text ?? '').join(''))
    .join('')
    .trim()

/**
 * Les deux documents où la tâche `de` de `source` (son rang dans l'ordre de lecture, sous-tâches avec elle) est
 * passée dans `destination`, avant, après ou dans la tâche `vers`. Une liste de destination encore vierge est
 * remplacée par la tâche. Avec `copie`, la source reste telle quelle. `null` si un rang n'existe pas ou si la tâche
 * passerait le sixième niveau.
 */
export function transferer(
  source: NoeudTexte,
  de: number,
  destination_: NoeudTexte,
  vers: number,
  place: Place | boolean,
  copie = false,
): { source: NoeudTexte; destination: NoeudTexte } | null {
  const lieu = placeDe(place)
  const chemin = cheminsEnOrdre(source)[de]
  const cible = cheminsEnOrdre(destination_)[vers]
  if (!chemin || !cible) return null
  const tache = tacheA(source, chemin)
  if (!tache || !peutPoserAuNiveau(niveauDeDepot(cible, lieu), hauteur(tache))) return null
  const vierge = estListeVierge(destination_)
  const d = destination(cible, lieu)
  const apres = vierge ? { ...destination_, content: [{ type: 'taskList', content: [tache] }] } : inserer(destination_, d.parent, d.indice, tache)
  return { source: copie ? source : retirer(source, chemin), destination: apres }
}

/**
 * La tâche `de` de `source` posée seule sur une nouvelle liste, en `x`, `y` (UG) ; `null` si le rang n'existe pas.
 * Rend aussi la source privée de la tâche (avec `copie`, telle quelle).
 */
export function detacher(source: NoeudTexte, de: number, x: number, y: number, copie = false): { source: NoeudTexte; liste: Element<Taches> } | null {
  const chemin = cheminsEnOrdre(source)[de]
  const tache = chemin && tacheA(source, chemin)
  if (!chemin || !tache) return null
  const neuve = nouvelleListeTaches(x, y)
  return {
    source: copie ? source : retirer(source, chemin),
    liste: { ...neuve, contenu: { ...neuve.contenu, texte: { type: 'doc', content: [{ type: 'taskList', content: [tache] }] } } },
  }
}

/**
 * La liste `destination` avec, à sa suite, les tâches de `source` (leur titre est laissé de côté). Une destination encore
 * vierge est remplacée par elles.
 */
export function ajouterALaFin(destination_: NoeudTexte, source: NoeudTexte): NoeudTexte {
  const apres = sousTaches(source)
  if (apres.length === 0) return destination_
  const avant = estListeVierge(destination_) ? [] : sousTaches(destination_)
  return { ...destination_, content: [{ type: 'taskList', content: [...avant, ...apres] }] }
}
