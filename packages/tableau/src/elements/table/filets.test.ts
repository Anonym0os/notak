import { describe, expect, it } from 'vitest'
import { clarteDuFond, filetEntre, filetsDeCellule } from './filets'

describe('les filets entre cellules colorées', () => {
  it('sans fond de part ni d’autre, le filet ordinaire reste', () => {
    expect(filetEntre(null, { gras: true }, false)).toBeUndefined()
  })

  it('une cellule colorée contre le corps blanc : son filet mêlé d’ardoise', () => {
    const c = filetEntre({ fond: '#62dbc8' }, null, false)
    expect(c).toContain('#62dbc8')
    expect(c).toContain('--notak-table-filet-melange')
  })

  it('la plus foncée des deux donne la couleur de l’arête', () => {
    const clair = { fond: '#ffd14d' }
    const fonce = { fond: '#5882f8' }
    expect(filetEntre(clair, fonce, false)).toContain('#5882f8')
    expect(filetEntre(fonce, clair, false)).toContain('#5882f8')
  })

  it('en thème sombre, le corps de la table est plus foncé qu’un fond coloré : le filet ordinaire', () => {
    expect(filetEntre({ fond: '#62dbc8' }, null, true)).toBeUndefined()
    expect(clarteDuFond('entete', true)).toBeLessThan(clarteDuFond('#62dbc8', true))
  })

  it('les quatre côtés d’une cellule disent la même chose que leurs voisines', () => {
    const formats = [[{ fond: '#ff5757' }, null], [null, { fond: '#5882f8' }]]
    const a = filetsDeCellule(formats, 0, 0, false)
    const b = filetsDeCellule(formats, 0, 1, false)
    expect(a.droite).toBe(b.gauche)
    expect(a.bas).toBeDefined()
    expect(a.haut).toBeDefined()
  })
})
