import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Arbre, Id } from '../../coeur/tableau'
import { Icone, type NomIcone } from '../../icones'
import { t } from '../../langue'
import { type CibleMenu, type ContexteMenu, type Item, construireMenu, entrees, menuPlus, nettoyer } from './menus'
import { porter } from './modele/elements'
import { ajouterEnfant, ajouterFlottant, changerSujet, lire, nouvelArbre } from './modele/sujets'
import { BOUTONS_BARRE } from './repliBarre'

function carte() {
  let a: Arbre = nouvelArbre('Central')
  const c = lire(a).central
  let x: Id, y: Id, f: Id, g: Id
  ;[a, x] = ajouterEnfant(a, c, 'A')
  ;[a, y] = ajouterEnfant(a, x, 'A1')
  ;[a, f] = ajouterFlottant(a, { x: 200, y: 50 }, 'Libre')
  ;[a, g] = ajouterFlottant(a, { x: 300, y: 50 }, 'Libre 2')
  return { a, c, x, y, f, g }
}

const menu = (a: Arbre, cible: CibleMenu, plus: Partial<ContexteMenu> = {}) =>
  construireMenu({ arbre: a, lecture: lire(a), selection: 'id' in cible ? [cible.id] : [], cible, presse: false, styleCopie: false, brancheSeule: null, ...plus })
const ids = (items: Item[]) => entrees(items).map((e) => e.id)
const entree = (items: Item[], id: string) => entrees(items).find((e) => e.id === id)

describe('le menu d’un sujet', () => {
  it('« Commenter » porte son icône et son raccourci ; il se grise quand plusieurs sujets sont choisis', () => {
    const { a, x, y } = carte()
    const un = entree(menu(a, { genre: 'sujet', id: x }), 'commenter')!
    expect(un.libelle).toBe('Commenter')
    expect(un.icone).toBe('commentaire')
    expect(un.touche).toMatch(/M$/)
    expect(un.inactif).toBeUndefined()
    const deux = entree(menu(a, { genre: 'sujet', id: x }, { selection: [x, y] }), 'commenter')!
    expect(deux.inactif).toBe(true)
  })

  it('commence par Insérer, avec ses sous-menus et ses séparateurs, dans l’ordre de Xmind', () => {
    const { a, x } = carte()
    const m = menu(a, { genre: 'sujet', id: x })
    const inserer = m[0] as Extract<Item, object>
    expect(inserer.id).toBe('inserer')
    expect(inserer.sous!.map((i) => (i === 'sep' ? '—' : i.id))).toEqual([
      'inserer.note', 'inserer.etiquette', 'inserer.aFaire', 'inserer.tache', 'inserer.lien', '—',
      'inserer.piece', 'inserer.audio', '—',
      'inserer.marqueur', 'inserer.autocollant', 'inserer.illustration', 'inserer.image', 'inserer.equation',
    ])
    const lien = inserer.sous!.find((i) => i !== 'sep' && i.id === 'inserer.lien') as Extract<Item, object>
    expect(lien.sous!.map((i) => (i === 'sep' ? '—' : i.id))).toEqual(['inserer.pageWeb', 'inserer.lienSujet'])
    // « Commenter » suit Insérer, comme sur la planche.
    expect((m[1] as Extract<Item, object>).id).toBe('commenter')
    expect(m[2]).toBe('sep')
  })

  it('rien en tête, en queue ni en double : les séparateurs superflus sont retirés', () => {
    const { a, x, f } = carte()
    for (const id of [x, f]) {
      const m = menu(a, { genre: 'sujet', id })
      expect(m[0]).not.toBe('sep')
      expect(m.at(-1)).not.toBe('sep')
      m.forEach((it, i) => it === 'sep' && expect(m[i + 1]).not.toBe('sep'))
    }
    const un = { id: 'a', libelle: 'A', icone: 'note' } as const
    const deux = { id: 'b', libelle: 'B', icone: 'note' } as const
    expect(nettoyer(['sep', un, 'sep', 'sep', deux, 'sep', { id: 'v', libelle: 'V', icone: 'note', sous: [] }, 'sep'])).toEqual([un, 'sep', deux])
  })

  it('le central ne se coupe, ne se duplique ni ne se supprime ; il ne se replie pas comme un sujet', () => {
    const { a, c } = carte()
    const m = menu(a, { genre: 'sujet', id: c })
    for (const id of ['couper', 'dupliquer', 'supprimer', 'supprimerSeul']) expect(entree(m, id)!.inactif, id).toBe(true)
    expect(entree(m, 'copier')!.inactif).toBeUndefined()
    expect(entree(m, 'replier')).toBeUndefined()
    expect(entree(m, 'brancheSeule')).toBeUndefined()
    // Pour le central : ses sous-sujets, mais ni frères ni même niveau.
    expect(ids((entree(m, 'selectionner') as Extract<Item, object>).sous!)).toEqual(['sel.sousSujets', 'sel.tout'])
  })

  it('Coller et Coller le style ne sont ouverts que s’il y a quelque chose à coller', () => {
    const { a, x } = carte()
    expect(entree(menu(a, { genre: 'sujet', id: x }), 'coller')!.inactif).toBe(true)
    expect(entree(menu(a, { genre: 'sujet', id: x }, { presse: true }), 'coller')!.inactif).toBeUndefined()
    expect(entree(menu(a, { genre: 'sujet', id: x }), 'style.coller')!.inactif).toBe(true)
    expect(entree(menu(a, { genre: 'sujet', id: x }, { styleCopie: true }), 'style.coller')!.inactif).toBeUndefined()
  })

  it('Supprimer le marqueur, l’étiquette, le lien : une entrée si un seul genre, un sous-menu s’il y en a plusieurs', () => {
    const { a, x } = carte()
    expect(ids(menu(a, { genre: 'sujet', id: x }))).not.toContain('oter.marqueur')
    const seul = porter(a, [x], 'etiquettes', ['a'])
    expect(entree(menu(seul, { genre: 'sujet', id: x }), 'oter.etiquette')).toBeDefined()
    expect(entree(menu(seul, { genre: 'sujet', id: x }), 'oter')).toBeUndefined()
    const deux = porter(seul, [x], 'lien', 'https://notak.app')
    const sous = entree(menu(deux, { genre: 'sujet', id: x }), 'oter') as Extract<Item, object>
    expect(ids(sous.sous!)).toEqual(['oter.etiquette', 'oter.lien'])
  })

  it('les entrées d’une tâche suivent son état', () => {
    const { a, x } = carte()
    expect(ids(menu(a, { genre: 'sujet', id: x }))).not.toContain('tache.faite')
    const faire = porter(a, [x], 'tache', 'a-faire')
    expect(ids(menu(faire, { genre: 'sujet', id: x })).filter((i) => i.startsWith('tache.'))).toEqual(['tache.faite', 'tache.annulee', 'tache.oter'])
    const faite = porter(a, [x], 'tache', 'faite')
    expect(ids(menu(faite, { genre: 'sujet', id: x })).filter((i) => i.startsWith('tache.'))).toEqual(['tache.nonFaite', 'tache.annulee', 'tache.oter'])
    const plan = porter(faire, [x], 'planning', { duree: 2 })
    expect(ids(menu(plan, { genre: 'sujet', id: x }))).toContain('planning.oter')
  })

  it('Sélectionner varie selon le sujet : principal, flottant, résumé', () => {
    const { a, x, y, f } = carte()
    const sel = (id: Id, mod = a) => ids((entree(menu(mod, { genre: 'sujet', id }), 'selectionner') as Extract<Item, object>).sous!)
    expect(sel(y)).toEqual(['sel.sousSujets', 'sel.freres', 'sel.memeNiveau', 'sel.tout'])
    expect(sel(x)).toEqual(['sel.sousSujets', 'sel.freres', 'sel.memeNiveau', 'sel.tout'])
    expect(sel(f)).toEqual(['sel.flottants', 'sel.sousSujets', 'sel.tout'])
  })

  it('Replier ou Déplier : le libellé dit ce que le clic fera', () => {
    const { a: plat, x, y } = carte()
    const a = ajouterEnfant(plat, y, 'A11')[0]
    expect(ids(menu(a, { genre: 'sujet', id: x }))).toContain('replier')
    const replie = { ...a, sujets: { ...a.sujets, [x]: { ...a.sujets[x]!, replie: true }, [y]: { ...a.sujets[y]!, replie: true } } }
    expect(ids(menu(replie, { genre: 'sujet', id: x }))).toContain('deplier')
    expect(entree(menu(plat, { genre: 'sujet', id: y }), 'replier')!.inactif).toBe(true)
    expect(entree(menu(plat, { genre: 'sujet', id: x }), 'deplierTout')!.inactif).toBe(true)
    expect(ids(menu(a, { genre: 'sujet', id: x }))).toContain('replierTout')
    expect(ids(menu(replie, { genre: 'sujet', id: lire(a).central }))).toContain('deplierTout')
    expect(ids(menu(a, { genre: 'sujet', id: x }, { brancheSeule: x }))).toContain('toutAfficher')
  })

  it('Aligner n’existe que pour un flottant, et s’ouvre à deux flottants au moins', () => {
    const { a, x, f, g } = carte()
    expect(ids(menu(a, { genre: 'sujet', id: x }))).not.toContain('aligner')
    const seul = menu(a, { genre: 'sujet', id: f })
    expect(entree(seul, 'aligner.gauche')!.inactif).toBe(true)
    const deux = menu(a, { genre: 'sujet', id: f }, { selection: [f, g] })
    expect(entree(deux, 'aligner.gauche')!.inactif).toBeUndefined()
    expect(entree(deux, 'aligner.distribuerH')!.inactif).toBe(true)
  })

  it('Réinitialiser l’emplacement : pour un principal, en placement libre', () => {
    const { a, x } = carte()
    expect(ids(menu(a, { genre: 'sujet', id: x }))).not.toContain('reinitPosition')
    expect(ids(menu({ ...a, options: { libre: true } }, { genre: 'sujet', id: x }))).toContain('reinitPosition')
  })

  it('chaque entrée a son libellé dans la langue (jamais la clé nue)', () => {
    const { a, x, f } = carte()
    const cibles: CibleMenu[] = [
      { genre: 'sujet', id: x },
      { genre: 'sujet', id: f },
      { genre: 'fond', x: 0, y: 0 },
      { genre: 'relation', id: 'r' },
      { genre: 'limite', id: 'm' },
      { genre: 'zone', id: 'z' },
      { genre: 'image', id: x },
      { genre: 'equation', id: x },
      { genre: 'marqueur', id: x, marqueur: 'flag-red' },
      { genre: 'etiquette', id: x, rang: 0 },
      { genre: 'note', id: x },
      { genre: 'lien', id: x },
      { genre: 'piece', id: x },
      { genre: 'planning', id: x },
      { genre: 'tache', id: x },
    ]
    for (const cible of cibles) for (const e of entrees(menu(a, cible, { presse: true, styleCopie: true }))) expect(e.libelle, `${cible.genre} ${e.id}`).not.toMatch(/^arbre\.menu\./)
    expect(t('arbre.menu.inserer')).toBe('Insérer')
  })
})

describe('le menu du fond', () => {
  it('Coller, Créer une zone, Insérer le sujet flottant, la relation, tout replier, le central, Sélectionner', () => {
    const { a } = carte()
    const m = menu(a, { genre: 'fond', x: 10, y: 20 })
    expect(m.map((i) => (i === 'sep' ? '—' : i.id))).toEqual(['coller', '—', 'zone.creer', 'flottant', 'relation.inserer', '—', 'replierTout', '—', 'central', 'selectionner'])
    expect(entree(m, 'coller')!.inactif).toBe(true)
  })

  it('Sélectionner : n’ouvre que ce que la carte contient', () => {
    const { a, x, y } = carte()
    const vide = menu(a, { genre: 'fond', x: 0, y: 0 })
    expect(entree(vide, 'sel.relations')!.inactif).toBe(true)
    expect(entree(vide, 'sel.zones')!.inactif).toBe(true)
    expect(entree(vide, 'sel.flottants')!.inactif).toBeUndefined()
    expect(entree(vide, 'sel.tout')!.inactif).toBeUndefined()
    const plein = { ...a, relations: { r: { de: x, vers: y } }, zones: { z: { x: 0, y: 0, l: 50, h: 50 } } }
    expect(entree(menu(plein, { genre: 'fond', x: 0, y: 0 }), 'sel.relations')!.inactif).toBeUndefined()
    expect(entree(menu(plein, { genre: 'fond', x: 0, y: 0 }), 'sel.zones')!.inactif).toBeUndefined()
  })
})

describe('les autres menus', () => {
  it('une relation : Modifier, Supprimer, le style, le point, toutes les relations', () => {
    const { a, x, y } = carte()
    const r = { ...a, relations: { r: { de: x, vers: y } } }
    const m = menu(r, { genre: 'relation', id: 'r' })
    expect(m.map((i) => (i === 'sep' ? '—' : i.id))).toEqual(['relation.modifier', 'supprimer', '—', 'relation.styleCopier', 'relation.styleColler', 'relation.styleReinit', '—', 'relation.pointReinit', '—', 'sel.relations'])
    expect(entree(m, 'relation.pointReinit')!.inactif).toBe(true)
    const courbee = { ...r, relations: { r: { de: x, vers: y, controles: [{ x: 1, y: 1 }, { x: 2, y: 2 }] as [{ x: number; y: number }, { x: number; y: number }] } } }
    expect(entree(menu(courbee, { genre: 'relation', id: 'r' }), 'relation.pointReinit')!.inactif).toBeUndefined()
  })

  it('une limite : comme une relation, sans le point ni le style', () => {
    const { a } = carte()
    expect(ids(menu(a, { genre: 'limite', id: 'm' }))).toEqual(['relation.modifier', 'supprimer', 'sel.limites'])
  })

  it('une zone : Insérer un sujet flottant, Supprimer, Supprimer la zone, Effacer le contenu, Ajuster', () => {
    const { a } = carte()
    expect(ids(menu(a, { genre: 'zone', id: 'z' }))).toEqual(['zone.flottant', 'zone.supprimer', 'zone.retirer', 'zone.effacer', 'zone.ajuster', 'sel.zones'])
  })

  it('une image : Enregistrer sous seulement si c’est un fichier ; un marqueur : Modifier, Supprimer, Surligner', () => {
    const { a, x } = carte()
    expect(ids(menu(a, { genre: 'image', id: x }))).toEqual(['supprimer.champ', 'sel.images'])
    const image = porter(a, [x], 'image', { fichier: 'f', l: 10, h: 10 })
    expect(ids(menu(image, { genre: 'image', id: x }))).toEqual(['enregistrerImage', 'supprimer.champ', 'sel.images'])
    expect(ids(menu(a, { genre: 'marqueur', id: x, marqueur: 'flag-red' }))).toEqual(['marqueur.panneau', 'supprimer.champ', 'surligner'])
    expect(ids(menu(a, { genre: 'etiquette', id: x, rang: 0 }))).toEqual(['supprimer.champ', 'surligner'])
    expect(ids(menu(a, { genre: 'piece', id: x }))).toEqual(['piece.ouvrir', 'supprimer.champ', 'piece.enregistrer'])
  })
})

/** Tous les menus que la carte peut ouvrir, dans les états qui changent leurs entrées : chaque cible, avec tout ce qu'un sujet peut porter. */
function tousLesMenus(): { nom: string; items: Item[] }[] {
  const { a, c, x, y, f, g } = carte()
  let riche = changerSujet(a, x, (s) => ({ ...s, marqueurs: ['flag-red'] }))
  riche = porter(riche, [x], 'etiquettes', ['a'])
  riche = porter(riche, [x], 'lien', 'https://notak.app')
  riche = porter(riche, [x], 'tache', 'a-faire')
  riche = porter(riche, [x], 'planning', { duree: 2 })
  riche = porter(riche, [y], 'image', { fichier: 'f', l: 10, h: 10 })
  const avecResume = changerSujet(riche, y, (s) => ({ ...s, genre: 'resume' as const }))
  const plein = { ...riche, relations: { r: { de: x, vers: y, controles: [{ x: 1, y: 1 }, { x: 2, y: 2 }] as [{ x: number; y: number }, { x: number; y: number }] } }, zones: { z: { x: 0, y: 0, l: 50, h: 50 } }, limites: { m: { ids: [x] } } } as unknown as Arbre
  const contexte = { presse: true, styleCopie: true }
  const cibles: [string, Arbre, CibleMenu, Partial<ContexteMenu>][] = [
    ['sujet riche', plein, { genre: 'sujet', id: x }, contexte],
    ['sujet nu', a, { genre: 'sujet', id: x }, {}],
    ['sujet principal en placement libre', { ...riche, options: { libre: true } }, { genre: 'sujet', id: x }, { brancheSeule: x }],
    ['sujet replié', { ...riche, sujets: { ...riche.sujets, [x]: { ...riche.sujets[x]!, replie: true } } }, { genre: 'sujet', id: x }, {}],
    ['central', a, { genre: 'sujet', id: c }, {}],
    ['flottant', a, { genre: 'sujet', id: f }, { selection: [f, g] }],
    ['résumé', avecResume, { genre: 'sujet', id: y }, {}],
    ['fond', a, { genre: 'fond', x: 0, y: 0 }, contexte],
    ['fond plein', plein, { genre: 'fond', x: 0, y: 0 }, {}],
    ['relation', plein, { genre: 'relation', id: 'r' }, contexte],
    ['limite', plein, { genre: 'limite', id: 'm' }, {}],
    ['zone', plein, { genre: 'zone', id: 'z' }, {}],
    ['image', plein, { genre: 'image', id: y }, {}],
    ['équation', plein, { genre: 'equation', id: x }, {}],
    ['marqueur', plein, { genre: 'marqueur', id: x, marqueur: 'flag-red' }, {}],
    ['étiquette', plein, { genre: 'etiquette', id: x, rang: 0 }, {}],
    ['note', plein, { genre: 'note', id: x }, {}],
    ['lien', plein, { genre: 'lien', id: x }, {}],
    ['pièce jointe', plein, { genre: 'piece', id: x }, {}],
    ['tâche planifiée', plein, { genre: 'planning', id: x }, {}],
    ['case à faire', plein, { genre: 'tache', id: x }, {}],
  ]
  return cibles.map(([nom, arbre, cible, plus]) => ({ nom, items: menu(arbre, cible, plus) }))
}

describe('les icônes des menus', () => {
  it('chaque entrée de chaque menu, sous-menus compris, porte une icône du registre', () => {
    const menus = [...tousLesMenus(), { nom: 'le menu « + »', items: menuPlus({ note: true, aFaire: true, lienWeb: true, lienSujet: true, piece: true, audio: true, vignette: true, image: true, equation: true }, BOUTONS_BARRE.map((id) => ({ id, inactif: false }))) }]
    const vues = new Set<NomIcone>()
    let total = 0
    for (const { nom, items } of menus) {
      expect(items.length, nom).toBeGreaterThan(0)
      for (const e of entrees(items)) {
        total++
        expect(typeof e.icone, `${nom} : ${e.id}`).toBe('string')
        expect(e.icone.length, `${nom} : ${e.id}`).toBeGreaterThan(0)
        vues.add(e.icone)
      }
    }
    expect(total).toBeGreaterThan(100)
    // Le nom est dans le registre : l'icône se dessine (un nom inconnu ferait tomber le rendu).
    for (const nom of vues) expect(renderToStaticMarkup(createElement(Icone, { nom })), nom).toContain('<svg')
  })

  it('une même action garde la même icône d’un menu à l’autre', () => {
    const parId = new Map<string, Set<string>>()
    for (const { items } of tousLesMenus()) for (const e of entrees(items)) parId.set(e.id, (parId.get(e.id) ?? new Set()).add(e.icone))
    // Seules « Modifier » (le crayon, qui réemploie l'identifiant de ce qu'elle ouvre) en change.
    const changeantes = [...parId].filter(([, icones]) => icones.size > 1).map(([id]) => id)
    expect(changeantes.sort()).toEqual(['inserer.equation', 'inserer.tache'])
  })
})

describe('le menu « + »', () => {
  const tout = { note: true, aFaire: true, lienWeb: true, lienSujet: true, piece: true, audio: true, vignette: true, image: true, equation: true }
  const forme = (items: Item[]) => items.map((i) => (i === 'sep' ? '—' : i.id))

  it('Note, Tâches à faire, Lien ▸, pièces jointes, images : comme sur la capture 19', () => {
    const m = menuPlus(tout)
    expect(forme(m)).toEqual(['inserer.note', 'inserer.aFaire', 'inserer.lien', '—', 'inserer.piece', 'inserer.audio', '—', 'inserer.autocollant', 'inserer.illustration', 'inserer.image', 'inserer.equation'])
    expect(forme((entree(m, 'inserer.lien') as Extract<Item, object>).sous!)).toEqual(['inserer.pageWeb', 'inserer.lienSujet'])
  })

  it('grise ce que la sélection ne permet pas', () => {
    const m = menuPlus({ ...tout, note: false, piece: false })
    expect(entree(m, 'inserer.note')!.inactif).toBe(true)
    expect(entree(m, 'inserer.piece')!.inactif).toBe(true)
    expect(entree(m, 'inserer.aFaire')!.inactif).toBeUndefined()
  })

  it('les boutons repliés passent en tête, dans l’ordre de la barre, avec leur raccourci, puis un séparateur', () => {
    const m = menuPlus(tout, [{ id: 'zone', inactif: false }, { id: 'etiquette', inactif: true }, { id: 'tache', inactif: false }])
    expect(forme(m).slice(0, 5)).toEqual(['replie.zone', 'replie.etiquette', 'replie.tache', '—', 'inserer.note'])
    expect(entree(m, 'replie.zone')).toMatchObject({ libelle: 'Zone', icone: 'arbreEncadre' })
    expect(entree(m, 'replie.etiquette')).toMatchObject({ libelle: 'Étiquette', inactif: true })
    expect(entree(m, 'replie.tache')!.libelle).toBe('Tâche')
    expect(entree(menuPlus(tout, [{ id: 'relation', inactif: false }]), 'replie.relation')!.touche).toMatch(/R$/)
  })
})
