import { describe, expect, it } from 'vitest'
import { abonnement, annonceLaFin, finDeLecture } from './fin'

const YT = 'https://www.youtube-nocookie.com'
const VM = 'https://player.vimeo.com'

describe('fin de lecture', () => {
  it('YouTube : l’état « terminé » (0), dit en changement d’état ou en livraison d’infos', () => {
    expect(finDeLecture('youtube', YT, JSON.stringify({ event: 'onStateChange', info: 0 }))).toBe(true)
    expect(finDeLecture('youtube', YT, JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }))).toBe(true)
    expect(finDeLecture('youtube', YT, JSON.stringify({ event: 'onStateChange', info: 1 }))).toBe(false)
    expect(finDeLecture('youtube', YT, JSON.stringify({ event: 'infoDelivery', info: { currentTime: 3 } }))).toBe(false)
  })

  it('Vimeo : l’événement finish, en texte ou en objet', () => {
    expect(finDeLecture('vimeo', VM, JSON.stringify({ event: 'finish' }))).toBe(true)
    expect(finDeLecture('vimeo', VM, { event: 'finish' })).toBe(true)
    expect(finDeLecture('vimeo', VM, { event: 'play' })).toBe(false)
  })

  it('ignore un message venu d’ailleurs ou illisible', () => {
    expect(finDeLecture('youtube', 'https://evil.test', JSON.stringify({ event: 'onStateChange', info: 0 }))).toBe(false)
    expect(finDeLecture('vimeo', YT, { event: 'finish' })).toBe(false)
    expect(finDeLecture('youtube', YT, 'pas du json')).toBe(false)
    expect(finDeLecture('loom', YT, { event: 'finish' })).toBe(false)
  })

  it('seuls YouTube et Vimeo s’abonnent', () => {
    expect(annonceLaFin('youtube')).toBe(true)
    expect(annonceLaFin('loom')).toBe(false)
    expect(abonnement('vimeo')?.origine).toBe(VM)
    expect(abonnement('wistia')).toBeNull()
  })
})
