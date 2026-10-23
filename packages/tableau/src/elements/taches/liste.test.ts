import { describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import {
  PROFONDEUR_MAX,
  basculer,
  cheminsEnOrdre,
  compter,
  detacher,
  docTaches,
  docVide,
  effacerFaites,
  estFaite,
  estListeVierge,
  hauteur,
  lignesEnTaches,
  nouvelleListeTaches,
  peutDescendre,
  retirer,
  sousTaches,
  transferer,
} from './liste'

const tache = (texte: string, faite = false, ...sous: NoeudTexte[]): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: faite },
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: texte }] },
    ...(sous.length > 0 ? [{ type: 'taskList', content: sous }] : []),
  ],
})
const doc = (...taches: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content: [{ type: 'taskList', content: taches }] })
const texte = (t: NoeudTexte) => t.content![0]!.content?.[0]?.text ?? ''

/** A (a1, a2 (a2x)) · B */
const exemple = () => doc(tache('A', false, tache('a1'), tache('a2', false, tache('a2x'))), tache('B'))

/** « A:0 a1:0 a2:1 … » : l'état de chaque tâche dans l'ordre du document. */
function etats(d: NoeudTexte): string {
  const res: string[] = []
  const parcourir = (n: NoeudTexte) => {
    for (const t of sousTaches(n)) {
      res.push(`${texte(t)}:${estFaite(t) ? 1 : 0}`)
      parcourir(t)
    }
  }
  parcourir(d)
  return res.join(' ')
}

describe('une liste neuve', () => {
  it('a une seule tâche vide, non cochée', () => {
    const e = nouvelleListeTaches(3.4, 5)
    expect(e.largeur).toBe(34)
    expect(e.contenu.titre).toBeUndefined()
    expect(compter(e.contenu.texte)).toEqual({ faites: 0, total: 1 })
    expect(e.contenu.texte).toEqual(docVide())
  })

  it('remplace un document qui n’est pas une liste de tâches', () => {
    expect(docTaches({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual(docVide())
    expect(docTaches(exemple())).toEqual(exemple())
  })
})

describe('compter', () => {
  it('compte les tâches de tous les niveaux', () => {
    expect(compter(exemple())).toEqual({ faites: 0, total: 5 })
    const d = basculer(basculer(exemple(), [0, 1, 0]), [1])
    expect(compter(d)).toEqual({ faites: 2, total: 5 })
  })

  it('rend 0/0 sans tâche', () => {
    expect(compter({ type: 'doc' })).toEqual({ faites: 0, total: 0 })
  })
})

describe('basculer', () => {
  it('coche une tâche en haut, sans toucher aux autres', () => {
    expect(etats(basculer(exemple(), [1]))).toBe('A:0 a1:0 a2:0 a2x:0 B:1')
  })

  it('décoche une tâche cochée', () => {
    expect(etats(basculer(basculer(exemple(), [1]), [1]))).toBe('A:0 a1:0 a2:0 a2x:0 B:0')
  })

  it('atteint une sous-tâche profonde', () => {
    expect(etats(basculer(exemple(), [0, 1, 0]))).toBe('A:0 a1:0 a2:0 a2x:1 B:0')
  })

  it('un clic simple laisse les sous-tâches', () => {
    expect(etats(basculer(exemple(), [0]))).toBe('A:1 a1:0 a2:0 a2x:0 B:0')
  })

  it('Maj+clic coche toutes les sous-tâches', () => {
    expect(etats(basculer(exemple(), [0], true))).toBe('A:1 a1:1 a2:1 a2x:1 B:0')
  })

  it('Maj+clic sur une tâche cochée décoche toutes les sous-tâches', () => {
    const cochee = basculer(exemple(), [0], true)
    expect(etats(basculer(cochee, [0], true))).toBe('A:0 a1:0 a2:0 a2x:0 B:0')
  })

  it('Maj+clic suit l’état de la tâche cliquée, pas celui de ses sous-tâches', () => {
    // A est à faire, a1 est faite : A passe à faite, et a1 le reste.
    const d = basculer(exemple(), [0, 0])
    expect(etats(basculer(d, [0], true))).toBe('A:1 a1:1 a2:1 a2x:1 B:0')
    // A est faite, a1 aussi, a2 non : décocher A décoche tout.
    const e = basculer(basculer(exemple(), [0]), [0, 0])
    expect(etats(basculer(e, [0], true))).toBe('A:0 a1:0 a2:0 a2x:0 B:0')
  })

  it('ne change pas l’ancien document', () => {
    const avant = exemple()
    const copie = JSON.stringify(avant)
    basculer(avant, [0], true)
    expect(JSON.stringify(avant)).toBe(copie)
  })

  it('ne fait rien d’un chemin inconnu', () => {
    const d = exemple()
    expect(basculer(d, [7])).toBe(d)
    expect(basculer(d, [])).toBe(d)
    expect(etats(basculer(d, [1, 0]))).toBe(etats(d))
  })

  it('garde le texte', () => {
    expect(texte(sousTaches(basculer(exemple(), [0]))[0]!)).toBe('A')
  })
})

describe('effacerFaites', () => {
  it('retire les tâches cochées avec leurs sous-tâches', () => {
    const d = basculer(basculer(exemple(), [0]), [1])
    // Plus aucune tâche : il en reste une, vide.
    expect(effacerFaites(d)).toEqual(docVide())
  })

  it('garde les tâches à faire d’une tâche cochée seulement si elle reste', () => {
    // a2 cochée (avec a2x non cochée) disparaît en entier ; A et a1 restent.
    const d = basculer(exemple(), [0, 1])
    expect(etats(effacerFaites(d))).toBe('A:0 a1:0 B:0')
  })

  it('retire une cochée dans une tâche à faire, et la sous-liste vide avec elle', () => {
    const d = basculer(basculer(exemple(), [0, 0]), [0, 1])
    const res = effacerFaites(d)
    expect(etats(res)).toBe('A:0 B:0')
    expect(sousTaches(sousTaches(res)[0]!)).toEqual([])
    expect(sousTaches(res)[0]!.content).toHaveLength(1)
  })

  it('ne change rien quand rien n’est coché', () => {
    expect(effacerFaites(exemple())).toEqual(exemple())
  })
})

describe('profondeur', () => {
  it('mesure la hauteur d’une tâche', () => {
    expect(hauteur(tache('x'))).toBe(1)
    expect(hauteur(sousTaches(exemple())[0]!)).toBe(3)
  })

  it('autorise six niveaux au plus', () => {
    expect(PROFONDEUR_MAX).toBe(6)
    expect(peutDescendre(5, 1)).toBe(true)
    expect(peutDescendre(6, 1)).toBe(false)
    expect(peutDescendre(3, 3)).toBe(true)
    expect(peutDescendre(3, 4)).toBe(false)
  })
})

describe('retirer et coller', () => {
  const doc = (...t: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content: [{ type: 'taskList', content: t }] })
  const t = (texte: string, ...sous: NoeudTexte[]): NoeudTexte => ({
    type: 'taskItem',
    attrs: { checked: false },
    content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }, ...(sous.length ? [{ type: 'taskList', content: sous }] : [])],
  })

  it('retire une tâche et ses sous-tâches, une sous-tâche seule', () => {
    expect(retirer(doc(t('a', t('b')), t('c')), [0])).toEqual(doc(t('c')))
    expect(retirer(doc(t('a', t('b')), t('c')), [0, 0])).toEqual(doc(t('a'), t('c')))
    expect(retirer(doc(t('a')), [0])).toEqual(docVide())
  })

  it('change des lignes en tâches, puces, cases et retraits compris', () => {
    const r = lignesEnTaches('- pain\n  - [x] complet\n\n* lait\n')!
    expect(r).toEqual([
      { ...t('pain', { ...t('complet'), attrs: { checked: true } }) },
      t('lait'),
    ])
  })

  it('laisse une ligne simple se coller comme du texte', () => {
    expect(lignesEnTaches('bonjour')).toBeNull()
    expect(lignesEnTaches('[ ] seule')).toHaveLength(1)
  })
})

describe('passer d’une liste à une autre', () => {
  const tache = (texte: string, sous: NoeudTexte[] = [], fait = false): NoeudTexte => ({
    type: 'taskItem',
    attrs: { checked: fait },
    content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }, ...(sous.length ? [{ type: 'taskList', content: sous }] : [])],
  })
  const doc = (...taches: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content: [{ type: 'taskList', content: taches }] })
  const noms = (d: NoeudTexte): string[] => cheminsEnOrdre(d).map((c) => {
    let n: NoeudTexte = d
    for (const i of c) n = sousTaches(n)[i]!
    return n.content![0]!.content![0]!.text!
  })

  it('la tâche quitte sa liste et entre dans l’autre, avant ou après la cible', () => {
    const a = doc(tache('A'), tache('B'), tache('C'))
    const b = doc(tache('X'), tache('Y'))
    const r = transferer(a, 1, b, 1, true)!
    expect(noms(r.source)).toEqual(['A', 'C'])
    expect(noms(r.destination)).toEqual(['X', 'B', 'Y'])
    expect(noms(transferer(a, 1, b, 1, false)!.destination)).toEqual(['X', 'Y', 'B'])
  })

  it('emmène les sous-tâches et garde l’état coché', () => {
    const a = doc(tache('A', [tache('a1')], true), tache('B'))
    const r = transferer(a, 0, doc(tache('X')), 0, false)!
    expect(noms(r.destination)).toEqual(['X', 'A', 'a1'])
    expect(sousTaches(r.destination)[1]!.attrs?.checked).toBe(true)
  })

  it('se pose au niveau de la cible, parmi ses sous-tâches', () => {
    const r = transferer(doc(tache('A')), 0, doc(tache('X', [tache('x1')])), 1, true)!
    expect(noms(r.destination)).toEqual(['X', 'A', 'x1'])
    expect(sousTaches(sousTaches(r.destination)[0]!)).toHaveLength(2)
  })

  it('remplace la tâche vide d’une liste vierge', () => {
    const r = transferer(doc(tache('A'), tache('B')), 0, docVide(), 0, true)!
    expect(noms(r.destination)).toEqual(['A'])
    expect(estListeVierge(docVide())).toBe(true)
    expect(estListeVierge(r.destination)).toBe(false)
  })

  it('la source vidée garde une tâche vide', () => {
    const r = transferer(doc(tache('A')), 0, doc(tache('X')), 0, true)!
    expect(estListeVierge(r.source)).toBe(true)
  })

  it('refuse un rang inconnu, et un sixième niveau dépassé', () => {
    expect(transferer(doc(tache('A')), 3, doc(tache('X')), 0, true)).toBeNull()
    expect(transferer(doc(tache('A')), 0, doc(tache('X')), 3, true)).toBeNull()
    let profond = tache('6')
    for (const n of ['5', '4', '3', '2']) profond = tache(n, [profond])
    const cinq = doc(tache('1', [profond]))
    // « 6 » est au sixième niveau : une tâche à sous-tâche n'y entre pas.
    expect(transferer(doc(tache('X', [tache('x1')])), 0, cinq, 5, true)).toBeNull()
    expect(transferer(doc(tache('Y')), 0, cinq, 5, true)).not.toBeNull()
  })

  it('détache une tâche en liste d’une tâche, à l’endroit voulu', () => {
    const r = detacher(doc(tache('A'), tache('B', [tache('b1')])), 1, 7.4, -3)!
    expect(noms(r.source)).toEqual(['A'])
    expect(noms(r.liste.contenu.texte)).toEqual(['B', 'b1'])
    expect(r.liste.contenu.type).toBe('taches')
    expect([r.liste.x, r.liste.y]).toEqual([7.4, -3])
    expect(detacher(doc(tache('A')), 4, 0, 0)).toBeNull()
  })
})
