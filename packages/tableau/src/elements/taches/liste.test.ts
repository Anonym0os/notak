import { describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import {
  PROFONDEUR_MAX,
  basculer,
  compter,
  docTaches,
  docVide,
  effacerFaites,
  estFaite,
  hauteur,
  lignesEnTaches,
  nouvelleListeTaches,
  peutDescendre,
  retirer,
  sousTaches,
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
