// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { idiome, infosAppareil, marquerAppareil, oublierInfos, partagerFichier, peutPartager, plateforme } from './appareil'

const fenetre = (o: { coque?: boolean; dite?: string; ua?: string; touches?: number; ecran?: [number, number]; reponse?: unknown }) => ({
  ...(o.coque || o.dite ? { __TAURI_INTERNALS__: { invoke: async () => (o.reponse instanceof Error ? Promise.reject(o.reponse) : o.reponse) } } : {}),
  ...(o.dite ? { __NOTAK_PLATEFORME__: o.dite } : {}),
  navigator: { userAgent: o.ua ?? '', maxTouchPoints: o.touches ?? 0 },
  screen: { width: o.ecran?.[0] ?? 1440, height: o.ecran?.[1] ?? 900 },
  document: window.document.implementation.createHTMLDocument(''),
})

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

describe('la plateforme', () => {
  it('croit la coque avant tout', () => {
    expect(plateforme(fenetre({ dite: 'ios', ua: MAC }))).toBe('ios')
    expect(plateforme(fenetre({ dite: 'macos', ua: IPHONE }))).toBe('macos')
  })

  it('ignore une valeur que la coque ne connaît pas', () => {
    expect(plateforme(fenetre({ dite: 'amiga', ua: IPHONE }))).toBe('ios')
  })

  it('hors de la coque, c’est le web, quel que soit l’appareil', () => {
    expect(plateforme(fenetre({ ua: IPHONE }))).toBe('web')
  })

  it('dans une coque muette, lit l’agent utilisateur ; un Macintosh tactile est un iPad', () => {
    expect(plateforme(fenetre({ coque: true, ua: IPHONE }))).toBe('ios')
    expect(plateforme(fenetre({ coque: true, ua: MAC }))).toBe('macos')
    expect(plateforme(fenetre({ coque: true, ua: MAC, touches: 5 }))).toBe('ios')
    expect(plateforme(fenetre({ coque: true, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }))).toBe('windows')
    expect(plateforme(fenetre({ coque: true, ua: 'Mozilla/5.0 (X11; Linux x86_64)' }))).toBe('linux')
  })
})

describe('l’idiome', () => {
  it('un ordinateur partout sauf sur mobile ; sur iOS, la tablette commence à l’iPad mini', () => {
    expect(idiome(fenetre({ dite: 'macos', ecran: [800, 600] }))).toBe('ordinateur')
    expect(idiome(fenetre({ dite: 'ios', ecran: [390, 844] }))).toBe('telephone')
    expect(idiome(fenetre({ dite: 'ios', ecran: [1133, 744] }))).toBe('tablette')
    expect(idiome(fenetre({ dite: 'ios', ecran: [1024, 1366] }))).toBe('tablette')
  })
})

describe('la racine du document', () => {
  it('porte la plateforme, l’idiome, et « mobile » quand c’en est un', () => {
    const d = window.document.implementation.createHTMLDocument('')
    marquerAppareil(d, 'ios', 'tablette')
    expect(d.documentElement.dataset.plateforme).toBe('ios')
    expect(d.documentElement.dataset.idiome).toBe('tablette')
    expect(d.documentElement.hasAttribute('data-mobile')).toBe(true)
    marquerAppareil(d, 'macos', 'ordinateur')
    expect(d.documentElement.hasAttribute('data-mobile')).toBe(false)
  })
})

describe('les infos de la coque mobile', () => {
  beforeEach(oublierInfos)

  it('ne demande rien hors d’une coque mobile', async () => {
    expect(await infosAppareil(fenetre({ dite: 'macos', reponse: { plateforme: 'macos', idiome: 'ordinateur' } }))).toBeNull()
    expect(await infosAppareil(fenetre({ ua: IPHONE }))).toBeNull()
  })

  it('rend ce que dit le plugin, et corrige l’idiome deviné', async () => {
    const f = fenetre({ dite: 'ios', ecran: [390, 844], reponse: { plateforme: 'ios', idiome: 'tablette', systeme: '17.5' } })
    const i = await infosAppareil(f)
    expect(i).toMatchObject({ plateforme: 'ios', idiome: 'tablette' })
    expect(f.document.documentElement.dataset.idiome).toBe('tablette')
  })

  it('un plugin absent ou en panne : null, sans casser la page', async () => {
    expect(await infosAppareil(fenetre({ dite: 'ios', reponse: new Error('plugin appareil not found') }))).toBeNull()
  })
})

describe('la feuille de partage', () => {
  it('n’existe que dans la coque mobile', () => {
    expect(peutPartager(fenetre({ dite: 'ios' }) as never)).toBe(true)
    expect(peutPartager(fenetre({ dite: 'macos' }) as never)).toBe(false)
    expect(peutPartager(fenetre({ ua: IPHONE, touches: 5 }) as never)).toBe(false)
  })

  it('dit si la personne a envoyé le fichier quelque part ou refermé la feuille', async () => {
    expect(await partagerFichier(new Blob(['a']), 'a.txt', fenetre({ dite: 'ios', reponse: { fait: true } }) as never)).toBe('partage')
    expect(await partagerFichier(new Blob(['a']), 'a.txt', fenetre({ dite: 'ios', reponse: { fait: false } }) as never)).toBe('annule')
  })
})

