// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../coeur/magasin'
import type { Element, Image } from '../coeur/tableau'
import { commencerEnvoi, copieLocale, progressionEnvoi, useFichier } from './envois'
import type { ContexteToile, DepotFichiers } from './types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Les adresses `blob:` que le navigateur donnerait, et ce qu'elles montrent : on suit celles qu'on rend.
let creees: Map<string, Blob>
let rendues: string[]
beforeEach(() => {
  creees = new Map()
  rendues = []
  let n = 0
  Object.assign(URL, {
    createObjectURL: (b: Blob) => {
      const a = `blob:essai-${++n}`
      creees.set(a, b)
      return a
    },
    revokeObjectURL: (a: string) => void rendues.push(a),
  })
})
afterEach(() => vi.restoreAllMocks())

/** Un dépôt dont on finit (ou fait échouer) l'envoi à la main. */
function depotManuel() {
  let finir: (id: string) => void = () => {}
  let echouer: (e: Error) => void = () => {}
  const depot: DepotFichiers = {
    enregistrer: () =>
      new Promise((fin, refus) => {
        finir = fin
        echouer = refus
      }),
    adresse: async (id) => `/api/fichiers/${id}`,
  }
  return { depot, finir: (id: string) => finir(id), echouer: (e: Error) => echouer(e) }
}
const attendre = () => act(async () => {})

describe('progression d’un envoi', () => {
  it('suit les octets partis, puis cesse quand le fichier est reçu', async () => {
    let dire: (envoyes: number, total: number) => void = () => {}
    let finir: (id: string) => void = () => {}
    const depot: DepotFichiers = {
      enregistrer: (_f, progression) => {
        dire = progression ?? dire
        return new Promise((fini) => (finir = fini))
      },
      adresse: async () => null,
    }
    const id = commencerEnvoi(new Blob(['abcd']), depot)
    // Rien n'est encore parti : on ne sait pas.
    expect(progressionEnvoi(id)).toBe(-1)
    expect(copieLocale(id)).toMatch(/^blob:/)
    dire(1, 4)
    expect(progressionEnvoi(id)).toBe(0.25)
    dire(4, 4)
    expect(progressionEnvoi(id)).toBe(1)
    finir('vrai-id')
    await Promise.resolve()
    expect(progressionEnvoi(id)).toBeNull()
  })

  it('un fichier qui n’est pas en route n’a ni progression ni copie locale', () => {
    expect(progressionEnvoi('abc')).toBeNull()
    expect(copieLocale('abc')).toBeUndefined()
  })
})

describe('la copie locale d’un envoi', () => {
  it('une photo qu’on réduit se montre par son aperçu, une fois prêt, et jamais par l’original', async () => {
    const { depot } = depotManuel()
    let donner: (b: Blob | null) => void = () => {}
    const original = new Blob(['photo de 48 Mpx'], { type: 'image/jpeg' })
    const id = commencerEnvoi(original, depot, { apercu: new Promise((fin) => (donner = fin)) })
    expect(copieLocale(id)).toBeUndefined()
    donner(new Blob(['aperçu'], { type: 'image/jpeg' }))
    await attendre()
    expect(creees.get(copieLocale(id)!)!.size).toBe(new Blob(['aperçu']).size)
    expect([...creees.values()]).toHaveLength(1)
  })

  it('sans aperçu (le navigateur n’a pas su réduire), le fichier lui-même', async () => {
    const { depot } = depotManuel()
    const id = commencerEnvoi(new Blob(['photo'], { type: 'image/jpeg' }), depot, { apercu: Promise.resolve(null) })
    await attendre()
    expect(creees.get(copieLocale(id)!)!.size).toBe(new Blob(['photo']).size)
  })

  it('l’envoi fini, la copie que rien ne montre est rendue au navigateur ; un aperçu arrivé trop tard n’en fait pas', async () => {
    const { depot, finir } = depotManuel()
    const id = commencerEnvoi(new Blob(['fichier']), depot)
    const local = copieLocale(id)!
    finir('recu')
    await attendre()
    expect(rendues).toEqual([local])
    expect(copieLocale(id)).toBeUndefined()

    const suite = depotManuel()
    let donner: (b: Blob | null) => void = () => {}
    const autre = commencerEnvoi(new Blob(['photo']), suite.depot, { apercu: new Promise((fin) => (donner = fin)) })
    suite.finir('recu-2')
    await attendre()
    donner(new Blob(['aperçu']))
    await attendre()
    expect(copieLocale(autre)).toBeUndefined()
    expect(creees.size).toBe(1)
  })

  it('un envoi qui échoue rend aussi sa copie', async () => {
    const { depot, echouer } = depotManuel()
    const id = commencerEnvoi(new File(['x'], 'a.pdf'), depot)
    const local = copieLocale(id)!
    echouer(new Error('Réseau perdu'))
    await attendre()
    expect(rendues).toEqual([local])
  })

  it('la carte montre la copie jusqu’à la vraie image, sans passer par rien ; la copie est rendue ensuite', async () => {
    const { depot, finir } = depotManuel()
    const envoi = commencerEnvoi(new Blob(['photo'], { type: 'image/jpeg' }), depot)
    const local = copieLocale(envoi)!
    const element: Element<Image> = { id: 'i1', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: envoi, largeurOrigine: 10, hauteurOrigine: 10 } }
    const magasin = creerMagasin({ titre: '', elements: [element] })
    const contexte = { magasin, services: { fichiers: depot } } as unknown as ContexteToile
    const vues: (string | null | undefined)[] = []
    function Carte() {
      const e = useSyncExternalStore(magasin.ecouter, () => magasin.lire().elements[0]) as Element<Image>
      const { adresse } = useFichier(e, contexte)
      vues.push(adresse)
      return null
    }
    const hote = document.createElement('div')
    const racine = createRoot(hote)
    await act(async () => racine.render(createElement(Carte)))
    expect(vues.at(-1)).toBe(local)
    expect(rendues).toEqual([])
    finir('recu')
    await attendre()
    // L'élément a pris son vrai fichier, la carte la vraie adresse : la copie, puis elle, sans un rendu vide entre les
    // deux ni de retour à la copie quand l'élément est corrigé.
    expect((magasin.lire().elements[0]!.contenu as Image).fichier).toBe('recu')
    expect(vues.filter((a, i) => i === 0 || a !== vues[i - 1])).toEqual([local, '/api/fichiers/recu'])
    expect(rendues).toEqual([local])
    act(() => racine.unmount())
  })
})
