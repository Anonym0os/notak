import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { creerEspaceDistant } from './coeur/espaceDistant'
import { nouvelleNote } from './coeur/tableau'
import { DELAI_SUIVI, creerReseauLocal, ouvrirIndexLocal } from './reseauLocal'

const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms))
let n = 0
/** Un préfixe neuf par essai : chacun a son propre « navigateur ». */
const neuf = () => `essai${++n}:`

async function ouvrir(prefixe: string) {
  const { index, fermer } = await ouvrirIndexLocal(prefixe)
  const reseau = creerReseauLocal({ index, prefixe })
  const espace = creerEspaceDistant({ racine: index.racine(), utilisateur: { id: 'moi', nom: 'Moi', couleur: '#000' }, reseau, delaiFermeture: 5 })
  return { index, reseau, espace, fermer: () => (espace.detruire(), fermer()) }
}

describe('l’édition locale', () => {
  it('donne un accueil au premier lancement, et le même ensuite', async () => {
    const p = neuf()
    const a = await ouvrir(p)
    const racine = a.index.racine()
    a.fermer()
    await attendre()
    const b = await ouvrir(p)
    expect(b.index.racine()).toBe(racine)
    b.fermer()
  })

  it('garde les tableaux et ce qu’ils contiennent d’un lancement à l’autre', async () => {
    const p = neuf()
    const a = await ouvrir(p)
    const id = a.espace.creerTableau('Voyage', a.index.racine())
    const note = nouvelleNote(1, 2)
    a.espace.magasin(id).faire([{ type: 'creer', element: note }])
    await attendre()
    expect(a.index.lister().map((e) => [e.titre, e.parent])).toContainEqual(['Voyage', a.index.racine()])
    const liberer = a.espace.retenir!(id)
    await attendre()
    expect(a.espace.synchronise(id)).toBe(true)
    liberer()
    a.fermer()
    await attendre()

    const b = await ouvrir(p)
    const lu = await b.reseau.avec(id, (doc) => doc.getMap('elements').has(note.id))
    expect(lu).toBe(true)
    expect(b.index.entree(id)?.titre).toBe('Voyage')
    b.fermer()
  })

  it('un titre changé dans le tableau se lit dans l’index', async () => {
    const p = neuf()
    const a = await ouvrir(p)
    const id = a.espace.creerTableau('Avant')
    a.espace.renommer(id, 'Après')
    await attendre()
    expect(a.index.entree(id)?.titre).toBe('Après')
    a.fermer()
  })

  it('deux onglets ouverts sur le même tableau se suivent', async () => {
    const p = neuf()
    const a = await ouvrir(p)
    const b = await ouvrir(p)
    const id = a.index.racine()
    const liberer = [a.espace.retenir!(id), b.espace.retenir!(id)]
    await attendre()
    const note = nouvelleNote(0, 0)
    a.espace.magasin(id).faire([{ type: 'creer', element: note }])
    await attendre()
    expect(b.espace.magasin(id).lire().elements.map((e) => e.id)).toContain(note.id)
    for (const l of liberer) l()
    a.fermer()
    b.fermer()
  })

  it('ce qu’on écrit hors de la toile atteint le tableau ouvert', async () => {
    const p = neuf()
    const a = await ouvrir(p)
    const id = a.index.racine()
    const liberer = a.espace.retenir!(id)
    await attendre()
    const note = nouvelleNote(3, 3)
    await a.reseau.avec(id, (doc) => doc.getMap('elements').set(note.id, { ...note, plan: 'a0' }))
    await attendre()
    expect(a.espace.magasin(id).lire().elements.map((e) => e.id)).toContain(note.id)
    liberer()
    a.fermer()
  })

  it('un nom réservé (`/t/fichiers`) n’ouvre jamais une base de l’espace : rien ne s’écrit', async () => {
    const p = neuf()
    const a = await ouvrir(p)
    const ecrit = await a.reseau.avec('fichiers', (doc) => {
      doc.getMap('elements').set('x', { y: 1 })
      return doc.getMap('elements').size
    })
    expect(ecrit).toBe(1)
    const bases = (await indexedDB.databases()).map((b) => b.name)
    expect(bases).toContain(`${p}espace`)
    expect(bases).not.toContain(`${p}fichiers`)
    a.fermer()
  })
})


describe('le suivi des tableaux (le catalogue de la bibliothèque)', () => {
  /** Ce que le suivi entend : `change` tout de suite, `relire` une fois les changements retombés. */
  const ecoute = () => {
    const changes: string[] = []
    const relus: [string, number][] = []
    return { changes, relus, suivi: { change: (id: string) => void changes.push(id), relire: (id: string, doc: Y.Doc) => void relus.push([id, doc.getMap('elements').size]) } }
  }

  it('un changement se dit tout de suite, une fois ; la relecture vient quand il retombe, sur le document à jour', async () => {
    const p = neuf()
    const { index, fermer } = await ouvrirIndexLocal(p)
    const e = ecoute()
    const reseau = creerReseauLocal({ index, prefixe: p, suivi: e.suivi })
    const doc = new Y.Doc()
    const arreter = reseau.persister!('voyage', doc)
    await attendre()
    vi.useFakeTimers()
    try {
      doc.getMap('elements').set('a', { id: 'a' })
      doc.getMap('elements').set('b', { id: 'b' })
      expect(e.changes).toEqual(['voyage'])
      expect(e.relus).toEqual([])
      vi.advanceTimersByTime(DELAI_SUIVI)
      expect(e.relus).toEqual([['voyage', 2]])
    } finally {
      vi.useRealTimers()
    }
    arreter()
    fermer()
  })

  it('ce que la base rend au chargement n’est pas un changement ; fermer relit ce qui attendait', async () => {
    const p = neuf()
    const { index, fermer } = await ouvrirIndexLocal(p)
    const avant = creerReseauLocal({ index, prefixe: p })
    await avant.avec('voyage', (doc) => doc.getMap('elements').set('a', { id: 'a' }))
    const e = ecoute()
    const reseau = creerReseauLocal({ index, prefixe: p, suivi: e.suivi })
    // Ouvert pour lire seulement : rien à suivre.
    await reseau.avec('voyage', (doc) => expect(doc.getMap('elements').size).toBe(1))
    expect(e.changes).toEqual([])
    // Ouvert pour écrire puis refermé aussitôt : relu à la fermeture, sans attendre le délai.
    await reseau.avec('voyage', (doc) => doc.getMap('elements').set('b', { id: 'b' }))
    expect(e.changes).toEqual(['voyage'])
    expect(e.relus).toEqual([['voyage', 2]])
    fermer()
  })
})
