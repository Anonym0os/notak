import { describe, expect, it } from 'vitest'
import type { Element, Lien } from '../../coeur/tableau'
import { avecImageApercu, dimensionsApercu, estVideo, imageMontree, lienSous } from './imageApercu'

const lien = (c: Partial<Lien> = {}): Lien => ({ type: 'lien', url: 'https://exemple.fr', statut: 'pret', ...c })
const carte = (id: string, c: Partial<Lien> = {}, extra: Partial<Element> = {}): Element => ({ id, x: 0, y: 0, largeur: 34, contenu: lien(c), ...extra })

describe('image d’aperçu d’un lien', () => {
  it('montre celle qu’on a donnée, sinon celle de la page, sauf aperçu caché', () => {
    expect(imageMontree(lien())).toBe(false)
    expect(imageMontree(lien({ apercu: { image: 'https://x/i.png' } }))).toBe(true)
    expect(imageMontree(lien({ statut: 'attente', apercu: { image: 'https://x/i.png' } }))).toBe(false)
    expect(imageMontree(lien({ image: { fichier: 'f', largeur: 10, hauteur: 10 } }))).toBe(true)
    expect(imageMontree(lien({ sansApercu: true, image: { fichier: 'f', largeur: 10, hauteur: 10 } }))).toBe(false)
  })

  it('en donner une remontre l’aperçu caché', () => {
    const apres = avecImageApercu(lien({ sansApercu: true }), { fichier: 'f', largeur: 400, hauteur: 200 })
    expect(apres.sansApercu).toBeUndefined()
    expect(dimensionsApercu(apres)).toEqual({ largeur: 400, hauteur: 200 })
  })

  it('connaît la taille de l’image de la page quand elle l’a dite', () => {
    expect(dimensionsApercu(lien({ apercu: { image: 'https://x/i.png' } }))).toBeNull()
    expect(dimensionsApercu(lien({ apercu: { image: 'https://x/i.png', largeur: 800, hauteur: 600 } }))).toEqual({ largeur: 800, hauteur: 600 })
  })

  it('reconnaît une vidéo', () => {
    expect(estVideo(lien({ url: 'https://youtu.be/dQw4w9WgXcQ' }))).toBe(true)
    expect(estVideo(lien())).toBe(false)
  })
})

describe('lienSous', () => {
  const rects: Record<string, { min: { x: number; y: number }; max: { x: number; y: number } }> = {
    a: { min: { x: 0, y: 0 }, max: { x: 34, y: 30 } },
    b: { min: { x: 0, y: 0 }, max: { x: 34, y: 30 } },
  }
  const rect = (id: string) => rects[id] ?? null

  it('vise l’aperçu : au-dessous, c’est le texte', () => {
    const els = [carte('a')]
    expect(lienSous(els, rect, () => 12, { x: 5, y: 6 })?.id).toBe('a')
    expect(lienSous(els, rect, () => 12, { x: 5, y: 20 })).toBeNull()
  })

  it('sans aperçu visible, toute la carte reçoit', () => {
    expect(lienSous([carte('a')], rect, () => 0, { x: 5, y: 25 })?.id).toBe('a')
  })

  it('prend la plus haute dans l’empilement, et saute le verrouillé, le jeté et le vide', () => {
    expect(lienSous([carte('a'), carte('b')], rect, () => 0, { x: 5, y: 5 })?.id).toBe('b')
    expect(lienSous([carte('a'), carte('b', {}, { verrou: true })], rect, () => 0, { x: 5, y: 5 })?.id).toBe('a')
    expect(lienSous([carte('a'), carte('b', {}, { corbeille: 1 })], rect, () => 0, { x: 5, y: 5 })?.id).toBe('a')
    expect(lienSous([carte('a', { url: '' })], rect, () => 0, { x: 5, y: 5 })).toBeNull()
  })

  it('ignore le point hors de la carte', () => {
    expect(lienSous([carte('a')], rect, () => 0, { x: 50, y: 5 })).toBeNull()
  })
})
