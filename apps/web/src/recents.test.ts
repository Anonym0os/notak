import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvenementActivite } from './api'
import { DUREE_MISE_EN_VALEUR, apresGestes, creerRecents } from './recents'

const geste = (id: number, auteur: string, element: string, genre: EvenementActivite['genre'] = 'modifie'): EvenementActivite => ({
  id, genre, element, typeElement: 'note', libelle: '', instant: 0, auteur: { id: auteur, nom: auteur.toUpperCase(), couleur: `#${auteur}` },
})

describe('apresGestes', () => {
  it('retient les gestes des autres, jamais les miens ni ceux qui ôtent l’élément', () => {
    const c = apresGestes(new Map(), [geste(3, 'bob', 'a'), geste(2, 'moi', 'b'), geste(1, 'bob', 'c', 'supprime')], 'moi', 1000)
    expect([...c.keys()]).toEqual(['a'])
    expect(c.get('a')).toEqual({ couleur: '#bob', nom: 'BOB', jusqua: 1000 + DUREE_MISE_EN_VALEUR })
  })

  it('le geste le plus récent d’un élément l’emporte', () => {
    const c = apresGestes(new Map(), [geste(2, 'cleo', 'a'), geste(1, 'bob', 'a')], 'moi', 0)
    expect(c.get('a')?.nom).toBe('CLEO')
  })

  it('ce qui a trop duré sort ; rien de neuf rend la même carte', () => {
    const c = apresGestes(new Map(), [geste(1, 'bob', 'a')], 'moi', 0)
    expect(apresGestes(c, [], 'moi', 1)).toBe(c)
    expect(apresGestes(c, [], 'moi', DUREE_MISE_EN_VALEUR).size).toBe(0)
  })
})

describe('creerRecents', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('prévient quand un élément entre, puis quand il sort', () => {
    const r = creerRecents()
    const f = vi.fn()
    r.ecouter(f)
    const vide = r.lire()
    r.noter('t1', [geste(1, 'bob', 'a')], 'moi')
    expect(f).toHaveBeenCalledTimes(1)
    expect([...r.lire().keys()]).toEqual(['a'])
    const plein = r.lire()
    r.noter('t1', [], 'moi')
    expect(r.lire()).toBe(plein)
    expect(f).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(DUREE_MISE_EN_VALEUR + 100)
    expect(f).toHaveBeenCalledTimes(2)
    expect(r.lire().size).toBe(0)
    expect(vide.size).toBe(0)
  })

  it('un autre tableau repart de zéro', () => {
    const r = creerRecents()
    r.noter('t1', [geste(1, 'bob', 'a')], 'moi')
    r.noter('t2', [], 'moi')
    expect(r.lire().size).toBe(0)
  })
})
