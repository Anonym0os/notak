import { describe, expect, it, vi } from 'vitest'
import type { Arbre, Id } from '../../coeur/tableau'
import { type ActionsInsertion, type Hote, executer } from './actionsMenu'
import type { CibleMenu } from './menus'
import type { Geste } from './modele/gestes'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './modele/sujets'

function carte() {
  let a: Arbre = nouvelArbre('Central')
  const c = lire(a).central
  let x: Id, y: Id, f: Id
  ;[a, x] = ajouterEnfant(a, c, 'A')
  ;[a, y] = ajouterEnfant(a, c, 'B')
  ;[a, f] = ajouterFlottant(a, { x: 200, y: 50 }, 'Libre')
  return { a, c, x, y, f }
}

/** Un hôte factice : tout ce que la carte ouverte ferait est noté. */
function hote(a: Arbre) {
  const gestes: Geste[] = []
  const appels: string[] = []
  const l = lire(a)
  const noter = (nom: string) => (...args: unknown[]) => void appels.push(`${nom}:${JSON.stringify(args)}`)
  const inserer = Object.fromEntries(['zone', 'etiquettes', 'tache', 'aFaire', 'note', 'lienWeb', 'lienSujet', 'pieceJointe', 'noteAudio', 'marqueur', 'autocollant', 'illustration', 'imageLocale', 'equation'].map((n) => [n, vi.fn(() => void appels.push(`inserer.${n}`))])) as unknown as ActionsInsertion
  const h: Hote = {
    arbre: () => a,
    lecture: () => l,
    faire: (g) => void gestes.push(g),
    choisir: noter('choisir'),
    editer: noter('editer'),
    copier: noter('copier'),
    coller: noter('coller'),
    copierStyle: noter('copierStyle'),
    collerStyle: noter('collerStyle'),
    copierStyleRelation: noter('copierStyleRelation'),
    collerStyleRelation: noter('collerStyleRelation'),
    inserer,
    ouvrirIcones: noter('ouvrirIcones'),
    ouvrirNote: noter('ouvrirNote'),
    allerAuCentral: noter('allerAuCentral'),
    brancheSeule: noter('brancheSeule'),
    relier: noter('relier'),
    tailles: (ids) => Object.fromEntries(ids.map((i) => [i, { l: 40, h: 20 }])),
    contenuZone: () => ['f'],
    ajusterZone: noter('ajusterZone'),
    telecharger: noter('telecharger'),
    ouvrirFichier: noter('ouvrirFichier'),
    flottant: noter('flottant'),
    ouvrirLien: noter('ouvrirLien'),
  }
  return { h, gestes, appels }
}

const sujet = (id: Id): CibleMenu => ({ genre: 'sujet', id })

describe('ce que fait chaque entrée des menus', () => {
  it('Insérer : chaque entrée ouvre son éditeur, après avoir choisi le sujet cliqué s’il ne l’était pas', () => {
    const { a, x, y } = carte()
    const { h, appels } = hote(a)
    executer('inserer.etiquette', sujet(x), [y], h)
    expect(appels).toEqual([`choisir:${JSON.stringify([[x]])}`, 'inserer.etiquettes'])
    appels.length = 0
    executer('inserer.equation', sujet(x), [x], h)
    executer('inserer.pageWeb', sujet(x), [x], h)
    executer('inserer.audio', sujet(x), [x], h)
    executer('inserer.autocollant', sujet(x), [x], h)
    expect(appels).toEqual(['inserer.equation', 'inserer.lienWeb', 'inserer.noteAudio', 'inserer.autocollant'])
    executer('inserer.marqueur', sujet(x), [x], h)
    expect(appels.at(-1)).toBe('inserer.marqueur')
  })

  it('Couper, Copier, Coller, Dupliquer, Supprimer : sur toute la sélection si on clique dedans', () => {
    const { a, x, y, c } = carte()
    const { h, gestes, appels } = hote(a)
    executer('copier', sujet(x), [x, y], h)
    executer('couper', sujet(x), [x, y], h)
    expect(appels).toEqual([`copier:${JSON.stringify([[x, y], false])}`, `copier:${JSON.stringify([[x, y], true])}`])
    // Cliquer en dehors de la sélection : le sujet cliqué seul.
    executer('supprimer', sujet(y), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'supprimer', ids: [y] })
    executer('supprimer', sujet(x), [x, y], h)
    expect(gestes.at(-1)).toEqual({ type: 'supprimer', ids: [x, y] })
    executer('supprimerSeul', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'supprimerSeul', id: x })
    executer('dupliquer', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'dupliquer', id: x })
    appels.length = 0
    executer('coller', sujet(x), [x], h)
    executer('coller', { genre: 'fond', x: 12, y: 34 }, [], h)
    expect(appels).toEqual([`coller:${JSON.stringify([{ parent: x }])}`, `coller:${JSON.stringify([{ x: 12, y: 34 }])}`])
    void c
  })

  it('les tâches, le texte, ce que porte le sujet', () => {
    const { a, x } = carte()
    const { h, gestes } = hote(a)
    executer('tache.annulee', sujet(x), [x], h)
    executer('tache.faite', sujet(x), [x], h)
    executer('tache.nonFaite', sujet(x), [x], h)
    expect(gestes.map((g) => (g as { valeur?: string }).valeur)).toEqual(['annulee', 'faite', 'a-faire'])
    executer('tache.oter', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'oter', ids: [x], champs: ['tache'] })
    executer('planning.oter', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'oter', ids: [x], champs: ['planning'] })
    executer('viderTexte', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'renommer', id: x, titre: '' })
    executer('oter.marqueur', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'oter', ids: [x], champs: ['marqueurs'] })
    executer('style.reinit', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'style', ids: [x], style: null })
  })

  it('Sélectionner : choisit ce que la carte contient', () => {
    const { a, x, y } = carte()
    const { h, appels } = hote(a)
    executer('sel.freres', sujet(x), [x], h)
    expect(appels).toEqual([`choisir:${JSON.stringify([[y]])}`])
    appels.length = 0
    executer('sel.flottants', { genre: 'fond', x: 0, y: 0 }, [], h)
    expect(JSON.parse(appels[0]!.slice(8))[0]).toHaveLength(1)
  })

  it('Replier, Aligner, Réinitialiser l’emplacement', () => {
    const { a, x, f, c } = carte()
    const { h, gestes, appels } = hote(a)
    executer('replier', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'replier', id: x })
    executer('replierTout', sujet(c), [c], h)
    expect(gestes.at(-1)).toEqual({ type: 'replierBranches', id: c, replier: true })
    executer('deplierTout', sujet(c), [c], h)
    expect(gestes.at(-1)).toEqual({ type: 'replierBranches', id: c, replier: false })
    executer('deplierTout', { genre: 'fond', x: 0, y: 0 }, [], h)
    expect(gestes.at(-1)).toEqual({ type: 'toutReplier' })
    executer('aligner.haut', sujet(f), [f], h)
    expect(gestes.at(-1)).toEqual({ type: 'aligner', ids: [f], mode: 'haut', tailles: { [f]: { l: 40, h: 20 } } })
    executer('reinitPosition', sujet(x), [x], h)
    expect(gestes.at(-1)).toEqual({ type: 'realigner', ids: [x] })
    executer('brancheSeule', sujet(x), [x], h)
    executer('central', { genre: 'fond', x: 0, y: 0 }, [], h)
    executer('relation.inserer', { genre: 'fond', x: 0, y: 0 }, [], h)
    expect(appels.slice(-3).map((s) => s.split(':')[0])).toEqual(['brancheSeule', 'allerAuCentral', 'relier'])
  })

  it('le fond : insérer un sujet flottant au point cliqué, créer une zone', () => {
    const { a } = carte()
    const { h, appels } = hote(a)
    executer('flottant', { genre: 'fond', x: 70, y: 80 }, [], h)
    expect(appels).toEqual([`flottant:${JSON.stringify([70, 80])}`])
    executer('zone.creer', { genre: 'fond', x: 0, y: 0 }, [], h)
    expect(appels.at(-1)).toBe('inserer.zone')
  })

  it('une relation : modifier, copier et coller son style, réinitialiser', () => {
    const { a } = carte()
    const { h, gestes, appels } = hote(a)
    executer('relation.modifier', { genre: 'relation', id: 'r' }, ['r'], h)
    executer('relation.styleCopier', { genre: 'relation', id: 'r' }, ['r'], h)
    executer('relation.styleColler', { genre: 'relation', id: 'r' }, ['r'], h)
    expect(appels.map((s) => s.split(':')[0])).toEqual(['editer', 'copierStyleRelation', 'collerStyleRelation'])
    executer('relation.styleReinit', { genre: 'relation', id: 'r' }, ['r'], h)
    expect(gestes.at(-1)).toEqual({ type: 'relationReinit', ids: ['r'], quoi: 'tout' })
    executer('relation.pointReinit', { genre: 'relation', id: 'r' }, ['r'], h)
    expect(gestes.at(-1)).toEqual({ type: 'relationReinit', ids: ['r'], quoi: 'point' })
    executer('supprimer', { genre: 'relation', id: 'r' }, [], h)
    expect(gestes.at(-1)).toEqual({ type: 'supprimer', ids: ['r'] })
  })

  it('une zone : supprimer avec ou sans contenu, effacer le contenu, ajuster', () => {
    const { a } = carte()
    const { h, gestes, appels } = hote({ ...a, zones: { z: { x: 0, y: 0, l: 100, h: 100 } } })
    const z: CibleMenu = { genre: 'zone', id: 'z' }
    executer('zone.supprimer', z, ['z'], h)
    expect(gestes.at(-1)).toEqual({ type: 'zoneRetirer', id: 'z', membres: ['f'], quoi: 'tout' })
    executer('zone.retirer', z, ['z'], h)
    expect(gestes.at(-1)).toEqual({ type: 'zoneRetirer', id: 'z', membres: [], quoi: 'zone' })
    executer('zone.effacer', z, ['z'], h)
    expect(gestes.at(-1)).toEqual({ type: 'zoneRetirer', id: 'z', membres: ['f'], quoi: 'contenu' })
    executer('zone.ajuster', z, ['z'], h)
    expect(appels.at(-1)).toBe('ajusterZone:["z"]')
  })

  it('les pastilles : on retire l’image, l’équation, un marqueur, une étiquette, la note, le lien, la pièce ; on surligne', () => {
    let { a, x } = carte()
    a = { ...a, sujets: { ...a.sujets, [x]: { ...a.sujets[x]!, etiquettes: ['un', 'deux'], marqueurs: ['flag-red'] } } }
    const { h, gestes, appels } = hote(a)
    const sup = (cible: CibleMenu) => executer('supprimer.champ', cible, [], h)
    sup({ genre: 'image', id: x })
    expect(gestes.at(-1)).toEqual({ type: 'oter', ids: [x], champs: ['image', 'vignette'] })
    sup({ genre: 'equation', id: x })
    expect(gestes.at(-1)).toEqual({ type: 'oter', ids: [x], champs: ['equation'] })
    sup({ genre: 'marqueur', id: x, marqueur: 'flag-red' })
    expect(gestes.at(-1)).toEqual({ type: 'marqueur', ids: [x], marqueur: 'flag-red' })
    sup({ genre: 'etiquette', id: x, rang: 1 })
    expect(gestes.at(-1)).toEqual({ type: 'etiquettes', ids: [x], retirer: ['deux'] })
    sup({ genre: 'piece', id: x })
    expect(gestes.at(-1)).toEqual({ type: 'oter', ids: [x], champs: ['piece'] })
    executer('surligner', { genre: 'marqueur', id: x, marqueur: 'flag-red' }, [], h)
    expect(appels.at(-1)).toBe(`choisir:${JSON.stringify([[x]])}`)
    executer('surligner', { genre: 'etiquette', id: x, rang: 0 }, [], h)
    expect(appels.at(-1)).toBe(`choisir:${JSON.stringify([[x]])}`)
  })
})
