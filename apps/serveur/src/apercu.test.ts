import { describe, expect, it } from 'vitest'
import { causeDuStatut, hoteInterdit } from './apercu.ts'

describe('hoteInterdit', () => {
  it('refuse le serveur lui-même et le réseau local', () => {
    for (const h of ['localhost', 'app.localhost', '127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.0.1', '169.254.1.1', '[::1]', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1'])
      expect(hoteInterdit(h), h).toBe(true)
  })
  it('laisse passer le web public', () => {
    for (const h of ['example.com', '93.184.216.34', '172.32.0.1', '2606:2800:220:1::1']) expect(hoteInterdit(h), h).toBe(false)
  })
})

describe('causeDuStatut', () => {
  it('dit pourquoi la page ne s’est pas lue', () => {
    expect(causeDuStatut(404)).toBe('introuvable')
    expect(causeDuStatut(410)).toBe('introuvable')
    expect(causeDuStatut(403)).toBe('refuse')
    expect(causeDuStatut(429)).toBe('refuse')
    expect(causeDuStatut(500)).toBe('injoignable')
  })
})
