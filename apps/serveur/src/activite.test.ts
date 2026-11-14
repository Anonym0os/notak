import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Changement, changementsDe, comparer, mentionnes, observer, regrouper, sansDoublons, sansLesDejaVus } from './activite.ts'
import type { LigneActivite } from './base.ts'
import { texte } from './essai.ts'

const note = (mot: string, champs: Record<string, unknown> = {}) => ({ id: 'n', x: 0, y: 0, largeur: 34, plan: 'a', contenu: { type: 'note', texte: texte(mot) }, ...champs })

describe('comparer deux états d’un élément', () => {
  it('une création, une suppression définitive', () => {
    expect(comparer('n', undefined, note('Idée'))).toMatchObject({ genre: 'cree', typeElement: 'note', libelle: 'Idée' })
    expect(comparer('n', note('Idée'), undefined)).toMatchObject({ genre: 'supprime', libelle: 'Idée' })
  })

  it('la corbeille jette puis restaure ; un élément déjà jeté ne dit plus rien', () => {
    expect(comparer('n', note('Idée'), note('Idée', { corbeille: 5 }))).toMatchObject({ genre: 'supprime' })
    expect(comparer('n', note('Idée', { corbeille: 5 }), note('Idée'))).toMatchObject({ genre: 'restaure' })
    expect(comparer('n', note('Idée', { corbeille: 5 }), undefined)).toBeNull()
    expect(comparer('n', undefined, note('Idée', { corbeille: 5 }))).toBeNull()
    expect(comparer('n', note('a', { corbeille: 5 }), note('b', { corbeille: 5 }))).toBeNull()
  })

  it('un contenu qui change est une modification, un déplacement lointain en est un autre', () => {
    expect(comparer('n', note('Idée'), note('Idée bis'))).toMatchObject({ genre: 'modifie', libelle: 'Idée bis' })
    expect(comparer('n', note('Idée'), note('Idée', { x: 30 }))).toMatchObject({ genre: 'deplace' })
  })

  it('l’effleurement, le changement de plan ou de largeur ne comptent pas', () => {
    expect(comparer('n', note('Idée'), note('Idée', { x: 2, y: 1 }))).toBeNull()
    expect(comparer('n', note('Idée'), note('Idée', { plan: 'b', largeur: 40 }))).toBeNull()
  })

  it('un fil de commentaires : sa naissance sans message est muette, chaque message est un commentaire', () => {
    const fil = (...messages: { id: string; texte: string; auteur: { id: string } }[]) => ({
      id: 'c', x: 0, y: 0, largeur: 28, plan: 'a', contenu: { type: 'commentaire', messages },
    })
    const m1 = { id: 'm1', texte: 'Bonjour', auteur: { id: 'ana' } }
    const m2 = { id: 'm2', texte: 'Salut @Bob', auteur: { id: 'bob' } }
    expect(changementsDe('c', undefined, fil())).toEqual([])
    expect(changementsDe('c', undefined, fil(m1))).toMatchObject([{ genre: 'commente', fil: '', typeElement: 'commentaire', messages: [{ texte: 'Bonjour' }], participants: [] }])
    expect(changementsDe('c', fil(), fil(m1))).toMatchObject([{ genre: 'commente', messages: [{ texte: 'Bonjour' }], participants: [] }])
    expect(changementsDe('c', fil(m1), fil(m1, m2))).toMatchObject([{ genre: 'commente', libelle: 'Salut @Bob', participants: ['ana'] }])
  })

  it('une épingle n’est que son fil : y réagir, la résoudre, la replier ou la recolorer ne modifie pas le tableau', () => {
    const m1 = { id: 'm1', texte: 'Bonjour', auteur: { id: 'ana' } }
    const fil = (champs: Record<string, unknown> = {}, ...messages: Record<string, unknown>[]) => ({
      id: 'c', x: 0, y: 0, largeur: 28, plan: 'a', contenu: { type: 'commentaire', messages: messages.length ? messages : [m1], ...champs },
    })
    for (const champs of [{ resolu: true }, { replie: true }, { couleur: 'jaune' }]) expect(changementsDe('c', fil(), fil(champs))).toEqual([])
    // Y réagir est une réaction au message, que l'auteur apprendra : pas une modification.
    expect(changementsDe('c', fil(), fil({}, { ...m1, reactions: { '👍': ['bob'] } }))).toEqual([
      { genre: 'reaction', element: 'c', fil: '', typeElement: 'commentaire', libelle: '', reactions: [{ message: 'm1', auteur: 'ana', texte: 'Bonjour', personne: 'bob', avant: [], apres: ['👍'] }] },
    ])
    // La déplacer, la jeter, la remettre restent des gestes sur la toile.
    expect(changementsDe('c', fil(), { ...fil(), x: 30 })).toMatchObject([{ genre: 'deplace' }])
    expect(changementsDe('c', { ...fil(), corbeille: 5 }, fil())).toMatchObject([{ genre: 'restaure' }])
  })

  it('un fil dit quels messages ne disent plus ce qu’on a pu citer d’eux : supprimés, récrits, ou partis avec lui', () => {
    const fil = (champs: Record<string, unknown>, ...messages: Record<string, unknown>[]) => ({
      id: 'c', x: 0, y: 0, largeur: 28, plan: 'a', contenu: { type: 'commentaire', messages }, ...champs,
    })
    const m1 = { id: 'm1', texte: 'Bonjour', auteur: { id: 'ana' } }
    const m2 = { id: 'm2', texte: 'Je regrette', auteur: { id: 'bob' } }
    const perimes = (avant: Record<string, unknown> | undefined, apres: Record<string, unknown> | undefined) => changementsDe('c', avant, apres).flatMap((c) => c.perimes ?? [])
    expect(changementsDe('c', fil({}, m1, m2), fil({}, m1))).toEqual([{ genre: 'fil', element: 'c', fil: '', typeElement: 'commentaire', libelle: '', perimes: [{ id: 'm2', auteur: 'bob', texte: 'Je regrette' }] }])
    expect(perimes(fil({}, m1, m2), fil({}, m1, { ...m2, texte: 'Je nuance' }))).toEqual([{ id: 'm2', auteur: 'bob', texte: 'Je regrette', nouveau: 'Je nuance' }])
    // Jeté ou retiré, le fil emporte tous ses messages ; déjà jeté, il n'a plus rien à dire.
    const tous = [{ auteur: 'ana', texte: 'Bonjour' }, { auteur: 'bob', texte: 'Je regrette' }]
    expect(changementsDe('c', fil({}, m1, m2), fil({ corbeille: 5 }, m1, m2))).toMatchObject([{ genre: 'supprime' }, { genre: 'fil', perimes: tous }])
    expect(changementsDe('c', fil({}, m1, m2), undefined)).toMatchObject([{ genre: 'supprime' }, { genre: 'fil', perimes: tous }])
    expect(changementsDe('c', fil({ corbeille: 5 }, m1), undefined)).toEqual([])
    // Remis de la corbeille, il ne redit rien : on ne prévient pas deux fois.
    expect(changementsDe('c', fil({ corbeille: 5 }, m1), fil({}, m1))).toMatchObject([{ genre: 'restaure' }])
    // Une réponse, une réaction, des espaces en plus : ce qu'on a cité se dit toujours.
    expect(perimes(fil({}, m1), fil({}, m1, m2))).toEqual([])
    expect(perimes(fil({}, m1), fil({}, { ...m1, texte: ' Bonjour ', reactions: { '👍': ['bob'] } }))).toEqual([])
  })

  it('une réaction dit, message par message, les émojis de chacun avant et après ; un message neuf ou parti n’en dit rien', () => {
    const fil = (...messages: Record<string, unknown>[]) => ({ id: 'c', x: 0, y: 0, largeur: 28, plan: 'a', contenu: { type: 'commentaire', messages } })
    const m1 = { id: 'm1', texte: 'Qui vient ?', auteur: { id: 'ana' } }
    const m2 = { id: 'm2', texte: 'Moi', auteur: { id: 'bob' } }
    const reactions = (avant: Record<string, unknown>, apres: Record<string, unknown>) => changementsDe('c', avant, apres).flatMap((c) => c.reactions ?? [])
    // Bob change 👍 pour 🎉 sur le message d'Ana, Cléo retire le sien : chacun pour soi, avant et après.
    expect(reactions(fil({ ...m1, reactions: { '👍': ['bob', 'cleo'] } }), fil({ ...m1, reactions: { '🎉': ['bob'] } }))).toEqual([
      { message: 'm1', auteur: 'ana', texte: 'Qui vient ?', personne: 'bob', avant: ['👍'], apres: ['🎉'] },
      { message: 'm1', auteur: 'ana', texte: 'Qui vient ?', personne: 'cleo', avant: ['👍'], apres: [] },
    ])
    // Les mêmes émojis dans un autre ordre ne changent rien.
    expect(reactions(fil({ ...m1, reactions: { '👍': ['bob'], '🎉': ['bob'] } }), fil({ ...m1, reactions: { '🎉': ['bob'], '👍': ['bob'] } }))).toEqual([])
    // Une réponse qui arrive avec ses réactions, ou un message qui part avec les siennes : rien.
    expect(reactions(fil(m1), fil(m1, { ...m2, reactions: { '👍': ['ana'] } }))).toEqual([])
    expect(reactions(fil(m1, { ...m2, reactions: { '👍': ['ana'] } }), fil(m1))).toEqual([])
  })

  it('où qu’on commente, le fil se suit de même : accroché à une carte, dans la marge d’une note ou d’un document', () => {
    const m1 = { id: 'm1', texte: 'Bonjour', auteur: { id: 'ana' } }
    const m2 = { id: 'm2', texte: 'Salut @Bob', auteur: { id: 'bob' } }
    const fil = (...messages: Record<string, unknown>[]) => ({ type: 'commentaire', messages })
    const accroche = (...messages: Record<string, unknown>[]) => note('Idée', { commentaire: fil(...messages) })
    const enMarge = (type: 'note' | 'document', fils: Record<string, unknown>) =>
      note('Idée', { contenu: { type, ...(type === 'document' ? { titre: 'Plan' } : {}), texte: texte('Idée'), fils } })

    // Le premier message d'un fil accroché est un commentaire de la carte ; la carte elle-même n'a pas changé.
    expect(changementsDe('n', note('Idée'), accroche(m1))).toMatchObject([{ genre: 'commente', element: 'n', fil: '', typeElement: 'note', libelle: 'Bonjour', participants: [] }])
    expect(changementsDe('n', accroche(m1), accroche(m1, m2))).toMatchObject([{ genre: 'commente', fil: '', participants: ['ana'] }])
    // Dans la marge, chaque fil a sa clé, et ses participants ; écrire dans un fil ne modifie pas la note.
    const deux = { f1: fil(m1), f2: fil() }
    expect(changementsDe('n', enMarge('note', deux), enMarge('note', { ...deux, f2: fil(m2) }))).toMatchObject([{ genre: 'commente', fil: 'f2', typeElement: 'note', participants: [] }])
    expect(changementsDe('n', enMarge('document', { f1: fil(m1) }), enMarge('document', { f1: fil(m1, m2) }))).toMatchObject([
      { genre: 'commente', fil: 'f1', typeElement: 'document', participants: ['ana'] },
    ])
    // Une réaction, où qu'elle soit, est une réaction au message de son fil : elle ne modifie pas la note.
    const reagi = { ...m1, reactions: { '👍': ['bob'] } }
    const reaction = { personne: 'bob', auteur: 'ana', texte: 'Bonjour', avant: [], apres: ['👍'] }
    expect(changementsDe('n', accroche(m1), accroche(reagi))).toMatchObject([{ genre: 'reaction', element: 'n', fil: '', typeElement: 'note', reactions: [reaction] }])
    expect(changementsDe('n', enMarge('note', { f1: fil(m1) }), enMarge('note', { f1: fil(reagi) }))).toMatchObject([{ genre: 'reaction', fil: 'f1', reactions: [reaction] }])
    // Le texte qui change, lui, reste une modification, à côté du commentaire.
    const corrige = { ...enMarge('note', { f1: fil(m1, m2) }), contenu: { type: 'note', texte: texte('Idée bis'), fils: { f1: fil(m1, m2) } } }
    expect(changementsDe('n', enMarge('note', { f1: fil(m1) }), corrige).map((c) => c.genre)).toEqual(['modifie', 'commente'])
    // Jetée, la note emporte tous ses fils, celui qu'elle porte comme ceux de sa marge.
    const tout = { ...enMarge('note', { f1: fil(m2) }), commentaire: fil(m1) }
    expect(changementsDe('n', tout, { ...tout, corbeille: 5 })).toMatchObject([
      { genre: 'supprime' },
      { genre: 'fil', fil: '', perimes: [{ id: 'm1' }] },
      { genre: 'fil', fil: 'f1', perimes: [{ id: 'm2' }] },
    ])
  })
})

describe('observer un document', () => {
  it('ramasse ce qui change, pas ce qui précède l’observation', () => {
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', 'Avant')
    doc.getMap('elements').set('a', note('Déjà là', { id: 'a' }))
    const suivi = observer(doc)
    expect(suivi.ramasser()).toEqual([])

    doc.getMap('elements').set('b', note('Neuve', { id: 'b' }))
    doc.getMap('elements').set('a', note('Corrigée', { id: 'a' }))
    doc.getMap('meta').set('titre', 'Après')
    const pris = suivi.ramasser()
    expect(pris.map((c) => [c.genre, c.element])).toEqual([['cree', 'b'], ['modifie', 'a'], ['titre', '']])
    expect(suivi.ramasser()).toEqual([])
  })

  it('le texte d’une note, qui vit à part, compte comme une modification', () => {
    const doc = new Y.Doc()
    doc.getMap('elements').set('a', note('Texte', { id: 'a' }))
    const fragment = new Y.XmlFragment()
    doc.getMap('textes').set('a', fragment)
    const suivi = observer(doc)
    const paragraphe = new Y.XmlElement('paragraph')
    fragment.insert(0, [paragraphe])
    expect(suivi.ramasser()).toMatchObject([{ genre: 'modifie', element: 'a', typeElement: 'note' }])
  })

  it('un premier titre n’est pas un renommage', () => {
    const doc = new Y.Doc()
    const suivi = observer(doc)
    doc.getMap('meta').set('titre', 'Premier')
    expect(suivi.ramasser()).toEqual([])
  })

  it('une rafale de frappes ne fait qu’un changement par élément', () => {
    const rafale = [1, 2, 3].map(() => ({ genre: 'modifie' as const, element: 'a', typeElement: 'note', libelle: 'x' }))
    expect(sansDoublons(rafale)).toHaveLength(1)
  })

  it('une rafale garde, dans l’ordre, tout ce qui ne se dit plus', () => {
    const parti = (texte: string): Changement => ({ genre: 'fil', element: 'c', fil: '', typeElement: 'commentaire', libelle: '', perimes: [{ id: texte, auteur: 'bob', texte }] })
    expect(sansDoublons([parti('A'), { genre: 'fil', element: 'c', fil: '', typeElement: 'commentaire', libelle: '' }, parti('B')])).toMatchObject([
      { perimes: [{ texte: 'A' }, { texte: 'B' }] },
    ])
    // Récrit deux fois, il l'est jusqu'à sa dernière version.
    const recrit = (texte: string, nouveau: string): Changement => ({ ...parti(texte), perimes: [{ id: 'm', auteur: 'bob', texte, nouveau }] })
    expect(sansDoublons([recrit('A', 'B'), recrit('B', 'C')])).toMatchObject([{ perimes: [{ texte: 'A', nouveau: 'B' }, { texte: 'B', nouveau: 'C' }] }])
    // Deux fils d'une même note ne se mêlent pas : chacun garde ses messages et ses participants.
    const dans = (fil: string, participants: string[]): Changement => ({ genre: 'commente', element: 'n', fil, typeElement: 'note', libelle: fil, messages: [{ id: fil, texte: fil }], participants })
    expect(sansDoublons([dans('f1', ['ana']), dans('f2', ['bob'])]).map((c) => [c.fil, c.participants])).toEqual([['f1', ['ana']], ['f2', ['bob']]])
  })

  it('le fil d’un sujet de carte mentale vit à part : y écrire commente la carte, y réagir est une réaction au message', () => {
    const doc = new Y.Doc()
    doc.getMap('elements').set('carte', { id: 'carte', x: 0, y: 0, largeur: 40, plan: 'a', contenu: { type: 'arbre', sujets: {} } })
    const arbres = doc.getMap('arbres')
    const cle = (champ: string, id: string) => ['carte', champ, id].join('\u001f')
    const m1 = { id: 'm1', texte: 'Ce sujet manque', auteur: { id: 'ana' } }
    const suivi = observer(doc)
    arbres.set(cle('fils', 's1'), { type: 'commentaire', messages: [m1] })
    expect(suivi.ramasser()).toMatchObject([{ genre: 'commente', element: 'carte', fil: 's1', typeElement: 'arbre', libelle: 'Ce sujet manque' }])
    arbres.set(cle('fils', 's1'), { type: 'commentaire', messages: [{ ...m1, reactions: { '👍': ['bob'] } }] })
    expect(suivi.ramasser()).toEqual([
      { genre: 'reaction', element: 'carte', fil: 's1', typeElement: 'arbre', libelle: '', reactions: [{ message: 'm1', auteur: 'ana', texte: 'Ce sujet manque', personne: 'bob', avant: [], apres: ['👍'] }] },
    ])
    // Un sujet qu'on renomme, lui, modifie la carte.
    arbres.set(cle('sujets', 's1'), { ordre: 'a', titre: 'Sujet' })
    expect(suivi.ramasser()).toMatchObject([{ genre: 'modifie', element: 'carte' }])
    // Jetée, la carte emporte les fils de ses sujets ; remise, elle ne redit rien.
    const carte = doc.getMap<Record<string, unknown>>('elements').get('carte')!
    doc.getMap('elements').set('carte', { ...carte, corbeille: 5 })
    expect(suivi.ramasser()).toMatchObject([{ genre: 'supprime' }, { genre: 'fil', fil: 's1', perimes: [{ id: 'm1' }] }])
    doc.getMap('elements').set('carte', carte)
    expect(suivi.ramasser()).toMatchObject([{ genre: 'restaure' }])
  })

  it('une rafale de réactions va, pour chacun sur chaque message, du premier état au dernier', () => {
    const reaction = (personne: string, avant: string[], apres: string[], message = 'm1'): Changement => ({
      genre: 'reaction', element: 'c', fil: '', typeElement: 'commentaire', libelle: '', reactions: [{ message, auteur: 'ana', texte: 'Qui vient ?', personne, avant, apres }],
    })
    expect(sansDoublons([reaction('bob', [], ['👍']), reaction('bob', ['👍'], ['👍', '🎉'])])).toMatchObject([{ reactions: [{ personne: 'bob', avant: [], apres: ['👍', '🎉'] }] }])
    // Posé puis retiré : il n'en reste rien ; un autre message, ou une autre personne, gardent les leurs.
    expect(sansDoublons([reaction('bob', [], ['👍']), reaction('cleo', [], ['🎉']), reaction('bob', ['👍'], [])])).toMatchObject([{ reactions: [{ personne: 'cleo', apres: ['🎉'] }] }])
    expect(sansDoublons([reaction('bob', [], ['👍']), reaction('bob', [], ['👍'], 'm2')])[0]!.reactions).toHaveLength(2)
  })

  it('un message n’est neuf qu’une fois : passé d’un fil à un autre, ou revenu, il ne prévient plus', () => {
    const arrive: Changement = { genre: 'commente', element: 'n', fil: '', typeElement: 'note', libelle: 'B', messages: [{ id: 'm1', texte: 'A' }, { id: 'm2', texte: 'B' }], participants: [] }
    const part: Changement = { genre: 'fil', element: 'epingle', fil: '', typeElement: 'commentaire', libelle: '', perimes: [{ id: 'm1', auteur: 'ana', texte: 'A' }] }
    const vus = new Set(['m1'])
    // m1 vient de l'épingle : il n'est pas neuf ; m2, si, et ne le sera plus.
    expect(sansLesDejaVus([arrive, part], vus)).toMatchObject([{ genre: 'commente', libelle: 'B', messages: [{ id: 'm2' }] }, part])
    expect([...vus]).toEqual(['m1', 'm2'])
    // Rien de neuf du tout : il ne reste que ce qui a quitté le fil.
    expect(sansLesDejaVus([{ ...arrive, perimes: part.perimes }], vus)).toMatchObject([{ genre: 'fil', libelle: '', perimes: part.perimes }])
    expect(sansLesDejaVus([arrive], vus)).toEqual([])
  })
})

describe('mentions', () => {
  const gens = [
    { id: 'ana', nom: 'Ana Martin' },
    { id: 'anne', nom: 'Anne Durand' },
    { id: 'bob', nom: 'Bob Éclair' },
  ]
  it('le nom entier, ou le prénom s’il est seul à le porter, sans égard aux accents ni à la casse', () => {
    expect(mentionnes('Dis @bob eclair', gens)).toEqual(['bob'])
    expect(mentionnes('Dis @Bob !', gens)).toEqual(['bob'])
    expect(mentionnes('@Ana Martin et @anne durand', gens)).toEqual(['ana', 'anne'])
  })
  it('un prénom partagé, ou un mot qui le prolonge, ne désigne personne', () => {
    expect(mentionnes('@ana', [...gens, { id: 'ana2', nom: 'Ana Roy' }])).toEqual([])
    expect(mentionnes('@bobby', gens)).toEqual([])
    expect(mentionnes('bob@exemple.fr', gens)).toEqual([])
    expect(mentionnes('Bob sans arobase', gens)).toEqual([])
  })
})

describe('regrouper', () => {
  const ligne = (id: number, auteur: string, genre: LigneActivite['genre'], element: string, instant: number): LigneActivite => ({
    id, tableau: 't', auteur: { id: auteur, nom: auteur, couleur: '#000000' }, genre, element, typeElement: 'note', libelle: element, instant,
  })
  it('les gestes proches d’une même personne font une ligne ; un autre auteur, ou un long silence, en ouvre une autre', () => {
    const minute = 60_000
    const groupes = regrouper([
      ligne(6, 'ana', 'modifie', 'c', 100 * minute),
      ligne(5, 'ana', 'cree', 'b', 98 * minute),
      ligne(4, 'bob', 'modifie', 'a', 97 * minute),
      ligne(3, 'ana', 'modifie', 'a', 95 * minute),
      ligne(2, 'ana', 'cree', 'a', 94 * minute),
      ligne(1, 'ana', 'modifie', 'a', 50 * minute),
    ])
    expect(groupes.map((g) => [g.auteur.id, g.debut, g.fin])).toEqual([
      ['ana', 98 * minute, 100 * minute],
      ['bob', 97 * minute, 97 * minute],
      ['ana', 94 * minute, 95 * minute],
      ['ana', 50 * minute, 50 * minute],
    ])
    expect(groupes[0]!.resume).toEqual({ modifie: 1, cree: 1 })
    // Une note créée puis corrigée compte une fois, pour sa création.
    expect(groupes[2]!.resume).toEqual({ cree: 1 })
    expect(groupes[2]!.elements).toMatchObject([{ element: 'a', genre: 'cree' }])
  })
  it('rien à regrouper', () => {
    expect(regrouper([])).toEqual([])
  })
})
