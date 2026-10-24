import { describe, expect, it } from 'vitest'
import type { Id } from '../../../coeur/tableau'
import { INTERLIGNE, habitDe, mesureDeSujet, type Mesure } from '../apparence'
import { disposer } from '../disposition'
import { themeDeArbre } from '../themes'
import { DEBORD_CHAMP, RATTRAPAGE_BASE, debutEdition, estTitreParDefaut, positionDuChamp, titreRemplace } from './champ'
import { appliquerGeste } from './gestes'
import { ajouterEnfant, lire, nouvelArbre } from './sujets'

function carte(titre = 'Un titre assez long pour passer à la ligne dans le sujet principal de la carte') {
  let a = nouvelArbre('Centre')
  const c = lire(a).central
  let p: Id
  ;[a, p] = ajouterEnfant(a, c, titre)
  return { a, c, p }
}

/** La carte mesurée et disposée, comme la fenêtre le fait. */
function vue(a: ReturnType<typeof carte>['a']) {
  const l = lire(a)
  const theme = themeDeArbre(a)
  const mesures = new Map<Id, Mesure>([...l.sujets.keys()].map((id) => [id, mesureDeSujet(l, id, theme)]))
  const d = disposer(l, (id) => mesures.get(id) ?? { l: 40, h: 20 })
  return { l, mesures, d }
}

describe('où se pose le champ d’un titre', () => {
  it('exactement sur le texte du sujet, à sa police, sa taille et sa graisse', () => {
    const { a, p } = carte('Court')
    const { l, mesures, d } = vue(a)
    const pose = positionDuChamp(p, l, d, mesures, a)!
    const [b, m, h] = [d.boites.get(p)!, mesures.get(p)!, habitDe(l, p, themeDeArbre(a))]
    expect(pose.genre).toBe('sujet')
    expect(pose.x).toBeCloseTo(b.x + m.texte.x - DEBORD_CHAMP)
    expect(pose.y).toBeCloseTo(b.y + m.texte.y - h.police * RATTRAPAGE_BASE)
    expect(pose.l).toBeCloseTo(m.texte.l + 2 * DEBORD_CHAMP)
    expect(pose.h).toBeCloseTo(m.texte.h)
    expect(pose.police).toBe(h.police)
    expect(pose.graisse).toBe(h.graisse)
    expect(pose.interligne).toBeCloseTo(h.police * INTERLIGNE)
    expect(pose.alignement).toBe(h.alignement)
    expect(pose.couleur).toBeTruthy()
  })

  it('suit le style du sujet : taille, gras, italique, alignement, couleur du texte', () => {
    const { a, p } = carte('Court')
    const stylise = appliquerGeste(a, { type: 'style', ids: [p], style: { taille: 30, graisse: 300, italique: true, alignement: 'droite', couleurTexte: '#112233', casse: 'majuscules' } }, () => 'x')!.arbre
    const { l, mesures, d } = vue(stylise)
    const pose = positionDuChamp(p, l, d, mesures, stylise)!
    expect(pose).toMatchObject({ police: 30, graisse: 300, italique: true, alignement: 'droite', couleur: '#112233', casse: 'majuscules' })
  })

  it('grandit avec le texte qu’on écrit : la carte mesure le titre en cours', () => {
    const { a, p } = carte('Court')
    const avant = vue(a)
    const ecrit = titreRemplace(a, p, 'Un texte bien plus long que le titre enregistré')
    const apres = vue(ecrit)
    expect(apres.mesures.get(p)!.l).toBeGreaterThan(avant.mesures.get(p)!.l)
    expect(positionDuChamp(p, apres.l, apres.d, apres.mesures, ecrit)!.l).toBeGreaterThan(positionDuChamp(p, avant.l, avant.d, avant.mesures, a)!.l)
  })

  it('un titre long passe à la ligne à la largeur maximale du rang : le champ s’allonge', () => {
    const { a, p } = carte('Court')
    const court = vue(a)
    const long = vue(titreRemplace(a, p, 'Un titre très long qui doit passer à la ligne automatiquement dans le sujet, à la largeur maximale'))
    expect(long.mesures.get(p)!.lignes.length).toBeGreaterThan(1)
    expect(long.mesures.get(p)!.texte.h).toBeGreaterThan(court.mesures.get(p)!.texte.h)
  })

  it('une relation, une zone, une limite : un champ d’objet', () => {
    const { a, c, p } = carte('Court')
    const avecRelation = appliquerGeste(a, { type: 'relation', de: c, vers: p }, () => 'x')!
    const [id] = Object.keys(avecRelation.arbre.relations ?? {})
    const { l, mesures, d } = vue(avecRelation.arbre)
    expect(positionDuChamp(id!, l, d, mesures, avecRelation.arbre)?.genre).toBe('objet')
    expect(positionDuChamp('inconnu', l, d, mesures, a)).toBeNull()
  })
})

describe('le titre en cours', () => {
  it('remplace celui du sujet sans toucher la carte d’origine', () => {
    const { a, p } = carte('Court')
    const ecrit = titreRemplace(a, p, 'Neuf')
    expect(ecrit.sujets[p]!.titre).toBe('Neuf')
    expect(a.sujets[p]!.titre).toBe('Court')
  })

  it('ne change rien quand il n’y a rien à remplacer', () => {
    const { a, p } = carte('Court')
    expect(titreRemplace(a, undefined, 'x')).toBe(a)
    expect(titreRemplace(a, p, undefined)).toBe(a)
    expect(titreRemplace(a, 'inconnu', 'x')).toBe(a)
    expect(titreRemplace(a, p, 'Court')).toBe(a)
  })
})

describe('l’ouverture du champ', () => {
  it('reconnaît les titres qu’un sujet reçoit à sa naissance, dans les deux langues', () => {
    for (const t of ['Sujet principal 3', 'Sous-sujet 12', 'Sujet flottant', 'Sujet central', 'Main topic 1', 'Subtopic 4', 'Floating topic', 'Résumé']) expect(estTitreParDefaut(t)).toBe(true)
    for (const t of ['Mon idée', 'Sujet principal', 'Sous-sujet', 'Sujet principal 3 bis', '', 'Main topic']) expect(estTitreParDefaut(t)).toBe(false)
  })

  it('un sujet jamais titré s’ouvre avec tout sélectionné', () => {
    expect(debutEdition('x', 'Sujet principal 2')).toEqual({ id: 'x', texte: 'Sujet principal 2', tout: true })
  })

  it('un sujet titré s’ouvre avec le curseur à la fin', () => {
    expect(debutEdition('x', 'Mon idée')).toEqual({ id: 'x', texte: 'Mon idée', tout: false })
  })

  it('un caractère tapé remplace le titre, le curseur après lui', () => {
    expect(debutEdition('x', 'Mon idée', { frappe: 'é' })).toEqual({ id: 'x', texte: 'é', tout: false })
    expect(debutEdition('x', 'Sujet principal 2', { frappe: 'a' })).toEqual({ id: 'x', texte: 'a', tout: false })
  })

  it('le titre d’une relation, d’une zone ou d’une limite s’ouvre sélectionné', () => {
    expect(debutEdition('r', 'Lien', { objet: true })).toEqual({ id: 'r', texte: 'Lien', tout: true })
  })
})
