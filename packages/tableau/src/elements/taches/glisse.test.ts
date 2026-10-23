// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { options, plusProche, viser, viserAilleurs } from './glisse'

const carte = (type: string, attrs: Record<string, string> = {}, avecListe = true) => {
  const c = document.createElement('div')
  c.className = 'notak-carte'
  c.dataset.type = type
  for (const [k, v] of Object.entries(attrs)) c.dataset[k] = v
  if (avecListe) {
    const l = document.createElement('div')
    l.className = 'notak-taches'
    c.append(l)
  }
  return c
}
const toile = () => Object.assign(document.createElement('div'), { className: 'notak-toile' })

describe('viserAilleurs', () => {
  it('sa propre carte : on reste dans la liste', () => {
    const moi = carte('taches')
    expect(viserAilleurs([moi, toile()], moi)).toEqual({ genre: 'ici' })
  })

  it('une autre liste de tâches reçoit la tâche', () => {
    const autre = carte('taches', { id: 'T2' })
    const v = viserAilleurs([autre, toile()], carte('taches'))
    expect(v.genre).toBe('liste')
    expect(v.genre === 'liste' && v.carte).toBe(autre)
  })

  it('une liste en édition, verrouillée, ou un autre type : rien', () => {
    const moi = carte('taches')
    expect(viserAilleurs([carte('taches', { edition: '' }), toile()], moi).genre).toBe('rien')
    expect(viserAilleurs([carte('taches', { verrou: '' }), toile()], moi).genre).toBe('rien')
    expect(viserAilleurs([carte('note', {}, false), toile()], moi).genre).toBe('rien')
  })

  it('le vide de la toile : une nouvelle liste', () => {
    expect(viserAilleurs([toile()], carte('taches')).genre).toBe('toile')
  })

  it('hors de la toile : rien', () => {
    expect(viserAilleurs([document.body], carte('taches')).genre).toBe('rien')
  })
})

describe('viserAilleurs, sur une colonne', () => {
  it('sur la colonne ou sur l’un de ses éléments : la tâche y entre', () => {
    const colonne = carte('colonne', { id: 'C' }, false)
    const note = carte('note', { id: 'N' }, false)
    expect(viserAilleurs([colonne, toile()], carte('taches')).genre).toBe('colonne')
    // L'élément est dessiné par-dessus la colonne qui le porte.
    expect(viserAilleurs([note, colonne, toile()], carte('taches'))).toEqual({ genre: 'colonne', colonne })
  })

  it('une colonne verrouillée ne reçoit rien', () => {
    expect(viserAilleurs([carte('colonne', { verrou: '' }, false), toile()], carte('taches')).genre).toBe('rien')
  })

  it('une liste dans une colonne reçoit la tâche, pas la colonne', () => {
    const liste = carte('taches', { id: 'T2' })
    expect(viserAilleurs([liste, carte('colonne', {}, false), toile()], carte('taches')).genre).toBe('liste')
  })
})

/** Une liste décrite par ses niveaux : [1, 2, 2, 1] est A, a1, a2, B. */
function monde(niveaux: number[]) {
  const racine = document.createElement('div')
  racine.className = 'notak-taches'
  const ul = document.createElement('ul')
  racine.append(ul)
  const piles: HTMLElement[] = [ul]
  const lis: HTMLElement[] = []
  for (const n of niveaux) {
    piles.length = n
    const li = document.createElement('li')
    li.dataset.type = 'taskItem'
    const colonne = document.createElement('div')
    li.append(colonne)
    piles[n - 1]!.append(li)
    lis.push(li)
    const sous = document.createElement('ul')
    colonne.append(sous)
    piles[n] = sous
  }
  document.body.append(racine)
  return { racine, lis }
}

describe('options', () => {
  // A, a1, a2, B
  const { lis } = monde([1, 2, 2, 1])
  const [A, a1, a2, B] = lis as [HTMLElement, HTMLElement, HTMLElement, HTMLElement]
  const lire = (o: ReturnType<typeof options>) => o.map((x) => `${x.niveau}:${lis.indexOf(x.vers)}:${x.place}`)

  it('en tête de liste, au premier niveau devant la première tâche', () => {
    expect(lire(options(null, A, 1))).toEqual(['1:0:avant'])
  })

  it('devant la première sous-tâche, il n’y a que son niveau', () => {
    expect(lire(options(A, a1, 1))).toEqual(['2:1:avant'])
  })

  it('entre deux sous-tâches : leur niveau, ou dans la première qui n’a pas de sous-tâche', () => {
    expect(lire(options(a1, a2, 1))).toEqual(['2:2:avant', '3:1:dans'])
  })

  it('sous la dernière sous-tâche : le niveau de la suivante, ou celui de la sous-tâche, ou dedans', () => {
    expect(lire(options(a2, B, 1))).toEqual(['1:3:avant', '2:2:apres', '3:2:dans'])
  })

  it('en queue de liste : tous les niveaux jusqu’à dedans la dernière', () => {
    expect(lire(options(B, null, 1))).toEqual(['1:3:apres', '2:3:dans'])
    expect(lire(options(a2, null, 1))).toEqual(['1:0:apres', '2:2:apres', '3:2:dans'])
  })

  it('une tâche à sous-tâches ne passe pas le sixième niveau', () => {
    const { lis: l } = monde([1, 2, 3, 4, 5, 6])
    // Hauteur 5 : au niveau 2 elle va jusqu'au sixième, au niveau 3 elle le passe.
    expect(options(l[5]!, null, 5).map((o) => o.niveau)).toEqual([1, 2])
  })
})

describe('plusProche', () => {
  it('prend le niveau dont la colonne de cases est la plus proche de la case', () => {
    const { lis } = monde([1, 2, 2, 1])
    const opts = options(lis[2]!, lis[3]!, 1)
    const colonne = (n: number) => (n - 1) * 26
    expect(plusProche(opts, colonne, 0)?.niveau).toBe(1)
    expect(plusProche(opts, colonne, 20)?.niveau).toBe(2)
    expect(plusProche(opts, colonne, 80)?.niveau).toBe(3)
    expect(plusProche([], colonne, 0)).toBeNull()
  })
})

describe('viser', () => {
  it('rend le trait au milieu du vide, et ne propose pas l’endroit d’où vient la tâche', () => {
    const { racine, lis } = monde([1, 1, 1])
    // Trois lignes de 30 px, l'une sous l'autre.
    racine.style.cssText = 'position:relative'
    lis.forEach((li, i) => {
      li.getBoundingClientRect = () => ({ top: i * 30, bottom: i * 30 + 30, left: 0, right: 100, width: 100, height: 30, x: 0, y: i * 30, toJSON: () => ({}) })
    })
    racine.querySelector('ul')!.getBoundingClientRect = () => ({ top: 0, bottom: 90, left: 0, right: 100, width: 100, height: 90, x: 0, y: 0, toJSON: () => ({}) })
    racine.getBoundingClientRect = () => ({ top: 0, bottom: 90, left: 0, right: 100, width: 100, height: 90, x: 0, y: 0, toJSON: () => ({}) })
    // Vers la ligne entre la 1re et la 2e : on pose avant la 2e.
    const v = viser(racine, null, 31, 0)!
    expect(v.rang).toBe(1)
    expect(v.place).toBe('avant')
    expect(v.trait.top).toBe(29)
    // La 2e tâche portée : l'espace juste dessous (là où elle est) ne propose rien à son niveau.
    expect(viser(racine, lis[1]!, 31, 0)).toBeNull()
    expect(viser(racine, lis[1]!, 61, 0)).toBeNull()
    // Mais en glissant la case vers la droite, le niveau change : la tâche se range dans celle d'au-dessus.
    expect(viser(racine, lis[1]!, 31, 30)).toMatchObject({ niveau: 2, place: 'dans', rang: 0 })
    // Plus loin, sous la dernière : après elle.
    const fin = viser(racine, lis[1]!, 200, 0)!
    expect(fin.rang).toBe(2)
    expect(fin.place).toBe('apres')
  })
})
