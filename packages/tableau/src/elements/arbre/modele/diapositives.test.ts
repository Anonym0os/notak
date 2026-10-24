import { describe, expect, it } from 'vitest'
import type { Arbre, Id, Sujet } from '../../../coeur/tableau'
import {
  type Contexte,
  type Diapo,
  type Position,
  type Sequence,
  apresBranche,
  arrivee,
  chaine,
  depart,
  dispositionDe,
  livraisonDe,
  miseEnPageDe,
  niveauDe,
  placeImageDe,
  sequence,
  trajet,
  versParent,
  visibilite,
  visibiliteAuto,
} from './diapositives'
import { ajouterResume } from './elements'
import { poserDiapo } from './pitch'
import { ajouterEnfant, changerSujet, lire, nouvelArbre } from './sujets'

/** Central → A (A1, A2), B. */
function exemple() {
  let a: Arbre = nouvelArbre('C')
  const c = lire(a).central
  let A: Id, B: Id, A1: Id, A2: Id
  ;[a, A] = ajouterEnfant(a, c, 'A')
  ;[a, B] = ajouterEnfant(a, c, 'B')
  ;[a, A1] = ajouterEnfant(a, A, 'A1')
  ;[a, A2] = ajouterEnfant(a, A, 'A2')
  return { a, c, A, B, A1, A2 }
}

const note = (texte: string): Sujet['note'] => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }] })
const avecNote = (a: Arbre, id: Id) => changerSujet(a, id, (s) => ({ ...s, note: note('Une note') }))

/**
 * Une diapositive en une ligne lisible : `S A` (sujet), `L A 1` (liste, enfants visibles jusqu'au rang 1), `R X`
 * (résumé), `Fin` ; `~` devant : sautée ; `>` derrière : elle s'enchaîne en avançant.
 */
function ligne(a: Arbre, d: Diapo): string {
  const titre = a.sujets[d.sujet]?.titre ?? '?'
  const corps = d.type === 'sujet' ? `S ${titre}` : d.type === 'liste' ? `L ${titre} ${d.montre}` : d.type === 'resume' ? `R ${titre}` : 'Fin'
  return `${d.sautee ? '~' : ''}${corps}${d.enchaine.avant ? ' >' : ''}`
}
const suite = (a: Arbre, c?: Contexte) => sequence(lire(a), { resumes: a.resumes, ...c }).diapos.map((d) => ligne(a, d))

/** Ce qu'on voit, touche après touche, du départ à l'écran de fin. */
function arrets(a: Arbre, s: Sequence): string[] {
  const l = lire(a)
  const vus: string[] = []
  let ici: Position | null = null
  for (let n = 0; n < 200; n++) {
    const fin = arrivee(trajet(s, l, ici, 'avancer'), ici)
    if (fin === 'terminer' || fin === null) break
    ici = fin
    vus.push(ici === 'ecran-de-fin' ? 'écran de fin' : ligne(a, s.diapos[ici]!).replace(/ >$/, ''))
  }
  return vus
}

describe('les diapositives d’une carte (mode Pitch)', () => {
  it('les niveaux : central, principal, sous-sujet, résumé, flottant', () => {
    const { a, c, A, A1 } = exemple()
    const l = lire(a)
    expect([niveauDe(l, c), niveauDe(l, A), niveauDe(l, A1)]).toEqual(['central', 'principal', 'sous-sujet'])
  })

  it('en perçant (le défaut), la branche de chaque enfant s’intercale entre les étapes de la liste', () => {
    const { a } = exemple()
    expect(suite(a)).toEqual([
      'S C',
      'L C 0 >', // L0 : fait paraître la liste, on ne s'y arrête pas
      'L C 0', // entrée de A : A vient d'apparaître
      'S A',
      'L A 0 >',
      'L A 0', // entrée de A1
      '~S A1', // un sous-sujet sans rien à lui n'a pas de diapositive…
      '~L A 0 >', // … ni de sortie
      'L A 1', // entrée de A2 : la touche suivante fait simplement paraître A2
      '~S A2',
      '~L A 1',
      'L C 0 >', // sortie de A : on remonte dans la liste, et B paraît aussitôt
      'L C 1', // entrée de B
      'S B',
      'L C 1', // sortie du dernier enfant : toute la liste
      'Fin',
    ])
    const s = sequence(lire(a))
    expect(arrets(a, s)).toEqual(['S C', 'L C 0', 'S A', 'L A 0', 'L A 1', 'L C 1', 'S B', 'L C 1', 'Fin', 'écran de fin'])
    // Une liste ne montre que les enfants directs, chacun avec son état à l'étape.
    const liste = s.diapos[8]!
    expect(liste.type === 'liste' && liste.items.map((i) => [a.sujets[i.id]!.titre, i.etat])).toEqual([
      ['A1', 'passe'],
      ['A2', 'courant'],
    ])
    expect(s.diapos[1]!.type === 'liste' && s.diapos[1]!.premiere).toBe(true)
  })

  it('un par un : toute la liste se découvre, puis on visite les enfants qui ont du contenu', () => {
    const { a, A, A1 } = exemple()
    const b = avecNote(poserDiapo(a, [A], { livraison: 'un-par-un' }), A1)
    const s = sequence(lire(b))
    const deA = suite(b).slice(4, 12)
    expect(deA).toEqual([
      'L A 0', // révélation de A1
      'L A 1', // révélation de A2
      'L A 1 >', // entrée de A1 (il a une note) : un passage
      'S A1',
      'L A 1 >', // sortie de A1, vers l'entrée de A2
      '~L A 1 >', // A2 n'a rien : pas d'entrée…
      '~S A2',
      'L A 1', // … mais la sortie du dernier se montre, puisqu'on a percé A1
    ])
    // Entrées et sorties : tout est visible, la liste se centre sur l'enfant visité.
    const entreeA1 = s.diapos[6]!
    expect(entreeA1.type === 'liste' && [entreeA1.centre, entreeA1.items.map((i) => i.etat)]).toEqual([0, ['courant', 'visible']])
    const r = arrets(b, s)
    expect(r.slice(r.indexOf('S A'), r.indexOf('S A') + 6)).toEqual(['S A', 'L A 0', 'L A 1', 'S A1', 'L A 1', 'L C 1'])
  })

  it('tout à la fois : une étape, tout visible, puis les mêmes visites', () => {
    const { a, A } = exemple()
    const s = sequence(lire(poserDiapo(a, [A], { livraison: 'tout' })))
    const listes = s.diapos.filter((d) => d.type === 'liste' && d.sujet === A)
    expect(listes[0]!.type === 'liste' && [listes[0]!.montre, listes[0]!.items.map((i) => i.etat)]).toEqual([1, ['visible', 'visible']])
    // A1 et A2 n'ont rien : seule la première étape se montre.
    expect(listes.filter((d) => !d.sautee)).toHaveLength(1)
  })

  it('les défauts Auto sont ceux de Xmind', () => {
    const { a, c, A, A1 } = exemple()
    const l = lire(a)
    expect(livraisonDe(l, c)).toEqual({ valeur: 'percer', auto: true })
    // Le central en accolade ; un principal court qui a plus d'un enfant aussi ; ailleurs les paroles, ou les puces en tout à la fois.
    expect(miseEnPageDe(l, c)).toEqual({ valeur: 'accolade', auto: true })
    expect(miseEnPageDe(l, A).valeur).toBe('accolade')
    const [b, A11] = ajouterEnfant(a, A1, 'A11')
    expect(miseEnPageDe(lire(b), A1).valeur).toBe('paroles')
    expect(miseEnPageDe(lire(poserDiapo(b, [A1], { livraison: 'tout' })), A1).valeur).toBe('puces')
    expect(A11).toBeTruthy()
    // Les paroles ne se jouent pas en « tout à la fois » : le réglage cède au défaut.
    expect(dispositionDe(lire(poserDiapo(b, [A1], { livraison: 'tout', miseEnPage: 'paroles' })), A1)).toBe('puces')
    expect(miseEnPageDe(lire(poserDiapo(a, [c], { miseEnPage: 'arete' })), c)).toEqual({ valeur: 'arete', auto: false })
  })

  it('un titre de plus de 24 caractères fait passer un principal de l’accolade aux paroles', () => {
    const { a, A, A1 } = exemple()
    const long = changerSujet(a, A1, (s) => ({ ...s, titre: 'Un titre de vingt-cinq ca' }))
    expect(miseEnPageDe(lire(changerSujet(a, A1, (s) => ({ ...s, titre: 'Vingt-quatre caractères.' }))), A).valeur).toBe('accolade')
    expect(miseEnPageDe(lire(long), A).valeur).toBe('paroles')
  })

  it('Auto : un sous-sujet a sa diapositive s’il porte ce que la liste ne montre pas', () => {
    const { a, A, A1 } = exemple()
    const l = lire(a)
    expect(visibilite(l, A, 'sujet')).toEqual({ valeur: 'visible', auto: true })
    expect(visibilite(l, A1, 'sujet')).toEqual({ valeur: 'masque', auto: true })
    expect(visibilite(lire(avecNote(a, A1)), A1, 'sujet').valeur).toBe('visible')
    expect(visibilite(lire(changerSujet(a, A1, (s) => ({ ...s, etiquettes: ['x'] }))), A1, 'sujet').valeur).toBe('visible')
    expect(visibilite(lire(changerSujet(a, A1, (s) => ({ ...s, image: { fichier: 'f', l: 300, h: 200 } }))), A1, 'sujet').valeur).toBe('visible')
    expect(visibilite(lire(changerSujet(a, A1, (s) => ({ ...s, marqueurs: ['a', 'b', 'c', 'd'] }))), A1, 'sujet').valeur).toBe('visible')
    expect(visibilite(lire(changerSujet(a, A1, (s) => ({ ...s, marqueurs: ['a', 'b', 'c'] }))), A1, 'sujet').valeur).toBe('masque')
    // Un titre que la liste tronque (mesure du dessin).
    expect(visibilite(l, A1, 'sujet', { titreTronque: (id) => id === A1 }).valeur).toBe('visible')
    // La liste du parent sautée : il faut bien qu'il paraisse quelque part.
    expect(visibilite(lire(poserDiapo(a, [A], { liste: 'masque' })), A1, 'sujet').valeur).toBe('visible')
  })

  it('« Visible » sur une liste ne la force pas : la chaîne d’enfants uniques la saute encore', () => {
    // C → X → Y → Z : une chaîne de trois.
    let a: Arbre = nouvelArbre('C')
    const c = lire(a).central
    let X: Id, Y: Id, Z: Id
    ;[a, X] = ajouterEnfant(a, c, 'X')
    ;[a, Y] = ajouterEnfant(a, X, 'Y')
    ;[a, Z] = ajouterEnfant(a, Y, 'Z')
    const l = lire(a)
    expect([chaine(l, c), chaine(l, X), chaine(l, Y), chaine(l, Z)]).toEqual([3, 3, 3, 3])
    // Une chaîne devient une suite de diapositives de sujet, sans listes d'un seul élément.
    expect(arrets(a, sequence(l))).toEqual(['S C', 'S X', 'S Y', 'S Z', 'Fin', 'écran de fin'])
    const b = poserDiapo(a, [c], { liste: 'visible' })
    expect(visibilite(lire(b), c, 'liste')).toEqual({ valeur: 'masque', auto: false })
    expect(visibiliteAuto(lire(b), c, 'liste')).toBe('masque')
    expect(sequence(lire(b)).diapos.filter((d) => d.type === 'liste').every((d) => d.sautee)).toBe(true)
    // Deux maillons ne font pas une chaîne.
    const seul = nouvelArbre('C')
    const [court] = ajouterEnfant(seul, lire(seul).central, 'X')
    expect(chaine(lire(court), lire(court).central)).toBe(1)
  })

  it('sous un central en arête ou en chronologie, les principaux sans contenu propre n’ont pas de diapositive', () => {
    const { a, c, A, B, A1 } = exemple()
    const b = changerSujet(a, c, (s) => ({ ...s, structure: 'arete-droite' }))
    const l = lire(b)
    expect(miseEnPageDe(l, c).valeur).toBe('arete')
    expect(visibilite(l, B, 'sujet').valeur).toBe('masque')
    // La liste de chaque arête devient une tête d'arête ; le réglage de l'enfant n'y peut rien.
    expect(dispositionDe(l, A)).toBe('tete-arete')
    expect(dispositionDe(lire(poserDiapo(b, [A], { miseEnPage: 'puces' })), A)).toBe('tete-arete')
    expect(dispositionDe(l, A1)).not.toBe('tete-arete')
    const t = poserDiapo(a, [c], { miseEnPage: 'chronologie' })
    expect(visibilite(lire(t), A, 'sujet').valeur).toBe('masque')
    expect(dispositionDe(lire(t), A)).toBe('tete-chronologie')
  })

  it('un résumé s’insère juste après le dernier enfant qu’il couvre, entre deux diapositives de résumé', () => {
    let { a, c, A, B } = exemple()
    let D: Id
    ;[a, D] = ajouterEnfant(a, c, 'D')
    const [b, R] = ajouterResume(a, [A, B], 'En bref')
    expect(niveauDe(lire(b), R!)).toBe('resume')
    const s = suite(b)
    const deB = s.indexOf('S B')
    expect(s.slice(deB, deB + 8)).toEqual([
      'S B',
      'L C 1', // sortie de B, entrée du résumé
      'R En bref',
      '~S En bref', // rien de plus que la diapositive de résumé
      'R En bref >', // la seconde s'enchaîne
      'L C 1 >', // retour à la liste, vers l'entrée de D
      'L C 2',
      'S D',
    ])
    const r = sequence(lire(b), { resumes: b.resumes }).diapos.find((d) => d.type === 'resume')!
    expect(r.type === 'resume' && [r.plage, r.forme, r.gabarit]).toEqual([[A, B], 'accolade', 'resume'])
    expect(visibilite(lire(poserDiapo(b, [R!], { resume: 'masque' })), R!, 'resume').valeur).toBe('masque')
    expect(D).toBeTruthy()
  })

  it('un flottant suit le central, « Merci » vient après la dernière racine', () => {
    const { a, c } = exemple()
    const b: Arbre = { ...a, sujets: { ...a.sujets, F: { parent: c, genre: 'detache', ordre: 'a', titre: 'F', position: { x: 0, y: 0 } } } }
    const l = lire(b)
    expect(niveauDe(l, 'F')).toBe('flottant')
    const s = sequence(l)
    expect(suite(b).slice(-2)).toEqual(['S F', 'Fin'])
    // ⇧→ depuis le central : droit au premier flottant ; depuis le flottant : « Merci ».
    expect(apresBranche(s, s.debut.get(c)!)).toBe(s.debut.get('F'))
    expect(s.diapos[apresBranche(s, s.debut.get('F')!)!]!.type).toBe('fin')
  })

  it('le départ : la diapositive du sujet, même sautée', () => {
    const { a, c, A1 } = exemple()
    const l = lire(a)
    const s = sequence(l)
    expect(depart(s, l)).toBe(s.debut.get(c))
    const i = depart(s, l, A1)
    expect([s.diapos[i]!.type, s.diapos[i]!.sujet, s.diapos[i]!.sautee]).toEqual(['sujet', A1, true])
  })

  it('⇧→ : la sortie du sujet dans la liste du parent, qui s’enchaîne sur le frère suivant ; depuis le central, « Merci »', () => {
    const { a, c, A } = exemple()
    const l = lire(a)
    const s = sequence(l)
    const sauts = trajet(s, l, s.debut.get(A)!, 'passer')
    expect(sauts.map((x) => [typeof x.vers === 'number' ? ligne(a, s.diapos[x.vers]!) : x.vers, x.automatique])).toEqual([
      ['L C 0 >', false],
      ['L C 1', true],
    ])
    // Depuis une liste de A aussi.
    expect(apresBranche(s, s.debut.get(A)! + 2)).toBe(s.sortie.get(A))
    for (const i of [s.debut.get(c)!, 2]) expect(s.diapos[arrivee(trajet(s, l, i, 'passer'), i) as number]!.type).toBe('fin')
  })

  it('⇧← : l’étape de la liste du parent où le sujet a paru ; le central revient à sa diapositive', () => {
    const { a, c, A } = exemple()
    const l = lire(a)
    const s = sequence(l)
    const listeA = s.diapos.findIndex((d) => d.type === 'liste' && d.sujet === A && !d.sautee && !d.enchaine.avant)
    expect(versParent(s, listeA)).toBe(s.entree.get(A))
    expect(versParent(s, s.debut.get(A)!)).toBe(s.entree.get(A))
    expect(versParent(s, 2)).toBe(s.debut.get(c))
    expect(trajet(s, l, s.debut.get(c)!, 'remonter')).toEqual([])
    // L'effet est joué, sans les animations des diapositives.
    expect(trajet(s, l, listeA, 'remonter')[0]!.effet).toEqual({ nom: 'morphing', duree: 1000, animationsDiapo: false })
  })

  it('reculer franchit les diapositives sautées, sans animation, et traverse les sorties de liste', () => {
    const { a, A } = exemple()
    const l = lire(a)
    const s = sequence(l)
    const entreeB = s.diapos.findIndex((d) => d.type === 'liste' && d.entreeDe !== undefined && a.sujets[d.entreeDe]?.titre === 'B')
    const sauts = trajet(s, l, entreeB, 'reculer')
    // La sortie de A s'enchaîne en reculant : on repart dans la dernière diapositive montrée de A.
    expect(sauts.map((x) => x.vers)).toEqual([s.sortie.get(A), s.entree.get(Object.keys(a.sujets).find((k) => a.sujets[k]!.titre === 'A2')!)])
    expect(sauts.every((x) => x.effet.nom === 'aucun' && x.effet.duree === 0)).toBe(true)
    // Au début, on reste.
    expect(trajet(s, l, 0, 'reculer')).toEqual([])
  })

  it('au bout : « Merci », l’écran de fin, puis la fin ; reculer depuis l’écran de fin rend « Merci » sans effet', () => {
    const { a } = exemple()
    const l = lire(a)
    const s = sequence(l)
    const merci = s.diapos.length - 1
    expect(trajet(s, l, merci, 'avancer')).toEqual([{ de: merci, vers: 'ecran-de-fin', effet: { nom: 'fondu', duree: 400, animationsDiapo: true }, automatique: false }])
    expect(arrivee(trajet(s, l, 'ecran-de-fin', 'avancer'), 'ecran-de-fin')).toBe('terminer')
    const retour = trajet(s, l, 'ecran-de-fin', 'reculer')
    expect([retour[0]!.vers, retour[0]!.effet.nom]).toEqual([merci, 'aucun'])
  })

  it('la place de l’image en Auto, et en portrait', () => {
    const { a, A } = exemple()
    const b = changerSujet(a, A, (s) => ({ ...s, image: { fichier: 'f', l: 800, h: 600 } }))
    expect(placeImageDe(lire(b), A)).toEqual({ valeur: 'gauche', auto: true })
    expect(placeImageDe(lire(b), A, '9:16').valeur).toBe('dessus')
    const s = sequence(lire(b), { ratio: '9:16' })
    const d = s.diapos[s.debut.get(A)!]!
    expect(d.type === 'sujet' && [d.gabarit, d.placeImage]).toEqual(['sujet-image', 'dessus'])
    // En portrait, l'accolade devient un arbre.
    expect(s.diapos[1]!.gabarit).toBe('arbre')
  })
})
