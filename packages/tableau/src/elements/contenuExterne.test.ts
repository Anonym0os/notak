import { afterEach, describe, expect, it } from 'vitest'
import { contenuExterneDe, hotesDe, oublierLesAccords } from './contenuExterne'
import type { Services } from './types'

afterEach(oublierLesAccords)

/** Un hôte qui retient les tableaux marqués, comme l'édition locale (l'index de l'espace). */
function hote(marques: string[] = []) {
  const m = new Set(marques)
  const ecouteurs = new Set<() => void>()
  const services: Services = {
    contenuExterne: (id) => (m.has(id) ? 'demander' : undefined),
    permettreContenuExterne: (id) => {
      m.delete(id)
      for (const f of ecouteurs) f()
    },
    ecouterContenuExterne: (f) => {
      ecouteurs.add(f)
      return () => ecouteurs.delete(f)
    },
  }
  return { services, marquer: (id: string) => (m.add(id), ecouteurs.forEach((f) => f())) }
}

describe('le contenu d’autres sites', () => {
  it('sans service de l’hôte, ou sans tableau connu, rien n’attend : tout se charge comme avant', () => {
    expect(contenuExterneDe({}, 'T', 'E')).toBeNull()
    expect(contenuExterneDe(hote(['T']).services, undefined, 'E')).toBeNull()
  })

  it('un tableau que l’hôte marque attend l’accord ; un autre non', () => {
    const { services } = hote(['T'])
    expect(contenuExterneDe(services, 'T', 'E')!.attend()).toBe(true)
    expect(contenuExterneDe(services, 'autre', 'E')!.attend()).toBe(false)
  })

  it('« Afficher » vaut pour cet élément et cette partie seulement, le temps de la session', () => {
    const { services } = hote(['T'])
    const e1 = contenuExterneDe(services, 'T', 'E1')!
    const e2 = contenuExterneDe(services, 'T', 'E2')!
    e1.permettre('image:https://a.example/x.png')
    expect(e1.attend('image:https://a.example/x.png')).toBe(false)
    // Une autre partie du même élément, un autre élément, un autre tableau : tout attend encore.
    expect(e1.attend('image:https://a.example/y.png')).toBe(true)
    expect(e1.attend()).toBe(true)
    expect(e2.attend('image:https://a.example/x.png')).toBe(true)
    expect(contenuExterneDe(hote(['U']).services, 'U', 'E1')!.attend('image:https://a.example/x.png')).toBe(true)
    // Un identifiant ou une adresse qui contient les séparateurs ne se confond pas avec un autre accord.
    e1.permettre('a|b')
    expect(contenuExterneDe(services, 'T', 'E1|a')!.attend('b')).toBe(true)
  })

  it('l’accord de tout le tableau, donné à l’hôte, lève l’attente de tous ses éléments, et on en est prévenu', () => {
    const { services } = hote(['T'])
    const e = contenuExterneDe(services, 'T', 'E')!
    let vus = 0
    const arreter = e.ecouter(() => vus++)
    const avant = e.etat()
    services.permettreContenuExterne!('T')
    expect(e.attend()).toBe(false)
    expect(contenuExterneDe(services, 'T', 'autre')!.attend()).toBe(false)
    expect(vus).toBe(1)
    expect(e.etat()).not.toBe(avant)
    arreter()
    services.permettreContenuExterne!('T')
    expect(vus).toBe(1)
  })

  it('un accord de session prévient ceux qui suivent, tous éléments confondus, une seule fois', () => {
    const { services } = hote(['T'])
    const e1 = contenuExterneDe(services, 'T', 'E1')!
    const e2 = contenuExterneDe(services, 'T', 'E2')!
    let vus = 0
    e2.ecouter(() => vus++)
    e1.permettre()
    e1.permettre()
    expect(vus).toBe(1)
    expect(e2.etat()).not.toBe('1|0')
  })

  it('une toile qui se marque après coup se met à attendre', () => {
    const h = hote()
    const e = contenuExterneDe(h.services, 'T', 'E')!
    let vus = 0
    e.ecouter(() => vus++)
    expect(e.attend()).toBe(false)
    h.marquer('T')
    expect(e.attend()).toBe(true)
    expect(vus).toBe(1)
  })

  it('les hôtes cités, sans www ni doublon, dans l’ordre', () => {
    expect(hotesDe(['https://www.youtube-nocookie.com/embed/x', undefined, 'https://i.ytimg.com/a.jpg', 'https://youtube-nocookie.com/y'])).toEqual(['youtube-nocookie.com', 'i.ytimg.com'])
  })
})
