import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { creerMagasinYjs } from '../coeur/magasinYjs'
import { POSITION_MAX, type Element, type NoeudTexte } from '../coeur/tableau'
import { ACCUEIL } from './accueil'
import { MODELES } from './catalogue'
import { type ElementModele, type ModeleTableau, elementsDuModele, hauteurEstimee } from './construire'

let n = 0
const id = () => `id${++n}`

const noeudsValides = (d: NoeudTexte): boolean =>
  typeof d.type === 'string' && (d.text === undefined || d.text.length > 0) && (d.content ?? []).every(noeudsValides)

/** Tout ce qui ferait d'un tableau un tableau cassé, en clair ; vide s'il est valide. */
export function problemes(elements: Element[]): string[] {
  const p: string[] = []
  const ids = new Set(elements.map((e) => e.id))
  if (ids.size !== elements.length) p.push('identifiants en double')
  const colonnes = new Set(elements.filter((e) => e.contenu.type === 'colonne').map((e) => e.id))
  const rangs = new Set<string>()
  for (const e of elements) {
    if (!Number.isInteger(e.x) || !Number.isInteger(e.y) || Math.abs(e.x) > POSITION_MAX || Math.abs(e.y) > POSITION_MAX) p.push(`position de ${e.id}`)
    if (!(e.largeur >= 10)) p.push(`largeur de ${e.id}`)
    if (e.parent !== undefined) {
      if (!colonnes.has(e.parent)) p.push(`${e.id} : le parent n'est pas une colonne`)
      if (!e.ordre) p.push(`${e.id} : pas de rang`)
      else if (rangs.has(`${e.parent}/${e.ordre}`)) p.push(`${e.id} : rang en double`)
      else rangs.add(`${e.parent}/${e.ordre}`)
      if (e.contenu.type === 'colonne' || e.contenu.type === 'ligne') p.push(`${e.id} : ${e.contenu.type} dans une colonne`)
      if (e.ordre?.endsWith('0')) p.push(`${e.id} : rang qui finit par zéro`)
    } else if (e.ordre !== undefined) p.push(`${e.id} : rang sans colonne`)
    const c = e.contenu
    if (c.type === 'note' || c.type === 'taches') {
      if (c.texte.type !== 'doc' || !noeudsValides(c.texte)) p.push(`${e.id} : texte invalide`)
    }
    if (c.type === 'taches' && c.texte.content?.[0]?.type !== 'taskList') p.push(`${e.id} : pas une liste de tâches`)
    if (c.type === 'colonne' && !c.titre) p.push(`${e.id} : colonne sans titre`)
  }
  return p
}

const rect = (e: ElementModele) => ({ x0: e.x, y0: e.y, x1: e.x + (e.largeur ?? 34), y1: e.y + hauteurEstimee(e) })

const chevauchements = (m: ModeleTableau): string[] => {
  const r = m.elements.map((e) => ({ e, ...rect(e.genre === 'titre' ? { ...e, largeur: e.largeur ?? 60 } : e) }))
  const sortie: string[] = []
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      const [a, b] = [r[i]!, r[j]!]
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) sortie.push(`${i} et ${j}`)
    }
  return sortie
}

describe('modèles de tableaux', () => {
  it('il y en a une dizaine, chacun nommé et décrit une seule fois', () => {
    expect(MODELES.length).toBeGreaterThanOrEqual(10)
    expect(new Set(MODELES.map((m) => m.id)).size).toBe(MODELES.length)
    expect(new Set(MODELES.map((m) => m.titre)).size).toBe(MODELES.length)
    for (const m of MODELES) {
      expect(m.titre.length).toBeGreaterThan(2)
      expect(m.resume.length).toBeGreaterThan(10)
      expect(m.elements.length).toBeGreaterThanOrEqual(4)
    }
  })

  it.each(MODELES.map((m) => [m.id, m] as const))('%s est un tableau valide', (_nom, m) => {
    expect(problemes(elementsDuModele(m, id))).toEqual([])
  })

  it.each(MODELES.map((m) => [m.id, m] as const))('%s ne superpose rien sur la toile', (_nom, m) => {
    expect(chevauchements(m)).toEqual([])
  })

  it.each(MODELES.map((m) => [m.id, m] as const))('%s se pose dans un document et se relit à l’identique', (_nom, m) => {
    const elements = elementsDuModele(m, id)
    const magasin = creerMagasinYjs(new Y.Doc())
    magasin.appliquerSeulement(elements.map((element) => ({ type: 'creer' as const, element })))
    expect(magasin.lire().elements).toEqual(elements)
  })

  it('le catalogue réunit des colonnes, des notes, des tâches et des titres', () => {
    const types = new Set(MODELES.flatMap((m) => elementsDuModele(m, id).map((e) => (e.contenu.type === 'note' && e.contenu.variante === 'titre' ? 'titre' : e.contenu.type))))
    expect([...types].sort()).toEqual(['colonne', 'note', 'taches', 'titre'])
  })

  it('chaque pose donne des identifiants neufs, et les enfants suivent leur colonne', () => {
    const m = MODELES.find((x) => x.id === 'planning')!
    const a = elementsDuModele(m, id)
    const b = elementsDuModele(m, id)
    expect(a.some((e) => b.some((f) => f.id === e.id))).toBe(false)
    for (const e of a) if (e.parent) expect(a.findIndex((x) => x.id === e.parent)).toBeLessThan(a.indexOf(e))
  })

  it('un problème est bien détecté', () => {
    const [premier] = elementsDuModele(MODELES[0]!, id)
    expect(problemes([premier!, premier!])).toContain('identifiants en double')
    expect(problemes([{ ...premier!, parent: 'ailleurs', ordre: 'a' }])).not.toEqual([])
  })

  it('le tableau d’accueil est valide, sans superposition, et présente les gestes en colonnes', () => {
    const elements = elementsDuModele(ACCUEIL, id)
    expect(problemes(elements)).toEqual([])
    expect(chevauchements(ACCUEIL)).toEqual([])
    expect(elements.filter((e) => e.contenu.type === 'colonne').length).toBeGreaterThanOrEqual(4)
    expect(elements.length).toBeGreaterThan(15)
  })
})
