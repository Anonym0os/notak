import { describe, expect, it } from 'vitest'
import { type Connexion, type Reseau, creerEspaceDistant, presenceDe } from './espaceDistant'

const utilisateur = { id: 'u1', nom: 'Samy', couleur: '#2f6feb' }

function faux() {
  const connectes: string[] = []
  const declares: string[] = []
  let echecs = 0
  const reseau: Reseau = {
    connecter(id): Connexion {
      connectes.push(id)
      return { awareness: null, lectureSeule: () => false, refuse: () => false, synchronise: () => true, detruire() {} }
    },
    async declarer(id) {
      if (echecs-- > 0) throw new Error('hors ligne')
      declares.push(id)
    },
  }
  return { reseau, connectes, declares, echouer: (n: number) => (echecs = n) }
}

const attendre = () => new Promise((r) => setTimeout(r, 5))

describe('espace distant', () => {
  it('rend l’id tout de suite et ne se relie au serveur qu’après la déclaration', async () => {
    const f = faux()
    const e = creerEspaceDistant({ racine: 'R', utilisateur, reseau: f.reseau })
    const id = e.creerTableau('Idées', 'R')
    expect(e.tableau(id)?.titre).toBe('Idées')
    expect(f.connectes).not.toContain(id)
    await attendre()
    expect(f.declares).toEqual([id])
    expect(f.connectes).toContain(id)
    e.detruire()
  })

  it('réessaie une déclaration qui échoue', async () => {
    const f = faux()
    f.echouer(2)
    const e = creerEspaceDistant({ racine: 'R', utilisateur, reseau: f.reseau, delaiReprise: 1 })
    const id = e.creerTableau('Idées')
    await attendre()
    await attendre()
    expect(f.declares).toEqual([id])
    e.detruire()
  })

  it('reprend les déclarations restées en route', async () => {
    const f = faux()
    let gardees = [{ id: 'X', titre: 'Resté' }]
    const e = creerEspaceDistant({
      racine: 'R',
      utilisateur,
      reseau: f.reseau,
      memoire: { lire: () => gardees, ecrire: (d) => (gardees = d) },
    })
    await attendre()
    expect(f.declares).toEqual(['X'])
    expect(gardees).toEqual([])
    e.detruire()
  })

  it('tient le chemin des tableaux par lesquels on est entré', () => {
    const e = creerEspaceDistant({ racine: 'R', utilisateur, reseau: faux().reseau })
    e.entrer?.('A', 'R')
    e.entrer?.('B', 'A')
    expect(e.chemin('B')).toEqual(['R', 'A', 'B'])
    expect(e.parent('B')).toBe('A')
    // Revenir en arrière par un renvoi ne retourne pas le chemin.
    e.entrer?.('A', 'B')
    e.entrer?.('R', 'B')
    expect(e.chemin('B')).toEqual(['R', 'A', 'B'])
    expect(e.parent('R')).toBeNull()
    expect(e.chemin('Z')).toEqual(['Z'])
    e.detruire()
  })

  it('lit le titre d’un renvoi dans le document cible', () => {
    const e = creerEspaceDistant({ racine: 'R', utilisateur, reseau: faux().reseau })
    let n = 0
    e.ecouter(() => n++)
    const id = e.creerTableau('Voyage')
    e.renommer(id, 'Voyage 2027')
    expect(e.tableau(id)?.titre).toBe('Voyage 2027')
    expect(n).toBeGreaterThan(0)
    e.detruire()
  })
})

describe('presenceDe', () => {
  it('garde ce qui est bien formé et écarte le reste', () => {
    expect(presenceDe(3, { utilisateur: { id: 'a', nom: 'A', couleur: '#fff' }, curseur: { x: 1, y: 2 }, selection: ['x', 4], edition: 'x' })).toEqual({
      client: 3,
      utilisateur: { id: 'a', nom: 'A', couleur: '#fff' },
      curseur: { x: 1, y: 2 },
      selection: ['x'],
      edition: 'x',
    })
    expect(presenceDe(3, { curseur: null })).toBeNull()
    expect(presenceDe(3, { utilisateur: { id: 'a', nom: 'A', couleur: '#fff' }, curseur: { x: 'a' }, edition: 4 })).toMatchObject({ curseur: null, edition: null })
  })
})
