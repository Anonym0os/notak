import { describe, expect, it, vi } from 'vitest'
import type { ContexteToile } from '../types'
import { tousLesRecepteurs } from '../registre'
import { tableauDeAdresse } from './index'

const contexte = (tableaux: string[]) => ({ services: { tableau: (id: string) => (tableaux.includes(id) ? { elements: [] } : undefined) } }) as unknown as ContexteToile
const donnees = (texte: string, fichiers: File[] = []) => ({ getData: (t: string) => (t === 'text/plain' ? texte : ''), files: fichiers }) as unknown as DataTransfer

describe('tableauDeAdresse', () => {
  const ici = 'https://notak.exemple'
  it('reconnaît l’adresse d’un tableau de cet espace', () => {
    expect(tableauDeAdresse(`${ici}/t/abc`, contexte(['abc']), ici)).toBe('abc')
    expect(tableauDeAdresse(`${ici}/t/abc/`, contexte(['abc']), ici)).toBe('abc')
  })
  it('laisse les autres adresses', () => {
    expect(tableauDeAdresse(`${ici}/t/abc`, contexte([]), ici)).toBeNull()
    expect(tableauDeAdresse('https://autre.fr/t/abc', contexte(['abc']), ici)).toBeNull()
    expect(tableauDeAdresse(`${ici}/p/abc`, contexte(['abc']), ici)).toBeNull()
    expect(tableauDeAdresse('pas une adresse', contexte(['abc']), ici)).toBeNull()
  })
})

describe('récepteurs du lien', () => {
  const priorite = (n: number) => tousLesRecepteurs().find((r) => r.priorite === n)!

  it('un fichier .url déposé devient un lien', async () => {
    const f = new File(['[InternetShortcut]\nURL=https://exemple.fr/a\n'], 'site.url')
    f.text = async () => '[InternetShortcut]\nURL=https://exemple.fr/a\n'
    const pas = await priorite(36).recevoir(donnees('', [f]), { x: 4, y: 6 }, contexte([]))
    expect(pas).toHaveLength(1)
    expect(pas![0]).toMatchObject({ type: 'creer', element: { x: 4, y: 6, contenu: { type: 'lien', url: 'https://exemple.fr/a' } } })
  })

  it('un fichier ordinaire passe son chemin', async () => {
    expect(await priorite(36).recevoir(donnees('', [new File(['x'], 'a.pdf')]), { x: 0, y: 0 }, contexte([]))).toEqual([])
  })

  it('une adresse de tableau collée devient un raccourci vers lui', () => {
    vi.stubGlobal('location', { origin: 'https://notak.exemple' })
    const pas = priorite(30).recevoir(donnees(`https://notak.exemple/t/xyz\nhttps://exemple.fr`), { x: 0, y: 0 }, contexte(['xyz'])) as { element: { contenu: { type: string } } }[]
    expect(pas.map((p) => p.element.contenu.type)).toEqual(['tableau', 'lien'])
    expect(pas[0]).toMatchObject({ element: { contenu: { cible: 'xyz', raccourci: true } } })
    vi.unstubAllGlobals()
  })
})
