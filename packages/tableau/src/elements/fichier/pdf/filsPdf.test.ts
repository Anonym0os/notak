import { describe, expect, it } from 'vitest'
import type { Commentaire, Fichier, Message } from '../../../coeur/tableau'
import { ancre, cleFilPdf, filNeuf, filsDeLaPage, filsDesPages, nombreDeMessages, poserFilPdf } from './filsPdf'

const pdf: Fichier = { type: 'fichier', fichier: 'f1', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 10 }
const message = (id: string, texte = 'Ici ?'): Message => ({ id, auteur: { id: 'ana', nom: 'Ana' }, date: 1, texte })
const fil = (page: number, x: number, y: number, ...messages: Message[]): Commentaire => ({ type: 'commentaire', messages, surPage: { page, x, y } })

describe('les fils des pages d’un PDF', () => {
  it('se lisent dans l’ordre de lecture : page par page, de haut en bas, puis de gauche à droite', () => {
    const c: Fichier = {
      ...pdf,
      fils: { b: fil(2, 0.1, 0.5, message('1')), a: fil(1, 0.8, 0.2, message('2')), c: fil(1, 0.2, 0.2, message('3')), d: fil(1, 0.5, 0.1, message('4')) },
    }
    expect(filsDesPages(c).map((f) => f.id)).toEqual(['d', 'c', 'a', 'b'])
    expect(filsDeLaPage(filsDesPages(c), 1).map((f) => f.id)).toEqual(['d', 'c', 'a'])
    expect(nombreDeMessages(filsDesPages(c))).toBe(4)
  })

  it('un fil sans message ou sans place lisible ne se montre pas', () => {
    const c = { ...pdf, fils: { vide: fil(1, 0.1, 0.1), perdu: { type: 'commentaire', messages: [message('1')] }, bancal: { ...fil(1, 0.1, 0.1, message('2')), surPage: { page: 1, x: 'a', y: 0 } } } } as unknown as Fichier
    expect(filsDesPages(c)).toEqual([])
  })

  it('un point hors de la page y est ramené', () => {
    const c: Fichier = { ...pdf, fils: { a: fil(1, 1.4, -0.2, message('1')) } }
    expect(filsDesPages(c)[0]).toMatchObject({ x: 1, y: 0 })
    expect(ancre(0, 0.33333333, 2)).toEqual({ page: 1, x: 0.3333, y: 1 })
  })
})

describe('poser un fil sur une page', () => {
  it('le premier message l’écrit dans le fichier, à sa place', () => {
    const neuf = filNeuf(3, 0.25, 0.75)
    const c = poserFilPdf(pdf, 'f1', { ...neuf, messages: [message('m1')] })
    expect(c.fils?.f1).toEqual({ type: 'commentaire', messages: [message('m1')], surPage: { page: 3, x: 0.25, y: 0.75 } })
  })

  it('un fil sans message n’est pas gardé, et le dernier fil retiré emporte la clé', () => {
    expect(poserFilPdf(pdf, 'f1', filNeuf(1, 0, 0))).toBe(pdf)
    const avec = poserFilPdf(pdf, 'f1', fil(1, 0.1, 0.1, message('m1')))
    expect(poserFilPdf(avec, 'f1', { ...fil(1, 0.1, 0.1) })).toEqual(pdf)
    expect(poserFilPdf(avec, 'f1', null)).toEqual(pdf)
  })

  it('un fil qui a perdu sa place la retrouve', () => {
    const avec = poserFilPdf(pdf, 'f1', fil(2, 0.4, 0.6, message('m1')))
    const { surPage: _, ...sansPlace } = fil(2, 0.4, 0.6, message('m1'), message('m2'))
    expect(poserFilPdf(avec, 'f1', sansPlace).fils?.f1?.surPage).toEqual({ page: 2, x: 0.4, y: 0.6 })
  })

  it('les autres fils restent', () => {
    const deux = poserFilPdf(poserFilPdf(pdf, 'a', fil(1, 0.1, 0.1, message('1'))), 'b', fil(2, 0.1, 0.1, message('2')))
    expect(Object.keys(poserFilPdf(deux, 'a', null).fils ?? {})).toEqual(['b'])
  })

  it('le « lu » et la présence le retiennent sous sa clé, comme le fil d’un sujet', () => {
    expect(cleFilPdf('p1', 'f1')).toBe('fil:p1:f1')
  })
})
