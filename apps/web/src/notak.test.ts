import { type DepotFichiers, type EspaceNavigable, creerEspace, encoderNotak, decoderNotak } from '@notak/tableau'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { attendreEnvoi, poserNotak } from './notak'

function etat(titre: string, elements: Record<string, unknown>[], meta: Record<string, unknown> = {}): Uint8Array {
  const doc = new Y.Doc()
  doc.getMap('meta').set('titre', titre)
  for (const [k, v] of Object.entries(meta)) doc.getMap('meta').set(k, v)
  for (const e of elements) doc.getMap('elements').set(e.id as string, { x: 0, y: 0, largeur: 10, ...e })
  return Y.encodeStateAsUpdate(doc)
}

describe('importer un .notak comme une copie neuve', () => {
  it('recrée les tableaux sous le bon parent, renvoie les fichiers, et les renvois suivent', async () => {
    const fichier = encoderNotak({
      racine: 'A',
      tableaux: [
        { id: 'B', titre: 'Fille', parent: 'A', etat: etat('Fille', [{ id: 'm1', contenu: { type: 'image', fichier: 'F1', largeurOrigine: 1, hauteurOrigine: 1 } }]) },
        {
          id: 'A',
          titre: 'Tête',
          couleur: 'bleu',
          etat: etat(
            'Tête',
            [
              { id: 'n1', contenu: { type: 'tableau', cible: 'B' } },
              { id: 'n2', contenu: { type: 'note', texte: { type: 'doc' } }, corbeille: 1 },
            ],
            { etiquettes: [{ id: 'e1', nom: 'Urgent', couleur: 'rouge' }] },
          ),
        },
      ],
      fichiers: [{ id: 'F1', type: 'image/png', octets: new Uint8Array([1, 2]) }],
    })
    const espace = creerEspace({ racine: 'R', tableaux: { R: { titre: 'Accueil', elements: [] } } })
    const recus: Blob[] = []
    const depot = { enregistrer: async (b: Blob) => (recus.push(b), 'NOUVEAU-F') } as unknown as DepotFichiers

    const r = await poserNotak(decoderNotak(fichier), espace, 'R', depot)
    expect(r).toMatchObject({ tableaux: 2, perdus: 0 })
    expect(recus).toHaveLength(1)

    const tete = espace.tableau(r.tete)!
    expect(tete).toMatchObject({ titre: 'Tête', couleur: 'bleu', etiquettes: [{ id: 'e1', nom: 'Urgent', couleur: 'rouge' }] })
    // La corbeille reste dehors ; le renvoi vise le sous-tableau neuf, rangé sous la tête.
    expect(tete.elements).toHaveLength(1)
    const fille = (tete.elements[0]!.contenu as { cible: string }).cible
    expect(fille).not.toBe('B')
    expect(espace.parent(fille)).toBe(r.tete)
    expect(espace.tableau(fille)!.elements[0]!.contenu).toMatchObject({ type: 'image', fichier: 'NOUVEAU-F' })
    // Le renvoi vers la tête, dans le tableau d'où l'on importe.
    expect(espace.tableau('R')!.elements.map((e) => e.contenu)).toEqual([{ type: 'tableau', cible: r.tete }])
  })
})

describe('ne dire « importé » qu’une fois arrivé au serveur', () => {
  const espaceQui = (etats: Record<string, string[]>) => {
    const retenus: string[] = []
    const vus: Record<string, number> = {}
    return {
      retenus,
      espace: {
        retenir: (id: string) => {
          retenus.push(id)
          return () => void retenus.splice(retenus.indexOf(id), 1)
        },
        // Chaque lecture fait avancer l'état de ce tableau : en route, puis reçu.
        envoi: (id: string) => {
          const suite = etats[id]!
          const i = Math.min(vus[id] ?? 0, suite.length - 1)
          vus[id] = i + 1
          return suite[i] as 'enregistre' | 'envoi' | 'hors-ligne'
        },
      } as unknown as EspaceNavigable,
    }
  }

  it('attend que chaque tableau posé soit reçu, en les retenant le temps qu’ils partent', async () => {
    const { espace, retenus } = espaceQui({ a: ['envoi', 'envoi', 'enregistre'], b: ['enregistre'] })
    const fini = attendreEnvoi(espace, ['a', 'b'], 1000, 1)
    expect(retenus).toEqual(['a', 'b'])
    expect(await fini).toBe(true)
    expect(retenus).toEqual([])
  })

  it('rend faux, sans rien perdre, quand le serveur ne reçoit pas à temps', async () => {
    const { espace, retenus } = espaceQui({ a: ['hors-ligne'] })
    expect(await attendreEnvoi(espace, ['a'], 20, 1)).toBe(false)
    expect(retenus).toEqual([])
  })

  it('sans serveur (l’édition locale), rien à attendre', async () => {
    expect(await attendreEnvoi({} as EspaceNavigable, ['a'], 20, 1)).toBe(true)
  })
})
