import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../../coeur/tableau'
import { type Geste, appliquerGeste } from './gestes'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './sujets'

const titre = () => 'Neuf'

function carte() {
  let a: Arbre = nouvelArbre('Central')
  const c = lire(a).central
  let x: Id, y: Id, f: Id
  ;[a, x] = ajouterEnfant(a, c, 'A')
  ;[a, y] = ajouterEnfant(a, c, 'B')
  ;[a, f] = ajouterFlottant(a, { x: 200, y: 50 }, 'Libre')
  return { a, c, x, y, f }
}
const faire = (a: Arbre, g: Geste) => appliquerGeste(a, g, titre)!

describe('les gestes de la barre d’outils et du menu +', () => {
  it('une zone se crée, se titre, se redimensionne, se déplace avec son contenu et se retire', () => {
    const { a, f } = carte()
    const e = faire(a, { type: 'zone', rect: { x: 100, y: 0, l: 300, h: 200 }, titre: 'Zone' })
    const id = e.choisir!
    expect(e.arbre.zones![id]).toMatchObject({ x: 100, y: 0, l: 300, h: 200, titre: 'Zone' })
    expect(faire(e.arbre, { type: 'titrer', id, titre: ' Idées ' }).arbre.zones![id]!.titre).toBe('Idées')
    expect(faire(e.arbre, { type: 'titrer', id, titre: '' }).arbre.zones![id]!.titre).toBeUndefined()
    expect(faire(e.arbre, { type: 'zoneRect', id, rect: { x: 0, y: 0, l: 80, h: 90 } }).arbre.zones![id]).toMatchObject({ l: 80, h: 90 })
    const bouge = faire(e.arbre, { type: 'zoneDeplacer', id, de: { x: 5, y: 5 }, membres: [f] }).arbre
    expect(bouge.zones![id]).toMatchObject({ x: 105, y: 5 })
    expect(bouge.sujets[f]!.position).toEqual({ x: 205, y: 55 })
    // Supprimer la zone seule, son contenu seul, ou les deux.
    const seule = faire(e.arbre, { type: 'zoneRetirer', id, membres: [f], quoi: 'zone' }).arbre
    expect(seule.zones).toBeUndefined()
    expect(seule.sujets[f]).toBeDefined()
    const contenu = faire(e.arbre, { type: 'zoneRetirer', id, membres: [f], quoi: 'contenu' }).arbre
    expect(contenu.zones![id]).toBeDefined()
    expect(contenu.sujets[f]).toBeUndefined()
    const tout = faire(e.arbre, { type: 'zoneRetirer', id, membres: [f], quoi: 'tout' }).arbre
    expect(tout.zones).toBeUndefined()
    expect(tout.sujets[f]).toBeUndefined()
    // Suppr sur une zone choisie la retire aussi, comme une relation.
    expect(faire(e.arbre, { type: 'supprimer', ids: [id] }).arbre.zones).toBeUndefined()
  })

  it('une tâche : dates, durée, avancement, et on la retire', () => {
    const { a, x } = carte()
    let r = faire(a, { type: 'planning', ids: [x], planning: { debut: '2026-06-01', duree: 3 }, change: 'duree' }).arbre
    expect(r.sujets[x]!.planning).toEqual({ debut: '2026-06-01', duree: 3, fin: '2026-06-03' })
    r = faire(r, { type: 'planning', ids: [x], planning: { ...r.sujets[x]!.planning, progression: 60 } }).arbre
    expect(r.sujets[x]!.planning!.progression).toBe(60)
    r = faire(r, { type: 'oter', ids: [x], champs: ['planning'] }).arbre
    expect(r.sujets[x]!.planning).toBeUndefined()
  })

  it('« À faire » : à faire, faite, annulée, retirée', () => {
    const { a, x } = carte()
    let r = faire(a, { type: 'tache', ids: [x] }).arbre
    expect(r.sujets[x]!.tache).toBe('a-faire')
    r = faire(r, { type: 'porter', ids: [x], champ: 'tache', valeur: 'annulee' }).arbre
    expect(r.sujets[x]!.tache).toBe('annulee')
    r = faire(r, { type: 'oter', ids: [x], champs: ['tache'] }).arbre
    expect(r.sujets[x]!.tache).toBeUndefined()
  })

  it('ôter : marqueurs, étiquettes, lien, note, image, tout d’un coup', () => {
    const { a, x, y } = carte()
    let r = faire(a, { type: 'marqueur', ids: [x, y], marqueur: 'flag-red' }).arbre
    r = faire(r, { type: 'etiquettes', ids: [x, y], ajouter: ['a', 'b'] }).arbre
    r = faire(r, { type: 'porter', ids: [x], champ: 'lien', valeur: 'https://notak.app' }).arbre
    r = faire(r, { type: 'oter', ids: [x, y], champs: ['marqueurs', 'etiquettes', 'lien'] }).arbre
    for (const id of [x, y]) expect(r.sujets[id]).toEqual({ parent: lire(r).central, ordre: r.sujets[id]!.ordre, titre: r.sujets[id]!.titre })
  })

  it('les groupes de marqueurs à soi et la légende', () => {
    const { a, x } = carte()
    let r = faire(a, { type: 'groupe', action: 'creer', nom: 'Mes icônes', id: 'g1' }).arbre
    expect(r.groupes!.g1!.nom).toBe('Mes icônes')
    r = faire(r, { type: 'groupe', action: 'renommer', id: 'g1', nom: ' Autres ' }).arbre
    expect(r.groupes!.g1!.nom).toBe('Autres')
    // Un nom vide ne renomme pas.
    expect(faire(r, { type: 'groupe', action: 'renommer', id: 'g1', nom: '  ' }).arbre.groupes!.g1!.nom).toBe('Autres')
    r = faire(r, { type: 'marqueurPerso', action: 'ajouter', groupe: 'g1', nom: 'logo', fichier: 'fich' }).arbre
    const marqueur = `perso-${r.groupes!.g1!.marqueurs[0]!.id}`
    r = faire(r, { type: 'marqueur', ids: [x], marqueur }).arbre
    r = faire(r, { type: 'legende' }).arbre
    r = faire(r, { type: 'legendeTexte', marqueur, texte: 'Notre logo' }).arbre
    expect(r.legende).toEqual({ visible: true, textes: { [marqueur]: 'Notre logo' } })
    r = faire(r, { type: 'groupe', action: 'supprimer', id: 'g1' }).arbre
    expect(r.groupes).toBeUndefined()
    expect(r.sujets[x]!.marqueurs).toBeUndefined()
  })

  it('coller des branches sous un sujet, ou en flottants ; couper-coller déplace', () => {
    const { a, x, y } = carte()
    const f = { racines: [x], sujets: { [x]: a.sujets[x]! } }
    const sous = faire(a, { type: 'coller', fragment: f, parent: y })
    expect(lire(sous.arbre).enfants.get(y)).toHaveLength(1)
    expect(sous.choisir).toBe(lire(sous.arbre).enfants.get(y)![0])
    const libre = faire(a, { type: 'coller', fragment: f, position: { x: 10, y: 10 } })
    expect(lire(libre.arbre).flottants).toHaveLength(2)
    // Coller sous un sujet replié le déplie.
    const replie = faire(sous.arbre, { type: 'replier', id: y }).arbre
    expect(replie.sujets[y]!.replie).toBe(true)
    expect(faire(replie, { type: 'coller', fragment: f, parent: y }).arbre.sujets[y]!.replie).toBeUndefined()
    expect(appliquerGeste(a, { type: 'coller', fragment: { racines: [], sujets: {} }, parent: y }, titre)).toBeNull()
  })

  it('relation : réinitialiser le point de contrôle, ou tout ; coller un style copié', () => {
    const { a, x, y } = carte()
    let r = faire(a, { type: 'relation', de: x, vers: y })
    const id = r.choisir!
    let arbre = faire(r.arbre, { type: 'controles', id, controles: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }).arbre
    arbre = faire(arbre, { type: 'relationStyle', id, forme: 'droite', pointes: { depart: true, arrivee: true } }).arbre
    const point = faire(arbre, { type: 'relationReinit', ids: [id], quoi: 'point' }).arbre
    expect(point.relations![id]!.controles).toBeUndefined()
    expect(point.relations![id]!.forme).toBe('droite')
    const tout = faire(arbre, { type: 'relationReinit', ids: [id], quoi: 'tout' }).arbre
    expect(tout.relations![id]).toEqual({ de: x, vers: y })
    const collee = faire(tout, { type: 'relationStyleColler', ids: [id], forme: 'coudee', pointes: { depart: true } }).arbre
    expect(collee.relations![id]).toMatchObject({ forme: 'coudee', pointes: { depart: true } })
    r = faire(a, { type: 'relation', de: y, vers: x })
  })

  it('réinitialiser l’emplacement d’un seul sujet ; replier toutes les sous-branches ; aligner', () => {
    const { a, x, y, f } = carte()
    const decale = { ...a, sujets: { ...a.sujets, [x]: { ...a.sujets[x]!, decalage: { x: 20, y: 5 } }, [y]: { ...a.sujets[y]!, decalage: { x: 7, y: 7 } } } }
    const r = faire(decale, { type: 'realigner', ids: [x] }).arbre
    expect(r.sujets[x]!.decalage).toBeUndefined()
    expect(r.sujets[y]!.decalage).toEqual({ x: 7, y: 7 })
    expect(faire(decale, { type: 'realigner' }).arbre.sujets[y]!.decalage).toBeUndefined()
    const profond = ajouterEnfant(a, x, 'A1')[0]
    expect(faire(profond, { type: 'replierBranches', id: lire(profond).central, replier: true }).arbre.sujets[x]!.replie).toBe(true)
    const [b, g] = ajouterFlottant(a, { x: 500, y: 90 }, 'Autre')
    const al = faire(b, { type: 'aligner', ids: [f, g], mode: 'haut', tailles: { [f]: { l: 40, h: 20 }, [g]: { l: 40, h: 40 } } }).arbre
    // Le plus haut reste ; l'autre monte, bord haut contre bord haut.
    expect(al.sujets[f]!.position!.y).toBe(50)
    expect(al.sujets[g]!.position!.y).toBe(60)
  })
})
